/**
 * Invoice Service — Unit Tests.
 *
 * Invoice numbers are customer-facing and must be unique + well-formed. The
 * sequence value is collision-free (DB `nextval('tenant_invoice_seq')`); the
 * remaining risk is the formatting (date + zero-pad) and the "honour a
 * caller-supplied number, don't regenerate" branch in createInvoice. This pins
 * both:
 *
 *   - formatDateYYYYMMDD / buildInvoiceNumber (pure)
 *   - createInvoice uses params.invoiceNumber verbatim and does NOT pull a new
 *     sequence value when one is supplied (stub execute() throws if reached).
 *
 * Run: bun test src/invoice.service.test.ts
 */

import { describe, expect, it } from "bun:test";
import {
	buildInvoiceNumber,
	createInvoice,
	formatDateYYYYMMDD,
} from "./invoice.service";

// ---------------------------------------------------------------------------
// formatDateYYYYMMDD
// ---------------------------------------------------------------------------

describe("formatDateYYYYMMDD", () => {
	it("zero-pads month and day", () => {
		expect(formatDateYYYYMMDD(new Date(2026, 0, 5))).toBe("20260105"); // Jan 5
	});

	it("handles December (month index 11 → 12)", () => {
		expect(formatDateYYYYMMDD(new Date(2026, 11, 31))).toBe("20261231");
	});

	it("handles a two-digit month and day without extra padding", () => {
		expect(formatDateYYYYMMDD(new Date(2026, 9, 15))).toBe("20261015"); // Oct 15
	});
});

// ---------------------------------------------------------------------------
// buildInvoiceNumber
// ---------------------------------------------------------------------------

describe("buildInvoiceNumber", () => {
	it("formats as INV-YYYYMMDD-NNNNNN with a 6-digit zero-padded sequence", () => {
		expect(buildInvoiceNumber(new Date(2026, 5, 1), 42)).toBe(
			"INV-20260601-000042",
		);
	});

	it("does not pad a sequence that already has 6 digits", () => {
		expect(buildInvoiceNumber(new Date(2026, 5, 1), 123456)).toBe(
			"INV-20260601-123456",
		);
	});

	it("grows past 6 digits rather than truncating (pad is a minimum, not a cap)", () => {
		expect(buildInvoiceNumber(new Date(2026, 5, 1), 1_000_000)).toBe(
			"INV-20260601-1000000",
		);
	});

	it("formats sequence 1 as 000001", () => {
		expect(buildInvoiceNumber(new Date(2026, 5, 1), 1)).toBe(
			"INV-20260601-000001",
		);
	});
});

// ---------------------------------------------------------------------------
// createInvoice — caller-supplied number bypasses the sequence
// ---------------------------------------------------------------------------

/** tenantDb stub: insert echoes the values; execute() (nextval) throws if hit. */
function makeInvoiceDb() {
	let inserted: Record<string, unknown> | null = null;
	let executeCalled = false;
	const db = {
		execute: () => {
			executeCalled = true;
			throw new Error("NEXTVAL_CALLED");
		},
		insert: () => ({
			values: (v: Record<string, unknown>) => {
				inserted = v;
				return {
					returning: () => Promise.resolve([{ id: "inv-1", ...v }]),
				};
			},
		}),
	} as unknown as never;
	return {
		db,
		get inserted() {
			return inserted;
		},
		get executeCalled() {
			return executeCalled;
		},
	};
}

const baseParams = {
	date: new Date(2026, 5, 1),
	customerName: "Ahmad Firdaus",
	createdBy: "user-1",
	totalAmount: 30000,
	status: "unpaid" as const,
};

describe("createInvoice — invoice number resolution", () => {
	it("uses a caller-supplied invoiceNumber verbatim and never pulls a sequence", async () => {
		const m = makeInvoiceDb();
		const row = await createInvoice(m.db, {
			...baseParams,
			invoiceNumber: "INV-CUSTOM-0001",
		});
		expect((row as { invoiceNumber: string }).invoiceNumber).toBe(
			"INV-CUSTOM-0001",
		);
		expect(m.executeCalled).toBe(false);
		expect(m.inserted?.invoiceNumber).toBe("INV-CUSTOM-0001");
	});

	it("falls back to generating a number (which reaches the sequence) when none is supplied", async () => {
		const m = makeInvoiceDb();
		// No invoiceNumber → generateInvoiceNumber runs → execute() (nextval) is
		// reached, which the stub throws on. Proves the generation path is taken.
		await expect(createInvoice(m.db, baseParams)).rejects.toThrow(
			"NEXTVAL_CALLED",
		);
		expect(m.executeCalled).toBe(true);
	});
});
