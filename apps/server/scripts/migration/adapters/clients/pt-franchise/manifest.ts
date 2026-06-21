/**
 * Client manifest — "pt-franchise".
 *
 * THE per-client artifact. Maps this client's legacy workbook (8-tab Aoikumo/GHL
 * export) into the canonical model. A different client = a different file like
 * this one; nothing downstream changes.
 *
 * Place the client's workbook at ./data/source.xlsx (gitignored) or pass --file.
 */
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ClientManifest } from "../../../core/canonical";
import {
	composeAddress,
	decimalToCents,
	firstOf,
	mapValue,
	parseDate,
	toBool,
	toInt,
} from "../../transforms";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const manifest: ClientManifest = {
	slug: "pt-franchise",
	sourceFile: join(__dirname, "data", "source.xlsx"),
	defaultSourceSystem: "legacy_sheet",

	branches: {
		sheet: "location",
		toCanonical: (row, ctx) => {
			const legacyId = row.branch_id?.trim();
			if (!legacyId) return null;
			return {
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				country: firstOf(row.country) ?? "Unknown",
				state: firstOf(row.state, row.country) ?? "Unknown",
				name: firstOf(row.display_name, row.branch_name) ?? legacyId,
				address: composeAddress(
					row.address_1,
					row.address_2,
					row.city,
					row.postal_code,
				),
				managerLegacyStaffId: firstOf(row.branch_manager_staff_id),
				branchCode: firstOf(row.branch_code),
				displayName: firstOf(row.display_name),
				branchTier: firstOf(row.branch_tier),
				pricingTier: firstOf(row.pricing_tier),
				status: firstOf(row.status),
				countryCode: firstOf(row.country_code),
				collective: firstOf(row.collective),
				region: firstOf(row.region),
				city: firstOf(row.city),
				postalCode: firstOf(row.postal_code),
				openingDate: parseDate(row.opening_date),
				closingDate: parseDate(row.closing_date),
			};
		},
	},

	staff: {
		sheet: "staff",
		toCanonical: (row, ctx) => {
			// Export's stable key is external_staff_id (STF-xxx); internal staff_id
			// is blank and assigned by this migration. All cross-refs use STF-xxx.
			const legacyId = firstOf(row.external_staff_id, row.staff_id);
			const email = row.email?.trim().toLowerCase();
			if (!legacyId || !email) return null; // no email → no login

			const primaryRole = (row.primary_role ?? "").trim().toLowerCase();
			const isCoach =
				(row.has_coach_role ?? "").trim().toLowerCase() === "true";
			const role: "admin" | "trainer" | "staff" =
				primaryRole === "admin" ? "admin" : isCoach ? "trainer" : "staff";

			const first = firstOf(row.first_name);
			const last = firstOf(row.last_name);
			const name =
				firstOf(row.full_name, [first, last].filter(Boolean).join(" ")) ??
				email;

			return {
				// One crosswalk namespace per client run — cross-refs (STF/BR/CL)
				// are uniform across sheets, so the namespace must be too. The row's
				// external_*_source is provenance metadata, not a dedup key here.
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				email,
				name,
				firstName: first,
				lastName: last,
				displayName: firstOf(row.preferred_name, row.full_name),
				phone: firstOf(row.phone_number),
				role,
				status: mapValue(
					row.status,
					{
						active: "active",
						onboarding: "active",
						probation: "active",
						inactive: "suspended",
						terminated: "suspended",
					},
					"active",
				),
				homeBranchLegacyId: firstOf(row.home_branch_id),
			};
		},
	},

	services: {
		sheet: "product",
		toCanonical: (row, ctx) => {
			// Stable key is product_code (MY-T1-PT-2X12); product_id is blank.
			const legacyId = firstOf(row.product_code, row.product_id);
			if (!legacyId) return null;
			const sessionType = (row.session_type ?? "").trim().toLowerCase();
			const semiPrivate = sessionType === "spt_session";
			return {
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				name: firstOf(row.product_name, row.display_name) ?? legacyId,
				// standard_price is in whole currency units (RM4,560) → cents.
				priceCents: decimalToCents(row.standard_price),
				sessionCount: toInt(row.session_count),
				expiryDays: toInt(row.validity_days),
				durationSeconds: 3600, // no source per-session length — defaulted
				maxAttendees: semiPrivate ? 2 : 1,
				type: semiPrivate ? "semi_private" : "private",
				isActive: toBool(row.is_active),
			};
		},
	},

	clients: {
		sheet: "client",
		toCanonical: (row, ctx) => {
			// Stable key is external_client_id (aoikumo_9001); client_id is blank.
			const legacyId = firstOf(row.external_client_id, row.client_id);
			const email = row.email?.trim().toLowerCase();
			if (!legacyId || !email) return null; // no email → no login

			const first = firstOf(row.first_name);
			const last = firstOf(row.last_name);
			return {
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				email,
				name:
					firstOf(row.full_name, [first, last].filter(Boolean).join(" ")) ??
					email,
				firstName: first,
				lastName: last,
				phone: firstOf(row.phone_number),
				gender: firstOf(row.gender),
				dateOfBirth: parseDate(row.date_of_birth),
				address: composeAddress(
					row.address_1,
					row.address_2,
					row.city,
					row.postal_code,
				),
				identityType: firstOf(row.identity_type),
				identityNo: firstOf(row.idendity_no), // note: source typo "idendity"
				addressType: firstOf(row.address_type),
				city: firstOf(row.city),
				state: firstOf(row.state),
				country: firstOf(row.country),
				postalCode: firstOf(row.postal_code),
				emergencyContactName: firstOf(row.emergency_contact_name),
				emergencyContactPhone: firstOf(row.emergency_contact_no),
				emergencyContactRelationship: firstOf(
					row.emergency_contact_relationship,
				),
				status: mapValue(
					row.status,
					{
						active: "active",
						trial: "active",
						lead: "active",
						frozen: "active",
						inactive: "suspended",
						drop_off: "suspended",
					},
					"active",
				),
				homeBranchLegacyId: firstOf(row.home_branch_id),
				primaryCoachLegacyId: firstOf(row.primary_coach_id),
			};
		},
	},

	appointments: {
		sheet: "appointment",
		toCanonical: (row, ctx) => {
			const legacyId = firstOf(row.appointment_id);
			if (!legacyId) return null;
			const apptType = (row.appointment_type ?? "").trim().toLowerCase();
			return {
				legacyId,
				sourceSystem: ctx.defaultSourceSystem,
				branchLegacyId: firstOf(row.branch_id),
				clientLegacyId: firstOf(row.client_id),
				coachLegacyId: firstOf(row.coach_id),
				bookedByLegacyId: firstOf(row.booked_by_staff_id),
				type: apptType === "spt_session" ? "semi-private" : "private",
				status: mapValue(
					row.appointment_status,
					{
						scheduled: "confirmed",
						confirmed: "confirmed",
						completed: "completed",
						cancelled: "cancelled",
						no_show: "no-show",
						rescheduled: "cancelled",
					},
					"confirmed",
				),
				startTime: parseDate(row.start_at),
				endTime: parseDate(row.end_at),
				durationMinutes: toInt(row.duration_minutes) ?? 60,
				notes: firstOf(row.notes),
				bookingNumber: firstOf(row.appointment_id),
				cancelledAt: parseDate(row.cancelled_at),
				cancellationReason: firstOf(row.cancellation_reason),
			};
		},
	},
};

export default manifest;
