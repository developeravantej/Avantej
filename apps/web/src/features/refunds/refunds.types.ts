export type RefundStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "processed"
	| "cancelled";

export type RefundRow = {
	id: string;
	refundNumber: string;
	status: string;
	salesOrderId: string | null;
	paymentId: string | null;
	packageInstanceId: string | null;
	amountCents: number;
	taxAmountCents: number;
	reason: string;
	notes: string | null;
	requestedBy: string;
	requestedAt: string | Date;
	reviewedBy: string | null;
	reviewedAt: string | Date | null;
	reviewNotes: string | null;
	processedBy: string | null;
	processedAt: string | Date | null;
	refundMethod: string | null;
	refundReference: string | null;
	customerId: string;
	customerName: string;
	requestedByName?: string | null;
	salesOrderNumber?: string | null;
};

export type AuditRow = {
	id: string;
	action: string;
	createdAt: string | Date;
	summary?: string | null;
	actorName?: string | null;
};
