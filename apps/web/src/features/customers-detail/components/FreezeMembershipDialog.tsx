import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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
import { client } from "@/utils/orpc";
import type { FreezeFormState } from "../types";
import { todayIso } from "../utils";

export function FreezeMembershipDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	memberId: string;
	packages: Array<{ id: string; status: string | null; serviceName?: string | null }>;
}) {
	const { open, onOpenChange, organizationId, memberId, packages } = props;
	const queryClient = useQueryClient();
	const eligible = packages.filter((p) => p.status !== "paused");
	const [form, setForm] = useState<FreezeFormState>(() => ({
		packageInstanceId: eligible[0]?.id ?? "",
		startDate: todayIso(),
		endDate: todayIso(),
		reason: "medical",
		feeWaived: false,
		notes: "",
	}));
	const [submitError, setSubmitError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: () =>
			client.memberships.freeze({
				organizationId,
				packageInstanceId: form.packageInstanceId,
				memberId,
				startDate: new Date(form.startDate),
				endDate: new Date(form.endDate),
				reason: form.reason,
				feeWaived: form.feeWaived,
				notes: form.notes || undefined,
			}),
		onSuccess: async () => {
			setSubmitError(null);
			await queryClient.invalidateQueries({
				queryKey: ["customerDirectory", "detail", organizationId],
			});
			onOpenChange(false);
		},
		onError: (err: unknown) => {
			setSubmitError(err instanceof Error ? err.message : "Failed to freeze membership");
		},
	});

	const canSubmit =
		form.packageInstanceId &&
		form.startDate &&
		form.endDate &&
		new Date(form.endDate).getTime() > new Date(form.startDate).getTime() &&
		!mutation.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Pause Membership</DialogTitle>
					<DialogDescription>
						Freeze a package for medical leave, travel, or other reasons. The package
						auto-resumes on the end date. Audit-logged.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="freeze-pkg">Package</Label>
						<Select
							value={form.packageInstanceId}
							onValueChange={(v) => setForm((f) => ({ ...f, packageInstanceId: v }))}
						>
							<SelectTrigger id="freeze-pkg">
								<SelectValue placeholder="Select a package" />
							</SelectTrigger>
							<SelectContent>
								{eligible.length === 0 ? (
									<SelectItem value="" disabled>
										No active packages
									</SelectItem>
								) : (
									eligible.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.serviceName ?? p.id.slice(0, 8)} · {p.status ?? "—"}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="freeze-start">Start date</Label>
							<Input
								id="freeze-start"
								type="date"
								value={form.startDate}
								onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="freeze-end">End date</Label>
							<Input
								id="freeze-end"
								type="date"
								value={form.endDate}
								onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="freeze-reason">Reason</Label>
						<Select
							value={form.reason}
							onValueChange={(v) =>
								setForm((f) => ({ ...f, reason: v as FreezeFormState["reason"] }))
							}
						>
							<SelectTrigger id="freeze-reason">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="medical">Medical</SelectItem>
								<SelectItem value="travel">Travel</SelectItem>
								<SelectItem value="other">Other</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<label className="flex items-center gap-2 text-sm">
						<Checkbox
							checked={form.feeWaived}
							onCheckedChange={(v) =>
								setForm((f) => ({ ...f, feeWaived: v === true }))
							}
						/>
						<span>Waive freeze fee</span>
					</label>

					<div className="space-y-1.5">
						<Label htmlFor="freeze-notes">Notes (optional)</Label>
						<Textarea
							id="freeze-notes"
							rows={2}
							value={form.notes}
							onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
							placeholder="Internal notes for audit trail"
						/>
					</div>

					{submitError && (
						<Alert variant="destructive">
							<AlertDescription>{submitError}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => mutation.mutate()}
						disabled={!canSubmit}
					>
						{mutation.isPending ? "Pausing…" : "Pause membership"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
