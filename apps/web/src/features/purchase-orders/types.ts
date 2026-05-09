// Shared types for the purchase-orders feature

export type PurchaseOrderRow = {
	id: string;
	purchaseOrderNumber: string;
	supplierId: string;
	branchId: string;
	orderDate: Date | string | null;
	expectedDeliveryDate: Date | string | null | undefined;
	totalAmount: number;
	status: string;
	notes: string | null | undefined;
	createdAt: Date | string | null;
};

export type LineItem = {
	key: string;
	productId: string;
	orderedQty: string;
	unitCostRM: string;
};
