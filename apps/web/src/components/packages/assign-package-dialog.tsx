"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useState } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { rmToCents } from "@/lib/money";
import { client } from "@/utils/orpc";

// ── Types ──────────────────────────────────────────────────────────────────────

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

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

// ── Component ──────────────────────────────────────────────────────────────────

export interface AssignPackageDialogProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	organizationId: string;
	/**
	 * When provided, pre-fills the Client ID input with this value.
	 * The field remains editable so staff can override it.
	 */
	defaultClientId?: string;
	/**
	 * Called after a successful create mutation.
	 * The caller is responsible for invalidating any additional query keys
	 * (e.g. ["memberships", orgId] and ["installments-overview", orgId])
	 * beyond what this dialog already handles ("packageInstances").
	 */
	onSuccess: () => void;
}

export function AssignPackageDialog({
	open,
	onOpenChange,
	organizationId,
	defaultClientId,
	onSuccess,
}: AssignPackageDialogProps) {
	const [form, setForm] = useState<CreateInstanceFormState>(() => ({
		...EMPTY_FORM,
		clientId: defaultClientId ?? "",
	}));

	// Sync defaultClientId into the form when the dialog opens (or prop changes)
	// by tracking a "key" so we can reset — done via the open state reset below.

	// Packages list for the create form selector (active services with sessionCount > 0)
	const { data: packagesList = [] } = useQuery({
		queryKey: ["services-packages", organizationId, true],
		queryFn: async () => {
			const services = await client.services.list({ organizationId, isActive: true });
			return services.filter((s) => s.sessionCount != null && s.sessionCount > 0);
		},
		enabled: !!organizationId && open,
	});

	// Active installment plans for the create form
	const { data: planList = [] } = useQuery({
		queryKey: ["installmentPlans-active", organizationId],
		queryFn: async () => {
			return client.installmentPlans.list({ organizationId, activeOnly: true });
		},
		enabled: !!organizationId && open,
	});

	const createMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.packageInstances.create>[0]) =>
			client.packageInstances.create(input),
		successMessage: "Package assigned successfully.",
		errorMessage: (err) => err.message || "Failed to assign package.",
		invalidate: [["packageInstances", organizationId]],
		onSuccess: () => {
			onSuccess();
			setForm({ ...EMPTY_FORM, clientId: defaultClientId ?? "" });
		},
	});

	function handleClose() {
		onOpenChange(false);
		setForm({ ...EMPTY_FORM, clientId: defaultClientId ?? "" });
	}

	function handleCreateSubmit(e: React.FormEvent) {
		e.preventDefault();

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
			startsAt: new Date(`${form.startsAt}T00:00:00.000Z`).toISOString(),
			expiresAt: new Date(`${form.expiresAt}T23:59:59.000Z`).toISOString(),
			totalPrice: totalPriceCents,
			paymentStatus: form.paymentStatus,
			paymentPlanType: form.paymentPlanType || undefined,
			remark: form.remark.trim() || undefined,
		});
	}

	// Price breakdown helpers
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

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) handleClose();
				else onOpenChange(true);
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
							onClick={handleClose}
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
	);
}
