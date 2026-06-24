import { useMemo } from "react";
import {
	buildColumns,
	type PaymentRow,
} from "@/components/tables/payment/view/columns";
import PaymentDataTable from "@/components/tables/payment/view/data-table";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { ErrorCard } from "@/features/sales/components/ErrorCard";

export interface PaymentsTabProps {
	data: PaymentRow[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	refetch: () => void;
	onSelectPayment: (paymentId: string) => void;
}

export function PaymentsTab({
	data,
	isLoading,
	isError,
	error,
	refetch,
	onSelectPayment,
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
