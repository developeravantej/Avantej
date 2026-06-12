export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

const CANON: Record<string, Gender> = {
	male: "male",
	m: "male",
	female: "female",
	f: "female",
	other: "other",
	prefer_not_to_say: "prefer_not_to_say",
	"prefer not to say": "prefer_not_to_say",
};

/** Normalize any case/synonym to the canonical Gender union, or "" if unknown. */
export function normalizeGender(value: string | null | undefined): Gender | "" {
	if (!value) return "";
	const key = value.trim().toLowerCase();
	return CANON[key] ?? "";
}
