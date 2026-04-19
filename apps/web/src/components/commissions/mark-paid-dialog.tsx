import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { client } from "@/utils/orpc";

// ─── Schema ────────────────────────────────────────────────────────────────────

const markPaidSchema = z.object({
	payoutMethod: z.enum(["cash", "bank_transfer", "other"]),
	payoutReference: z.string().trim().optional(),
	payoutId: z
		.string()
		.optional()
		.refine(
			(val) => !val || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
			{ message: "Must be a valid UUID" },
		),
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
			payoutMethod: "cash",
			payoutReference: "",
			payoutId: "",
		},
	});

	const mutation = useMutation({
		mutationFn: (values: MarkPaidFormValues) =>
			(client as any).commissionSplits.markPaid({
				organizationId,
				ids: selectedIds,
				payoutMethod: values.payoutMethod,
				payoutReference: values.payoutReference || undefined,
				payoutId: values.payoutId || undefined,
			}),
		onSuccess: () => {
			toast.success(
				`Marked ${count} commission split${count !== 1 ? "s" : ""} as paid.`,
			);
			form.reset();
			onDone();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to mark commission splits as paid."),
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
						{/* Payout Method */}
						<FormField
							control={form.control}
							name="payoutMethod"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Payout Method <span className="text-destructive">*</span>
									</FormLabel>
									<Select
										value={field.value}
										onValueChange={field.onChange}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select method" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="cash">Cash</SelectItem>
											<SelectItem value="bank_transfer">Bank Transfer</SelectItem>
											<SelectItem value="other">Other</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Payout Reference */}
						<FormField
							control={form.control}
							name="payoutReference"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Reference</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="Transaction ID, receipt no., etc."
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Payout ID (optional UUID) */}
						<FormField
							control={form.control}
							name="payoutId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Payout ID{" "}
										<span className="font-normal text-muted-foreground text-xs">
											optional — link to an existing payout record
										</span>
									</FormLabel>
									<FormControl>
										<Input
											{...field}
											placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
											className="font-mono text-xs"
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
