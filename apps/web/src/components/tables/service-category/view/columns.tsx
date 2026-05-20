import type { ColumnDef } from "@tanstack/react-table";

function formatDate(date: Date | string | null | undefined): string {
	if (!date) return "N/A";
	try {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return "N/A";
	}
}

export const columns: ColumnDef<any>[] = [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ getValue }) => (
			<span className="font-semibold text-[#0a0a0a]">{getValue<string>() || "N/A"}</span>
		),
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ getValue }) => {
			const v = getValue<string | null>();
			return <span className="text-[#737373]">{v ?? "—"}</span>;
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "displayOrder",
		header: "Order",
		cell: ({ getValue }) => {
			const n = getValue<number>();
			return (
				<span className="font-mono tabular-nums">
					{n !== undefined && n !== null ? String(n) : "—"}
				</span>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "isActive",
		header: "Status",
		cell: ({ getValue }) => {
			const active = getValue<boolean>();
			return active === true ? (
				<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-green-50 text-green-700">
					Active
				</span>
			) : (
				<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-[#f3f3f3] text-[#737373]">
					Inactive
				</span>
			);
		},
		enableSorting: true,
		enableHiding: false,
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ getValue }) => (
			<span className="text-[#737373]">{formatDate(getValue<Date | string>())}</span>
		),
		enableSorting: true,
		enableHiding: false,
	},
];
