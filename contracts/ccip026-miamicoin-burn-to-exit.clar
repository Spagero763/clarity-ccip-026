;; Title: CCIP-026 MiamiCoin Burn to Exit
;; Version: 1.0.0
;; Summary: A proposal contract for CCIP-026 that enables MIA token holders to vote on the burn-to-exit mechanism.
;; Description: This contract implements voting functionality for the CCIP-026 proposal. Users who have stacked
;;   MIA tokens during cycles 82 and 83 can vote on whether to enable the burn-to-exit redemption mechanism.
;;   Once the vote passes, the ccd013-burn-to-exit-mia extension is enabled in the DAO.

;; TRAITS

(impl-trait 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.proposal-trait.proposal-trait)
;; (impl-trait 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccip015-trait.ccip015-trait)

;; ERRORS

;; Error codes - 26xxx series for CCIP-026
(define-constant ERR_PANIC (err u26000))
(define-constant ERR_SAVING_VOTE (err u26001))
(define-constant ERR_VOTED_ALREADY (err u26002))
(define-constant ERR_NOTHING_STACKED (err u26003))
(define-constant ERR_USER_NOT_FOUND (err u26004))
(define-constant ERR_PROPOSAL_NOT_ACTIVE (err u26005))
(define-constant ERR_PROPOSAL_STILL_ACTIVE (err u26006))
(define-constant ERR_VOTE_FAILED (err u26007))

;; CONSTANTS

;; Contract reference
(define-constant SELF (as-contract tx-sender))

;; Proposal metadata
(define-constant CCIP_026 {
  name: "MiamiCoin Burn to Exit",
  link: "https://github.com/citycoins/governance/blob/eea941ea40c16428b4806d1808e7dab9fc095e0a/ccips/ccip-026/ccip-026-miamicoin-burn-to-exit.md",
  hash: "",
})

;; Vote scaling - 16 decimal places for precision
(define-constant VOTE_SCALE_FACTOR (pow u10 u16))

;; Vote duration - approximately 2 weeks in Bitcoin blocks
(define-constant VOTE_LENGTH u2016)

;; City ID for MIA
(define-constant MIA_ID (default-to u1
  (contract-call? 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd004-city-registry
    get-city-id "mia"
  )))

;; DATA VARS

;; Whether voting is currently active
(define-data-var voteActive bool true)

;; Vote period boundaries
(define-data-var voteStart uint u0)
(define-data-var voteEnd uint u0)

;; Initialize vote period when deployed
(var-set voteStart burn-block-height)
(var-set voteEnd (+ burn-block-height VOTE_LENGTH))

;; DATA MAPS

;; Tracks aggregate voting totals for each city
;; Key: city ID (uint)
;; Value: voting statistics including total amounts and vote counts
(define-map CityVotes
  uint ;; city ID
  {
    totalAmountYes: uint,  ;; total stacked MIA amount voting yes
    totalAmountNo: uint,   ;; total stacked MIA amount voting no
    totalVotesYes: uint,   ;; number of users voting yes
    totalVotesNo: uint,    ;; number of users voting no
  }
)

;; Tracks individual user votes
;; Key: user ID (uint)
;; Value: user's vote choice and voting power
(define-map UserVotes
  uint ;; user ID
  {
    vote: bool,  ;; true = yes, false = no
    mia: uint,   ;; scaled voting power from stacked MIA
  }
)

;; PUBLIC FUNCTIONS

;; Execute the proposal after vote passes
;; Can only be called through the DAO's direct-execute mechanism
;; @param sender - The principal executing the proposal
;; @returns (response bool uint) - true on success
(define-public (execute (sender principal))
  (begin
    ;; Verify vote has passed (yes votes > no votes)
    (try! (is-executable))
    ;; Mark voting as complete
    (var-set voteEnd stacks-block-height)
    (var-set voteActive false)
    ;; Enable the burn-to-exit extension in the DAO
    (try! (contract-call? 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.base-dao
      set-extensions
      (list
        {
          extension: .ccd013-burn-to-exit-mia,
          enabled: true,
        }
      )))
    ;; Initialize the redemption contract (revokes delegation, enables redemptions)
    (try! (contract-call? .ccd013-burn-to-exit-mia initialize))
    (ok true)
  )
)

