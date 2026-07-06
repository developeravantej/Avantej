// ─── Types ────────────────────────────────────────────────────────────────────

export type TaxCategory =
	| "SST"
	| "GST"
	| "service_tax"
	| "withholding_tax"
	| "tax_exempt"
	| "custom";

export type TaxRateRow = {
	id: string;
	name: string;
	code: string;
	rateInBasisPoints: number;
	category: TaxCategory;
	isDefault: boolean;
	effectiveFrom: string;
	effectiveUntil: string | null;
	description: string | null;
	isActive: boolean;
	createdAt: string;
	/** Lowercased country-node key (e.g. "malaysia"); null = org-wide. */
	country: string | null;
};

export type FormState = {
	name: string;
	code: string;
	ratePercent: string;
	category: TaxCategory;
	effectiveFrom: string;
	effectiveUntil: string;
	description: string;
	isDefault: boolean;
	/** "" = org-wide (all countries); otherwise a COUNTRY_OPTIONS value. */
	country: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const EMPTY_FORM: FormState = {
	name: "",
	code: "",
	ratePercent: "",
	category: "SST",
	effectiveFrom: "",
	effectiveUntil: "",
	description: "",
	isDefault: false,
	country: "",
};

export const CATEGORY_LABELS: Record<TaxCategory, string> = {
	SST: "SST",
	GST: "GST",
	service_tax: "Service Tax",
	withholding_tax: "Withholding Tax",
	tax_exempt: "Tax Exempt",
	custom: "Custom",
};

// Country scope options for per-country tax rates. Values are the canonical
// lowercased country-node keys (kept in sync with COUNTRY_CURRENCY in
// packages/services/src/currency.service.ts). An empty selection = org-wide.
export const COUNTRY_OPTIONS: { value: string; label: string }[] = [
	{ value: "malaysia", label: "Malaysia" },
	{ value: "thailand", label: "Thailand" },
	{ value: "singapore", label: "Singapore" },
	{ value: "indonesia", label: "Indonesia" },
	{ value: "philippines", label: "Philippines" },
	{ value: "vietnam", label: "Vietnam" },
];

export const COUNTRY_LABELS: Record<string, string> = {
	malaysia: "Malaysia",
	thailand: "Thailand",
	singapore: "Singapore",
	indonesia: "Indonesia",
	philippines: "Philippines",
	vietnam: "Vietnam",
};
