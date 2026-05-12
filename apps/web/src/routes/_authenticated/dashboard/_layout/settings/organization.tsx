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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";
import { OrganizationSettingsForm } from "./organization-settings-form";
import type { OrgSettingsValues } from "./organization-settings-form";

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
					<Settings className="size-6 text-brand-primary-1" />
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
						<OrganizationSettingsForm
							form={form}
							isAdmin={isAdmin}
							onSubmit={handleSave}
						/>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
