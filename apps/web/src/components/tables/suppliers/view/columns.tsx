import type { ColumnDef } from "@tanstack/table-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SupplierRow {
	id: string;
	name: string;
	description?: string | null;
	accountNumber?: string | null;
	paymentTerms?: string | null;
	contactPerson?: string | null;
	contactPhone?: string | null;
	officePhone?: string | null;
	email?: string | null;
	website?: string | null;
	barcode?: string | null;
	isActive: boolean;
	createdAt?: string | null;
	updatedAt?: string | null;
}

interface ColumnMeta {
	onEdit: (supplier: SupplierRow) => void;
	onDeactivate: (supplier: SupplierRow) => void;
	onViewDetails: (supplier: SupplierRow) => void;
}

function na(value?: string | null): React.ReactNode {
	if (!value) return <span className="text-brand-secondary-2">N/A</span>;
	return value;
}

export function createColumns(meta: ColumnMeta): ColumnDef<SupplierRow>[] {
	return [
		{
			accessorKey: "name",
			header: ({ column }) => (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
				>
					Name
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			),
		},
		{
			accessorKey: "description",
			header: "Description",
			cell: ({ row }) => {
				const val = row.original.description;
				if (!val) return <span className="text-brand-secondary-2">N/A</span>;
				return (
					<div className="max-w-[200px] truncate" title={val}>
						{val}
					</div>
				);
			},
		},
		{
			accessorKey: "accountNumber",
			header: "Account",
			cell: ({ row }) => na(row.original.accountNumber),
		},
		{
			accessorKey: "paymentTerms",
			header: "Terms",
			cell: ({ row }) => na(row.original.paymentTerms),
		},
		{
			accessorKey: "contactPerson",
			header: "PIC",
			cell: ({ row }) => na(row.original.contactPerson),
		},
		{
			accessorKey: "contactPhone",
			header: "Contact",
			cell: ({ row }) => {
				const phone = row.original.contactPhone;
				if (!phone) return <span className="text-brand-secondary-2">N/A</span>;
				return (
					<a href={`tel:${phone}`} className="text-blue-600 hover:underline">
						{phone}
					</a>
				);
			},
		},
		{
			accessorKey: "officePhone",
			header: "Office",
			cell: ({ row }) => {
				const phone = row.original.officePhone;
				if (!phone) return <span className="text-brand-secondary-2">N/A</span>;
				return (
					<a href={`tel:${phone}`} className="text-blue-600 hover:underline">
						{phone}
					</a>
				);
			},
		},
		{
			accessorKey: "email",
			header: "Email",
			cell: ({ row }) => {
				const email = row.original.email;
				if (!email) return <span className="text-brand-secondary-2">N/A</span>;
				return (
					<a
						href={`mailto:${email}`}
						className="text-blue-600 hover:underline"
					>
						{email}
					</a>
				);
			},
		},
		{
			accessorKey: "website",
			header: "Website",
			cell: ({ row }) => {
				const website = row.original.website;
				if (!website) return <span className="text-brand-secondary-2">N/A</span>;
				return (
					<a
						href={website}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-600 hover:underline"
					>
						{website}
					</a>
				);
			},
		},
		{
			accessorKey: "isActive",
			header: "Status",
			cell: ({ row }) => (
				<Badge variant={row.original.isActive ? "default" : "secondary"}>
					{row.original.isActive ? "Active" : "Inactive"}
				</Badge>
			),
		},
		{
			id: "actions",
			enableHiding: false,
			cell: ({ row }) => {
				const supplier = row.original;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="h-8 w-8 p-0">
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() =>
									navigator.clipboard.writeText(supplier.name)
								}
							>
								Copy supplier name
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => meta.onViewDetails(supplier)}
							>
								View details
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => meta.onEdit(supplier)}>
								Edit supplier
							</DropdownMenuItem>
							{supplier.isActive && (
								<DropdownMenuItem
									onClick={() => meta.onDeactivate(supplier)}
									className="text-red-600 focus:text-red-600"
								>
									Deactivate supplier
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		},
	];
}
