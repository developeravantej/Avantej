"use client";

import { useState } from "react";
import { ConfirmPaymentDialog } from "@/components/packages/confirm-payment-dialog";
import type { Installment } from "@/components/packages/installment-types";
import type { InstallmentOverviewItem } from "@/components/packages/installment-types";
import { InstallmentTimeline } from "@/components/packages/installment-timeline";
import { ManualUnlockDialog } from "@/components/packages/manual-unlock-dialog";
import { RefundDialog } from "@/components/packages/refund-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { formatPrice } from "@/lib/money";
import type { PackageRowVM } from "./packages-tab";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	try {
		const d = value instanceof Date ? value : new Date(value as string);
		if (Number.isNaN(d.getTime())) return "—";
		return d.toISOString().slice(0, 10);
	} catch {
		return "—";
	}
}

function expiryLabel(days: number | null): { text: string; className: string } {
	if (days === null)
		return { text: "No expiry", className: "text-muted-foreground" };
	if (days <= 0)
		return { text: "Expired", className: "font-medium text-red-600" };
	if (days <= 7)
		return {
			text: `in ${days} day${days !== 1 ? "s" : ""}`,
			className: "font-medium text-red-600",
		};
	if (days <= 30)
		return { text: `in ${days} days`, className: "font-medium text-amber-600" };
	return { text: `in ${days} days`, className: "text-muted-foreground" };
}

// Build the minimal InstallmentOverviewItem shape the dialogs need.
// ManualUnlockDialog uses: packageInstance.id
// RefundDialog uses: packageInstance.id
// Both check `if (!packageInstance)` so the cast is safe as long as id is set.
function toMinimalOverviewItem(row: PackageRowVM): InstallmentOverviewItem {
	return {
		id: row.id,
		clientId: row.clientId,
		serviceId: row.serviceId,
		serviceName: row.serviceName ?? null,
		creditsTotal: row.creditsTotal,
		creditsRemaining: row.creditsRemaining,
		creditsUsed: 0,
		creditsUnlocked: 0,
		isLocked: row.isLocked,
		lockedReason: row.lockedReason ?? null,
		gracePeriodEndsAt: row.installment?.gracePeriodEndsAt ?? null,
		nextDueDate: row.installment?.nextDueDate ?? null,
		paymentPlanType: row.installment?.paymentPlanType ?? null,
		installmentsPaid: row.installment?.installmentsPaid ?? 0,
		installmentsTotal: row.installment?.installmentsTotal ?? 0,
	} as unknown as InstallmentOverviewItem;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PackagesTabRowDrawerProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	row: PackageRowVM | null;
	organizationId: string;
	/** Pass true; router enforces admin internally (AC9) — no UI gating needed. */
	canWrite: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PackagesTabRowDrawer({
	open,
	onOpenChange,
	row,
	organizationId,
	canWrite,
}: PackagesTabRowDrawerProps) {
	const [confirmInstallment, setConfirmInstallment] =
		useState<Installment | null>(null);
	const [unlockOpen, setUnlockOpen] = useState(false);
	const [refundOpen, setRefundOpen] = useState(false);

	// Nothing to render until a row is selected
	if (!row) return null;

	const creditsPercent =
		Math.round((row.creditsRemaining / Math.max(row.creditsTotal, 1)) * 100);

	const expiry = expiryLabel(row.daysUntilExpiry);

	// Status badge
	let statusVariant: "default" | "secondary" | "outline" = "default";
	let statusLabel = row.status.charAt(0).toUpperCase() + row.status.slice(1);
	if (row.isLocked) {
		statusVariant = "secondary";
		statusLabel = "Frozen";
	} else if (
		row.status === "expired" ||
		row.status === "exhausted" ||
		row.status === "cancelled"
	) {
		statusVariant = "outline";
	}

	const minimalItem = toMinimalOverviewItem(row);

	return (
		<>
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
					{/* ── Header ───────────────────────────────────────────────────── */}
					<SheetHeader className="border-b pb-4">
						<SheetTitle className="text-base font-semibold">
							{row.clientName ?? "Unknown customer"}
						</SheetTitle>
						<p className="text-sm text-muted-foreground">
							{row.serviceName ?? "—"}
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							<Badge variant={statusVariant}>{statusLabel}</Badge>
							{row.installment && (
								<Badge variant="outline">
									{row.installment.paymentPlanName ??
										row.installment.paymentPlanType}
								</Badge>
							)}
						</div>
					</SheetHeader>

					{/* ── Summary ──────────────────────────────────────────────────── */}
					<div className="flex flex-col gap-4 px-1 py-5">
						{/* Credits */}
						<div className="flex flex-col gap-1">
							<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Credits
							</span>
							<div className="flex items-center gap-3">
								<span className="tabular-nums text-sm font-medium">
									{row.creditsRemaining} / {row.creditsTotal}
								</span>
								<div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full bg-primary"
										style={{ width: `${creditsPercent}%` }}
									/>
								</div>
							</div>
						</div>

						{/* Expiry */}
						<div className="flex flex-col gap-0.5">
							<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Expires
							</span>
							<span className="text-sm">{formatDate(row.expiresAt)}</span>
							<span className={`text-xs ${expiry.className}`}>
								{expiry.text}
							</span>
						</div>

						{/* Outstanding balance — only if > 0 */}
						{row.outstandingBalanceCents > 0 && (
							<div className="flex flex-col gap-0.5">
								<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Outstanding Balance
								</span>
								<span className="font-medium text-red-600 text-sm">
									{formatPrice(row.outstandingBalanceCents, "MYR")}
								</span>
							</div>
						)}

						{/* Started */}
						<div className="flex flex-col gap-0.5">
							<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Started
							</span>
							<span className="text-sm">{formatDate(row.startsAt)}</span>
						</div>
					</div>

					{/* ── Installment section ───────────────────────────────────────── */}
					{row.installment && (
						<>
							<Separator />
							<div className="flex flex-col gap-4 py-5">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">Installment Schedule</span>
									{canWrite && (
										<div className="flex gap-2">
											{row.isLocked && (
												<Button
													size="sm"
													variant="outline"
													onClick={() => setUnlockOpen(true)}
												>
													Unlock
												</Button>
											)}
											<Button
												size="sm"
												variant="outline"
												onClick={() => setRefundOpen(true)}
											>
												Refund
											</Button>
										</div>
									)}
								</div>
								<InstallmentTimeline
									organizationId={organizationId}
									packageInstanceId={row.id}
									onConfirmPayment={(i) => setConfirmInstallment(i)}
									canWrite={canWrite}
								/>
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>

			{/* ── Dialogs ──────────────────────────────────────────────────────── */}
			<ConfirmPaymentDialog
				open={!!confirmInstallment}
				onOpenChange={(v) => {
					if (!v) setConfirmInstallment(null);
				}}
				installment={confirmInstallment}
				organizationId={organizationId}
				onSuccess={() => setConfirmInstallment(null)}
			/>

			<ManualUnlockDialog
				open={unlockOpen}
				onOpenChange={setUnlockOpen}
				packageInstance={minimalItem}
				organizationId={organizationId}
				onSuccess={() => setUnlockOpen(false)}
			/>

			<RefundDialog
				open={refundOpen}
				onOpenChange={setRefundOpen}
				packageInstance={minimalItem}
				organizationId={organizationId}
				onSuccess={() => setRefundOpen(false)}
			/>
		</>
	);
}
