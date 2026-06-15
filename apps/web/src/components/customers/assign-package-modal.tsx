import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
		mutationFn: (
			vars: Parameters<typeof client.packageInstances.bulkAssign>[0],
		) => client.packageInstances.bulkAssign(vars),
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
					toast.success(
						`Package assigned to ${succeededCount} customer${succeededCount !== 1 ? "s" : ""}.`,
					),
				);
			} else if (succeededCount === 0) {
				import("sonner").then(({ toast }) =>
					toast.error(
						`Failed to assign package to all ${failedCount} customer${failedCount !== 1 ? "s" : ""}.`,
					),
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
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!mutation.isPending) {
					onOpenChange(v);
					if (!v) resetForm();
				}
			}}
		>
			<DialogContent
				className="sm:max-w-[480px] p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PACKAGE CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Assign package
						<span className="ml-2 text-xs font-normal text-[#737373]">
							to {customerIds.length} customer
							{customerIds.length !== 1 ? "s" : ""}
						</span>
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Select a package to assign to the selected customer
						{customerIds.length !== 1 ? "s" : ""}.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit}>
					<div className="px-6 pt-4 pb-2 overflow-y-auto space-y-4">
						{/* Package selector */}
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
								Package <span className="text-rose-500">*</span>
							</Label>
							{isLoading ? (
								<div className="h-9 rounded-lg bg-[#e5e5e5] animate-pulse" />
							) : (
								<Select required value={packageId} onValueChange={setPackageId}>
									<SelectTrigger>
										<SelectValue placeholder="Select a package…" />
									</SelectTrigger>
									<SelectContent>
										{packages.map((pkg) => (
											<SelectItem key={pkg.id} value={pkg.id}>
												{pkg.name}
												{pkg.sessionCount
													? ` (${pkg.sessionCount} sessions)`
													: ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</div>

						{/* Branch selector */}
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
								Branch <span className="text-rose-500">*</span>
							</Label>
							{isLoading ? (
								<div className="h-9 rounded-lg bg-[#e5e5e5] animate-pulse" />
							) : (
								<Select required value={branchId} onValueChange={setBranchId}>
									<SelectTrigger>
										<SelectValue placeholder="Select a branch…" />
									</SelectTrigger>
									<SelectContent>
										{branches.map((branch) => (
											<SelectItem key={branch.id} value={branch.id}>
												{branch.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</div>

						{/* Trainer selector (optional) */}
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
								Trainer{" "}
								<span className="text-[#a3a3a3] font-normal normal-case">
									(optional)
								</span>
							</Label>
							{isLoading ? (
								<div className="h-9 rounded-lg bg-[#e5e5e5] animate-pulse" />
							) : (
								<Select
									value={trainerMemberId}
									onValueChange={setTrainerMemberId}
								>
									<SelectTrigger>
										<SelectValue placeholder="No trainer assigned" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="">No trainer assigned</SelectItem>
										{trainers.map(
											(trainer: {
												id: string;
												name: string;
												email: string;
											}) => (
												<SelectItem key={trainer.id} value={trainer.id}>
													{trainer.name ?? trainer.email ?? trainer.id}
												</SelectItem>
											),
										)}
									</SelectContent>
								</Select>
							)}
						</div>

						{/* Start date */}
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
								Start date <span className="text-rose-500">*</span>
							</Label>
							<Input
								type="date"
								required
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
							/>
						</div>

						{/* Notes */}
						<div className="space-y-1.5">
							<Label className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wide">
								Notes{" "}
								<span className="text-[#a3a3a3] font-normal normal-case">
									(optional)
								</span>
							</Label>
							<Textarea
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								rows={2}
								maxLength={500}
								placeholder="Any remarks for this assignment…"
							/>
						</div>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								onOpenChange(false);
								resetForm();
							}}
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
