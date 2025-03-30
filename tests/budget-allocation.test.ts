import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock the contract calls
const mockContractCall = vi.fn()
const mockMapGet = vi.fn()
const mockMapSet = vi.fn()
const mockVarGet = vi.fn()
const mockVarSet = vi.fn()

// Mock the tx-sender
const mockTxSender = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"
const mockAdmin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"

// Setup mock environment
vi.mock("clarity-implementation", () => ({
  contractCall: (...args: any[]) => mockContractCall(...args),
  mapGet: (...args: any[]) => mockMapGet(...args),
  mapSet: (...args: any[]) => mockMapSet(...args),
  varGet: (...args: any[]) => mockVarGet(...args),
  varSet: (...args: any[]) => mockVarSet(...args),
  txSender: mockTxSender,
}))

// Import the contract functions (simulated)
const budgetAllocation = {
  setTotalBudget: (amount: number) => {
    if (mockTxSender !== mockAdmin) {
      return { error: 1 } // ERR_UNAUTHORIZED
    }
    mockVarSet("total-budget", amount)
    return { success: true }
  },
  
  proposeBudget: (department: string, amount: number) => {
    if (amount <= 0) {
      return { error: 2 } // ERR_INVALID_AMOUNT
    }
    
    const proposalId = (mockVarGet("proposal-counter") || 0) + 1
    mockMapSet(
        "budget-proposals",
        { proposalId },
        {
          department,
          amount,
          proposer: mockTxSender,
          status: "pending",
        },
    )
    mockVarSet("proposal-counter", proposalId)
    
    return { success: proposalId }
  },
  
  approveProposal: (proposalId: number) => {
    if (mockTxSender !== mockAdmin) {
      return { error: 1 } // ERR_UNAUTHORIZED
    }
    
    const proposal = mockMapGet("budget-proposals", { proposalId })
    if (!proposal) {
      return { error: 4 } // ERR_PROPOSAL_NOT_FOUND
    }
    
    if (proposal.status !== "pending") {
      return { error: 5 } // ERR_ALREADY_APPROVED
    }
    
    mockMapSet(
        "budget-proposals",
        { proposalId },
        {
          ...proposal,
          status: "approved",
        },
    )
    
    mockMapSet(
        "department-budgets",
        { department: proposal.department },
        {
          amount: proposal.amount,
          approved: true,
        },
    )
    
    return { success: true }
  },
  
  getDepartmentBudget: (department: string) => {
    return mockMapGet("department-budgets", { department }) || { amount: 0, approved: false }
  },
  
  getTotalBudget: () => {
    return mockVarGet("total-budget") || 0
  },
}

describe("Budget Allocation Contract", () => {
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks()
    
    // Setup default values
    mockVarGet.mockImplementation((key) => {
      if (key === "budget-admin") return mockAdmin
      if (key === "proposal-counter") return 0
      if (key === "total-budget") return 1000000
      return undefined
    })
    
    mockMapGet.mockImplementation((map, key) => {
      return undefined // Default to no existing entries
    })
  })
  
  describe("setTotalBudget", () => {
    it("should set the total budget when called by admin", () => {
      const result = budgetAllocation.setTotalBudget(2000000)
      expect(result).toEqual({ success: true })
      expect(mockVarSet).toHaveBeenCalledWith("total-budget", 2000000)
    })
    
    it("should fail when called by non-admin", () => {
      const originalMockTxSender = mockTxSender
      ;(global as any).mockTxSender = "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB" // Different address
      const result = budgetAllocation.setTotalBudget(2000000)
      expect(result).toEqual({ error: 1 }) // ERR_UNAUTHORIZED
      expect(mockVarSet).not.toHaveBeenCalled()
      ;(global as any).mockTxSender = originalMockTxSender
    })
  })
  
  describe("proposeBudget", () => {
    it("should create a new budget proposal", () => {
      const result = budgetAllocation.proposeBudget("Education", 500000)
      expect(result).toEqual({ success: 1 })
      expect(mockMapSet).toHaveBeenCalledWith(
          "budget-proposals",
          { proposalId: 1 },
          {
            department: "Education",
            amount: 500000,
            proposer: mockTxSender,
            status: "pending",
          },
      )
      expect(mockVarSet).toHaveBeenCalledWith("proposal-counter", 1)
    })
    
    it("should fail when amount is invalid", () => {
      const result = budgetAllocation.proposeBudget("Education", 0)
      expect(result).toEqual({ error: 2 }) // ERR_INVALID_AMOUNT
      expect(mockMapSet).not.toHaveBeenCalled()
    })
  })
  
  describe("approveProposal", () => {
    it("should approve a pending proposal", () => {
      // Setup mock proposal
      mockMapGet.mockImplementation((map, key) => {
        if (map === "budget-proposals" && key.proposalId === 1) {
          return {
            department: "Education",
            amount: 500000,
            proposer: "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB",
            status: "pending",
          }
        }
        return undefined
      })
      
      const result = budgetAllocation.approveProposal(1)
      expect(result).toEqual({ success: true })
      
      // Check proposal was updated
      expect(mockMapSet).toHaveBeenCalledWith(
          "budget-proposals",
          { proposalId: 1 },
          {
            department: "Education",
            amount: 500000,
            proposer: "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB",
            status: "approved",
          },
      )
      
      // Check department budget was set
      expect(mockMapSet).toHaveBeenCalledWith(
          "department-budgets",
          { department: "Education" },
          {
            amount: 500000,
            approved: true,
          },
      )
    })
    
    it("should fail when proposal does not exist", () => {
      const result = budgetAllocation.approveProposal(999)
      expect(result).toEqual({ error: 4 }) // ERR_PROPOSAL_NOT_FOUND
    })
    
    it("should fail when proposal is already approved", () => {
      mockMapGet.mockImplementation((map, key) => {
        if (map === "budget-proposals" && key.proposalId === 1) {
          return {
            department: "Education",
            amount: 500000,
            proposer: "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB",
            status: "approved", // Already approved
          }
        }
        return undefined
      })
      
      const result = budgetAllocation.approveProposal(1)
      expect(result).toEqual({ error: 5 }) // ERR_ALREADY_APPROVED
    })
  })
  
  describe("getDepartmentBudget", () => {
    it("should return department budget when it exists", () => {
      mockMapGet.mockImplementation((map, key) => {
        if (map === "department-budgets" && key.department === "Education") {
          return {
            amount: 500000,
            approved: true,
          }
        }
        return undefined
      })
      
      const result = budgetAllocation.getDepartmentBudget("Education")
      expect(result).toEqual({
        amount: 500000,
        approved: true,
      })
    })
    
    it("should return default values when department budget does not exist", () => {
      const result = budgetAllocation.getDepartmentBudget("NonExistent")
      expect(result).toEqual({
        amount: 0,
        approved: false,
      })
    })
  })
})

