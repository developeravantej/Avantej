import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useDebounce } from "@/hooks/useDebounce";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/components/tables/sales/view/data-table";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BookUser, Plus, Search, Edit, ChevronDown } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/walk-in/view",
)({
	beforeLoad: async () => {
		await requirePermission("walk_in_customer_management:read");
	},
	component: WalkInCustomersPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Gender = "male" | "female" | "other" | "prefer_not_to_say";

type WalkInCustomerRow = {
	id: string;
	name: string;
	phone: string | null;
	email: string | null;
	dateOfBirth: Date | string | null;
	gender: string | null;
	branchId: string | null;
	address: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	medicalNotes: string | null;
	notes: string | null;
	isActive: boolean;
	createdAt: Date | string;
};

type FormState = {
	name: string;
	phone: string;
	email: string;
	dateOfBirth: string; // "YYYY-MM-DD" for the date input
	gender: Gender | "";
	branchId: string;
	address: string;
	emergencyContactName: string;
	emergencyContactPhone: string;
	medicalNotes: string;
	notes: string;
};

const EMPTY_FORM: FormState = {
	name: "",
	phone: "",
	email: "",
	dateOfBirth: "",
	gender: "",
	branchId: "",
	address: "",
	emergencyContactName: "",
	emergencyContactPhone: "",
	medicalNotes: "",
	notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Date or ISO string from the API to a "YYYY-MM-DD" string
 * suitable for an <input type="date">.
 */
function toDateInputValue(value: Date | string | null | undefined): string {
	if (!value) return "";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	return d.toISOString().slice(0, 10);
}

/**
 * Convert a "YYYY-MM-DD" date string to an ISO datetime string required by
 * the create procedure's z.string().datetime() validation.
 */
function dateInputToIso(value: string): string | undefined {
	if (!value) return undefined;
	// Append midnight UTC to satisfy datetime() validation
	return `${value}T00:00:00.000Z`;
}

// ─── Page component ───────────────────────────────────────────────────────────

function WalkInCustomersPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Search & debounce
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);

	// Sheet state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	// Collapsible sections in the sheet
	const [emergencyOpen, setEmergencyOpen] = useState(false);
	const [healthOpen, setHealthOpen] = useState(false);

	// ── Queries ────────────────────────────────────────────────────────────

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["walkInCustomers", organizationId, debouncedSearch],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.walkInCustomers.list({
				organizationId,
				search: debouncedSearch || undefined,
			});
		},
		enabled: !!organizationId,
	});

	// ── Mutations ──────────────────────────────────────────────────────────

	const createMutation = useMutation({
		mutationFn: (values: FormState) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.walkInCustomers.create({
				organizationId,
				name: values.name,
				phone: values.phone || undefined,
				email: values.email || undefined,
				dateOfBirth: dateInputToIso(values.dateOfBirth),
				gender: (values.gender as Gender) || undefined,
				branchId: values.branchId || undefined,
				address: values.address || undefined,
				emergencyContactName: values.emergencyContactName || undefined,
				emergencyContactPhone: values.emergencyContactPhone || undefined,
				medicalNotes: values.medicalNotes || undefined,
				notes: values.notes || undefined,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["walkInCustomers", organizationId],
			});
			toast.success("Walk-in customer created successfully.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to create customer.",
			);
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, values }: { id: string; values: FormState }) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.walkInCustomers.update({
				organizationId,
				id,
				name: values.name || undefined,
				phone: values.phone || undefined,
				email: values.email || undefined,
				dateOfBirth: values.dateOfBirth || undefined,
				gender: (values.gender as Gender) || undefined,
				branchId: values.branchId || undefined,
				address: values.address || undefined,
				emergencyContactName: values.emergencyContactName || undefined,
				emergencyContactPhone: values.emergencyContactPhone || undefined,
				medicalNotes: values.medicalNotes || undefined,
				notes: values.notes || undefined,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["walkInCustomers", organizationId],
			});
			toast.success("Walk-in customer updated successfully.");
			closeSheet();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to update customer.",
			);
		},
	});

	const deactivateMutation = useMutation({
		mutationFn: (id: string) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.walkInCustomers.deactivate({ organizationId, id });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["walkInCustomers", organizationId],
			});
			toast.success("Customer deactivated.");
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to deactivate customer.",
			);
		},
	});

	// ── Sheet helpers ──────────────────────────────────────────────────────

	function openCreate() {
		setEditingId(null);
		setForm(EMPTY_FORM);
		setEmergencyOpen(false);
		setHealthOpen(false);
		setSheetOpen(true);
	}

	function openEdit(row: WalkInCustomerRow) {
		setEditingId(row.id);
		setForm({
			name: row.name,
			phone: row.phone ?? "",
			email: row.email ?? "",
			dateOfBirth: toDateInputValue(row.dateOfBirth),
			gender: (row.gender as Gender) ?? "",
			branchId: row.branchId ?? "",
			address: row.address ?? "",
			emergencyContactName: row.emergencyContactName ?? "",
			emergencyContactPhone: row.emergencyContactPhone ?? "",
			medicalNotes: row.medicalNotes ?? "",
			notes: row.notes ?? "",
		});
		// Open collapsible sections if data exists
		setEmergencyOpen(
			!!(row.emergencyContactName || row.emergencyContactPhone),
		);
		setHealthOpen(!!(row.medicalNotes || row.notes));
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setEditingId(null);
		setForm(EMPTY_FORM);
		setEmergencyOpen(false);
		setHealthOpen(false);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.name.trim()) {
			toast.error("Name is required.");
			return;
		}
		if (editingId) {
			updateMutation.mutate({ id: editingId, values: form });
		} else {
			createMutation.mutate(form);
		}
	}

	const isMutating =
		createMutation.isPending ||
		updateMutation.isPending ||
		deactivateMutation.isPending;

	// ── Table data & columns ───────────────────────────────────────────────

	const tableData: WalkInCustomerRow[] = apiData.map((item) => ({
		id: item.id,
		name: item.name,
		phone: item.phone ?? null,
		email: item.email ?? null,
		dateOfBirth: item.dateOfBirth ?? null,
		gender: item.gender ?? null,
		branchId: item.branchId ?? null,
		address: item.address ?? null,
		emergencyContactName: item.emergencyContactName ?? null,
		emergencyContactPhone: item.emergencyContactPhone ?? null,
		medicalNotes: item.medicalNotes ?? null,
		notes: item.notes ?? null,
		isActive: item.isActive,
		createdAt: item.createdAt,
	}));

	const columns: ColumnDef<WalkInCustomerRow>[] = [
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.name}</span>
			),
		},
		{
			accessorKey: "phone",
			header: "Phone",
			cell: ({ row }) => <CopyableCell value={row.original.phone} />,
		},
		{
			accessorKey: "email",
			header: "Email",
			cell: ({ row }) => <CopyableCell value={row.original.email} />,
		},
		{
			accessorKey: "branchId",
			header: "Branch",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{row.original.branchId ?? "—"}
				</span>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Date Added",
			cell: ({ row }) => {
				const val = row.original.createdAt;
				if (!val) return "—";
				try {
					return new Date(val).toLocaleDateString();
				} catch {
					return "—";
				}
			},
		},
		{
			accessorKey: "isActive",
			header: "Status",
			cell: ({ row }) =>
				row.original.isActive ? (
					<Badge variant="default">Active</Badge>
				) : (
					<Badge variant="outline">Inactive</Badge>
				),
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => openEdit(row.original)}
						disabled={isMutating}
					>
						<Edit className="h-4 w-4 mr-1" />
						Edit
					</Button>
					{row.original.isActive && (
						<Button
							variant="ghost"
							size="sm"
							className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
							onClick={() => deactivateMutation.mutate(row.original.id)}
							disabled={isMutating}
						>
							Deactivate
						</Button>
					)}
				</div>
			),
		},
	];

	// ── Guard: no org selected ─────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage walk-in customers.
			</div>
		);
	}

	// ── Guard: loading ─────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<BookUser className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Walk-in Customers</h1>
						<p className="text-muted-foreground text-sm">
							Manage unregistered walk-in customers and their details.
						</p>
					</div>
				</div>
				<Button onClick={openCreate} disabled={isMutating}>
					<Plus className="h-4 w-4 mr-2" />
					Add Customer
				</Button>
			</div>

			{/* Search bar */}
			<div className="relative w-72">
				<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search name, email or phone..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-9"
				/>
			</div>

			<Separator />

			{/* Table */}
			<DataTable<WalkInCustomerRow, unknown>
				columns={columns}
				data={tableData}
			/>

			{/* Create / Edit Sheet */}
			<Sheet
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
			>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader>
						<SheetTitle>
							{editingId ? "Edit Customer" : "Add Walk-in Customer"}
						</SheetTitle>
						<SheetDescription>
							{editingId
								? "Update the details of this walk-in customer."
								: "Enter the details for the new walk-in customer."}
						</SheetDescription>
					</SheetHeader>

					<form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 py-4">
						{/* ── Basic Info ───────────────────────────────────────── */}
						<div className="space-y-1">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Basic Info
							</p>
							<Separator />
						</div>

						{/* Name */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wic-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="wic-name"
								placeholder="Full name"
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
								required
							/>
						</div>

						{/* Phone */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wic-phone">Phone</Label>
							<Input
								id="wic-phone"
								type="tel"
								placeholder="+60 12-345 6789"
								value={form.phone}
								onChange={(e) =>
									setForm((f) => ({ ...f, phone: e.target.value }))
								}
							/>
						</div>

						{/* Email */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wic-email">Email</Label>
							<Input
								id="wic-email"
								type="email"
								placeholder="customer@example.com"
								value={form.email}
								onChange={(e) =>
									setForm((f) => ({ ...f, email: e.target.value }))
								}
							/>
						</div>

						{/* Date of Birth + Gender row */}
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="wic-dob">Date of Birth</Label>
								<Input
									id="wic-dob"
									type="date"
									value={form.dateOfBirth}
									onChange={(e) =>
										setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="wic-gender">Gender</Label>
								<Select
									value={form.gender}
									onValueChange={(v) =>
										setForm((f) => ({ ...f, gender: v as Gender | "" }))
									}
								>
									<SelectTrigger id="wic-gender">
										<SelectValue placeholder="Select..." />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="male">Male</SelectItem>
										<SelectItem value="female">Female</SelectItem>
										<SelectItem value="other">Other</SelectItem>
										<SelectItem value="prefer_not_to_say">
											Prefer not to say
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* ── Location ─────────────────────────────────────────── */}
						<div className="space-y-1 pt-1">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Location
							</p>
							<Separator />
						</div>

						{/* Branch */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wic-branch">Branch ID</Label>
							<Input
								id="wic-branch"
								type="text"
								placeholder="Branch UUID (optional)"
								value={form.branchId}
								onChange={(e) =>
									setForm((f) => ({ ...f, branchId: e.target.value }))
								}
							/>
						</div>

						{/* Address */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="wic-address">Address</Label>
							<Textarea
								id="wic-address"
								placeholder="Street, city, postcode..."
								rows={2}
								value={form.address}
								onChange={(e) =>
									setForm((f) => ({ ...f, address: e.target.value }))
								}
							/>
						</div>

						{/* ── Emergency Contact (collapsible) ──────────────────── */}
						<Collapsible open={emergencyOpen} onOpenChange={setEmergencyOpen}>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex w-full items-center justify-between pt-1"
								>
									<div className="space-y-0.5 text-left">
										<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											Emergency Contact
										</p>
										<Separator />
									</div>
									<ChevronDown
										className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
											emergencyOpen ? "rotate-180" : ""
										}`}
									/>
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="flex flex-col gap-4 pt-3">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="wic-ec-name">Contact Name</Label>
									<Input
										id="wic-ec-name"
										placeholder="Emergency contact full name"
										value={form.emergencyContactName}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												emergencyContactName: e.target.value,
											}))
										}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="wic-ec-phone">Contact Phone</Label>
									<Input
										id="wic-ec-phone"
										type="tel"
										placeholder="+60 12-345 6789"
										value={form.emergencyContactPhone}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												emergencyContactPhone: e.target.value,
											}))
										}
									/>
								</div>
							</CollapsibleContent>
						</Collapsible>

						{/* ── Health Notes (collapsible) ────────────────────────── */}
						<Collapsible open={healthOpen} onOpenChange={setHealthOpen}>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex w-full items-center justify-between pt-1"
								>
									<div className="space-y-0.5 text-left">
										<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											Health Notes
										</p>
										<Separator />
									</div>
									<ChevronDown
										className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
											healthOpen ? "rotate-180" : ""
										}`}
									/>
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="flex flex-col gap-4 pt-3">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="wic-medical">Medical Notes</Label>
									<Textarea
										id="wic-medical"
										placeholder="Allergies, conditions, medications..."
										rows={3}
										value={form.medicalNotes}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												medicalNotes: e.target.value,
											}))
										}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="wic-notes">General Notes</Label>
									<Textarea
										id="wic-notes"
										placeholder="Any additional notes..."
										rows={2}
										value={form.notes}
										onChange={(e) =>
											setForm((f) => ({ ...f, notes: e.target.value }))
										}
									/>
								</div>
							</CollapsibleContent>
						</Collapsible>

						{/* ── Footer ───────────────────────────────────────────── */}
						<SheetFooter className="px-0 pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={closeSheet}
								disabled={isMutating}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isMutating}>
								{isMutating
									? "Saving..."
									: editingId
										? "Save Changes"
										: "Add Customer"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</div>
	);
}
