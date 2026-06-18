import { mock } from "bun:test";

/**
 * Canonical chainable `select()` mock.
 *
 * Returns a thenable chain whose terminal value (what `await`ing the chain, or
 * `.then(...)`, resolves to) is `returnValue`. Every chain method returns the
 * same chain object so any call order works:
 *   `select().from().where().orderBy().limit()` → resolves to `returnValue`.
 *
 * This is the ONE definition for the whole server test suite — import it instead
 * of re-declaring a local `selectChainResolving`/`sel` per file. The method list
 * is the SUPERSET observed across every unit test, so any caller's chain is
 * covered.
 *
 * ⚠️ Two services need a DIFFERENT terminal shape and must NOT use this helper:
 *   - a `.for("update")` that resolves to a Promise directly (payouts test)
 *   - a `.as(...)` that returns `sql` aggregate objects (commission-splits test)
 * Those keep their bespoke local mocks.
 */
export function selectChainResolving(returnValue: unknown = []) {
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
		// `.for("update")` / `.for("share")` row-locks. Returns the chain so it can
		// be awaited directly (await select()….for("update")) or chained with
		// `.then(...)`. Without this, any service using a row-lock (validatePromoCode,
		// voidCommissionSplit, …) throws on the mock.
		"for",
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

// Transaction mock factory. Caller passes the outer mockDb so the callback's
// `tx` IS the same instance — tests can configure `mockDb.insert.mockReturnValueOnce(...)`
// before the call and have it apply inside the transaction. Previously this
// created a FRESH mockDb per transaction, causing every test that mocks an
// insert/update inside a transactional service path to see empty results.
function createTransactionMock(self: () => unknown) {
	return mock((callback: (tx: unknown) => Promise<unknown>) => {
		return callback(self());
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
	const selectMock = mock(() => selectChainResolving());

	// query.{table}.findMany / findFirst patterns
	const createQueryTable = (
		defaults: { findMany?: unknown; findFirst?: unknown } = {},
	) => ({
		findMany: mock(() => Promise.resolve(defaults.findMany ?? [])),
		findFirst: mock(() => Promise.resolve(defaults.findFirst ?? undefined)),
	});

	const instance: any = {
		insert: insertMock,
		update: updateMock,
		delete: deleteMock,
		select: selectMock,
		// execute: used for pg_advisory_xact_lock and raw SQL in applyCommissionCaps
		execute: mock(() => Promise.resolve([])),
		// transaction filled after instance reference is captured below
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
	};
	instance.transaction = createTransactionMock(() => instance);
	return instance as any;
}
