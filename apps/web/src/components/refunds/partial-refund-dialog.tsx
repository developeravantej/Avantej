/**
 * Partial Refund Dialog (Agent 2.8 — Phase 2 Wave 3d — J5)
 *
 * Refund a specific number of session credits against a package instance.
 * The user types a packageInstanceId + credits + reason; the server-side
 * service derives the per-credit amount from the package totalPrice.
 *
 * v1: minimal — operator pastes the package_instance_id. Future versions
 * should auto-list package instances for the order.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

export interface PartialRefundDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	branchId?: string;
	/** Optional pre-fill for the package instance id field */
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
	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: {
			packageInstanceId: packageInstanceId ?? "",
			creditsRefunded: "",
			reason: "",
		},
	});

	async function onSubmit(values: FormValues) {
		try {
			const result = await client.refunds.createPartial({
				organizationId,
				packageInstanceId: values.packageInstanceId,
				creditsRefunded: Number(values.creditsRefunded),
				reason: values.reason,
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
			const msg = err instanceof Error ? err.message : "Failed to create refund";
			toast.error(msg);
		}
	}

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

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="packageInstanceId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Package Instance ID</FormLabel>
									<FormControl>
										<Input
											placeholder="00000000-0000-0000-0000-000000000000"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="creditsRefunded"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Credits to refund</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={1}
											step={1}
											placeholder="3"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="reason"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Reason</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Customer cancelled remaining sessions"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={form.formState.isSubmitting}>
								{form.formState.isSubmitting ? "Creating..." : "Create Refund"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
