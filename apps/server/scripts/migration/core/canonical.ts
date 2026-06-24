/**
 * Canonical model — the STABLE contract between per-client adapters and the
 * Avantej-shaped loaders. Adapters (one per client) map their messy legacy
 * columns INTO these DTOs; loaders only ever consume these. Adding a new client
 * = a new adapter/manifest, never a new loader.
 *
 * Phase 1 wires CanonicalBranch end-to-end. The remaining DTOs (Staff, Client,
 * Service, SalesOrder, Package, Appointment, Claim) are added alongside their
 * loaders in phases 2–8, against this same contract.
 */

/** A source row read from one sheet, all values as trimmed text (fidelity-safe). */
export type RawRow = Record<string, string>;

export interface CanonicalBranch {
	/** Legacy primary key (e.g. "BR-MY-001") — crosswalk source_id. */
	legacyId: string;
	/** Originating system for this row — crosswalk source_system. */
	sourceSystem: string;
	/** For tree synthesis: org → country → state → branch. */
	country: string;
	state: string;
	/** Branch node display name. */
	name: string;
	/** Composed single-line address (branch_details.address). */
	address?: string;
	/** Legacy manager id — resolved to pic_user_id in the post-staff 2nd pass. */
	managerLegacyStaffId?: string;

	// Extended attributes with no target column until migration 0095 lands.
	// Carried so nothing is silently lost; the loader logs them as deferred.
	branchCode?: string;
	displayName?: string;
	branchTier?: string;
	pricingTier?: string;
	status?: string;
	countryCode?: string;
	collective?: string;
	region?: string;
	city?: string;
	postalCode?: string;
	openingDate?: Date | null;
	closingDate?: Date | null;
}

export interface CanonicalStaff {
	legacyId: string;
	sourceSystem: string;
	/** Lowercased; required (no email → no login → row skipped). */
	email: string;
	/** Better-Auth requires a non-empty name. */
	name: string;
	firstName?: string;
	lastName?: string;
	displayName?: string;
	phone?: string;
	/** Mapped Avantej text role. */
	role: "admin" | "trainer" | "staff";
	/** Mapped Avantej member status. */
	status: "active" | "suspended";
	/** Legacy home branch id → hierarchyScopeId via the location crosswalk. */
	homeBranchLegacyId?: string;
}

/** Legacy "product" (a PT package/program) → Avantej `services` (which absorbed
 *  packages). Retail goods would map to `products`; this client has none. */
export interface CanonicalService {
	legacyId: string;
	sourceSystem: string;
	name: string;
	/** Selling price in integer cents (currency dropped — see multi-currency gap). */
	priceCents: number | null;
	sessionCount: number | null;
	expiryDays: number | null;
	/** Per-session length in seconds. No source field → defaulted; flagged. */
	durationSeconds: number;
	maxAttendees: number;
	type: "private" | "semi_private";
	isActive: boolean;
}

/** Legacy "client" → control-panel user + tenant member (role client) +
 *  customer_profiles. Identity/structured-address fields land on the user table
 *  (idPassportNo, address parts, dob, emergency contact); fitness/contact on the
 *  profile. */
export interface CanonicalClient {
	legacyId: string;
	sourceSystem: string;
	email: string;
	name: string;
	firstName?: string;
	lastName?: string;
	phone?: string;
	gender?: string;
	dateOfBirth?: Date | null;
	/** Composed single-line address (customer_profiles.address). */
	address?: string;
	identityType?: string;
	identityNo?: string;
	addressType?: string;
	city?: string;
	state?: string;
	country?: string;
	postalCode?: string;
	emergencyContactName?: string;
	emergencyContactPhone?: string;
	emergencyContactRelationship?: string;
	status: "active" | "suspended";
	homeBranchLegacyId?: string;
	/** Legacy staff id of the primary coach → members.id via staff crosswalk. */
	primaryCoachLegacyId?: string;
}

/** Legacy "appointment" → appointments. Price/commission fields are not in the
 *  source for historical rows (set to 0, flagged); coach payout is carried by
 *  redemption.claim_amount instead. sales_order / redemption / package links are
 *  deferred (those loaders are blocked / later). */
export interface CanonicalAppointment {
	legacyId: string;
	sourceSystem: string;
	branchLegacyId?: string;
	clientLegacyId?: string;
	coachLegacyId?: string;
	bookedByLegacyId?: string;
	type: "private" | "semi-private";
	status: "pending" | "confirmed" | "completed" | "cancelled" | "no-show";
	startTime: Date | null;
	endTime: Date | null;
	durationMinutes: number;
	notes?: string;
	bookingNumber?: string;
	cancelledAt?: Date | null;
	cancellationReason?: string;
}

// ── Manifest contract ──────────────────────────────────────────────────────

export interface EntityCtx {
	defaultSourceSystem: string;
}

/** How one canonical entity is sourced + mapped for a given client. */
export interface EntitySpec<T> {
	/** Source sheet/tab name in the client's workbook. */
	sheet: string;
	/** Map one raw row to a canonical DTO (return null to skip the row). */
	toCanonical: (row: RawRow, ctx: EntityCtx) => T | null;
}

/** One file per client. The only artifact written per onboarding. */
export interface ClientManifest {
	slug: string;
	/** Default path to the client's .xlsx (overridable via --file). */
	sourceFile: string;
	/** Fallback source_system when a row doesn't carry its own. */
	defaultSourceSystem: string;
	branches: EntitySpec<CanonicalBranch>;
	staff: EntitySpec<CanonicalStaff>;
	services: EntitySpec<CanonicalService>;
	clients: EntitySpec<CanonicalClient>;
	appointments: EntitySpec<CanonicalAppointment>;
	// sales / packages / claims are added here in later phases.
}
