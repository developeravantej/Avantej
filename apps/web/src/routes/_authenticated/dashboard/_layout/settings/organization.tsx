import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/organization",
)({
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
			<div className="h-4 w-32 rounded bg-muted animate-pulse" />
			<div className="h-10 w-full rounded-md bg-muted animate-pulse" />
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
		const grace = (gracePeriodData as any)?.value;
		const commission = (commissionData as any)?.value;
		const locale = (localeData as any)?.value;
		form.reset({
			gracePeriodDays: grace
				? parseInt(grace, 10) || DEFAULT_VALUES.gracePeriodDays
				: DEFAULT_VALUES.gracePeriodDays,
			commissionPct: commission
				? parseFloat(commission) || DEFAULT_VALUES.commissionPct
				: DEFAULT_VALUES.commissionPct,
			locale: (locale as OrgSettingsValues["locale"]) ?? DEFAULT_VALUES.locale,
			packageApprovalRequired:
				(((packageApprovalData as any)?.value as string | undefined) ?? "true") === "true",
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
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage settings.
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="p-6 space-y-6">
			{/* Page header */}
			<div className="flex items-center gap-3">
				<div className="p-2 rounded-lg bg-brand-primary-1/10">
					<Settings className="h-6 w-6 text-brand-primary-1" />
				</div>
				<div>
					<h1 className="text-2xl font-bold font-heading text-brand-primary-1">
						Organization Settings
					</h1>
					<p className="text-brand-secondary-1 text-sm">
						Configure organization-wide defaults and policies.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-base font-medium text-brand-primary-1">
						General Settings
					</CardTitle>
					{!isAdmin && (
						<Badge variant="outline" className="text-xs">
							Admin only
						</Badge>
					)}
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="space-y-6">
							<FieldSkeleton />
							<FieldSkeleton />
							<FieldSkeleton />
						</div>
					) : (
						<Form {...form}>
							<form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
								{/* Grace Period Days */}
								<FormField
									control={form.control}
									name="gracePeriodDays"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-brand-primary-1">
												Grace Period (Days)
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
											<FormDescription className="text-brand-secondary-1">
												Number of days after a payment due date before an account is
												considered overdue. Range: 1–365 days.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Commission Percentage */}
								<FormField
									control={form.control}
									name="commissionPct"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-brand-primary-1">
												Default Commission (%)
											</FormLabel>
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
													<span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary-1 text-sm pointer-events-none">
														%
													</span>
												</div>
											</FormControl>
											<FormDescription className="text-brand-secondary-1">
												Default commission percentage applied to staff sales. Range:
												0–100%.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Locale */}
								<FormField
									control={form.control}
									name="locale"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-brand-primary-1">Locale</FormLabel>
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
											<FormDescription className="text-brand-secondary-1">
												Locale used for date, currency, and number formatting across the
												organization.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Package Approval Required */}
								<FormField
									control={form.control}
									name="packageApprovalRequired"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 max-w-lg">
											<div className="space-y-0.5">
												<FormLabel className="text-brand-primary-1 text-base">
													Require Package Approval
												</FormLabel>
												<FormDescription className="text-brand-secondary-1">
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

								<div className="flex items-center gap-3 pt-2">
									<Button
										type="submit"
										disabled={!isAdmin || form.formState.isSubmitting}
									>
										{form.formState.isSubmitting ? "Saving…" : "Save Settings"}
									</Button>
									{!isAdmin && (
										<p className="text-sm text-muted-foreground">
											You need admin permissions to change these settings.
										</p>
									)}
								</div>
							</form>
						</Form>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
