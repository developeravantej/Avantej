import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import DataTable from "@/components/tables/sales/view/data-table";
import { Package, Plus, Edit, Archive } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/packages/view",
)({
	beforeLoad: async () => {
		await requirePermission("service_management:read");
	},
	component: PackagesViewPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type AppointmentType = "private" | "semi-private" | "both";
type ExpiryMode = "days" | "date" | "none";
type StatusFilter = "active" | "archived" | "all";

interface PackageRow {
	id: string;
	name: string;
	appointmentType: AppointmentType;
	sessionCount: number;
	pricePerSession: number; // cents
	maxClientsPerSession: number;
	expiryDays: number | null;
	expiryDate: string | null;
	branchId: string | null;
	isArchived: boolean;
	createdAt: string;
}

interface FormState {
	name: string;
	appointmentType: AppointmentType;
	sessionCount: string;
	pricePerSessionRm: string;
	maxClientsPerSession: string;
	expiryMode: ExpiryMode;
	expiryDays: string;
	expiryDate: string;
	branchId: string;
}

const EMPTY_FORM: FormState = {
	name: "",
	appointmentType: "private",
	sessionCount: "1",
	pricePerSessionRm: "",
	maxClientsPerSession: "1",
	expiryMode: "none",
	expiryDays: "",
	expiryDate: "",
	branchId: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────


function formatExpiryDisplay(row: PackageRow): string {
	if (row.expiryDays != null) return `${row.expiryDays} days`;
	if (row.expiryDate) return new Date(row.expiryDate).toLocaleDateString("en-MY");
	return "—";
}

const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
	private: "Private",
	"semi-private": "Semi-Private",
	both: "Both",
};

// ── Main component ─────────────────────────────────────────────────────────────

function PackagesViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [archiveTarget, setArchiveTarget] = useState<string | null>(null);

	const isArchivedFilter =
		statusFilter === "active"   ? false :
		statusFilter === "archived" ? true  :
		undefined;

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["services-packages", organizationId, isArchivedFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			const services = await client.services.list({ organizationId, isActive: isArchivedFilter === true ? false : isArchivedFilter === false ? true : undefined });
			return services.filter((s) => s.sessionCount != null && s.sessionCount > 0);
		},
		enabled: !!organizationId,
	});

	const createMutation = useMutation({
		mutationFn: (input: Parameters<typeof client.services.create>[0]) =>
			client.services.create(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["services-packages", organizationId] });
			toast.success("Package created successfully.");
			closeSheet();
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to create package."),
	});

	const updateMutation = useMutation({
		mutationFn: (input: Parameters<typeof client.services.update>[0]) =>
			client.services.update(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["services-packages", organizationId] });
			toast.success("Package updated successfully.");
			closeSheet();
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to update package."),
	});

	const archiveMutation = useMutation({
		mutationFn: (id: string) =>
			client.services.update({ organizationId: organizationId!, id, isActive: false }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["services-packages", organizationId] });
			toast.success("Package archived.");
			setArchiveTarget(null);
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to archive package."),
	});

	function openCreate() {
		setEditingId(null);
		setForm(EMPTY_FORM);
		setSheetOpen(true);
	}

	function openEdit(row: PackageRow) {
		setEditingId(row.id);
		setForm({
			name: row.name,
			appointmentType: row.appointmentType,
			sessionCount: String(row.sessionCount),
			pricePerSessionRm: (row.pricePerSession / 100).toFixed(2),
			maxClientsPerSession: String(row.maxClientsPerSession),
			expiryMode: row.expiryDays != null ? "days" : row.expiryDate ? "date" : "none",
			expiryDays: row.expiryDays ? String(row.expiryDays) : "",
			expiryDate: row.expiryDate ? row.expiryDate.slice(0, 10) : "",
			branchId: row.branchId ?? "",
		});
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setEditingId(null);
		setForm(EMPTY_FORM);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId) return;

		if (!form.name.trim()) { toast.error("Name is required."); return; }
		const sessionCount = parseInt(form.sessionCount, 10);
		if (!Number.isFinite(sessionCount) || sessionCount < 1) {
			toast.error("Session count must be at least 1."); return;
		}
		const priceRm = parseFloat(form.pricePerSessionRm);
		if (Number.isNaN(priceRm) || priceRm < 0) {
			toast.error("Price per session must be 0 or greater."); return;
		}
		const maxClients = parseInt(form.maxClientsPerSession, 10);
		if (!Number.isFinite(maxClients) || maxClients < 1) {
			toast.error("Max clients per session must be at least 1."); return;
		}

		let expiryDays: number | undefined;
		let expiryDate: string | undefined;
		if (form.expiryMode === "days") {
			const d = parseInt(form.expiryDays, 10);
			if (!Number.isFinite(d) || d < 1) { toast.error("Expiry days must be at least 1."); return; }
			expiryDays = d;
		} else if (form.expiryMode === "date") {
			if (!form.expiryDate) { toast.error("Please set an expiry date."); return; }
			expiryDate = new Date(`${form.expiryDate}T00:00:00.000Z`).toISOString();
		}

		const serviceType =
			form.appointmentType === "semi-private" ? "semi_private" :
			form.appointmentType === "both" ? "both" :
			"private";

		const basePayload = {
			organizationId,
			name: form.name.trim(),
			type: serviceType as "private" | "semi_private" | "both",
			sessionCount,
			price: Math.round(priceRm * 100),
			maxAttendees: maxClients,
			expiryDays,
			expiryDate,
			expirable: form.expiryMode !== "none",
			branchId: form.branchId.trim() || null,
			duration: 60,
			durationUnitType: "minutes" as const,
			isActive: true,
			schedulingType: "appointment" as const,
		};

		if (editingId) {
			updateMutation.mutate({ ...basePayload, id: editingId });
		} else {
			createMutation.mutate(basePayload);
		}
	}

	const data: PackageRow[] = apiData.map((item) => {
		// Map service type to appointment type display value
		const appointmentType: AppointmentType =
			item.type === "semi_private" ? "semi-private" :
			item.type === "both" ? "both" :
			"private";
		return {
			id: item.id,
			name: item.name,
			appointmentType,
			sessionCount: item.sessionCount ?? 0,
			pricePerSession: item.price ?? 0,
			maxClientsPerSession: item.maxAttendees ?? 1,
			expiryDays: item.expiryDays ?? null,
			expiryDate: item.expiryDate ? String(item.expiryDate) : null,
			branchId: item.branchId ?? null,
			isArchived: !(item.isActive ?? true),
			createdAt: item.createdAt ? String(item.createdAt) : "",
		};
	});

	const isMutating = createMutation.isPending || updateMutation.isPending || archiveMutation.isPending;

	const columns: ColumnDef<PackageRow>[] = [
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.name}</span>
			),
		},
		{
			accessorKey: "appointmentType",
			header: "Type",
			cell: ({ row }) => (
				<Badge variant="outline">
					{APPOINTMENT_TYPE_LABELS[row.original.appointmentType] ?? row.original.appointmentType}
				</Badge>
			),
		},
		{
			accessorKey: "sessionCount",
			header: "Sessions",
			cell: ({ row }) => (
				<span className="tabular-nums">{row.original.sessionCount}</span>
			),
		},
		{
			accessorKey: "pricePerSession",
			header: "Price / Session",
			cell: ({ row }) => (
				<span className="tabular-nums font-medium">
					{formatPrice(row.original.pricePerSession, "MYR")}
				</span>
			),
		},
		{
			accessorKey: "maxClientsPerSession",
			header: "Max Clients",
			cell: ({ row }) => (
				<span className="tabular-nums">{row.original.maxClientsPerSession}</span>
			),
		},
		{
			id: "validity",
			header: "Validity",
			cell: ({ row }) => formatExpiryDisplay(row.original),
		},
		{
			accessorKey: "isArchived",
			header: "Status",
			cell: ({ row }) =>
				row.original.isArchived ? (
					<Badge variant="outline">Archived</Badge>
				) : (
					<Badge variant="default">Active</Badge>
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
					{!row.original.isArchived && (
						<Button
							variant="ghost"
							size="sm"
							className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
							onClick={() => setArchiveTarget(row.original.id)}
							disabled={isMutating}
						>
							<Archive className="h-4 w-4 mr-1" />
							Archive
						</Button>
					)}
				</div>
			),
		},
	];

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view packages.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<Package className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Packages</h1>
						<p className="text-sm text-muted-foreground">
							Manage session packages available for purchase or assignment.
						</p>
					</div>
				</div>
				<Button onClick={openCreate} disabled={isMutating}>
					<Plus className="h-4 w-4 mr-2" />
					New Package
				</Button>
			</div>

			{/* Status filter tabs */}
			<div className="flex items-center rounded-lg border bg-muted/40 p-1 gap-1">
				{(["active", "archived", "all"] as const).map((s) => (
					<button
						key={s}
						type="button"
						onClick={() => setStatusFilter(s)}
						className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
							statusFilter === s
								? "bg-background shadow-sm text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{s.charAt(0).toUpperCase() + s.slice(1)}
					</button>
				))}
			</div>

			<Separator />

			{/* Table */}
			<DataTable<PackageRow, unknown> columns={columns} data={data} />

			{/* Create / Edit Sheet */}
			<Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); }}>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader>
						<SheetTitle>{editingId ? "Edit Package" : "New Package"}</SheetTitle>
						<SheetDescription>
							{editingId
								? "Update the details for this package."
								: "Create a new session package for your organization."}
						</SheetDescription>
					</SheetHeader>

					<form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 py-4">
						{/* Name */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pkg-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="pkg-name"
								placeholder="e.g. 10-Session Private Package"
								value={form.name}
								onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
								required
							/>
						</div>

						{/* Appointment Type */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pkg-type">
								Appointment Type <span className="text-destructive">*</span>
							</Label>
							<Select
								value={form.appointmentType}
								onValueChange={(v) => setForm((f) => ({ ...f, appointmentType: v as AppointmentType }))}
							>
								<SelectTrigger id="pkg-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="private">Private</SelectItem>
									<SelectItem value="semi-private">Semi-Private</SelectItem>
									<SelectItem value="both">Both</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Session Count + Max Clients */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="pkg-sessions">
									Session Count <span className="text-destructive">*</span>
								</Label>
								<Input
									id="pkg-sessions"
									type="number"
									min="1"
									step="1"
									value={form.sessionCount}
									onChange={(e) => setForm((f) => ({ ...f, sessionCount: e.target.value }))}
									required
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="pkg-max-clients">
									Max Clients / Session <span className="text-destructive">*</span>
								</Label>
								<Input
									id="pkg-max-clients"
									type="number"
									min="1"
									step="1"
									value={form.maxClientsPerSession}
									onChange={(e) => setForm((f) => ({ ...f, maxClientsPerSession: e.target.value }))}
									required
								/>
							</div>
						</div>

						{/* Price per session */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pkg-price">
								Price per Session (RM) <span className="text-destructive">*</span>
							</Label>
							<Input
								id="pkg-price"
								type="number"
								min="0"
								step="0.01"
								placeholder="0.00"
								value={form.pricePerSessionRm}
								onChange={(e) => setForm((f) => ({ ...f, pricePerSessionRm: e.target.value }))}
								required
							/>
							<p className="text-xs text-muted-foreground">Stored as integer cents (× 100).</p>
						</div>

						{/* Expiry mode */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pkg-expiry-mode">Validity</Label>
							<Select
								value={form.expiryMode}
								onValueChange={(v) => setForm((f) => ({ ...f, expiryMode: v as ExpiryMode, expiryDays: "", expiryDate: "" }))}
							>
								<SelectTrigger id="pkg-expiry-mode">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">No expiry</SelectItem>
									<SelectItem value="days">Rolling (days from start)</SelectItem>
									<SelectItem value="date">Fixed expiry date</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{form.expiryMode === "days" && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="pkg-expiry-days">
									Expiry Days <span className="text-destructive">*</span>
								</Label>
								<Input
									id="pkg-expiry-days"
									type="number"
									min="1"
									step="1"
									placeholder="e.g. 365"
									value={form.expiryDays}
									onChange={(e) => setForm((f) => ({ ...f, expiryDays: e.target.value }))}
								/>
							</div>
						)}

						{form.expiryMode === "date" && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="pkg-expiry-date">
									Expiry Date <span className="text-destructive">*</span>
								</Label>
								<Input
									id="pkg-expiry-date"
									type="date"
									value={form.expiryDate}
									onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
								/>
							</div>
						)}

						{/* Branch ID */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pkg-branch">Branch ID</Label>
							<Input
								id="pkg-branch"
								type="text"
								placeholder="Branch UUID (leave blank for org-wide)"
								value={form.branchId}
								onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
							/>
							<p className="text-xs text-muted-foreground">Optional. Restricts package to a specific branch.</p>
						</div>

						<SheetFooter className="px-0 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={closeSheet}
								disabled={createMutation.isPending || updateMutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
								{createMutation.isPending || updateMutation.isPending
									? "Saving…"
									: editingId ? "Save Changes" : "Create Package"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>

			{/* Archive Confirmation Dialog */}
			<Dialog
				open={archiveTarget !== null}
				onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Archive Package</DialogTitle>
						<DialogDescription>
							This package will be archived and hidden from new assignments.
							Existing client assignments are not affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setArchiveTarget(null)}
							disabled={archiveMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => archiveMutation.mutate(archiveTarget!)}
							disabled={archiveMutation.isPending}
						>
							{archiveMutation.isPending ? "Archiving…" : "Archive"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
