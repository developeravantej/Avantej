"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchOption {
	id: string;
	name: string;
}

interface AssignPackageModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** tenant members.id values from the customer directory selection */
	customerIds: string[];
	organizationId: string;
	/** Pre-resolved branch nodes from userContext — avoids a separate hierarchy API call */
	branches: BranchOption[];
	/** Called after a successful (even partial) bulk assign */
	onSuccess?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignPackageModal({
	open,
	onOpenChange,
	customerIds,
	organizationId,
	branches,
	onSuccess,
}: AssignPackageModalProps) {
	const today = new Date().toISOString().slice(0, 10);

	const [packageId, setPackageId] = useState("");
	const [branchId, setBranchId] = useState("");
	const [trainerMemberId, setTrainerMemberId] = useState("");
	const [startDate, setStartDate] = useState(today);
	const [notes, setNotes] = useState("");

	// ── Data fetching ─────────────────────────────────────────────────────────

	const { data: servicesData, isLoading: servicesLoading } = useQuery({
		queryKey: ["services", organizationId],
		queryFn: () => client.services.list({ organizationId, isActive: true }),
		enabled: open && !!organizationId,
	});

	const { data: membersData, isLoading: membersLoading } = useQuery({
		queryKey: ["members", organizationId, "trainer"],
		queryFn: () => client.members.list({ organizationId, role: "trainer" }),
		enabled: open && !!organizationId,
	});

	const packages = servicesData ?? [];
	const trainers = membersData ?? [];

	// ── Mutation ──────────────────────────────────────────────────────────────

	const mutation = useApiMutation({
		mutationFn: (vars: Parameters<typeof client.packageInstances.bulkAssign>[0]) =>
			client.packageInstances.bulkAssign(vars),
		successMessage: false, // handled manually below for partial results
		errorMessage: (err) => err.message,
		invalidate: [
			["customerDirectory", organizationId],
			["customerDirectoryStats", organizationId],
		],
		onSuccess: (data) => {
			const { succeededCount, failedCount } = data;
			if (failedCount === 0) {
				// All succeeded
				import("sonner").then(({ toast }) =>
					toast.success(`Package assigned to ${succeededCount} customer${succeededCount !== 1 ? "s" : ""}.`),
				);
			} else if (succeededCount === 0) {
				import("sonner").then(({ toast }) =>
					toast.error(`Failed to assign package to all ${failedCount} customer${failedCount !== 1 ? "s" : ""}.`),
				);
			} else {
				import("sonner").then(({ toast }) =>
					toast.warning(
						`Assigned to ${succeededCount}, failed for ${failedCount} customer${failedCount !== 1 ? "s" : ""}.`,
					),
				);
			}
			onSuccess?.();
			onOpenChange(false);
			resetForm();
		},
	});

	function resetForm() {
		setPackageId("");
		setBranchId("");
		setTrainerMemberId("");
		setStartDate(today);
		setNotes("");
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!packageId || !branchId) return;
		mutation.mutate({
			organizationId,
			customerIds,
			packageId,
			branchId,
			trainerMemberId: trainerMemberId || undefined,
			startDate,
			notes: notes || undefined,
		});
	}

	const isLoading = servicesLoading || membersLoading;
	const canSubmit = !!packageId && !!branchId && !mutation.isPending;

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) { onOpenChange(v); if (!v) resetForm(); } }}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle className="text-base font-semibold text-[#0a0a0a]">
						Assign package
						<span className="ml-2 text-xs font-normal text-[#737373]">
							to {customerIds.length} customer{customerIds.length !== 1 ? "s" : ""}
						</span>
					</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="mt-2 space-y-4">
					{/* Package selector */}
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
							Package <span className="text-rose-500">*</span>
						</label>
						{isLoading ? (
							<div className="h-9 rounded-lg bg-[#e5e5e5] animate-pulse" />
						) : (
							<select
								required
								value={packageId}
								onChange={(e) => setPackageId(e.target.value)}
								className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]"
							>
								<option value="">Select a package…</option>
								{packages.map((pkg) => (
									<option key={pkg.id} value={pkg.id}>
										{pkg.name}
										{pkg.sessionCount ? ` (${pkg.sessionCount} sessions)` : ""}
									</option>
								))}
							</select>
						)}
					</div>

					{/* Branch selector */}
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
							Branch <span className="text-rose-500">*</span>
						</label>
						{isLoading ? (
							<div className="h-9 rounded-lg bg-[#e5e5e5] animate-pulse" />
						) : (
							<select
								required
								value={branchId}
								onChange={(e) => setBranchId(e.target.value)}
								className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]"
							>
								<option value="">Select a branch…</option>
								{branches.map((branch) => (
									<option key={branch.id} value={branch.id}>
										{branch.name}
									</option>
								))}
							</select>
						)}
					</div>

					{/* Trainer selector (optional) */}
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
							Trainer <span className="text-[#a3a3a3] font-normal normal-case">(optional)</span>
						</label>
						{isLoading ? (
							<div className="h-9 rounded-lg bg-[#e5e5e5] animate-pulse" />
						) : (
							<select
								value={trainerMemberId}
								onChange={(e) => setTrainerMemberId(e.target.value)}
								className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]"
							>
								<option value="">No trainer assigned</option>
								{trainers.map((trainer: { id: string; name: string; email: string }) => (
									<option key={trainer.id} value={trainer.id}>
										{trainer.name ?? trainer.email ?? trainer.id}
									</option>
								))}
							</select>
						)}
					</div>

					{/* Start date */}
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
							Start date <span className="text-rose-500">*</span>
						</label>
						<input
							type="date"
							required
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
							className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]"
						/>
					</div>

					{/* Notes */}
					<div className="space-y-1.5">
						<label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
							Notes <span className="text-[#a3a3a3] font-normal normal-case">(optional)</span>
						</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={2}
							maxLength={500}
							placeholder="Any remarks for this assignment…"
							className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] resize-none"
						/>
					</div>

					<DialogFooter className="pt-2">
						<button
							type="button"
							onClick={() => { onOpenChange(false); resetForm(); }}
							disabled={mutation.isPending}
							className="rounded-lg border border-[#e5e5e5] px-4 py-2 text-sm font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] disabled:opacity-40"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!canSubmit}
							className="rounded-lg bg-[#0a0a0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#262626] disabled:opacity-40 disabled:cursor-not-allowed"
						>
							{mutation.isPending
								? "Assigning…"
								: `Assign to ${customerIds.length} customer${customerIds.length !== 1 ? "s" : ""}`}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
