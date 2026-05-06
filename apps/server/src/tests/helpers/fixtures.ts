import { randomUUID } from "crypto";

const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";

// ──────────────────────────────────────────────────────────────────────────────
// Expense Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeExpense(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		branchId: BRANCH_NODE_ID,
		submittedBy: MEMBER_ID,
		category: "travel",
		description: "Flight to KL for training",
		amountInCents: 15000, // RM 150.00
		currency: "MYR",
		expenseDate: new Date("2026-02-01T00:00:00.000Z"),
		receiptUrl: null,
		status: "pending",
		approvedBy: null,
		approvedAt: null,
		rejectedBy: null,
		rejectionReason: null,
		paidAt: null,
		paymentReference: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Announcement Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeAnnouncement(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		branchId: BRANCH_NODE_ID,
		title: "Branch Meeting Tomorrow",
		message: "Please attend the branch meeting at 9am.",
		priority: "normal",
		targetAudience: "all",
		isPinned: false,
		isActive: true,
		startDate: null,
		endDate: null,
		createdBy: MEMBER_ID,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Purchase Order Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makePurchaseOrder(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		branchId: BRANCH_NODE_ID,
		poNumber: "PO-20260227-0001",
		supplierId: randomUUID(),
		status: "draft",
		notes: null,
		orderDate: new Date(),
		expectedDeliveryDate: null,
		subtotalInCents: 50000,
		totalInCents: 50000,
		approvedBy: null,
		approvedAt: null,
		cancelledBy: null,
		cancelledAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

export function makePurchaseOrderItem(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		purchaseOrderId: randomUUID(),
		productId: randomUUID(),
		orderedQty: 10,
		unitCostInCents: 5000, // RM 50.00 each
		subtotalInCents: 50000,
		receivedQty: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Promotion Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makePromotion(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		branchId: BRANCH_NODE_ID,
		code: "PROMO10",
		name: "10% Off Promo",
		description: null,
		type: "percentage",
		value: 1000, // 10.00% (stored as basis points × 100)
		minimumOrderAmount: null,
		maximumDiscount: null,
		usageLimit: null,
		perCustomerLimit: 1,
		usageCount: 0,
		isActive: true,
		validFrom: new Date("2026-01-01T00:00:00.000Z"),
		validUntil: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Tax Rate Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeTaxRate(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		name: "SST 8%",
		code: "SST08",
		rateInBasisPoints: 800, // 8.00%
		category: "standard",
		description: null,
		isDefault: false,
		isActive: true,
		effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
		effectiveUntil: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Installment Plan Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeInstallmentPlan(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		code: "full",
		name: "Full Payment",
		numInstallments: 1,
		defaultIntervalDays: 30,
		description: null,
		isDefault: true,
		isActive: true,
		sortOrder: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Walk-in Customer Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeWalkInCustomer(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		branchId: BRANCH_NODE_ID,
		name: "Jane Doe",
		email: "jane@example.com",
		phoneNumber: "+60123456789",
		dateOfBirth: null,
		gender: "female",
		emergencyContactName: null,
		emergencyContactPhone: null,
		medicalNotes: null,
		notes: null,
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Member Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeMember(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: randomUUID(),
		userId: randomUUID(),
		organizationId: ORG_ID,
		role: "staff",
		// Wave 3a Agent 2.1 (Journey J1): nullable FK to roles table.
		// Default null so existing fixture consumers keep legacy text-role behaviour.
		roleId: null,
		status: "active",
		hierarchyScopeId: BRANCH_NODE_ID,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Class Slot Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeClassSlot(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		branchId: BRANCH_NODE_ID,
		serviceId: randomUUID(),
		trainerId: MEMBER_ID,
		startTime: new Date("2026-03-01T09:00:00.000Z"),
		endTime: new Date("2026-03-01T10:00:00.000Z"),
		capacity: 10,
		enrolledCount: 0,
		status: "scheduled",
		notes: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Commission Split Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeCommissionSplit(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		appointmentId: randomUUID(),
		staffId: MEMBER_ID,
		splitPercentage: 5000, // 50%
		calculatedAmount: 5000, // RM 50.00 in cents
		isPaid: false,
		paidAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Member Profile Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeMemberProfile(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		memberId: MEMBER_ID,
		organizationId: ORG_ID,
		displayName: "John Trainer",
		bio: "Certified personal trainer with 5 years experience.",
		specialization: "Strength & Conditioning",
		imageUrl: null,
		phoneNumber: "+60123456789",
		certifications: ["CPT", "CSCS"],
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Waitlist Entry Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeWaitlistEntry(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		organizationId: ORG_ID,
		classSlotId: randomUUID(),
		customerId: randomUUID(),
		position: 1,
		status: "waiting",
		notifiedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}
