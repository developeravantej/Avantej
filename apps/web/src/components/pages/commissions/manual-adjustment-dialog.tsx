import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { useApiMutation } from "@/hooks/useApiMutation";
import { rmToCents } from "@/lib/money";
import { client } from "@/utils/orpc";

// F-COM-01 (best-guess product decision): the `manualAdjustment` procedure
// (commissionSplits.manualAdjustment) created a pending_review commission split
// but had no frontend caller, so the Review tab was always empty. This dialog is
// the minimal UI to create such adjustments.
//
// The backend (lifecycle.procedures.ts) requires:
//   - staffId: members.userId of the staff the adjustment is for (NOT members.id —
//     per the staffId convention, staff_assignments/commission rows key on userId).
//   - amountCents: signed integer (negative = clawback, positive = bonus).
//   - note: non-empty.
//   - EXACTLY ONE of salesOrderId | appointmentId | packageInstanceId (DB CHECK
//     commission_splits_must_target_one). We surface this as a target-type + ID pair.
//
// Assumption: operators creating manual adjustments know the target record's UUID
// (copied from the sale/appointment/package detail page). A richer picker is out of
// scope for this minimal fix — a free-text UUID keeps the surface small while
// unblocking the create → review flow end-to-end.

type StaffMember = { id: string; userId: string; name: string };

type TargetType = "salesOrderId" | "appointmentId" | "packageInstanceId";

const TARGET_LABELS: Record<TargetType, string> = {
	salesOrderId: "Sales Order",
	appointmentId: "Appointment",
	packageInstanceId: "Package Instance",
};

const schema = z.object({
	staffId: z.string().uuid("Select a staff member"),
	// Signed amount in RM. Non-zero. Stored as signed cents.
	amountRm: z
		.string()
		.min(1, "Amount is required")
		.refine(
			(v) => Number.isFinite(Number.parseFloat(v)) && Number.parseFloat(v) !== 0,
			{ message: "Enter a valid non-zero amount" },
		),
	note: z.string().min(1, "Note is required"),
	targetType: z.enum(["salesOrderId", "appointmentId", "packageInstanceId"]),
	targetId: z.string().uuid("Enter a valid target UUID"),
});

type FormValues = z.infer<typeof schema>;

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-destructive">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

export interface ManualAdjustmentDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
}

export function ManualAdjustmentDialog({
	open,
	onOpenChange,
	organizationId,
}: ManualAdjustmentDialogProps) {
	// Staff list for the recipient dropdown. staffId == members.userId.
	const { data: staff = [] } = useQuery({
		queryKey: ["members", "list", organizationId, "manual-adjustment"],
		queryFn: () =>
			client.members.list({ organizationId }) as Promise<StaffMember[]>,
		enabled: !!organizationId && open,
	});

	const createAdjustment = useApiMutation({
		mutationFn: (value: FormValues) =>
			client.commissionSplits.createManualAdjustment({
				organizationId,
				staffId: value.staffId,
				amountCents: rmToCents(Number.parseFloat(value.amountRm)),
				note: value.note,
				// Exactly one target — keyed off the chosen target type.
				[value.targetType]: value.targetId,
			} as Parameters<
				typeof client.commissionSplits.createManualAdjustment
			>[0]),
		successMessage: "Manual adjustment created — pending review.",
		errorMessage: (err) => err.message || "Failed to create manual adjustment.",
		// Refresh the pending-review list/badge and the liability summary so the new
		// adjustment shows up immediately in the Review tab.
		invalidate: [
			["commissions", "pendingReview"],
			["commissionSplits", "pendingReviewTotal"],
			["commissionLiability"],
			["commissions"],
		],
		onSuccess: () => {
			onOpenChange(false);
			form.reset();
		},
	});

	const form = useForm({
		defaultValues: {
			staffId: "",
			amountRm: "",
			note: "",
			targetType: "salesOrderId",
			targetId: "",
		} as FormValues,
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			await createAdjustment.mutateAsync(value);
		},
	});

	function handleOpenChange(next: boolean) {
		if (!next) form.reset();
		onOpenChange(next);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Manual Adjustment</DialogTitle>
					<DialogDescription>
						Create a manual commission adjustment. It will be added to the Review
						tab as pending until approved.
					</DialogDescription>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="staffId">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Staff Member <span className="text-destructive">*</span>
								</Label>
								<Select
									value={field.state.value}
									onValueChange={(v) => field.handleChange(v)}
								>
									<SelectTrigger id={field.name}>
										<SelectValue placeholder="Select staff…" />
									</SelectTrigger>
									<SelectContent>
										{staff.map((m) => (
											<SelectItem key={m.userId} value={m.userId}>
												{m.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="amountRm">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Amount (RM) <span className="text-destructive">*</span>
								</Label>
								<Input
									id={field.name}
									type="number"
									step="0.01"
									placeholder="0.00 (negative for a clawback)"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									Use a negative amount for a clawback / deduction.
								</p>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-[140px_1fr] gap-2">
						<form.Field name="targetType">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Target <span className="text-destructive">*</span>
									</Label>
									<Select
										value={field.state.value}
										onValueChange={(v) => field.handleChange(v as TargetType)}
									>
										<SelectTrigger id={field.name}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{(Object.keys(TARGET_LABELS) as TargetType[]).map((t) => (
												<SelectItem key={t} value={t}>
													{TARGET_LABELS[t]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>

						<form.Field name="targetId">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Target ID <span className="text-destructive">*</span>
									</Label>
									<Input
										id={field.name}
										placeholder="UUID of the linked record"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="note">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Note <span className="text-destructive">*</span>
								</Label>
								<Textarea
									id={field.name}
									rows={2}
									placeholder="Why is this adjustment being made?"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isPending) => (
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => handleOpenChange(false)}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={isPending}>
									{isPending ? "Creating…" : "Create Adjustment"}
								</Button>
							</DialogFooter>
						)}
					</form.Subscribe>
				</form>
			</DialogContent>
		</Dialog>
	);
}
