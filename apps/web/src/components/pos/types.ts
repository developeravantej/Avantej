// ─── Shared types for POS components ─────────────────────────────────────────

export type CustomerType = "member" | "walk_in";

export interface SelectedCustomer {
	type: CustomerType;
	id: string;
	name: string;
	phone: string | null;
	email?: string | null;
	branchId: string;
}

export type LineItemType = "service" | "package" | "custom";

export interface CartItem {
	/** Client-side unique id for list rendering */
	id: string;
	type: LineItemType;
	/** services.id — null for custom */
	refId?: string;
	description: string;
	quantity: number;
	unitPriceCents: number;
	/** For packages: whether the referenced service is sell-able as a package */
	isPackageSellable?: boolean;
}

export interface AppliedPromo {
	code: string;
	promotionId: string;
	discountCents: number;
	description: string;
}

export type PaymentMethod = "cash" | "card" | "bank_transfer";

export interface TaxRateOption {
	id: string;
	name: string;
	rateInBasisPoints: number;
}

export interface InstallmentPlanOption {
	id: string;
	code: string;
	name: string;
	numInstallments: number;
}
