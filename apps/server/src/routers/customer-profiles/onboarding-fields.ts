/**
 * Shared onboarding-profile field mapping for the customer-profiles router.
 *
 * The self-service registration wizard (registration.complete /
 * completeProfile) and the staff "Add Customer → Full details" path both write
 * the same onboarding columns onto the control-panel `user` row. This centralizes
 * that mapping so the paths can't drift.
 */

export type OnboardingProfileInput = {
	idPassportNo?: string;
	addressType?: "home" | "work";
	streetAddress?: string;
	city?: string;
	state?: string;
	country?: string;
	postalCode?: string;
	dateOfBirth?: string;
	emergencyContactName?: string;
	emergencyContactRelationship?: string;
	emergencyContactPhone?: string;
};

/** True only when EVERY registration-required onboarding field is present. */
export function isFullOnboardingProfile(i: OnboardingProfileInput): boolean {
	return !!(
		i.idPassportNo &&
		i.addressType &&
		i.streetAddress &&
		i.city &&
		i.state &&
		i.country &&
		i.postalCode &&
		i.dateOfBirth &&
		i.emergencyContactName &&
		i.emergencyContactRelationship &&
		i.emergencyContactPhone
	);
}

/**
 * Control-panel `user` columns for an onboarding profile. `role` is set to
 * "user" (registration complete) only when the FULL profile is present — a
 * partial set writes the supplied fields but leaves the customer incomplete.
 */
export function onboardingUserColumns(i: OnboardingProfileInput) {
	return {
		idPassportNo: i.idPassportNo ?? null,
		addressType: i.addressType ?? null,
		streetAddress: i.streetAddress ?? null,
		city: i.city ?? null,
		state: i.state ?? null,
		country: i.country ?? null,
		postalCode: i.postalCode ?? null,
		dateOfBirth: i.dateOfBirth ?? null,
		emergencyContactName: i.emergencyContactName ?? null,
		emergencyContactRelationship: i.emergencyContactRelationship ?? null,
		emergencyContactPhone: i.emergencyContactPhone ?? null,
		role: isFullOnboardingProfile(i) ? ("user" as const) : null,
	};
}
