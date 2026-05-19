/**
 * Commission math — pure helpers extracted from _buildSplits for unit
 * testability.
 *
 * All numeric inputs are integers (cents / basis points / counts). No floats
 * anywhere in this module. No DB access. No side effects.
 *
 * Audit references in test names:
 *   #1 — multiply-then-floor (multiply amount × weightage × quantity together,
 *        floor once, avoiding per-coach rounding loss).
 *   #2 — config-sum 10000 bp invariant (allSlots must sum to exactly 10000
 *        bp or the redistribution math silently under/over-pays).
 *   #3 — dedupe by slotIndex (duplicate slotIndex would double-pay because
 *        presentSlotIndices is a Set but presentCount is array length).
 */

export interface SlotConfig {
	slotIndex: number;
	weightageBasisPoints: number;
}

export interface StaffAssignment {
	staffId: string;
	slotIndex: number;
}

/**
 * Fix #2: assert all configured slots sum to exactly 10000 basis points.
 * Empty configs are allowed (the engine simply won't fire splits). Throws
 * an Error otherwise — caller decides whether to log + skip or surface.
 */
export function assertConfigSumIs10000(
	allSlots: readonly SlotConfig[],
	configId: string,
): void {
	if (allSlots.length === 0) return; // empty config is valid
	const total = allSlots.reduce((s, x) => s + x.weightageBasisPoints, 0);
	if (total !== 10000) {
		throw new Error(
			`Coach-slot config ${configId} weightages sum to ${total}bp; expected 10000bp. Refusing to compute commission splits.`,
		);
	}
}

/**
 * Fix #3: dedupe staffAssignments by slotIndex. If a caller posts two
 * assignments against the same slot, the redistribution math would
 * double-pay that slot. Returns { deduped, hadDuplicates }.
 */
export function dedupeBySlotIndex<T extends StaffAssignment>(
	assignments: readonly T[],
): { deduped: T[]; hadDuplicates: boolean } {
	const byIndex = new Map<number, T>();
	for (const a of assignments) byIndex.set(a.slotIndex, a);
	const deduped = Array.from(byIndex.values());
	return { deduped, hadDuplicates: deduped.length !== assignments.length };
}

/**
 * Build the effective weightage array for each present coach (sorted by
 * slotIndex ASC). Redistributes the weightage of absent slots evenly across
 * present coaches; the first `remainder` coaches each absorb one extra
 * basis point so the total still sums to 10000.
 *
 * INPUT INVARIANT: validAssignments must already be sorted by slotIndex ASC
 * and deduped (use dedupeBySlotIndex first). allSlots must sum to 10000bp.
 */
export function computeEffectiveWeightages(
	allSlots: readonly SlotConfig[],
	validAssignments: readonly StaffAssignment[],
): number[] {
	const slotWeightByIndex = new Map<number, number>(
		allSlots.map((s) => [s.slotIndex, s.weightageBasisPoints]),
	);
	const presentSlotIndices = new Set(validAssignments.map((a) => a.slotIndex));

	let unclaimedBP = 0;
	for (const slot of allSlots) {
		if (!presentSlotIndices.has(slot.slotIndex)) {
			unclaimedBP += slot.weightageBasisPoints;
		}
	}

	const presentCount = validAssignments.length;
	if (presentCount === 0) return [];

	const bonusBP = Math.floor(unclaimedBP / presentCount);
	const remainder = unclaimedBP - bonusBP * presentCount;

	return validAssignments.map((a, i) => {
		const base = slotWeightByIndex.get(a.slotIndex) ?? 0;
		return base + bonusBP + (i < remainder ? 1 : 0);
	});
}

/**
 * Fix #1: compute the final commission amount in cents for ONE coach,
 * multiplying weightage × quantity together BEFORE the single floor.
 * Per-coach rounding loss is bounded to <1 cent total per call instead of
 * <1 cent per unit.
 *
 * effectiveWeightage is in basis points (0–10000).
 */
export function computeFinalAmountCents(
	baseAmountCents: number,
	effectiveWeightage: number,
	quantity: number,
): number {
	if (quantity <= 0) return 0;
	return Math.floor(
		(baseAmountCents * effectiveWeightage * quantity) / 10000,
	);
}
