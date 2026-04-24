import { vi } from "vitest";

export const mockClient = {
	expenses: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "exp-1" }),
		approve: vi.fn().mockResolvedValue({}),
		reject: vi.fn().mockResolvedValue({}),
		markPaid: vi.fn().mockResolvedValue({}),
	},
	announcements: {
		list: vi.fn().mockResolvedValue([]),
		listActive: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({}),
		update: vi.fn().mockResolvedValue({}),
		delete: vi.fn().mockResolvedValue({}),
	},
	promotions: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({}),
		update: vi.fn().mockResolvedValue({}),
		deactivate: vi.fn().mockResolvedValue({}),
	},
	taxRates: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({}),
		update: vi.fn().mockResolvedValue({}),
		setDefault: vi.fn().mockResolvedValue({}),
		deactivate: vi.fn().mockResolvedValue({}),
	},
	purchaseOrders: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({}),
		approve: vi.fn().mockResolvedValue({}),
		receiveItems: vi.fn().mockResolvedValue({}),
		cancel: vi.fn().mockResolvedValue({}),
	},
	salesOrders: {
		list: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
		getById: vi.fn().mockResolvedValue(null),
		create: vi.fn().mockResolvedValue({ id: "so-1" }),
		update: vi.fn().mockResolvedValue({}),
		cancel: vi.fn().mockResolvedValue({}),
	},
	analytics: {
		getDashboardKpis: vi.fn().mockResolvedValue({
			totalSales: 0,
			salesOrderCount: 0,
			totalAppointments: 0,
			completedAppointments: 0,
			activeMembersCount: 0,
			revenueByBranch: [],
		}),
		getStaffPerformance: vi.fn().mockResolvedValue([]),
	},
	walkInCustomers: {
		// list returns empty — walk-in directory has been removed (router stubbed)
		list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
		// getById, create, update, deactivate all throw BAD_REQUEST in production (stubbed router)
		getById: vi.fn().mockRejectedValue(new Error("BAD_REQUEST")),
		create: vi.fn().mockRejectedValue(new Error("BAD_REQUEST")),
		update: vi.fn().mockRejectedValue(new Error("BAD_REQUEST")),
		deactivate: vi.fn().mockRejectedValue(new Error("BAD_REQUEST")),
	},
	notifications: { list: vi.fn().mockResolvedValue([]) },
	members: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ member: { id: "member-new" } }),
		suspend: vi.fn().mockResolvedValue({}),
		deactivate: vi.fn().mockResolvedValue({}),
		reactivate: vi.fn().mockResolvedValue({}),
		updateRole: vi.fn().mockResolvedValue({}),
	},
	memberProfiles: {
		get: vi.fn().mockResolvedValue(null),
		upsert: vi.fn().mockResolvedValue({}),
	},
	serviceMembers: {
		listForMember: vi.fn().mockResolvedValue([]),
		assign: vi.fn().mockResolvedValue({}),
		remove: vi.fn().mockResolvedValue({}),
		updateBuffer: vi.fn().mockResolvedValue({}),
	},
	serviceCategories: {
		list: vi.fn().mockResolvedValue([]),
	},
	permissions: { list: vi.fn().mockResolvedValue([]) },
	suppliers: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "sup-1" }),
		update: vi.fn().mockResolvedValue({}),
		deactivate: vi.fn().mockResolvedValue({}),
	},
	brands: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "brand-1" }),
		update: vi.fn().mockResolvedValue({}),
		delete: vi.fn().mockResolvedValue({}),
	},
	productCategories: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "cat-1" }),
		update: vi.fn().mockResolvedValue({}),
		delete: vi.fn().mockResolvedValue({}),
	},
	unitsOfMeasure: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "uom-1" }),
		update: vi.fn().mockResolvedValue({}),
		delete: vi.fn().mockResolvedValue({}),
	},
	stockRequests: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "sr-1" }),
		approve: vi.fn().mockResolvedValue({}),
		reject: vi.fn().mockResolvedValue({}),
		fulfill: vi.fn().mockResolvedValue({}),
	},
	transferOrders: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "to-1" }),
		markInTransit: vi.fn().mockResolvedValue({}),
		complete: vi.fn().mockResolvedValue({}),
		cancel: vi.fn().mockResolvedValue({}),
	},
	packages: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "pkg-1" }),
		update: vi.fn().mockResolvedValue({}),
		archive: vi.fn().mockResolvedValue({}),
	},
	services: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "svc-1" }),
		update: vi.fn().mockResolvedValue({}),
	},
	packageInstances: {
		list: vi.fn().mockResolvedValue([]),
		listAll: vi.fn().mockResolvedValue([]),
		assign: vi.fn().mockResolvedValue({ id: "pi-1" }),
		listExpiring: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
	},
	products: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "prod-1" }),
		update: vi.fn().mockResolvedValue({}),
	},
	checkIns: {
		list: vi.fn().mockResolvedValue([]),
		recordCheckIn: vi.fn().mockResolvedValue({}),
		listTodaysBookings: vi.fn().mockResolvedValue([]),
		recordBulkCheckIn: vi
			.fn()
			.mockResolvedValue({
				results: [],
				totalChecked: 0,
				totalSkipped: 0,
				totalError: 0,
			}),
		getActivePackageForMember: vi.fn().mockResolvedValue(null),
	},
	auth: { userContext: vi.fn().mockResolvedValue({}) },
	trainerTiers: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({}),
		deactivate: vi.fn().mockResolvedValue({}),
		reactivate: vi.fn().mockResolvedValue({}),
		assignToMember: vi.fn().mockResolvedValue({}),
	},
	categoryCommission: {
		getByCategory: vi.fn().mockResolvedValue(null),
		upsert: vi.fn().mockResolvedValue({}),
	},
	commissionSplits: {
		approve: vi.fn().mockResolvedValue({}),
		void: vi.fn().mockResolvedValue({}),
		listLedger: vi.fn().mockResolvedValue({ rows: [] }),
	},
	installments: {
		adminOverview: vi.fn().mockResolvedValue({ items: [], total: 0 }),
		listByPackageInstance: vi.fn().mockResolvedValue([]),
		confirmPayment: vi.fn().mockResolvedValue({}),
		manualUnlock: vi.fn().mockResolvedValue({}),
		adjustCredits: vi.fn().mockResolvedValue({}),
		suggestRefund: vi.fn().mockResolvedValue({ suggestedRefund: 0 }),
		setOverdraft: vi.fn().mockResolvedValue({}),
	},
	installmentPlans: {
		list: vi.fn().mockResolvedValue([]),
	},
	rooms: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "room-1" }),
		update: vi.fn().mockResolvedValue({}),
		deactivate: vi.fn().mockResolvedValue({}),
	},
	classSlots: {
		list: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({ id: "slot-1" }),
		update: vi.fn().mockResolvedValue({}),
		cancel: vi.fn().mockResolvedValue({}),
	},
};
