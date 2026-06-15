/**
 * Minimal local mock tenant DB for packages/services unit tests.
 *
 * The shared mock in apps/server/src/tests/helpers/db-mock.factory.ts cannot be
 * imported here (packages must not depend on apps) and, crucially, does not
 * support the `.for("update")` row-lock that several service-layer reads use.
 *
 * This mock is deliberately tiny: it satisfies the exact chains the commission
 * void / state-machine services call —
 *   select().from().where().for(...)          → resolves to `selectRows`
 *   update().set(vals).where().returning()    → resolves to `updateRows`
 *   insert(table).values(vals)                → resolves void, records `vals`
 *   transaction(cb)                           → cb(self)
 * and records the writes so tests can assert audit + update payloads.
 */

export type MockTxOptions = {
	/** Rows returned by the first (and only) select chain. */
	selectRows?: unknown[];
	/** Rows returned by update().returning(). */
	updateRows?: unknown[];
};

export type MockTx = {
	db: any;
	/** Payloads passed to insert(...).values(x) — audit rows land here. */
	inserts: unknown[];
	/** Payloads passed to update().set(x). */
	updates: unknown[];
};

export function createMockTx(opts: MockTxOptions = {}): MockTx {
	const selectRows = opts.selectRows ?? [];
	const updateRows = opts.updateRows ?? [];
	const inserts: unknown[] = [];
	const updates: unknown[] = [];

	const selectChain: any = {
		from: () => selectChain,
		where: () => selectChain,
		// `.for("update")` is awaited directly → must be thenable to the rows.
		for: () => Promise.resolve(selectRows),
		orderBy: () => selectChain,
		limit: () => Promise.resolve(selectRows),
		then: (resolve: (v: unknown) => unknown) =>
			Promise.resolve(selectRows).then(resolve),
	};

	const db: any = {
		select: () => selectChain,
		update: () => ({
			set: (vals: unknown) => {
				updates.push(vals);
				return {
					where: () => ({
						returning: () => Promise.resolve(updateRows),
					}),
				};
			},
		}),
		insert: () => ({
			values: (vals: unknown) => {
				inserts.push(vals);
				return Promise.resolve();
			},
		}),
	};

	db.transaction = (cb: (tx: any) => Promise<unknown>) => cb(db);

	return { db, inserts, updates };
}
