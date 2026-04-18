import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import DataTable from "@/components/tables/sales/view/data-table";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Layers, Plus } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/packages/instances/view",
)({
	beforeLoad: async () => {
		await requirePermission("service_management:read");
	},
	component: PackageInstancesViewPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type InstanceStatus = "active" | "expired" | "exhausted" | "cancelled";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

interface PackageInstanceRow {
	id: string;
	serviceId: string;
	serviceName: string;
	clientId: string;
	source: string;
	creditsTotal: number;
	creditsRemaining: number;
	creditsUsed: number;
	totalPrice: number | null;
	startsAt: string | null;
	expiresAt: string | null;
	status: InstanceStatus;
	paymentStatus: PaymentStatus;
	createdAt: string | null;
}

interface CreateInstanceFormState {
	serviceId: string;
	clientId: string;
	source: "assigned" | "purchased";
	creditsTotal: string;
	totalPriceRm: string;
	startsAt: string;
	expiresAt: string;
	paymentStatus: PaymentStatus;
	paymentPlanType: string;
	remark: string;
}

const today = new Date().toISOString().slice(0, 10);

const EMPTY_FORM: CreateInstanceFormState = {
	serviceId: "",
	clientId: "",
	source: "assigned",
	creditsTotal: "",
	totalPriceRm: "",
	startsAt: today,
	expiresAt: "",
	paymentStatus: "pending",
	paymentPlanType: "",
	remark: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────


function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
	active: "default",
	expired: "outline",
	exhausted: "secondary",
	cancelled: "destructive",
};

// ── Main component ─────────────────────────────────────────────────────────────

function PackageInstancesViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
	const [createOpen, setCreateOpen] = useState(false);
	const [form, setForm] = useState<CreateInstanceFormState>(EMPTY_FORM);

	// Admin list — all instances for the org
	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["packageInstances", organizationId, statusFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.packageInstances.listAll({
				organizationId,
				status: statusFilter as InstanceStatus | undefined,
			});
		},
		enabled: !!organizationId,
	});

	// Packages list for the create form selector (active services with sessionCount > 0)
	const { data: packagesList = [] } = useQuery({
		queryKey: ["services-packages", organizationId, true],
		queryFn: async () => {
			if (!organizationId) return [];
			const services = await client.services.list({ organizationId, isActive: true });
			return services.filter((s) => s.sessionCount != null && s.sessionCount > 0);
		},
		enabled: !!organizationId && createOpen,
	});

	// Active installment plans for the create form
	const { data: planList = [] } = useQuery({
		queryKey: ["installmentPlans-active", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.installmentPlans.list({ organizationId, activeOnly: true });
		},
		enabled: !!organizationId && createOpen,
	});

	// Always-on services query for the name mapping in the data table.
	// No isActive filter — historical instances may point at archived services.
	const { data: allServices = [] } = useQuery({
		queryKey: ["services-all", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.services.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const serviceNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const s of allServices) map.set(s.id, s.name);
		return map;
	}, [allServices]);

	const createMutation = useMutation({
		mutationFn: (input: Parameters<typeof client.packageInstances.create>[0]) =>
			client.packageInstances.create(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["packageInstances", organizationId] });
			toast.success("Package assigned successfully.");
			setCreateOpen(false);
			setForm(EMPTY_FORM);
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to assign package."),
	});

	function handleCreateSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId) return;

		if (!form.serviceId) { toast.error("Please select a package."); return; }
		if (!form.clientId.trim()) { toast.error("Client ID is required."); return; }
		const creditsTotal = parseInt(form.creditsTotal, 10);
		if (!Number.isFinite(creditsTotal) || creditsTotal < 1) {
			toast.error("Credits total must be at least 1."); return;
		}
		if (!form.startsAt) { toast.error("Start date is required."); return; }
		if (!form.expiresAt) { toast.error("Expiry date is required."); return; }
		if (new Date(form.expiresAt) <= new Date(form.startsAt)) {
			toast.error("Expiry date must be after start date."); return;
		}

		const totalPriceCents = form.totalPriceRm
			? Math.round(parseFloat(form.totalPriceRm) * 100)
			: undefined;

		createMutation.mutate({
			organizationId,
			serviceId: form.serviceId,
			clientId: form.clientId.trim(),
			source: form.source,
			creditsTotal,
			creditsRemaining: creditsTotal,
			startsAt: new Date(`${form.startsAt}T00:00:00.000Z`).toISOString(),
			expiresAt: new Date(`${form.expiresAt}T23:59:59.000Z`).toISOString(),
			totalPrice: totalPriceCents,
			paymentStatus: form.paymentStatus,
			paymentPlanType: form.paymentPlanType || undefined,
			remark: form.remark.trim() || undefined,
		});
	}

	const data: PackageInstanceRow[] = apiData.map((item) => ({
		id: item.id,
		serviceId: item.serviceId,
		serviceName: serviceNameById.get(item.serviceId) ?? `${item.serviceId.slice(0, 8)}…`,
		clientId: item.clientId,
		source: item.source,
		creditsTotal: item.creditsTotal,
		creditsRemaining: item.creditsRemaining,
		creditsUsed: item.creditsUsed,
		totalPrice: item.totalPrice ?? null,
		startsAt: item.startsAt ? String(item.startsAt) : null,
		expiresAt: item.expiresAt ? String(item.expiresAt) : null,
		status: item.status as InstanceStatus,
		paymentStatus: item.paymentStatus as PaymentStatus,
		createdAt: item.createdAt ? String(item.createdAt) : null,
	}));

	// Installment plan price breakdown helpers
	const selectedPlan = planList.find((p) => p.code === form.paymentPlanType);
	const baseRm = parseFloat(form.totalPriceRm || "0");
	const premiumPct = (selectedPlan?.pricePremiumBps ?? 0) / 100;
	const adjustedRm = Number.isFinite(baseRm) ? baseRm * (1 + premiumPct / 100) : 0;
	const perInstallmentRm =
		selectedPlan && selectedPlan.numInstallments > 0
			? adjustedRm / selectedPlan.numInstallments
			: 0;
	const showBreakdown =
		!!selectedPlan &&
		selectedPlan.numInstallments > 1 &&
		Number.isFinite(baseRm) &&
		baseRm > 0;

	const STATUS_TABS = [
		{ value: undefined, label: "All" },
		{ value: "active", label: "Active" },
		{ value: "expired", label: "Expired" },
		{ value: "exhausted", label: "Exhausted" },
		{ value: "cancelled", label: "Cancelled" },
	] as const;

	const columns: ColumnDef<PackageInstanceRow>[] = [
		{
			accessorKey: "serviceName",
			header: "Service",
			cell: ({ row }) => (
				<CopyableCell
					value={row.original.serviceId}
					displayText={row.original.serviceName}
				/>
			),
		},
		{
			accessorKey: "clientId",
			header: "Client ID",
			cell: ({ row }) => (
				<CopyableCell
					value={row.original.clientId}
					displayText={row.original.clientId.slice(0, 8) + "…"}
				/>
			),
		},
		{
			accessorKey: "source",
			header: "Source",
			cell: ({ row }) => (
				<Badge variant="outline">
					{row.original.source.charAt(0).toUpperCase() + row.original.source.slice(1)}
				</Badge>
			),
		},
		{
			id: "credits",
			header: "Credits Used",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{row.original.creditsUsed} / {row.original.creditsTotal}
				</span>
			),
		},
		{
			accessorKey: "creditsRemaining",
			header: "Remaining",
			cell: ({ row }) => (
				<span className="tabular-nums font-medium">
					{row.original.creditsRemaining}
				</span>
			),
		},
		{
			accessorKey: "totalPrice",
			header: "Total (MYR)",
			cell: ({ row }) =>
				row.original.totalPrice != null
					? formatPrice(row.original.totalPrice, "MYR")
					: <span className="text-muted-foreground">—</span>,
		},
		{
			accessorKey: "startsAt",
			header: "Starts",
			cell: ({ row }) => formatDate(row.original.startsAt),
		},
		{
			accessorKey: "expiresAt",
			header: "Expires",
			cell: ({ row }) => formatDate(row.original.expiresAt),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge variant={STATUS_VARIANTS[row.original.status] ?? "outline"}>
					{row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
				</Badge>
			),
		},
	];

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view package instances.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading…</span>
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
						<Layers className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">Package Instances</h1>
						<p className="text-sm text-muted-foreground">
							Assigned and purchased package records for all clients.
						</p>
					</div>
				</div>
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="h-4 w-4 mr-2" />
					Assign Package
				</Button>
			</div>

			{/* Status filter tabs */}
			<div className="flex items-center gap-1 border-b">
				{STATUS_TABS.map((tab) => {
					const isActive = statusFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Table */}
			<DataTable<PackageInstanceRow, unknown> columns={columns} data={data} />

			{/* Assign Package Sheet */}
			<Sheet open={createOpen} onOpenChange={(open) => {
				setCreateOpen(open);
				if (!open) setForm(EMPTY_FORM);
			}}>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader>
						<SheetTitle>Assign Package</SheetTitle>
						<SheetDescription>
							Assign or sell a package to a client. All fields marked * are required.
						</SheetDescription>
					</SheetHeader>

					<form onSubmit={handleCreateSubmit} className="flex flex-col gap-5 px-4 py-4">
						{/* Package selector */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="inst-package">
								Package <span className="text-destructive">*</span>
							</Label>
							<Select
								value={form.serviceId}
								onValueChange={(v) => setForm((f) => ({ ...f, serviceId: v }))}
							>
								<SelectTrigger id="inst-package">
									<SelectValue placeholder="Select a package…" />
								</SelectTrigger>
								<SelectContent>
									{packagesList.map((pkg) => (
										<SelectItem key={pkg.id} value={pkg.id}>
											{pkg.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Client ID */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="inst-client">
								Client ID <span className="text-destructive">*</span>
							</Label>
							<Input
								id="inst-client"
								placeholder="Client user UUID"
								value={form.clientId}
								onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
								className="font-mono text-sm"
							/>
							<p className="text-xs text-muted-foreground">Enter the client's user ID (UUID).</p>
						</div>

						{/* Source */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="inst-source">Source</Label>
							<Select
								value={form.source}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, source: v as "assigned" | "purchased" }))
								}
							>
								<SelectTrigger id="inst-source">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="assigned">Assigned (by staff)</SelectItem>
									<SelectItem value="purchased">Purchased (by client)</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Installment plan */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="inst-plan">Installment Plan</Label>
							<Select
								value={form.paymentPlanType || "__none__"}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, paymentPlanType: v === "__none__" ? "" : v }))
								}
							>
								<SelectTrigger id="inst-plan">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">Full payment (no installments)</SelectItem>
									{planList.map((plan) => (
										<SelectItem key={plan.id} value={plan.code}>
											{plan.name}
											{plan.pricePremiumBps > 0
												? ` (+${(plan.pricePremiumBps / 100).toFixed(1)}%)`
												: ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Optional — choose a plan to split the total into installments.
							</p>
						</div>

						{/* Credits total */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="inst-credits">
								Credits (Sessions) <span className="text-destructive">*</span>
							</Label>
							<Input
								id="inst-credits"
								type="number"
								min="1"
								step="1"
								placeholder="e.g. 10"
								value={form.creditsTotal}
								onChange={(e) => setForm((f) => ({ ...f, creditsTotal: e.target.value }))}
							/>
						</div>

						{/* Dates */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="inst-start">
									Start Date <span className="text-destructive">*</span>
								</Label>
								<Input
									id="inst-start"
									type="date"
									value={form.startsAt}
									onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="inst-expiry">
									Expiry Date <span className="text-destructive">*</span>
								</Label>
								<Input
									id="inst-expiry"
									type="date"
									value={form.expiresAt}
									onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
									min={form.startsAt || undefined}
								/>
							</div>
						</div>

						{/* Total price + Payment status */}
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="inst-price">Total Price (RM)</Label>
								<Input
									id="inst-price"
									type="number"
									min="0"
									step="0.01"
									placeholder="0.00"
									value={form.totalPriceRm}
									onChange={(e) => setForm((f) => ({ ...f, totalPriceRm: e.target.value }))}
								/>
								{showBreakdown && (
									<p className="text-xs text-muted-foreground leading-snug">
										Base RM {baseRm.toFixed(2)}
										{premiumPct > 0 &&
											` + ${premiumPct.toFixed(1)}% premium = RM ${adjustedRm.toFixed(2)}`}
										{" → "}
										{selectedPlan!.numInstallments} × RM {perInstallmentRm.toFixed(2)} every{" "}
										{selectedPlan!.defaultIntervalDays} days
									</p>
								)}
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="inst-payment-status">Payment Status</Label>
								<Select
									value={form.paymentStatus}
									onValueChange={(v) =>
										setForm((f) => ({ ...f, paymentStatus: v as PaymentStatus }))
									}
								>
									<SelectTrigger id="inst-payment-status">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="pending">Pending</SelectItem>
										<SelectItem value="paid">Paid</SelectItem>
										<SelectItem value="failed">Failed</SelectItem>
										<SelectItem value="refunded">Refunded</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Remark */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="inst-remark">Remark</Label>
							<Textarea
								id="inst-remark"
								placeholder="Optional notes…"
								rows={2}
								value={form.remark}
								onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
							/>
						</div>

						<Separator />

						<SheetFooter className="px-0 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}
								disabled={createMutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={createMutation.isPending}>
								{createMutation.isPending ? "Assigning…" : "Assign Package"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		</div>
	);
}
