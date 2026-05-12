import { mock } from "bun:test";

// Chainable select mock factory
function createSelectChain(returnValue: unknown = []) {
	const chain: Record<string, unknown> = {};
	const methods = [
		"from",
		"where",
		"orderBy",
		"limit",
		"offset",
		"leftJoin",
		"innerJoin",
		"groupBy",
		"having",
	];

	for (const method of methods) {
		chain[method] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(returnValue).then(resolve);
	return chain;
}

// Chainable insert mock factory
function createInsertChain(returnValue: unknown = []) {
	const valuesChain: Record<string, unknown> = {};
	valuesChain.returning = mock(() => Promise.resolve(returnValue));
	valuesChain.onConflictDoUpdate = mock(() => valuesChain);
	valuesChain.onConflictDoNothing = mock(() => valuesChain);

	const insertMock = mock(() => ({ values: mock(() => valuesChain) }));
	return { insertMock, valuesChain };
}

// Chainable update mock factory
function createUpdateChain(returnValue: unknown = []) {
	const setChain: Record<string, unknown> = {};
	setChain.where = mock(() => ({
		returning: mock(() => Promise.resolve(returnValue)),
	}));

	const updateMock = mock(() => ({ set: mock(() => setChain) }));
	return { updateMock, setChain };
}

// Chainable delete mock factory
function createDeleteChain(returnValue: unknown = []) {
	const deleteMock = mock(() => ({
		where: mock(() => Promise.resolve(returnValue)),
	}));
	return { deleteMock };
}

// Transaction mock
function createTransactionMock() {
	return mock((callback: (tx: unknown) => Promise<unknown>) => {
		return callback(createMockTenantDb());
	});
}

/**
 * Creates a fresh mock tenantDb object.
 * All mock functions are cleared on each call.
 * Override return values per-test with mockResolvedValueOnce().
 */
export function createMockTenantDb() {
	const { insertMock } = createInsertChain();
	const { updateMock } = createUpdateChain();
	const { deleteMock } = createDeleteChain();
	const selectMock = mock(() => createSelectChain());

	// query.{table}.findMany / findFirst patterns
	const createQueryTable = (
		defaults: { findMany?: unknown; findFirst?: unknown } = {},
	) => ({
		findMany: mock(() => Promise.resolve(defaults.findMany ?? [])),
		findFirst: mock(() => Promise.resolve(defaults.findFirst ?? undefined)),
	});

	return {
		insert: insertMock,
		update: updateMock,
		delete: deleteMock,
		select: selectMock,
		transaction: createTransactionMock(),
		query: {
			expenses: createQueryTable(),
			announcements: createQueryTable(),
			classSlots: createQueryTable(),
			memberProfiles: createQueryTable(),
			waitlistEntries: createQueryTable(),
			commissionSplits: createQueryTable(),
			purchaseOrders: createQueryTable(),
			purchaseOrderItems: createQueryTable(),
			promotions: createQueryTable(),
			promotionUsages: createQueryTable(),
			walkInCustomers: createQueryTable(),
			taxRates: createQueryTable(),
			installmentPlans: createQueryTable(),
			installments: createQueryTable(),
			installmentEvents: createQueryTable(),
			packageInstances: createQueryTable(),
			members: createQueryTable(),
			hierarchyNodes: createQueryTable(),
			salesOrders: createQueryTable(),
			appointments: createQueryTable(),
		},
	} as any;
}