;; Cast or change a vote on the proposal
;; @param vote - true for yes, false for no
;; @returns (response bool uint) - true on success
(define-public (vote-on-proposal (vote bool))
  (let (
      (voterId (unwrap!
        (contract-call?
          'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd003-user-registry
          get-user-id contract-caller
        )
        ERR_USER_NOT_FOUND
      ))
      (voterRecord (map-get? UserVotes voterId))
    )
    ;; check if vote is active
    (asserts! (is-vote-active) ERR_PROPOSAL_NOT_ACTIVE)
    ;; check if vote record exists for user
    (match voterRecord
      record
      ;; if the voterRecord exists
      (let (
          (oldVote (get vote record))
          (miaVoteAmount (get mia record))
        )
        ;; check vote is not the same as before
        (asserts! (not (is-eq oldVote vote)) ERR_VOTED_ALREADY)
        ;; record the new vote for the user
        (map-set UserVotes voterId (merge record { vote: vote }))
        ;; update vote stats for MIA
        (update-city-votes MIA_ID miaVoteAmount vote true)
      )
      ;; if the voterRecord does not exist
      (let ((miaVoteAmount (scale-down (default-to u0 (get-mia-vote voterId true)))))
        ;; check that the user has a positive vote
        (asserts! (> miaVoteAmount u0) ERR_NOTHING_STACKED)
        ;; insert new user vote record
        (asserts!
          (map-insert UserVotes voterId {
            vote: vote,
            mia: miaVoteAmount,
          })
          ERR_SAVING_VOTE
        )
        ;; update vote stats for MIA
        (update-city-votes MIA_ID miaVoteAmount vote false)
      )
    )
    ;; Emit event with voter information
    (print {
      notification: "vote-on-ccip-026",
      payload: (get-voter-info voterId),
    })
    (ok true)
  )
)

;; READ ONLY FUNCTIONS

;; Check if the proposal has passed and can be executed
;; @returns (response bool uint) - ok(true) if executable, err(26007) if vote failed
(define-read-only (is-executable)
  (let (
      (votingRecord (unwrap! (get-vote-totals) ERR_PANIC))
      (voteTotals (get totals votingRecord))
    )
    ;; Proposal passes if yes votes > no votes (requires at least one vote)
    (asserts! (> (get totalVotesYes voteTotals) (get totalVotesNo voteTotals))
      ERR_VOTE_FAILED
    )
    (ok true)
  )
)

;; Check if the vote is currently active (within vote period)
;; @returns bool - true if current block is within vote period
(define-read-only (is-vote-active)
  (if (and (>= burn-block-height (var-get voteStart)) (<= burn-block-height (var-get voteEnd)))
    true
    false
  )
)

;; Get proposal metadata (name, link, hash)
;; @returns (optional tuple) - proposal information
(define-read-only (get-proposal-info)
  (some CCIP_026)
)

;; Get the vote period configuration
;; @returns (optional tuple) - start block, end block, and length
(define-read-only (get-vote-period)
  (some {
    startBlock: (var-get voteStart),
    endBlock: (var-get voteEnd),
    length: VOTE_LENGTH,
  })
)

;; Get MIA vote totals (raw map data)
;; @returns (optional tuple) - vote totals for MIA city
(define-read-only (get-vote-total-mia)
  (map-get? CityVotes MIA_ID)
)

;; Get MIA vote totals with default values if no votes exist
;; @returns tuple - vote totals (defaults to zeros)
(define-read-only (get-vote-total-mia-or-default)
  (default-to {
    totalAmountYes: u0,
    totalAmountNo: u0,
    totalVotesYes: u0,
    totalVotesNo: u0,
  }
    (get-vote-total-mia)
  )
)

