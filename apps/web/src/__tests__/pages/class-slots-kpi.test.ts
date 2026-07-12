import { describe, it, expect, vi } from "vitest";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// class-slots-page imports @/utils/orpc at module scope — stub it so this pure
// computation test never touches the real RPC client.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { computeClassSlotKpis } from "@/components/pages/class-slots/class-slots-page";

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

describe("computeClassSlotKpis (client-side, loaded rows only)", () => {
	it("returns zeros for an empty list", () => {
		expect(computeClassSlotKpis([])).toEqual({
			totalSlots: 0,
			avgFillRate: 0,
			totalWaitlisted: 0,
			projectedRevenueCents: 0,
		});
	});

	it("excludes cancelled slots from every KPI", () => {
		const result = computeClassSlotKpis([
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
		const result = computeClassSlotKpis([
			slot({ capacity: 10, spotsBooked: 10 }), // 100%
			slot({ capacity: 10, spotsBooked: 2 }), // 20%
			slot({ capacity: 3, spotsBooked: 1 }), // 33.33%
		]);
		// (1 + 0.2 + 0.3333…) / 3 = 0.5111… → 51%
		expect(result.avgFillRate).toBe(51);
	});

	it("treats capacity 0 as 0% fill instead of dividing by zero", () => {
		const result = computeClassSlotKpis([
			slot({ capacity: 0, spotsBooked: 5 }),
			slot({ capacity: 10, spotsBooked: 10 }),
		]);
		expect(result.avgFillRate).toBe(50);
	});

	it("sums waitlist counts, coalescing missing values to 0", () => {
		const result = computeClassSlotKpis([
			slot({ waitlistCount: 3 }),
			slot({ waitlistCount: null }),
			slot({ waitlistCount: 2 }),
		]);
		expect(result.totalWaitlisted).toBe(5);
	});

	it("projects revenue as capacity × price per spot over loaded slots, null price → 0", () => {
		const result = computeClassSlotKpis([
			slot({ capacity: 10, pricePerSpotCents: 1_500 }), // 15_000
			slot({ capacity: 8, pricePerSpotCents: null }), // 0
			slot({ capacity: 4, pricePerSpotCents: 2_500 }), // 10_000
		]);
		expect(result.projectedRevenueCents).toBe(25_000);
	});
});
