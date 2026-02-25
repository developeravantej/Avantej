import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SupplierRow {
	Name: string;
	Description: string;
	Account: string;
	Terms: string;
	"Contact Person": string;
	Contact: string;
	Office: string;
	Email: string;
	Website: string;
	Barcode: string;
	ID: string;
	"Created At"?: string;
	"Updated At"?: string;
}

export const columns: ColumnDef<SupplierRow>[] = [
	{
		accessorKey: "Name",
		header: ({ column }) => (
			<Button
				variant="ghost"
				type="button"
				onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
			>
				Name
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
	},
	{
		accessorKey: "Description",
		header: "Description",
		cell: ({ row }) => {
			const description = row.getValue("Description") as string;
			return (
				<div className="max-w-[200px] truncate" title={description}>
					{description === "N/A" ? (
						<span className="text-muted-foreground">N/A</span>
					) : (
						description
					)}
				</div>
			);
		},
	},
	{
		accessorKey: "Account",
		header: "Account",
		cell: ({ row }) => {
			const account = row.getValue("Account") as string;
			return account === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
				account
			);
		},
	},
	{
		accessorKey: "Terms",
		header: "Terms",
		cell: ({ row }) => {
			const terms = row.getValue("Terms") as string;
			return terms === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
				<span>{terms}</span>
			);
		},
	},
	{
		accessorKey: "Contact Person",
		header: "PIC",
		cell: ({ row }) => {
			const contactPerson = row.getValue("Contact Person") as string;
			return contactPerson === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
				contactPerson
			);
		},
	},
	{
		accessorKey: "Contact",
		header: "Contact",
		cell: ({ row }) => {
			const contact = row.getValue("Contact") as string;
			return contact === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
				<a href={`tel:${contact}`} className="text-blue-600 hover:underline">
					{contact}
				</a>
			);
		},
	},
	{
		accessorKey: "Office",
		header: "Office",
		cell: ({ row }) => {
			const office = row.getValue("Office") as string;
			return office === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
				<a href={`tel:${office}`} className="text-blue-600 hover:underline">
					{office}
				</a>
			);
		},
	},
	{
		accessorKey: "Email",
		header: "Email",
		cell: ({ row }) => {
			const email = row.getValue("Email") as string;
			return email === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
				<a href={`mailto:${email}`} className="text-blue-600 hover:underline">
					{email}
				</a>
			);
		},
	},
	{
		accessorKey: "Website",
		header: "Website",
		cell: ({ row }) => {
			const website = row.getValue("Website") as string;
			return website === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
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
		accessorKey: "Barcode",
		header: "Barcode",
		cell: ({ row }) => {
			const barcode = row.getValue("Barcode") as string;
			return barcode === "N/A" ? (
				<span className="text-muted-foreground">N/A</span>
			) : (
				barcode
			);
		},
	},
	{
		id: "actions",
		enableHiding: false,
		cell: ({ row }) => {
			const supplier = row.original;
			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="h-8 w-8 p-0" type="button">
							<span className="sr-only">Open menu</span>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuItem
							onClick={() => navigator.clipboard.writeText(supplier.Name)}
						>
							Copy supplier name
						</DropdownMenuItem>
						<DropdownMenuItem>View details</DropdownMenuItem>
						<DropdownMenuItem>Edit supplier</DropdownMenuItem>
						<DropdownMenuItem className="text-red-600 focus:text-red-600">
							Delete supplier
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	},
];
