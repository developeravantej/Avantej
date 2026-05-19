import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useApiMutation } from "@/hooks/useApiMutation";
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
import { client } from "@/utils/orpc";

// ─── Schema ────────────────────────────────────────────────────────────────────

const markPaidSchema = z.object({
	paymentReference: z.string().trim().min(1, "Payment reference is required"),
});

type MarkPaidFormValues = z.input<typeof markPaidSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface MarkPaidDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedIds: string[];
	organizationId: string;
	onDone: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MarkPaidDialog({
	open,
	onOpenChange,
	selectedIds,
	organizationId,
	onDone,
}: MarkPaidDialogProps) {
	const count = selectedIds.length;

	const form = useForm<MarkPaidFormValues>({
		resolver: zodResolver(markPaidSchema),
		defaultValues: {
			paymentReference: "",
		},
	});

	const mutation = useApiMutation({
		mutationFn: (values: MarkPaidFormValues) =>
			client.commissionSplits.markPaidById({
				organizationId,
				ids: selectedIds,
				paymentReference: values.paymentReference,
			}),
		successMessage: `Marked ${count} commission split${count !== 1 ? "s" : ""} as paid.`,
		errorMessage: (err) => err.message || "Failed to mark commission splits as paid.",
		onSuccess: () => {
			form.reset();
			onDone();
		},
	});

	function handleClose() {
		if (mutation.isPending) return;
		form.reset();
		onOpenChange(false);
	}

	function onSubmit(values: MarkPaidFormValues) {
		mutation.mutate(values);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) handleClose();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Mark as Paid</DialogTitle>
					<DialogDescription>
						Record payment details for {count} commission split
						{count !== 1 ? "s" : ""}. This will move them to Paid status.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="space-y-5 py-2"
					>
						{/* Payment Reference */}
						<FormField
							control={form.control}
							name="paymentReference"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Payment Reference <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="Transaction ID, receipt no., bank transfer ref…"
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
								onClick={handleClose}
								disabled={mutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={mutation.isPending}>
								{mutation.isPending ? "Saving…" : "Mark as Paid"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
