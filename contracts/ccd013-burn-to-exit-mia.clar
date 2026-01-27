;; Title: CCD013 - MIA Burn To Exit
;; Version: 1.0.0
;; Summary: An extension that allows users to redeem MIA tokens for a portion of the MIA rewards treasury.
;; Description: An extension that provides the ability to claim a portion of the MIA rewards treasury 
;;   in exchange for MIA tokens. The redemption rate is 1,700 STX per 1,000,000 MIA (0.0017 STX per MIA).
;;   Supports both MIA V1 and V2 tokens. Maximum 10,000,000 MIA can be redeemed per transaction.

;; TRAITS
(impl-trait 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.extension-trait.extension-trait)

;; CONSTANTS

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u13000))
(define-constant ERR_NOT_ENABLED (err u13005))
(define-constant ERR_BALANCE_NOT_FOUND (err u13006))
(define-constant ERR_NOTHING_TO_REDEEM (err u13007))
(define-constant ERR_NOT_ENOUGH_FUNDS_IN_CONTRACT (err u13010))

;; Helpers
(define-constant MICRO_CITYCOINS (pow u10 u6)) ;; 6 decimal places
(define-constant REDEMPTION_SCALE_FACTOR (pow u10 u6)) ;; 1m MIA = 1700 STX
(define-constant REDEMPTION_RATIO u1700) ;; start with 0.0017 STX per MIA
(define-constant MAX_PER_TRANSACTION (* u10000000 MICRO_CITYCOINS)) ;; max 10m MIA per transaction

;; DATA VARS

;; Flag to enable/disable redemptions (set via initialize function)
(define-data-var redemptionsEnabled bool false)

;; Total MIA tokens redeemed (in micro MIA)
(define-data-var totalRedeemed uint u0)

;; Total STX transferred to users (in micro STX)
(define-data-var totalTransferred uint u0)

;; DATA MAPS

;; Tracks cumulative redemption claims per user
;; Key: user principal
;; Value: total MIA redeemed and STX received
(define-map RedemptionClaims
  principal
  {
    uMia: uint,  ;; total MIA redeemed in micro units
    uStx: uint,  ;; total STX received in micro units
  }
)

;; PUBLIC FUNCTIONS

;; Check if caller is the DAO or an enabled extension
;; Used for authorization checks on protected functions
;; @returns (response bool uint) - ok(true) if authorized
(define-public (is-dao-or-extension)
  (ok (asserts!
    (or
      (is-eq tx-sender 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao)
      (contract-call? 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao
        is-extension contract-caller
      )
    )
    ERR_UNAUTHORIZED
  ))
)

;; Callback function required by extension trait
;; @param sender - The principal that initiated the callback
;; @param memo - Optional memo buffer
;; @returns (response bool uint) - always ok(true)
(define-public (callback
    (sender principal)
    (memo (buff 34))
  )
  (ok true)
)

;; Initialize the redemption contract
;; Revokes STX delegation from the treasury and enables redemptions
;; Can only be called through the DAO after proposal execution
;; @returns (response tuple uint) - Redemption info on success
(define-public (initialize)
  (begin
    ;; Verify caller is DAO or extension
    (try! (is-dao-or-extension))
    ;; Revoke any existing delegation to make STX available
    (try! (contract-call?
      'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-rewards-v3
      revoke-delegate-stx
    ))
    ;; Enable redemptions after delegation is revoked
    (var-set redemptionsEnabled true)
    (ok (print {
      notification: "initialize-contract",
      payload: (get-redemption-info),
    }))
  )
)