;; Get aggregated vote totals
;; @returns (optional tuple) - MIA record and combined totals
(define-read-only (get-vote-totals)
  (let ((miaRecord (get-vote-total-mia-or-default)))
    (some {
      mia: miaRecord,
      totals: {
        totalAmountYes: (get totalAmountYes miaRecord),
        totalAmountNo: (get totalAmountNo miaRecord),
        totalVotesYes: (get totalVotesYes miaRecord),
        totalVotesNo: (get totalVotesNo miaRecord),
      },
    })
  )
)

(define-read-only (get-voter-info (id uint))
  (map-get? UserVotes id)
)

;; MIA vote calculation
;; returns (some uint) or (none)
;; optionally scaled by VOTE_SCALE_FACTOR (10^6)
(define-read-only (get-mia-vote
    (userId uint)
    (scaled bool)
  )
  (let (
      ;; MAINNET: MIA cycle 82 / first block BTC 838,250 STX 145,643
      (cycle82Hash (unwrap! (get-block-hash u145643) none))
      (cycle82Data (at-block cycle82Hash
        (contract-call?
          'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd007-citycoin-stacking
          get-stacker MIA_ID u82 userId
        )))
      (cycle82Amount (get stacked cycle82Data))
      ;; MAINNET: MIA cycle 83 / first block BTC 840,350 STX 147,282
      (cycle83Hash (unwrap! (get-block-hash u147282) none))
      (cycle83Data (at-block cycle83Hash
        (contract-call?
          'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH.ccd007-citycoin-stacking
          get-stacker MIA_ID u83 userId
        )))
      (cycle83Amount (get stacked cycle83Data))
      ;; MIA vote calculation
      (scaledVote (/ (+ (scale-up cycle82Amount) (scale-up cycle83Amount)) u2))
    )
    ;; check that at least one value is positive
    (asserts! (or (> cycle82Amount u0) (> cycle83Amount u0)) none)
    ;; return scaled or unscaled value
    (if scaled
      (some scaledVote)
      (some (/ scaledVote VOTE_SCALE_FACTOR))
    )
  )
)

;; PRIVATE FUNCTIONS

;; update city vote map
(define-private (update-city-votes
    (cityId uint)
    (voteAmount uint)
    (vote bool)
    (changedVote bool)
  )
  (let ((cityRecord (default-to {
      totalAmountYes: u0,
      totalAmountNo: u0,
      totalVotesYes: u0,
      totalVotesNo: u0,
    }
      (map-get? CityVotes cityId)
    )))
    ;; do not record if amount is 0
    (if (> voteAmount u0)
      ;; handle vote
      (if vote
        ;; handle yes vote
        (map-set CityVotes cityId {
          totalAmountYes: (+ voteAmount (get totalAmountYes cityRecord)),
          totalVotesYes: (+ u1 (get totalVotesYes cityRecord)),
          totalAmountNo: (if changedVote
            (- (get totalAmountNo cityRecord) voteAmount)
            (get totalAmountNo cityRecord)
          ),
          totalVotesNo: (if changedVote
            (- (get totalVotesNo cityRecord) u1)
            (get totalVotesNo cityRecord)
          ),
        })
        ;; handle no vote
        (map-set CityVotes cityId {
          totalAmountYes: (if changedVote
            (- (get totalAmountYes cityRecord) voteAmount)
            (get totalAmountYes cityRecord)
          ),
          totalVotesYes: (if changedVote
            (- (get totalVotesYes cityRecord) u1)
            (get totalVotesYes cityRecord)
          ),
          totalAmountNo: (+ voteAmount (get totalAmountNo cityRecord)),
          totalVotesNo: (+ u1 (get totalVotesNo cityRecord)),
        })
      )
      ;; ignore calls with vote amount equal to 0
      false
    )
  )
)

;; get block hash by height 
(define-private (get-block-hash (blockHeight uint))
  (get-stacks-block-info? id-header-hash blockHeight)
)

;; CREDIT: ALEX math-fixed-point-16.clar

(define-private (scale-up (a uint))
  (* a VOTE_SCALE_FACTOR)
)

(define-private (scale-down (a uint))
  (/ a VOTE_SCALE_FACTOR)
)
