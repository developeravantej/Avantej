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
};

export const CATEGORY_LABELS: Record<TaxCategory, string> = {
	SST: "SST",
	GST: "GST",
	service_tax: "Service Tax",
	withholding_tax: "Withholding Tax",
	tax_exempt: "Tax Exempt",
	custom: "Custom",
};
