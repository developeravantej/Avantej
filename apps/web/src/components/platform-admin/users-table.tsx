import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Search, LogIn } from "lucide-react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserRow {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	name: string;
	lastLoginAt: Date | null;
	isPlatformAdmin: boolean;
	platformAdminRole: string | null;
}

interface Pagination {
	currentPage: number;
	totalPages: number;
	pageSize: number;
	totalItems: number;
}

interface UsersTableProps {
	data: UserRow[];
	isLoading: boolean;
	callerRole: "super_admin" | "support" | "billing" | null;
	onSearch: (q: string) => void;
	searchValue: string;
	pagination: Pagination | undefined;
	onPageChange: (page: number) => void;
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function PlatformRoleBadge({ role }: { role: string | null }) {
	if (!role) return <span className="text-muted-foreground">-</span>;

	const variantMap: Record<string, "default" | "secondary" | "outline"> = {
		super_admin: "default",
		support: "secondary",
		billing: "outline",
	};

	return (
		<Badge variant={variantMap[role] ?? "outline"} className="capitalize">
			{role.replace("_", " ")}
		</Badge>
	);
}

// ─── UsersTable ───────────────────────────────────────────────────────────────

export function UsersTable({
	data,
	isLoading,
	callerRole,
	onSearch,
	searchValue,
	pagination,
	onPageChange,
}: UsersTableProps) {
	// Controlled dialog for confirmation — one dialog shared across all rows
	const [confirmingUser, setConfirmingUser] = useState<UserRow | null>(null);

	const canImpersonate = callerRole === "super_admin" || callerRole === "support";

	const impersonateMutation = useApiMutation({
		mutationFn: (userId: string) => client.admin.impersonateUser({ userId }),
		errorMessage: (err) => `Impersonation failed: ${err.message}`,
		onSuccess: (result) => {
			// Hard reload so the new cookie takes effect
			window.location.href = result.redirectTo;
		},
		onError: () => {
			setConfirmingUser(null);
		},
	});

	const columns: ColumnDef<UserRow>[] = [
		{
			accessorKey: "email",
			header: "Email",
			cell: ({ row }) => <CopyableCell value={row.original.email} />,
		},
		{
			accessorKey: "firstName",
			header: "First Name",
			cell: ({ row }) => row.original.firstName || <span className="text-muted-foreground">-</span>,
		},
		{
			accessorKey: "lastName",
			header: "Last Name",
			cell: ({ row }) => row.original.lastName || <span className="text-muted-foreground">-</span>,
		},
		{
			accessorKey: "lastLoginAt",
			header: "Last Login",
			cell: ({ row }) => {
				const val = row.original.lastLoginAt;
				if (!val) return <span className="text-muted-foreground">Never</span>;
				return new Date(val).toLocaleDateString();
			},
		},
		{
			accessorKey: "platformAdminRole",
			header: "Platform Admin",
			cell: ({ row }) => (
				<PlatformRoleBadge role={row.original.platformAdminRole} />
			),
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row }) => {
				const user = row.original;
				// Hide "Login as" when:
				// 1. The caller doesn't have the right role
				// 2. The target is a platform admin (cannot impersonate admins)
				if (!canImpersonate || user.isPlatformAdmin) {
					return null;
				}

				return (
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={() => setConfirmingUser(user)}
					>
						<LogIn className="size-3.5" />
						Login as
					</Button>
				);
			},
		},
	];

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="space-y-4">
			{/* Search bar */}
			<div className="flex items-center gap-2">
				<div className="relative w-80">
					<Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by email or name..."
						value={searchValue}
						onChange={(e) => onSearch(e.target.value)}
						className="pl-8"
					/>
				</div>
				{pagination && (
					<span className="ml-auto text-sm text-muted-foreground">
						{pagination.totalItems} user{pagination.totalItems !== 1 ? "s" : ""}
					</span>
				)}
			</div>

			{/* Table */}
			<div className="rounded-md border shadow-sm">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="border-b bg-muted/50 hover:bg-muted/60"
							>
								{headerGroup.headers.map((header) => (
									<TableHead
										key={header.id}
										className="px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap"
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center text-muted-foreground"
								>
									Loading…
								</TableCell>
							</TableRow>
						) : table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row, index) => (
								<TableRow
									key={row.id}
									className={`border-b transition-colors hover:bg-muted/50 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className="px-4 py-3 text-sm whitespace-nowrap"
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center"
								>
									No users found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			{pagination && pagination.totalPages > 1 && (
				<div className="flex items-center justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={pagination.currentPage <= 1 || isLoading}
						onClick={() => onPageChange(pagination.currentPage - 1)}
					>
						Previous
					</Button>
					<span className="text-sm text-muted-foreground">
						Page {pagination.currentPage} of {pagination.totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={pagination.currentPage >= pagination.totalPages || isLoading}
						onClick={() => onPageChange(pagination.currentPage + 1)}
					>
						Next
					</Button>
				</div>
			)}

			{/* Impersonation confirmation dialog — shared, rendered once */}
			<Dialog
				open={!!confirmingUser}
				onOpenChange={(open) => {
					if (!open) setConfirmingUser(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Impersonate user?</DialogTitle>
						<DialogDescription>
							You are about to impersonate{" "}
							<strong>{confirmingUser?.email}</strong>. This session is audited
							and will expire automatically after 1 hour.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" disabled={impersonateMutation.isPending}>
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							disabled={impersonateMutation.isPending}
							onClick={() => {
								if (confirmingUser) {
									impersonateMutation.mutate(confirmingUser.id);
								}
							}}
						>
							{impersonateMutation.isPending ? "Logging in..." : "Confirm — Login as user"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
