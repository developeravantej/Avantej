import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { CheckCircle, DollarSign, Layers, Plus, Zap, History, Users, Trash2 } from "lucide-react";
import { StatusTimeline } from "@/components/ui/status-timeline";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

import { Textarea } from "@/components/ui/textarea";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice, rmToCents } from "@/lib/money";
import { client } from "@/utils/orpc";

// ── Types ─────────────────────────────────────────────────────────────────────

type InstanceStatus = "active" | "expired" | "exhausted" | "cancelled" | "pending";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

interface PackageInstanceRow {
	id: string;
	serviceId: string;
	serviceName: string;
	clientId: string;
	clientName: string | null;
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
	pending: "secondary",
	expired: "outline",
	exhausted: "secondary",
	cancelled: "destructive",
};

const STATUS_TABS = [
	{ value: undefined, label: "All" },
	{ value: "active", label: "Active" },
	{ value: "pending", label: "Pending" },
	{ value: "expired", label: "Expired" },
	{ value: "exhausted", label: "Exhausted" },
	{ value: "cancelled", label: "Cancelled" },
] as const;

const TH = "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const TD = "px-5 py-4";

// ── Status History sub-component ──────────────────────────────────────────────

function PackageInstanceHistory({
	organizationId,
	packageInstanceId,
}: {
	organizationId: string;
	packageInstanceId: string;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["packageInstances", "statusHistory", packageInstanceId],
		queryFn: () =>
			client.packageInstances.statusHistory({ organizationId, packageInstanceId }),
	});
	return <StatusTimeline entries={data?.rows ?? []} isLoading={isLoading} />;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PackageInstancesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
	const [createOpen, setCreateOpen] = useState(false);
	const [form, setForm] = useState<CreateInstanceFormState>(EMPTY_FORM);
	const [historyInstanceId, setHistoryInstanceId] = useState<string | null>(null);
	const [staffInstanceId, setStaffInstanceId] = useState<string | null>(null);
	const [assignStaffId, setAssignStaffId] = useState("");

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

	const createMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.packageInstances.create>[0]) =>
			client.packageInstances.create(input),
		successMessage: "Package assigned successfully.",
		errorMessage: (err) => err.message || "Failed to assign package.",
		invalidate: [["packageInstances", organizationId]],
		onSuccess: () => {
			setCreateOpen(false);
			setForm(EMPTY_FORM);
		},
	});

	// Staff assignment queries + mutations
	const { data: staffRows = [], isLoading: isLoadingStaff } = useQuery({
		queryKey: ["packageInstanceStaff", staffInstanceId, organizationId],
		queryFn: async () => {
			if (!staffInstanceId || !organizationId) return [];
			return client.packageInstanceStaff.list({
				organizationId,
				packageInstanceId: staffInstanceId,
			});
		},
		enabled: !!staffInstanceId && !!organizationId,
	});

	const { data: trainerList = [] } = useQuery({
		queryKey: ["members", organizationId, "trainer"],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.members.list({ organizationId, role: "trainer", status: "active" });
		},
		enabled: !!staffInstanceId && !!organizationId,
	});

	const assignStaffMutation = useApiMutation({
		mutationFn: (input: { staffId: string; slotIndex: number }) =>
			client.packageInstanceStaff.assign({
				organizationId: organizationId!,
				packageInstanceId: staffInstanceId!,
				staffId: input.staffId,
				slotIndex: input.slotIndex,
			}),
		successMessage: "Staff assigned.",
		errorMessage: (err) => err.message || "Failed to assign staff.",
		invalidate: [["packageInstanceStaff", staffInstanceId, organizationId]],
		onSuccess: () => setAssignStaffId(""),
	});

	const removeStaffMutation = useApiMutation({
		mutationFn: (staffId: string) =>
			client.packageInstanceStaff.remove({
				organizationId: organizationId!,
				packageInstanceId: staffInstanceId!,
				staffId,
			}),
		successMessage: "Staff removed.",
		errorMessage: (err) => err.message || "Failed to remove staff.",
		invalidate: [["packageInstanceStaff", staffInstanceId, organizationId]],
	});

	function handleAssignStaff() {
		if (!assignStaffId || !staffInstanceId || !organizationId) return;
		// slotIndex = next available index
		const nextSlot = staffRows.length > 0
			? Math.max(...staffRows.map((r) => r.slotIndex)) + 1
			: 0;
		assignStaffMutation.mutate({ staffId: assignStaffId, slotIndex: nextSlot });
	}

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
			? rmToCents(parseFloat(form.totalPriceRm))
			: undefined;

		createMutation.mutate({
			organizationId,
			serviceId: form.serviceId,
			clientId: form.clientId.trim(),
			source: form.source,
			creditsTotal,
			...({creditsRemaining: creditsTotal} as any),
			startsAt: new Date(`${form.startsAt}T00:00:00.000Z`).toISOString(),
			expiresAt: new Date(`${form.expiresAt}T23:59:59.000Z`).toISOString(),
			totalPrice: totalPriceCents,
			paymentStatus: form.paymentStatus,
			paymentPlanType: form.paymentPlanType || undefined,
			remark: form.remark.trim() || undefined,
		});
	}

	const data: PackageInstanceRow[] = apiData.map((item: any) => ({
		id: item.id,
		serviceId: item.serviceId,
		serviceName: serviceNameById.get(item.serviceId) ?? `${item.serviceId.slice(0, 8)}…`,
		clientId: item.clientId,
		clientName: (item as { clientName?: string | null }).clientName ?? null,
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

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view package instances.
			</div>
		);
	}

	// ── Stat computations ──────────────────────────────────────────────────────
	const totalActive = data.filter((d) => d.status === "active").length;
	const totalCreditsUsed = data.reduce((s, d) => s + d.creditsUsed, 0);
	const totalRevenue = data.reduce((s, d) => s + (d.totalPrice ?? 0), 0);

	return (
		<>
			{/* Header */}
				<div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
					<div className="mr-auto">
						<h1 className="text-base font-semibold tracking-tight">Session Packs</h1>
						<p className="text-xs text-muted-foreground">
							{isLoading ? "Loading…" : `${data.length} record${data.length !== 1 ? "s" : ""}`}
						</p>
					</div>
					<Button size="sm" onClick={() => setCreateOpen(true)}>
						<Plus className="h-4 w-4 mr-1.5" />
						Assign Pack
					</Button>
				</div>

				{/* Stat cards */}
				<div className="grid grid-cols-2 gap-3 border-b px-5 py-4 lg:grid-cols-4">
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
							<p className="mt-1 text-2xl font-bold">{data.length}</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<Layers className="h-4 w-4 text-muted-foreground" />
						</div>
					</div>
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active</p>
							<p className="mt-1 text-2xl font-bold">{totalActive}</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<CheckCircle className="h-4 w-4 text-muted-foreground" />
						</div>
					</div>
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Credits Used</p>
							<p className="mt-1 text-2xl font-bold">{totalCreditsUsed}</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<Zap className="h-4 w-4 text-muted-foreground" />
						</div>
					</div>
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Revenue</p>
							<p className="mt-1 text-2xl font-bold">{formatPrice(totalRevenue, "MYR")}</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<DollarSign className="h-4 w-4 text-muted-foreground" />
						</div>
					</div>
				</div>

				{/* Filter tabs */}
				<div className="flex items-center gap-1.5 overflow-x-auto border-b px-5 py-3">
					{STATUS_TABS.map((tab) => (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
								statusFilter === tab.value
									? "bg-foreground text-background shadow-sm"
									: "text-muted-foreground hover:bg-muted hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Table */}
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className={TH}>Service</TableHead>
							<TableHead className={TH}>Client</TableHead>
							<TableHead className={TH}>Source</TableHead>
							<TableHead className={TH}>Credits Used</TableHead>
							<TableHead className={TH}>Remaining</TableHead>
							<TableHead className={TH}>Total (MYR)</TableHead>
							<TableHead className={TH}>Starts</TableHead>
							<TableHead className={TH}>Expires</TableHead>
							<TableHead className={TH}>Status</TableHead>
							<TableHead className={TH}>Staff</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 10 }).map((__, j) => (
										<TableCell key={j} className={TD}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : data.length === 0 ? (
							<TableRow>
								<TableCell colSpan={10} className="h-60">
									<div className="flex flex-col items-center justify-center gap-3 text-center">
										<div className="flex size-14 items-center justify-center rounded-full bg-muted">
											<Layers className="h-6 w-6 text-muted-foreground" />
										</div>
										<p className="text-sm font-medium">No session packs found</p>
										<p className="text-xs text-muted-foreground">Assign a pack to get started.</p>
									</div>
								</TableCell>
							</TableRow>
						) : (
							data.map((row) => (
								<TableRow
									key={row.id}
									className="transition-colors hover:bg-muted/30 cursor-pointer"
									onClick={() => setHistoryInstanceId(row.id)}
								>
									<TableCell className={TD}>
										<CopyableCell
											value={row.serviceId}
											displayText={row.serviceName}
										/>
									</TableCell>
									<TableCell className={TD}>
										<CopyableCell
											value={row.clientId}
											displayText={row.clientName ?? row.clientId.slice(0, 8) + "…"}
										/>
									</TableCell>
									<TableCell className={TD}>
										<Badge variant="outline">
											{row.source.charAt(0).toUpperCase() + row.source.slice(1)}
										</Badge>
									</TableCell>
									<TableCell className={TD}>
										<span className="tabular-nums">
											{row.creditsUsed} / {row.creditsTotal}
										</span>
									</TableCell>
									<TableCell className={TD}>
										<span className="tabular-nums font-medium">{row.creditsRemaining}</span>
									</TableCell>
									<TableCell className={TD}>
										{row.totalPrice != null ? (
											formatPrice(row.totalPrice, "MYR")
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className={TD}>{formatDate(row.startsAt)}</TableCell>
									<TableCell className={TD}>{formatDate(row.expiresAt)}</TableCell>
									<TableCell className={TD}>
										<Badge variant={STATUS_VARIANTS[row.status] ?? "outline"}>
											{row.status.charAt(0).toUpperCase() + row.status.slice(1)}
										</Badge>
									</TableCell>
									<TableCell className={TD}>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-xs"
											onClick={(e) => {
												e.stopPropagation();
												setStaffInstanceId(row.id);
											}}
										>
											<Users className="h-3.5 w-3.5 mr-1" />
											Staff
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>

			{/* Assign Package Dialog */}
			<Dialog
				open={createOpen}
				onOpenChange={(open) => {
					setCreateOpen(open);
					if (!open) setForm(EMPTY_FORM);
				}}
			>
				<DialogContent className="sm:max-w-lg overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Assign Package</DialogTitle>
						<DialogDescription>
							Assign or sell a package to a client. All fields marked * are required.
						</DialogDescription>
					</DialogHeader>

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

						<DialogFooter className="px-0 pt-2">
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
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* ── Status History Dialog ── */}
			<Dialog
				open={historyInstanceId !== null}
				onOpenChange={(open) => {
					if (!open) setHistoryInstanceId(null);
				}}
			>
				<DialogContent className="sm:max-w-md overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<History className="h-4 w-4 text-muted-foreground" />
							Status History
						</DialogTitle>
						<DialogDescription>
							Status transitions for this package instance.
						</DialogDescription>
					</DialogHeader>
					{historyInstanceId && organizationId && (
						<PackageInstanceHistory
							organizationId={organizationId}
							packageInstanceId={historyInstanceId}
						/>
					)}
				</DialogContent>
			</Dialog>

			{/* ── Assigned Staff Dialog ── */}
			<Dialog
				open={staffInstanceId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setStaffInstanceId(null);
						setAssignStaffId("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Users className="h-4 w-4 text-muted-foreground" />
							Assigned Staff
						</DialogTitle>
						<DialogDescription>
							Manage trainer/staff assignments for this package instance.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						{/* Current assignments */}
						{isLoadingStaff ? (
							<div className="text-sm text-muted-foreground">Loading…</div>
						) : staffRows.length === 0 ? (
							<p className="text-sm text-muted-foreground">No staff assigned yet.</p>
						) : (
							<div className="space-y-2">
								{staffRows.map((sr) => {
									type TrainerItem = { id: string; userId?: string; name?: string | null; email?: string | null };
									const trainer = (trainerList as TrainerItem[]).find(
										(t) => t.userId === sr.staffId,
									);
									const displayName =
										trainer?.name ?? trainer?.email ?? sr.staffId.slice(0, 8) + "…";
									return (
										<div
											key={sr.id}
											className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
										>
											<div className="flex items-center gap-2">
												<span className="text-xs text-muted-foreground font-mono w-6">
													#{sr.slotIndex}
												</span>
												<span className="font-medium">{displayName}</span>
												<Badge variant="outline" className="text-[10px] px-1.5 py-0">
													{sr.role}
												</Badge>
											</div>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 w-7 p-0 text-destructive hover:text-destructive"
												disabled={removeStaffMutation.isPending}
												onClick={() => removeStaffMutation.mutate(sr.staffId)}
											>
												<Trash2 className="h-3.5 w-3.5" />
											</Button>
										</div>
									);
								})}
							</div>
						)}

						<Separator />

						{/* Add staff */}
						<div className="flex gap-2">
							<Select value={assignStaffId} onValueChange={setAssignStaffId}>
								<SelectTrigger className="flex-1">
									<SelectValue placeholder="Select trainer to add…" />
								</SelectTrigger>
								<SelectContent>
									{(trainerList as Array<{ id: string; userId?: string; name?: string | null; email?: string | null }>).map((t) => {
										const alreadyAssigned = staffRows.some((sr) => sr.staffId === t.userId);
										if (alreadyAssigned) return null;
										return (
											<SelectItem key={t.id} value={t.userId ?? t.id}>
												{t.name ?? t.email ?? t.id}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
							<Button
								size="sm"
								disabled={!assignStaffId || assignStaffMutation.isPending}
								onClick={handleAssignStaff}
							>
								<Plus className="h-4 w-4 mr-1" />
								Add
							</Button>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setStaffInstanceId(null)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
