/**
 * Partial Refund Dialog
 *
 * Refund a specific number of session credits against a package instance.
 * The user types a packageInstanceId + credits + reason; the server-side
 * service derives the per-credit amount from the package totalPrice.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { client } from "@/utils/orpc";

const schema = z.object({
	packageInstanceId: z.string().uuid("Must be a valid UUID"),
	creditsRefunded: z
		.string()
		.min(1, "Required")
		.refine(
			(v) => Number.isInteger(Number(v)) && Number(v) > 0,
			"Must be a positive integer",
		),
	reason: z.string().min(1, "Reason is required"),
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

export interface PartialRefundDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	branchId?: string;
	packageInstanceId?: string;
}

export function PartialRefundDialog({
	open,
	onOpenChange,
	organizationId,
	branchId,
	packageInstanceId,
}: PartialRefundDialogProps) {
	const queryClient = useQueryClient();

	const form = useForm({
		defaultValues: {
			packageInstanceId: packageInstanceId ?? "",
			creditsRefunded: "",
			reason: "",
		} as FormValues,
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			try {
				const result = await client.refunds.createPartial({
					organizationId,
					packageInstanceId: value.packageInstanceId,
					creditsRefunded: Number(value.creditsRefunded),
					reason: value.reason,
					branchId,
				});
				toast.success(`Partial refund ${result.refundNumber} created`);
				await queryClient.invalidateQueries({ queryKey: ["refunds"] });
				await queryClient.invalidateQueries({
					queryKey: ["packageInstances"],
				});
				onOpenChange(false);
				form.reset();
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : "Failed to create refund";
				toast.error(msg);
			}
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Partial Package Refund</DialogTitle>
					<DialogDescription>
						Refund a specific number of unused session credits on a package
						instance. The per-credit amount is derived from the package's total
						price.
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
					<form.Field name="packageInstanceId">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Package Instance ID</Label>
								<Input
									id={field.name}
									placeholder="00000000-0000-0000-0000-000000000000"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="creditsRefunded">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Credits to refund</Label>
								<Input
									id={field.name}
									type="number"
									min={1}
									step={1}
									placeholder="3"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="reason">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Reason</Label>
								<Textarea
									id={field.name}
									placeholder="Customer cancelled remaining sessions"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isSubmitting) => (
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => onOpenChange(false)}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "Creating..." : "Create Refund"}
								</Button>
							</DialogFooter>
						)}
					</form.Subscribe>
				</form>
			</DialogContent>
		</Dialog>
	);
}
