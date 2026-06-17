import { describe, test, expect } from "bun:test";
import { purgeOldEmailLogs } from "@avantej-core/services/email-domain.service";

/**
 * Stub control-panel DB for the batched purge loop.
 *  - select().from().where().limit() resolves to the next queued id-batch
 *  - delete().where() records how many ids were "deleted"
 */
function makeDb(batches: string[][]) {
	let i = 0;
	let deleted = 0;
	const db = {
		select() {
			const chain: Record<string, unknown> = {};
			for (const m of ["from", "where"]) chain[m] = () => chain;
			chain.limit = () => {
				const batch = batches[i++] ?? [];
				return Promise.resolve(batch.map((id) => ({ id })));
			};
			return chain;
		},
		delete() {
			return {
				where: (..._a: unknown[]) => {
					// last selected batch size is tracked via closure on i-1
					const batch = batches[i - 1] ?? [];
					deleted += batch.length;
					return Promise.resolve();
				},
			};
		},
		_deleted: () => deleted,
	};
	return db as never;
}

describe("purgeOldEmailLogs", () => {
	test("no expired rows → no-op", async () => {
		const res = await purgeOldEmailLogs(makeDb([[]]));
		expect(res).toEqual({ deleted: 0, batches: 0, capped: false });
	});

	test("single partial batch stops after one pass", async () => {
		const res = await purgeOldEmailLogs(makeDb([["a", "b", "c"]]), {
			batchLimit: 5000,
		});
		expect(res).toEqual({ deleted: 3, batches: 1, capped: false });
	});

	test("full batch then partial drains both", async () => {
		// batchLimit 2 → first batch full (2) keeps looping, second partial (1) stops
		const res = await purgeOldEmailLogs(makeDb([["a", "b"], ["c"]]), {
			batchLimit: 2,
		});
		expect(res).toEqual({ deleted: 3, batches: 2, capped: false });
	});

	test("caps at maxBatches and reports capped=true", async () => {
		// every batch is full (size 1 == batchLimit 1) → would loop forever; cap at 2
		const res = await purgeOldEmailLogs(makeDb([["a"], ["b"], ["c"], ["d"]]), {
			batchLimit: 1,
			maxBatches: 2,
		});
		expect(res.deleted).toBe(2);
		expect(res.batches).toBe(2);
		expect(res.capped).toBe(true);
	});
});
