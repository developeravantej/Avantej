import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/tables/uom/view/data-table";
import { columns, type UoMRow } from "@/components/tables/uom/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/uom/view"
)({
	component: RouteComponent,
});

const mockUoMs: UoMRow[] = [
	{ id: "1", Name: "Piece", Description: "Single unit", "Base UoM": "—" },
	{ id: "2", Name: "Box", Description: "Box of 12", "Base UoM": "Piece" },
	{ id: "3", Name: "Carton", Description: "Carton of 24 boxes", "Base UoM": "Box" },
];

function RouteComponent() {
	const [data, setData] = useState<UoMRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setData(mockUoMs);
		setIsLoading(false);
	}, []);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	return <DataTable columns={columns} data={data} />;
}
