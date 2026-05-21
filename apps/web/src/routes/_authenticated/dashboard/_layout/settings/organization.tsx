import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Lock } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/organization",
)({
	beforeLoad: async () => {
		await requirePermission("hierarchy_management:update");
	},
	component: OrganizationSettingsPage,
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const orgSettingsSchema = z.object({
	gracePeriodDays: z.number().int().min(1).max(365),
	commissionPct: z.number().min(0).max(100),
	locale: z.enum(["en-MY", "en-US"]),
	packageApprovalRequired: z.boolean(),
});

type OrgSettingsValues = z.infer<typeof orgSettingsSchema>;

const DEFAULT_VALUES: OrgSettingsValues = {
	gracePeriodDays: 7,
	commissionPct: 0,
	locale: "en-MY",
	packageApprovalRequired: true,
};

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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FieldSkeleton() {
	return (
		<div className="space-y-2">
			<div className="h-4 w-32 rounded bg-[#e5e5e5] animate-pulse" />
			<div className="h-10 w-full rounded-md bg-[#e5e5e5] animate-pulse" />
		</div>
	);
}

// ─── FormSection ──────────────────────────────────────────────────────────────

function FormSection({
	title,
	helper,
	children,
}: {
	title: string;
	helper?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<h2 className="text-base font-bold text-[#0a0a0a] mb-1">{title}</h2>
			{helper && <p className="text-sm text-[#737373] mb-4">{helper}</p>}
			<div className="space-y-4">{children}</div>
		</div>
	);
}

// ─── Page Component ───────────────────────────────────────────────────────────

function OrganizationSettingsPage() {
	const { data: userContext, hasRole } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const isAdmin = hasRole(["admin"]);

	// ─── Queries ─────────────────────────────────────────────────────────────

	const { data: gracePeriodData, isLoading: l1 } = useQuery({
		queryKey: ["organizationSettings", organizationId, "grace_period_days"],
		queryFn: () =>
			organizationId
				? client.organizationSettings.get({ organizationId, key: "grace_period_days" })
				: Promise.resolve(null),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const { data: commissionData, isLoading: l2 } = useQuery({
		queryKey: ["organizationSettings", organizationId, "commission_percentage"],
		queryFn: () =>
			organizationId
				? client.organizationSettings.get({ organizationId, key: "commission_percentage" })
				: Promise.resolve(null),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const { data: localeData, isLoading: l3 } = useQuery({
		queryKey: ["organizationSettings", organizationId, "locale"],
		queryFn: () =>
			organizationId
				? client.organizationSettings.get({ organizationId, key: "locale" })
				: Promise.resolve(null),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const { data: packageApprovalData, isLoading: l4 } = useQuery({
		queryKey: ["organizationSettings", organizationId, "package_approval.required"],
		queryFn: () =>
			organizationId
				? client.organizationSettings.get({ organizationId, key: "package_approval.required" })
				: Promise.resolve(null),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const isLoading = l1 || l2 || l3 || l4;

	// ─── Form ─────────────────────────────────────────────────────────────────

	const form = useForm({
		defaultValues: DEFAULT_VALUES,
		validators: { onSubmit: orgSettingsSchema },
		onSubmit: async ({ value }) => {
			if (!organizationId) return;
			const previousValues = form.state.values;
			try {
				await Promise.all([
					client.organizationSettings.upsert({
						organizationId,
						key: "grace_period_days",
						value: String(value.gracePeriodDays),
					}),
					client.organizationSettings.upsert({
						organizationId,
						key: "commission_percentage",
						value: String(value.commissionPct),
					}),
					client.organizationSettings.upsert({
						organizationId,
						key: "locale",
						value: value.locale,
					}),
					client.organizationSettings.upsert({
						organizationId,
						key: "package_approval.required",
						value: String(value.packageApprovalRequired),
					}),
				]);
				toast.success("Settings saved");
			} catch {
				form.reset(previousValues);
				toast.error("Failed to save settings");
			}
		},
	});

	// Pre-fill form when queries resolve
	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- query-driven prefill, not a user event
	useEffect(() => {
		if (isLoading) return;
		const gp = gracePeriodData as { value?: string } | null;
		const cm = commissionData as { value?: string } | null;
		const lc = localeData as { value?: string } | null;
		const pa = packageApprovalData as { value?: string } | null;
		form.reset({
			gracePeriodDays: gp?.value
				? parseInt(gp.value, 10) || DEFAULT_VALUES.gracePeriodDays
				: DEFAULT_VALUES.gracePeriodDays,
			commissionPct: cm?.value
				? parseFloat(cm.value) || DEFAULT_VALUES.commissionPct
				: DEFAULT_VALUES.commissionPct,
			locale: (lc?.value as OrgSettingsValues["locale"]) ?? DEFAULT_VALUES.locale,
			packageApprovalRequired: (pa?.value ?? "true") === "true",
		});
	}, [isLoading, gracePeriodData, commissionData, localeData, packageApprovalData, form]);

	// ─── Guard: no org selected ───────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex items-center justify-center">
				<div className="flex flex-col items-center justify-center text-[#737373]">
					<Lock className="h-8 w-8 mb-3 opacity-30" />
					<p className="text-sm font-medium text-[#0a0a0a]">No organization selected</p>
					<p className="text-xs mt-1">Select an organization to manage settings.</p>
				</div>
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* Page header */}
			<div className="mb-5 flex items-end justify-between">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						ORG SETTINGS
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Organization Settings
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						Configure organization-wide defaults and policies.
					</p>
				</div>
				{!isAdmin && (
					<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
						<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
						Admin only
					</span>
				)}
			</div>

			{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="max-w-[720px] space-y-5 pb-24"
			>
				{/* General Settings */}
				<FormSection
					title="General Settings"
					helper="Organization-wide defaults applied to all members and operations."
				>
					{isLoading ? (
						<div className="space-y-6">
							<FieldSkeleton />
							<FieldSkeleton />
							<FieldSkeleton />
						</div>
					) : (
						<>
							{/* Grace Period Days */}
							<form.Field name="gracePeriodDays">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor={field.name}>
											Grace Period (Days){" "}
											<span className="text-rose-600">*</span>
										</Label>
										<Input
											id={field.name}
											type="number"
											min={1}
											max={365}
											disabled={!isAdmin}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) =>
												field.handleChange(Number(e.target.value))
											}
											className="max-w-xs"
										/>
										<p className="text-xs text-[#737373]">
											Number of days after a payment due date before an account
											is considered overdue. Range: 1–365 days.
										</p>
										<FieldError errors={field.state.meta.errors} />
									</div>
								)}
							</form.Field>

							{/* Commission Percentage */}
							<form.Field name="commissionPct">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor={field.name}>Default Commission (%)</Label>
										<div className="relative max-w-xs">
											<Input
												id={field.name}
												type="number"
												min={0}
												max={100}
												step={0.01}
												disabled={!isAdmin}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) =>
													field.handleChange(Number(e.target.value))
												}
												className="pr-8"
											/>
											<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] text-sm pointer-events-none">
												%
											</span>
										</div>
										<p className="text-xs text-[#737373]">
											Default commission percentage applied to staff sales.
											Range: 0–100%.
										</p>
										<FieldError errors={field.state.meta.errors} />
									</div>
								)}
							</form.Field>

							{/* Locale */}
							<form.Field name="locale">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor={field.name}>Locale</Label>
										<Select
											disabled={!isAdmin}
											value={field.state.value}
											onValueChange={(v) =>
												field.handleChange(v as OrgSettingsValues["locale"])
											}
										>
											<SelectTrigger id={field.name} className="max-w-xs">
												<SelectValue placeholder="Select locale" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="en-MY">
													English (Malaysia)
												</SelectItem>
												<SelectItem value="en-US">
													English (United States)
												</SelectItem>
											</SelectContent>
										</Select>
										<p className="text-xs text-[#737373]">
											Locale used for date, currency, and number formatting
											across the organization.
										</p>
										<FieldError errors={field.state.meta.errors} />
									</div>
								)}
							</form.Field>
						</>
					)}
				</FormSection>

				{/* Approval Policy */}
				<FormSection
					title="Approval Policy"
					helper="Control how package purchases are handled before sessions can be booked."
				>
					{isLoading ? (
						<FieldSkeleton />
					) : (
						<form.Field name="packageApprovalRequired">
							{(field) => (
								<div className="flex flex-row items-center justify-between rounded-xl border border-[#e5e5e5] p-4">
									<div className="space-y-0.5">
										<Label className="text-[#0a0a0a] text-sm font-semibold">
											Require Package Approval
										</Label>
										<p className="text-xs text-[#737373]">
											When enabled, customer-purchased packages start as
											"Pending" and require a trainer to be assigned before
											sessions can be booked.
										</p>
									</div>
									<Switch
										checked={field.state.value}
										onCheckedChange={(v) => field.handleChange(v)}
										disabled={!isAdmin}
									/>
								</div>
							)}
						</form.Field>
					)}
				</FormSection>
			</form>

			{/* Sticky footer */}
			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(isSubmitting) => (
					<div className="fixed bottom-0 left-0 right-0 border-t border-[#e5e5e5] bg-white px-6 py-3 flex items-center justify-end gap-3 z-10">
						{!isAdmin && (
							<p className="text-sm text-[#737373]">
								You need admin permissions to change these settings.
							</p>
						)}
						<Button
							type="submit"
							disabled={!isAdmin || isSubmitting}
							onClick={() => form.handleSubmit()}
							className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
						>
							{isSubmitting ? "Saving…" : "Save Settings"}
						</Button>
					</div>
				)}
			</form.Subscribe>
		</div>
	);
}
