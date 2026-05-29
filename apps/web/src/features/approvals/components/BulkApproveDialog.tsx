import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { formatPriceShort } from "../approvals.helpers";
import type { PendingRow } from "../approvals.types";

export function BulkApproveDialog({
	open,
	onOpenChange,
	organizationId,
	selectedRows,
	onDone,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	organizationId: string;
	selectedRows: PendingRow[];
	onDone: () => void;
}) {
	const [trainerMemberId, setTrainerMemberId] = useState<string | null>(null);

	const { data: members = [], isLoading: loadingTrainers } = useQuery({
		queryKey: ["members", organizationId, "bulk-trainer-list"],
		queryFn: () => client.members.list({ organizationId }),
		enabled: open,
	});

	const trainers = useMemo(
		() =>
			(members as Array<{
				role: string;
				status: string;
				id: string;
				userId: string;
				name: string;
			}>).filter(
				(m) => (m.role === "trainer" || m.role === "admin") && m.status === "active",
			),
		[members],
	);

	const mutation = useApiMutation({
		mutationFn: () => {
			if (!trainerMemberId) throw new Error("Pick a trainer first");
			return client.packageInstances.bulkApprove({
				organizationId,
				packageInstanceIds: selectedRows.map((r) => r.id),
				trainerMemberId,
			});
		},
		successMessage: (res: { succeededCount: number; failedCount: number }) =>
			res.failedCount === 0
				? `Approved ${res.succeededCount} package${res.succeededCount === 1 ? "" : "s"}.`
				: `Approved ${res.succeededCount}, ${res.failedCount} failed.`,
		errorMessage: (err) => err?.message ?? "Bulk approval failed.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => {
			onDone();
			onOpenChange(false);
			setTrainerMemberId(null);
		},
	});

	const totalValueCents = selectedRows.reduce(
		(s, r) => s + (r.totalPrice ?? 0),
		0,
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Bulk approve {selectedRows.length} packages</DialogTitle>
					<DialogDescription>
						Assign one trainer to all selected packages. Rows whose branch
						doesn&apos;t match the trainer will be skipped — you&apos;ll see a
						count after.
					</DialogDescription>
				</DialogHeader>

				<div className="mb-3 rounded-lg border border-[#e5e5e5] bg-[#f3f3f3]/50 p-3 text-xs">
					<div>
						<b className="font-mono tabular-nums">{selectedRows.length}</b>{" "}
						packages selected ·{" "}
						<b className="font-mono tabular-nums">
							{formatPriceShort(totalValueCents)}
						</b>{" "}
						total value
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="bulk-trainer">Trainer to assign</Label>
					<Select
						value={trainerMemberId ?? undefined}
						onValueChange={(v) => setTrainerMemberId(v)}
					>
						<SelectTrigger id="bulk-trainer">
							<SelectValue
								placeholder={loadingTrainers ? "Loading…" : "Pick a trainer…"}
							/>
						</SelectTrigger>
						<SelectContent>
							{trainers.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.name}{" "}
									<span className="text-muted-foreground">({t.role})</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<DialogFooter className="mt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => mutation.mutate()}
						disabled={!trainerMemberId || mutation.isPending}
					>
						{mutation.isPending
							? "Approving…"
							: `Approve ${selectedRows.length}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
