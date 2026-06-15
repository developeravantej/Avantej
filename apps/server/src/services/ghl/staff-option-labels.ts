// apps/server/src/services/ghl/staff-option-labels.ts
/**
 * Pure label builder for the Avantej-managed GHL "Primary Staff" SINGLE_OPTIONS
 * dropdown (Path C).
 *
 * GHL SINGLE_OPTIONS store only label strings and the webhook returns that label
 * (no stable id/value). To keep the lead→coach mapping deterministic we make
 * Avantej own the option list and guarantee the labels are UNIQUE, then store
 * each member's label so inbound resolution is an exact label match.
 *
 * Disambiguation, in order, only when a base name collides:
 *   1. base name           ("Alex Tan")
 *   2. name + " (branch)"  ("Alex Tan (KL Central)")    — when branch differs
 *   3. name + " #<short>"  ("Alex Tan #1a2b3c")          — last resort, always unique
 */

export interface StaffForLabel {
	memberId: string;
	name: string;
	branchName: string | null;
}

export interface StaffOptionLabel {
	memberId: string;
	label: string;
}

function shortId(memberId: string): string {
	return memberId.replace(/-/g, "").slice(0, 6);
}

/**
 * Build a unique option label per staff member. Deterministic and total:
 * every input member appears exactly once in the output with a unique label.
 * Members with a blank name are skipped (can't be shown/resolved by name).
 */
export function buildStaffOptionLabels(
	staff: StaffForLabel[],
): StaffOptionLabel[] {
	const named = staff
		.map((s) => ({ ...s, name: s.name.trim().normalize("NFC") }))
		.filter((s) => s.name !== "");

	// Count base-name collisions (case-insensitive).
	const nameCounts = new Map<string, number>();
	for (const s of named) {
		const key = s.name.toLowerCase();
		nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
	}

	const used = new Set<string>();
	const out: StaffOptionLabel[] = [];

	for (const s of named) {
		let label = s.name;
		if ((nameCounts.get(s.name.toLowerCase()) ?? 0) > 1) {
			// collision: try name + branch
			const branch = s.branchName?.trim().normalize("NFC");
			label = branch ? `${s.name} (${branch})` : s.name;
		}
		// guarantee global uniqueness (handles same name+branch, or no branch)
		if (used.has(label.toLowerCase())) {
			label = `${s.name} #${shortId(s.memberId)}`;
		}
		used.add(label.toLowerCase());
		out.push({ memberId: s.memberId, label });
	}

	return out;
}