;; Redeem MIA tokens for STX from the treasury
;; Burns the user's MIA tokens (V1 and/or V2) and transfers STX at the redemption ratio
;; @param amountUMia - Amount of MIA to redeem in micro units (1 MIA = 1,000,000 uMIA)
;; @returns (response tuple uint) - Redemption details (STX received, MIA burned)
(define-public (redeem-mia (amountUMia uint))
  (let (
      ;; Get user's V1 and V2 MIA balances
      (userAddress tx-sender)
      (balanceV1 (unwrap!
        (contract-call? 'SP466FNC0P7JWTNM2R9T199QRZN1MYEDTAR0KP27.miamicoin-token
          get-balance userAddress
        )
        ERR_BALANCE_NOT_FOUND
      ))
      (balanceV2 (unwrap!
        (contract-call?
          'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2
          get-balance userAddress
        )
        ERR_BALANCE_NOT_FOUND
      ))
      ;; Get previous redemption totals for this user
      (redemptionClaimed (default-to {
        uMia: u0,
        uStx: u0,
      }
        (map-get? RedemptionClaims userAddress)
      ))
      ;; Cap amount at MAX_PER_TRANSACTION (10M MIA)
      (maxAmountUMia (if (> amountUMia MAX_PER_TRANSACTION)
        MAX_PER_TRANSACTION
        amountUMia
      ))
      ;; Calculate V1 redemption amount (converted to micro units)
      (redemptionAmountUMiaV1 (if (> maxAmountUMia (* balanceV1 MICRO_CITYCOINS))
        (* balanceV1 MICRO_CITYCOINS)
        maxAmountUMia
      ))
      (redemptionV1InMia (/ redemptionAmountUMiaV1 MICRO_CITYCOINS))
      ;; Calculate V2 redemption amount (already in micro units)
      (remainingAmountUMia (- maxAmountUMia redemptionAmountUMiaV1))
      (redemptionAmountUMiaV2 (if (> remainingAmountUMia balanceV2)
        balanceV2
        remainingAmountUMia
      ))
      ;; Total MIA to redeem
      (redemptionTotalUMia (+ redemptionAmountUMiaV1 redemptionAmountUMiaV2))
      ;; Calculate STX payout at redemption ratio
      (redemptionAmountUStx (try! (get-redemption-for-balance redemptionTotalUMia)))
    )
    ;; Validate redemptions are enabled
    (asserts! (var-get redemptionsEnabled) ERR_NOT_ENABLED)
    ;; Validate user has tokens to redeem
    (asserts! (> redemptionAmountUStx u0) ERR_NOTHING_TO_REDEEM)
    ;; Burn V1 tokens if any
    (and
      (> redemptionV1InMia u0)
      (try! (contract-call?
        'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-core-v1-patch
        burn-mia-v1 redemptionV1InMia userAddress
      ))
    )
    ;; Burn V2 tokens if any
    (and
      (> redemptionAmountUMiaV2 u0)
      (try! (contract-call?
        'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2 burn
        redemptionAmountUMiaV2 userAddress
      ))
    )
    ;; Transfer STX from treasury to user
    (try! (contract-call?
      'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-rewards-v3
      withdraw-stx redemptionAmountUStx userAddress
    ))
    ;; Update global redemption totals
    (var-set totalRedeemed (+ (var-get totalRedeemed) redemptionTotalUMia))
    (var-set totalTransferred (+ (var-get totalTransferred) redemptionAmountUStx))
    ;; Update user's cumulative redemption record
    (map-set RedemptionClaims userAddress {
      uMia: (+ (get uMia redemptionClaimed) redemptionTotalUMia),
      uStx: (+ (get uStx redemptionClaimed) redemptionAmountUStx),
    })
    ;; Emit contract-level redemption event
    (print {
      notification: "contract-redemption",
      payload: (get-redemption-info),
    })
    ;; Emit user-level redemption event
    (print {
      notification: "user-redemption",
      payload: (get-user-redemption-info userAddress),
    })
    ;; Return detailed redemption results
    (ok {
      uStx: redemptionAmountUStx,
      uMia: redemptionTotalUMia,
      uMiaV2: redemptionAmountUMiaV2,
      miaV1: redemptionV1InMia,
    })
  )
)

;; READ ONLY FUNCTIONS

(define-read-only (is-redemption-enabled)
  (var-get redemptionsEnabled)
)

(define-read-only (get-redemption-current-balance)
  (stx-get-balance 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-rewards-v3)
)

(define-read-only (get-redemption-ratio)
  REDEMPTION_RATIO
)

(define-read-only (get-total-redeemed)
  (var-get totalRedeemed)
)

(define-read-only (get-total-transferred)
  (var-get totalTransferred)
)

;; aggregate all exposed vars above
(define-read-only (get-redemption-info)
  {
    redemptionsEnabled: (is-redemption-enabled),
    currentContractBalance: (get-redemption-current-balance),
    redemptionRatio: REDEMPTION_RATIO,
    totalRedeemed: (get-total-redeemed),
    totalTransferred: (get-total-transferred),
  }
)

(define-read-only (get-user-redemption-info (user principal))
  { totalRedeemed: (map-get? RedemptionClaims user) }
)

(define-read-only (get-redemption-for-balance (balance uint))
  (let (
      (redemptionAmountScaled (* REDEMPTION_RATIO balance))
      (redemptionAmount (/ redemptionAmountScaled REDEMPTION_SCALE_FACTOR))
      (contractCurrentBalance (get-redemption-current-balance))
    )
    (if (< redemptionAmount contractCurrentBalance)
      ;; if redemption amount is less than contract balance, return redemption amount
      (ok redemptionAmount)
      ;; if redemption amount is greater than contract balance, thrown an error
      ERR_NOT_ENOUGH_FUNDS_IN_CONTRACT
    )
  )
)
