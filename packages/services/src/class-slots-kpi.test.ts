import { describe, expect, it } from "bun:test";
import { aggregateClassSlotKpis } from "./class-slots.service";

// `aggregateClassSlotKpis` is the canonical KPI reduction: `getClassSlotKpis`
// mirrors this exact math in SQL over ALL matching slots, and the web client's
// `computeClassSlotKpis` mirrors it over the loaded page. These cases pin the
// semantics (cancelled-exclusion / divide-by-zero / fill-rate / revenue-cents)
// so the SQL and client stay honest against a single spec.

function slot(
	over: Partial<{
		isCancelled: boolean;
		capacity: number;
		spotsBooked: number;
		waitlistCount: number | null;
		pricePerSpotCents: number | null;
	}> = {},
) {
	return {
		isCancelled: false,
		capacity: 10,
		spotsBooked: 0,
		waitlistCount: 0,
		pricePerSpotCents: 0,
		...over,
	};
}

describe("aggregateClassSlotKpis", () => {
	it("returns zeros for an empty set", () => {
		expect(aggregateClassSlotKpis([])).toEqual({
			totalSlots: 0,
			avgFillRate: 0,
			totalWaitlisted: 0,
			projectedRevenueCents: 0,
		});
	});

	it("excludes cancelled slots from every KPI", () => {
		const result = aggregateClassSlotKpis([
			slot({
				isCancelled: true,
				capacity: 10,
				spotsBooked: 10,
				waitlistCount: 5,
				pricePerSpotCents: 10_000,
			}),
			slot({ capacity: 10, spotsBooked: 5, pricePerSpotCents: 2_000 }),
		]);
		expect(result.totalSlots).toBe(1);
		expect(result.avgFillRate).toBe(50);
		expect(result.totalWaitlisted).toBe(0);
		expect(result.projectedRevenueCents).toBe(20_000);
	});

	it("averages per-slot fill rates and rounds to a whole percent", () => {
		const result = aggregateClassSlotKpis([
			slot({ capacity: 10, spotsBooked: 10 }), // 100%
			slot({ capacity: 10, spotsBooked: 2 }), // 20%
			slot({ capacity: 3, spotsBooked: 1 }), // 33.33%
		]);
		// (1 + 0.2 + 0.3333…) / 3 = 0.5111… → 51%
		expect(result.avgFillRate).toBe(51);
	});

	it("treats capacity 0 as 0% fill instead of dividing by zero", () => {
		const result = aggregateClassSlotKpis([
			slot({ capacity: 0, spotsBooked: 5 }),
			slot({ capacity: 10, spotsBooked: 10 }),
		]);
		expect(result.avgFillRate).toBe(50);
	});

	it("sums active waitlist counts, coalescing missing values to 0", () => {
		const result = aggregateClassSlotKpis([
			slot({ waitlistCount: 3 }),
			slot({ waitlistCount: null }),
			slot({ waitlistCount: 2 }),
		]);
		expect(result.totalWaitlisted).toBe(5);
	});

	it("projects revenue as capacity × price per spot (cents), null price → 0", () => {
		const result = aggregateClassSlotKpis([
			slot({ capacity: 10, pricePerSpotCents: 1_500 }), // 15_000
			slot({ capacity: 8, pricePerSpotCents: null }), // 0
			slot({ capacity: 4, pricePerSpotCents: 2_500 }), // 10_000
		]);
		expect(result.projectedRevenueCents).toBe(25_000);
	});
});
