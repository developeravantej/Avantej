import { useMemo } from "react";
import {
	buildColumns,
	type PaymentRow,
} from "@/components/tables/payment/view/columns";
import PaymentDataTable from "@/components/tables/payment/view/data-table";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { ErrorCard } from "@/features/sales/components/ErrorCard";

// Note: payment rows are deliberately non-interactive here — per-row actions
// (PDF download, copy) live in the column defs, and full invoice/payment
// detail lives on /dashboard/payment/view. The old `onSelectPayment` callback
// was a dead prop (never wired to the table) and has been removed.
export interface PaymentsTabProps {
	data: PaymentRow[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
}

export function PaymentsTab({
	data,
	isLoading,
	isError,
	error,
	refetch,
}: PaymentsTabProps) {
	const columns = useMemo(() => buildColumns(), []);

	if (isError) return <ErrorCard error={error} refetch={refetch} />;

	return (
		<Skeleton name="sales-view" loading={isLoading} fallback={<PageLoader />}>
			<PaymentDataTable<PaymentRow, unknown>
				columns={columns}
				data={data}
				emptyTitle="No payments found"
			/>
		</Skeleton>
	);
}
