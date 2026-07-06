/**
 * Client manifest — "move" (MOVE Private Fitness).
 *
 * Maps MOVE's consolidated workbook (built by ./build-source.ts from the 3 raw
 * files: Location-Branch.csv, Staff.csv, Offering-Service.xlsx) into the
 * canonical model. The raw files keep their original headers in the generated
 * source.xlsx; all column→canonical mapping happens HERE.
 *
 * Generate the workbook first:
 *   bun run scripts/migration/adapters/clients/move/build-source.ts
 * Then dry-run:
 *   bun run scripts/migration/engine/run.ts --org move --client move
 *
 * Notes / decisions (see docs/MOVE_TENANT_SEED_PLAN.md):
 *  - state: derived from ghl_branch_name prefix ("Kuala Lumpur - Bukit Jalil" → "Kuala Lumpur").
 *  - staff role: is_manager → admin; else is_coach → trainer; else staff.
 *  - staff scope: first/primary branch (option C) via home_branch_code (resolved at build time).
 *  - coach_tier (Lead/Senior/...) is NOT carried here — commission tiers are a separate P7 step.
 *  - services: org-wide (branchId/categoryId null per loader); price in sen (×100); multi-currency parked.
 *  - clients / appointments: MOVE supplied none → empty sheets, stub mappers (never invoked).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientManifest } from "../../../core/canonical";
import {
	decimalToCents,
	firstOf,
	normalizePhone,
	toBool,
	toInt,
} from "../../transforms";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const manifest: ClientManifest = {
	slug: "move",
	sourceFile: join(__dirname, "data", "source.xlsx"),
	defaultSourceSystem: "move_sheet",

	branches: {
		sheet: "location",
		toCanonical: (row, ctx) => {
			const legacyId = firstOf(row.branch_code);
			if (!legacyId) return null;
			// No state column. ghl_branch_name = "<state/city> - <area>" → take the prefix.
			const ghl = (row.ghl_branch_name ?? "").trim();
			const state = ghl.includes(" - ")
				? ghl.split(" - ")[0]!.trim()
				: (firstOf(row.country) ?? "Unknown");
			return {
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				country: firstOf(row.country) ?? "Unknown",
				state,
				name: firstOf(row.branch_name) ?? legacyId,
				address: firstOf(row.registered_address),
				// no manager column on the location file — pic link skipped
				branchCode: firstOf(row.branch_code),
				branchTier: firstOf(row.branch_tier),
				pricingTier: firstOf(row.pricing_tier),
				status: firstOf(row.branch_status),
				countryCode: legacyId.split("-")[0], // MY / TH / SG
			};
		},
	},

	staff: {
		sheet: "staff",
		toCanonical: (row, ctx) => {
			const legacyId = firstOf(row.staff_code);
			const email = row.staff_email?.trim().toLowerCase();
			if (!legacyId || !email) return null; // no email → no login

			const isManager = toBool(row.is_manager);
			const isCoach = toBool(row.is_coach);
			const role: "admin" | "trainer" | "staff" = isManager
				? "admin"
				: isCoach
					? "trainer"
					: "staff";

			const name = firstOf(row.staff_name) ?? email;
			return {
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				email,
				name,
				displayName: firstOf(row.staff_name),
				// numbers already carry their country code (60/66/65), no leading 0
				phone: normalizePhone(row.staff_phone_no) ?? undefined,
				role,
				status: "active",
				// resolved name→code at build time (first branch in access_branch_name)
				homeBranchLegacyId: firstOf(row.home_branch_code),
			};
		},
	},

	services: {
		sheet: "product",
		toCanonical: (row, ctx) => {
			// offering_id (OFF-NNNNN) is UNIQUE per row; offering_code repeats across
			// country/tier variants (same code, different price + currency). Key on the
			// row id so every country variant seeds as its own service (no multi-currency
			// support yet → distinct rows, not service_prices). Country suffix on the name
			// disambiguates the repeated program names in POS.
			const legacyId = firstOf(row.offering_id, row.offering_code);
			if (!legacyId) return null;
			const category = (row.offering_category ?? "").toLowerCase();
			const semiPrivate = category.includes("semi");
			const cc = firstOf(row.country_code);
			const baseName = firstOf(row.offering_name) ?? legacyId;
			return {
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				name: cc ? `${baseName} (${cc})` : baseName,
				// price_excluding_tax is a raw float in major units → sen (×100, rounded)
				priceCents: decimalToCents(row.price_excluding_tax),
				sessionCount: toInt(row.included_session_count),
				expiryDays: toInt(row.total_validity_day) ?? toInt(row.days_to_expire),
				durationSeconds: 60, // loader labels unit 'minutes' → 60-min session
				maxAttendees: semiPrivate ? 3 : 1,
				type: semiPrivate ? "semi_private" : "private",
				isActive: true,
			};
		},
	},

	// MOVE supplied no client/appointment data — empty sheets, stubs never invoked.
	clients: {
		sheet: "client",
		toCanonical: () => null,
	},
	appointments: {
		sheet: "appointment",
		toCanonical: () => null,
	},
};

export default manifest;
