import { randomUUID } from "crypto";

const BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";

// ──────────────────────────────────────────────────────────────────────────────
// Package Instance Fixtures
//
// XOR REQUIREMENT — pkg_owner_xor constraint (migration 0027_walkin_commission.sql):
//   (client_id IS NULL) <> (walk_in_customer_id IS NULL)
//
// Exactly ONE of clientId or walkInCustomerId must be supplied.
// Passing both or neither throws an early descriptive error rather than
// propagating a confusing Postgres check constraint violation.
//
// Most tests want a regular client — pass { clientId, ... }.
// Walk-in tests should pass { walkInCustomerId, ... } instead.
// ──────────────────────────────────────────────────────────────────────────────
export function makePackageInstance(opts: {
	serviceId: string;
	clientId?: string | null;
	walkInCustomerId?: string | null;
	[key: string]: unknown;
}) {
	const { clientId = null, walkInCustomerId = null, serviceId, ...rest } = opts;
	const hasClient = clientId != null;
	const hasWalkIn = walkInCustomerId != null;
	if (hasClient === hasWalkIn) {
		throw new Error(
			"makePackageInstance: must supply exactly one of clientId or walkInCustomerId (XOR). " +
				`Received clientId=${JSON.stringify(clientId)}, walkInCustomerId=${JSON.stringify(walkInCustomerId)}.`,
		);
	}

	const now = new Date();
	return {
		id: randomUUID(),
		serviceId,
		clientId,
		walkInCustomerId,
		source: "assigned" as string,
		paymentStatus: "pending" as string,
		creditsTotal: 1,
		creditsUsed: 0,
		status: "active" as string,
		startsAt: now,
		expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
		...rest,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Expense Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeExpense(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: randomUUID(),
		branchId: BRANCH_NODE_ID,
		submittedBy: MEMBER_ID,
		category: "travel",
		description: "Flight to KL for training",
		amount: 15000, // RM 150.00
		currency: "myr",
		expenseDate: new Date("2026-02-01T00:00:00.000Z"),
		receiptUrl: null,
		status: "pending",
		approvedBy: null,
		approvedAt: null,
		rejectionReason: null,
		paidAt: null,
		paidBy: null,
		paymentReference: null,
		notes: null,
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
		scopedBranchIds: [] as string[],
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
		branchId: BRANCH_NODE_ID,
		purchaseOrderNumber: "PO-20260227-0001",
		supplierId: randomUUID(),
		status: "draft",
		notes: null,
		orderDate: new Date(),
		expectedDeliveryDate: null,
		receivedAt: null,
		subtotal: 50000,
		taxAmount: 0,
		totalAmount: 50000,
		createdBy: MEMBER_ID,
		approvedBy: null,
		approvedAt: null,
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
		receivedQty: 0,
		unitCost: 5000, // RM 50.00 each
		totalCost: 50000,
		notes: null,
		createdAt: new Date(),
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
		// Org-wide by default (applies to any branch). The branch-scope guard in
		// validatePromoCode only engages when branchId is non-null, so tests that
		// exercise discount math don't need to thread a matching params.branchId.
		// Override with a node id to test branch-scoped rejection.
		branchId: null,
		code: "PROMO10",
		name: "10% Off Promo",
		description: null,
		type: "percentage",
		value: 1000, // 10.00% (stored as basis points × 100)
		minimumOrderAmount: 0,
		maximumDiscount: null,
		usageLimit: null,
		perCustomerLimit: 1,
		usageCount: 0,
		isActive: true,
		validFrom: new Date("2026-01-01T00:00:00.000Z"),
		validUntil: null,
		applicableProductIds: null,
		applicableServiceIds: null,
		createdBy: MEMBER_ID,
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
		name: "SST 8%",
		code: "SST08",
		rateInBasisPoints: 800, // 8.00%
		category: "SST",
		country: null, // WS3: per-country scoping (null = org-wide)
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
		branchId: BRANCH_NODE_ID,
		name: "Jane Doe",
		email: "jane@example.com",
		phone: "+60123456789",
		dateOfBirth: null,
		gender: "female",
		address: null,
		emergencyContactName: null,
		emergencyContactPhone: null,
		medicalNotes: null,
		notes: null,
		isActive: true,
		createdBy: MEMBER_ID,
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
		role: "staff",
		// Wave 3a Agent 2.1 (Journey J1): nullable FK to roles table.
		// Default null so existing fixture consumers keep legacy text-role behaviour.
		roleId: null,
		status: "active",
		hierarchyScopeId: BRANCH_NODE_ID,
		joinedAt: new Date(),
		trainerTierId: null,
		...overrides,
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Class Slot Fixtures
// ──────────────────────────────────────────────────────────────────────────────
export function makeClassSlot(
	overrides: Partial<Record<string, unknown>> = {},
) {
	return {
		id: randomUUID(),
		branchId: BRANCH_NODE_ID,
		serviceId: randomUUID(),
		instructorId: MEMBER_ID,
		date: new Date("2026-03-01T00:00:00.000Z"),
		startTime: "09:00",
		endTime: "10:00",
		capacity: 10,
		spotsBooked: 0,
		spotsAvailable: 10,
		isFull: false,
		isAvailable: true,
		isCancelled: false,
		cancellationReason: null,
		location: null,
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
		appointmentId: randomUUID(),
		salesOrderId: null,
		staffId: MEMBER_ID,
		splitPercentage: 50, // 50%
		calculatedAmount: 5000, // RM 50.00 in cents
		notes: null,
		status: "pending",
		approvedBy: null,
		approvedAt: null,
		paidBy: null,
		paidAt: null,
		payoutId: null,
		slotIndex: null,
		conditionId: null,
		trainerTierId: null,
		weightageBasisPoints: null,
		baseAmountCents: null,
		splitType: "automatic",
		manualNote: null,
		earnedAt: new Date(),
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
		classSlotId: randomUUID(),
		userId: randomUUID(),
		position: 1,
		status: "waiting",
		notifiedAt: null,
		expiresAt: null,
		bookedAt: null,
		appointmentId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}
