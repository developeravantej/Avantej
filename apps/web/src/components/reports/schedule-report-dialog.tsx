import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Trash2 } from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { client } from "@/utils/orpc";

const scheduleSchema = z.object({
	recipients: z
		.string()
		.trim()
		.min(1, "At least one recipient is required")
		.refine(
			(s) =>
				s
					.split(",")
					.map((r) => r.trim())
					.filter(Boolean)
					.every((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)),
			{ message: "All recipients must be valid email addresses" },
		),
	reportName: z.string().trim().min(1, "Report name is required").max(200),
	windowKey: z.enum(["7D", "30D", "90D", "YTD"]),
	frequency: z.enum(["daily", "weekly", "monthly"]),
});

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

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

interface ScheduleReportDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	currentWindow: "7D" | "30D" | "90D" | "YTD";
}

export function ScheduleReportDialog({
	open,
	onOpenChange,
	organizationId,
	currentWindow,
}: ScheduleReportDialogProps) {
	const qc = useQueryClient();

	const { data: existing = [], isLoading } = useQuery({
		queryKey: ["scheduledReports", organizationId],
		queryFn: () => client.scheduledReports.list({ organizationId }),
		enabled: open && !!organizationId,
		staleTime: 30 * 1000,
	});

	const createMutation = useMutation({
		mutationFn: (values: ScheduleFormValues) =>
			client.scheduledReports.create({
				organizationId,
				...values,
			}),
		onSuccess: () => {
			toast.success("Schedule created. First email goes out on the next hourly tick.");
			qc.invalidateQueries({ queryKey: ["scheduledReports", organizationId] });
			form.reset();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to create schedule");
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			client.scheduledReports.delete({ organizationId, id }),
		onSuccess: () => {
			toast.success("Schedule removed.");
			qc.invalidateQueries({ queryKey: ["scheduledReports", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to delete schedule");
		},
	});

	const toggleMutation = useMutation({
		mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
			client.scheduledReports.toggle({ organizationId, id, isActive }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["scheduledReports", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to update schedule");
		},
	});

	const form = useForm({
		defaultValues: {
			recipients: "",
			reportName: "Performance Report",
			windowKey: currentWindow,
			frequency: "weekly",
		} as ScheduleFormValues,
		validators: { onSubmit: scheduleSchema },
		onSubmit: async ({ value }) => {
			await createMutation.mutateAsync(value);
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Schedule Email Report</DialogTitle>
					<DialogDescription>
						Email a KPI summary to specified recipients on a recurring schedule.
						Emails fire on the next hourly cron tick after the due time.
					</DialogDescription>
				</DialogHeader>

				{/* Existing schedules */}
				<div className="border-b pb-4">
					<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
						Existing Schedules
					</h3>
					{isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading…
						</div>
					) : existing.length === 0 ? (
						<p className="text-sm text-muted-foreground">No schedules yet.</p>
					) : (
						<div className="space-y-2">
							{existing.map((row) => (
								<div
									key={row.id}
									className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium truncate">{row.reportName}</span>
											{!row.isActive && (
												<span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
													Paused
												</span>
											)}
										</div>
										<p className="text-xs text-muted-foreground truncate">
											{row.recipients} · {row.frequency} · {row.windowKey}
										</p>
										{row.lastError && (
											<p className="mt-1 text-xs text-destructive truncate" title={row.lastError}>
												Last error: {row.lastError}
											</p>
										)}
									</div>
									<button
										type="button"
										onClick={() =>
											toggleMutation.mutate({ id: row.id, isActive: !row.isActive })
										}
										className="text-xs text-muted-foreground hover:text-foreground"
									>
										{row.isActive ? "Pause" : "Resume"}
									</button>
									<button
										type="button"
										onClick={() => deleteMutation.mutate(row.id)}
										className="text-destructive hover:opacity-80"
										aria-label="Remove schedule"
									>
										<Trash2 className="h-4 w-4" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Create new schedule */}
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4 pt-2"
				>
					<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						New Schedule
					</h3>

					<form.Field name="reportName">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Report Name</Label>
								<Input
									id={field.name}
									placeholder="e.g., Weekly Performance Summary"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="recipients">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Recipients{" "}
									<span className="text-xs font-normal text-muted-foreground">
										(comma-separated emails)
									</span>
								</Label>
								<Input
									id={field.name}
									placeholder="ops@example.com, gm@example.com"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="windowKey">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>Window</Label>
									<Select
										value={field.state.value}
										onValueChange={(v) =>
											field.handleChange(v as ScheduleFormValues["windowKey"])
										}
									>
										<SelectTrigger id={field.name}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="7D">7 days</SelectItem>
											<SelectItem value="30D">30 days</SelectItem>
											<SelectItem value="90D">90 days</SelectItem>
											<SelectItem value="YTD">Year-to-date</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>

						<form.Field name="frequency">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>Frequency</Label>
									<Select
										value={field.state.value}
										onValueChange={(v) =>
											field.handleChange(v as ScheduleFormValues["frequency"])
										}
									>
										<SelectTrigger id={field.name}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="daily">Daily</SelectItem>
											<SelectItem value="weekly">Weekly</SelectItem>
											<SelectItem value="monthly">Monthly</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={createMutation.isPending}
						>
							Close
						</Button>
						<Button type="submit" disabled={createMutation.isPending}>
							{createMutation.isPending ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Creating…
								</>
							) : (
								<>
									<Mail className="h-4 w-4 mr-2" />
									Create Schedule
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
