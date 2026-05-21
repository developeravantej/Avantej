import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
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
	gracePeriodDays: z.coerce.number().int().min(1).max(365),
	commissionPct: z.coerce.number().min(0).max(100),
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

	const form = useForm<OrgSettingsValues>({
		resolver: zodResolver(orgSettingsSchema) as any,
		defaultValues: DEFAULT_VALUES,
	});

	// Pre-fill form when queries resolve
	useEffect(() => {
		if (isLoading) return;
		const gp = gracePeriodData as any;
		const cm = commissionData as any;
		const lc = localeData as any;
		const pa = packageApprovalData as any;
		form.reset({
			gracePeriodDays: gp?.value
				? parseInt(gp.value, 10) || DEFAULT_VALUES.gracePeriodDays
				: DEFAULT_VALUES.gracePeriodDays,
			commissionPct: cm?.value
				? parseFloat(cm.value) || DEFAULT_VALUES.commissionPct
				: DEFAULT_VALUES.commissionPct,
			locale: (lc?.value as OrgSettingsValues["locale"]) ?? DEFAULT_VALUES.locale,
			packageApprovalRequired:
				(pa?.value ?? "true") === "true",
		});
	}, [isLoading, gracePeriodData, commissionData, localeData, packageApprovalData, form]);

	// ─── Save handler ─────────────────────────────────────────────────────────

	const handleSave = async (values: OrgSettingsValues) => {
		if (!organizationId) return;
		const previousValues = form.getValues();
		try {
			await Promise.all([
				client.organizationSettings.upsert({
					organizationId,
					key: "grace_period_days",
					value: String(values.gracePeriodDays),
				}),
				client.organizationSettings.upsert({
					organizationId,
					key: "commission_percentage",
					value: String(values.commissionPct),
				}),
				client.organizationSettings.upsert({
					organizationId,
					key: "locale",
					value: values.locale,
				}),
				client.organizationSettings.upsert({
					organizationId,
					key: "package_approval.required",
					value: String(values.packageApprovalRequired),
				}),
			]);
			toast.success("Settings saved");
		} catch {
			form.reset(previousValues);
			toast.error("Failed to save settings");
		}
	};

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

			<Form {...form}>
				<form onSubmit={form.handleSubmit(handleSave as any)} className="max-w-[720px] space-y-5 pb-24">
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
								<FormField
									control={form.control as any}
									name="gracePeriodDays"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Grace Period (Days) <span className="text-rose-600">*</span>
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													min={1}
													max={365}
													disabled={!isAdmin}
													{...field}
													className="max-w-xs"
												/>
											</FormControl>
											<FormDescription className="text-[#737373]">
												Number of days after a payment due date before an account is
												considered overdue. Range: 1–365 days.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Commission Percentage */}
								<FormField
									control={form.control as any}
									name="commissionPct"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Default Commission (%)</FormLabel>
											<FormControl>
												<div className="relative max-w-xs">
													<Input
														type="number"
														min={0}
														max={100}
														step={0.01}
														disabled={!isAdmin}
														{...field}
														className="pr-8"
													/>
													<span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] text-sm pointer-events-none">
														%
													</span>
												</div>
											</FormControl>
											<FormDescription className="text-[#737373]">
												Default commission percentage applied to staff sales. Range:
												0–100%.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Locale */}
								<FormField
									control={form.control as any}
									name="locale"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Locale</FormLabel>
											<Select
												disabled={!isAdmin}
												value={field.value}
												onValueChange={field.onChange}
											>
												<FormControl>
													<SelectTrigger className="max-w-xs">
														<SelectValue placeholder="Select locale" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="en-MY">English (Malaysia)</SelectItem>
													<SelectItem value="en-US">English (United States)</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription className="text-[#737373]">
												Locale used for date, currency, and number formatting across the
												organization.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
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
							<FormField
								control={form.control as any}
								name="packageApprovalRequired"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-xl border border-[#e5e5e5] p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-[#0a0a0a] text-sm font-semibold">
												Require Package Approval
											</FormLabel>
											<FormDescription className="text-[#737373]">
												When enabled, customer-purchased packages start as
												"Pending" and require a trainer to be assigned before
												sessions can be booked.
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
												disabled={!isAdmin}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						)}
					</FormSection>
				</form>
			</Form>

			{/* Sticky footer */}
			<div className="fixed bottom-0 left-0 right-0 border-t border-[#e5e5e5] bg-white px-6 py-3 flex items-center justify-end gap-3 z-10">
				{!isAdmin && (
					<p className="text-sm text-[#737373]">
						You need admin permissions to change these settings.
					</p>
				)}
				<Button
					type="submit"
					disabled={!isAdmin || form.formState.isSubmitting}
					onClick={form.handleSubmit(handleSave as any)}
					className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
				>
					{form.formState.isSubmitting ? "Saving…" : "Save Settings"}
				</Button>
			</div>
		</div>
	);
}
