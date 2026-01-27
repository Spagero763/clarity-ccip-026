;; Unit tests for CCD013 Burn to Exit MIA contract
;; These tests verify the redemption calculation logic

;; Test preparation - transfers STX to treasury for redemption tests
(define-public (prepare)
  (begin
    ;; Send 20,000 STX to the treasury contract for redemption tests
    (try! (stx-transfer? u20000000000 tx-sender
      'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd002-treasury-mia-rewards-v3
    ))
    (ok true)
  )
)

;; Test: Zero MIA should return zero STX
(define-public (test-get-redemption-for-balance)
  (let (
      (amountUMia u0)
      (expectedResult (ok u0))
      (ustx (contract-call? .ccd013-burn-to-exit-mia get-redemption-for-balance
        amountUMia
      ))
    )
    (asserts! (is-eq ustx expectedResult) (err u9999))
    (ok true)
  )
)

;; Test: 1M MIA should return 1,700 STX (0.0017 STX per MIA)
(define-public (test-get-redemption-for-balance-1m)
  (let (
      (amountUMia u1000000000000) ;; 1,000,000 MIA in micro units
      (expectedResult (ok u1700000000)) ;; 1,700 STX in micro units
      (ustx (contract-call? .ccd013-burn-to-exit-mia get-redemption-for-balance
        amountUMia
      ))
    )
    (asserts! (is-eq ustx expectedResult) (err u9999))
    (ok true)
  )
)

;; Test: 10M MIA should return 17,000 STX
(define-public (test-get-redemption-for-balance-10m)
  (let (
      (amountUMia u10000000000000) ;; 10,000,000 MIA in micro units
      (expectedResult (ok u17000000000)) ;; 17,000 STX in micro units
      (ustx (contract-call? .ccd013-burn-to-exit-mia get-redemption-for-balance
        amountUMia
      ))
    )
    (asserts! (is-eq ustx expectedResult) (err ustx))
    (ok true)
  )
)

;; Test: 100M MIA should fail - exceeds available treasury funds
(define-public (test-get-redemption-for-balance-100m)
  (let (
      (amountUMia u100000000000000) ;; 100,000,000 MIA in micro units
      (expectedResult (err u13010)) ;; ERR_NOT_ENOUGH_FUNDS_IN_CONTRACT
      (ustx (contract-call? .ccd013-burn-to-exit-mia get-redemption-for-balance
        amountUMia
      ))
    )
    (asserts! (is-eq ustx expectedResult) (err u9999))
    (ok true)
  )
)
