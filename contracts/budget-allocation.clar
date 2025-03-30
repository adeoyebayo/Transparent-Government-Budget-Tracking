;; Budget Allocation Contract
;; Records approved spending by department

;; Define data variables
(define-data-var total-budget uint u0)
(define-map department-budgets { department: (string-ascii 64) } { amount: uint, approved: bool })
(define-map budget-proposals { proposal-id: uint } { department: (string-ascii 64), amount: uint, proposer: principal, status: (string-ascii 10) })
(define-data-var proposal-counter uint u0)

;; Error codes
(define-constant ERR_UNAUTHORIZED u1)
(define-constant ERR_INVALID_AMOUNT u2)
(define-constant ERR_DEPARTMENT_NOT_FOUND u3)
(define-constant ERR_PROPOSAL_NOT_FOUND u4)
(define-constant ERR_ALREADY_APPROVED u5)

;; Define governance role
(define-data-var budget-admin principal tx-sender)

;; Check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get budget-admin)))

;; Set a new admin
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR_UNAUTHORIZED))
    (ok (var-set budget-admin new-admin))))

;; Set the total budget
(define-public (set-total-budget (amount uint))
  (begin
    (asserts! (is-admin) (err ERR_UNAUTHORIZED))
    (ok (var-set total-budget amount))))

;; Create a budget proposal
(define-public (propose-budget (department (string-ascii 64)) (amount uint))
  (let ((proposal-id (+ (var-get proposal-counter) u1)))
    (asserts! (> amount u0) (err ERR_INVALID_AMOUNT))
    (map-set budget-proposals
      { proposal-id: proposal-id }
      { department: department, amount: amount, proposer: tx-sender, status: "pending" })
    (var-set proposal-counter proposal-id)
    (ok proposal-id)))

;; Approve a budget proposal
(define-public (approve-proposal (proposal-id uint))
  (let ((proposal (unwrap! (map-get? budget-proposals { proposal-id: proposal-id }) (err ERR_PROPOSAL_NOT_FOUND))))
    (asserts! (is-admin) (err ERR_UNAUTHORIZED))
    (asserts! (is-eq (get status proposal) "pending") (err ERR_ALREADY_APPROVED))

    ;; Update proposal status
    (map-set budget-proposals
      { proposal-id: proposal-id }
      (merge proposal { status: "approved" }))

    ;; Set department budget
    (map-set department-budgets
      { department: (get department proposal) }
      { amount: (get amount proposal), approved: true })

    (ok true)))

;; Reject a budget proposal
(define-public (reject-proposal (proposal-id uint))
  (let ((proposal (unwrap! (map-get? budget-proposals { proposal-id: proposal-id }) (err ERR_PROPOSAL_NOT_FOUND))))
    (asserts! (is-admin) (err ERR_UNAUTHORIZED))
    (asserts! (is-eq (get status proposal) "pending") (err ERR_ALREADY_APPROVED))

    ;; Update proposal status
    (map-set budget-proposals
      { proposal-id: proposal-id }
      (merge proposal { status: "rejected" }))

    (ok true)))

;; Get department budget
(define-read-only (get-department-budget (department (string-ascii 64)))
  (default-to { amount: u0, approved: false }
    (map-get? department-budgets { department: department })))

;; Get proposal details
(define-read-only (get-proposal (proposal-id uint))
  (map-get? budget-proposals { proposal-id: proposal-id }))

;; Get total budget
(define-read-only (get-total-budget)
  (var-get total-budget))

