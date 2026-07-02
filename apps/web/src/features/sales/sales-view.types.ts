// ─── KPI types from backend ────────────────────────────────────────────────────

export interface KpiSummary {
	totalSalesCents: number;
	totalRefundedCents: number;
	outstandingCents: number;
	/** Cash actually collected in the period (SUM of invoices.amount_paid). */
	totalCollectedCents?: number;
	salesCount: number;
}

// ─── Cancelled Sales helpers ──────────────────────────────────────────────────────

export type LineItem = {
	id: string;
	description: string;
	quantity: number;
	unitPrice: number;
	totalPrice: number;
	taxRateBps: number | null;
	taxRateCode: string | null;
};

export type CancelledSaleRow = {
	id: string;
	cancellationNumber?: string | null;
	salesOrderId?: string | null;
	customerName?: string | null;
	customerType: string;
	cancellationDate?: string | Date | null;
	cancelledBy?: string | null;
	cancelledAmount?: number | null;
	cancellationReason?: string | null;
	cancellationReasonCategory?: string | null;
	lineItems: LineItem[];
	repeatOffenderCount: number;
};
