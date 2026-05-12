import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/notifications",
)({
	component: NotificationPreferencesPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type SaveState = "idle" | "saving" | "saved";

type NotifPrefs = {
	emailEnabled: boolean;
	smsEnabled: boolean;
	pushEnabled: boolean;
	bookingReminders: boolean;
	bookingConfirmations: boolean;
	promotionalEmails: boolean;
	packageExpiry: boolean;
};

type PrefKey = keyof NotifPrefs;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: NotifPrefs = {
	emailEnabled: true,
	smsEnabled: true,
	pushEnabled: true,
	bookingReminders: true,
	bookingConfirmations: true,
	promotionalEmails: true,
	packageExpiry: true,
};

type ChannelSetting = {
	key: PrefKey;
	label: string;
	description: string;
};

const CHANNEL_SETTINGS: ChannelSetting[] = [
	{
		key: "emailEnabled",
		label: "Email Notifications",
		description: "Receive notifications via email",
	},
	{
		key: "smsEnabled",
		label: "SMS Notifications",
		description: "Receive notifications via SMS",
	},
	{
		key: "pushEnabled",
		label: "Push Notifications",
		description: "Receive push notifications in browser",
	},
];

const CONTENT_SETTINGS: ChannelSetting[] = [
	{
		key: "bookingReminders",
		label: "Booking Reminders",
		description: "Get reminded about upcoming appointments",
	},
	{
		key: "bookingConfirmations",
		label: "Booking Confirmations",
		description: "Receive confirmation when a booking is made",
	},
	{
		key: "promotionalEmails",
		label: "Promotional Emails",
		description: "Receive promotions and special offers",
	},
	{
		key: "packageExpiry",
		label: "Package Expiry",
		description: "Get notified when a package is about to expire",
	},
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
	return (
		<div className="flex items-center justify-between py-4">
			<div className="space-y-1.5">
				<div className="h-4 w-40 rounded bg-muted animate-pulse" />
				<div className="h-3 w-56 rounded bg-muted animate-pulse" />
			</div>
			<div className="h-6 w-11 rounded-full bg-muted animate-pulse" />
		</div>
	);
}

function SkeletonCard({ rows }: { rows: number }) {
	return (
		<Card>
			<CardHeader>
				<div className="h-5 w-44 rounded bg-muted animate-pulse" />
				<div className="h-3 w-64 rounded bg-muted animate-pulse mt-1" />
			</CardHeader>
			<CardContent className="divide-y">
				{Array.from({ length: rows }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
					<SkeletonRow key={i} />
				))}
			</CardContent>
		</Card>
	);
}

// ─── Setting Row ──────────────────────────────────────────────────────────────

function SettingRow({
	setting,
	checked,
	disabled,
	onToggle,
}: {
	setting: ChannelSetting;
	checked: boolean;
	disabled: boolean;
	onToggle: (key: PrefKey, value: boolean) => void;
}) {
	const id = `notif-${setting.key}`;
	return (
		<div className="flex items-center justify-between py-4">
			<div className="space-y-0.5">
				<label
					htmlFor={id}
					className="text-sm font-medium text-brand-primary-1 cursor-pointer"
				>
					{setting.label}
				</label>
				<p className="text-sm text-muted-foreground">{setting.description}</p>
			</div>
			<Switch
				id={id}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onToggle(setting.key, value)}
			/>
		</div>
	);
}

// ─── Page Component ───────────────────────────────────────────────────────────

function NotificationPreferencesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [saveState, setSaveState] = useState<SaveState>("idle");

	// ─── Query ───────────────────────────────────────────────────────────────

	const { data: apiPrefs, isLoading } = useQuery({
		queryKey: ["notificationPreferences", organizationId],
		queryFn: () => {
			if (!organizationId) return null;
			return client.notificationPreferences.get({ organizationId });
		},
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	// Merge API response with defaults (null = first visit → all true)
	const prefs: NotifPrefs = {
		emailEnabled: apiPrefs?.emailEnabled ?? DEFAULT_PREFS.emailEnabled,
		smsEnabled: apiPrefs?.smsEnabled ?? DEFAULT_PREFS.smsEnabled,
		pushEnabled: apiPrefs?.pushEnabled ?? DEFAULT_PREFS.pushEnabled,
		bookingReminders:
			apiPrefs?.bookingReminders ?? DEFAULT_PREFS.bookingReminders,
		bookingConfirmations:
			apiPrefs?.bookingConfirmations ?? DEFAULT_PREFS.bookingConfirmations,
		promotionalEmails:
			apiPrefs?.promotionalEmails ?? DEFAULT_PREFS.promotionalEmails,
		packageExpiry: apiPrefs?.packageExpiry ?? DEFAULT_PREFS.packageExpiry,
	};

	// ─── Mutation ────────────────────────────────────────────────────────────

	const mutation = useApiMutation({
		mutationFn: (field: Partial<NotifPrefs>) => {
			if (!organizationId) throw new Error("No organization selected");
			return client.notificationPreferences.update({
				organizationId,
				...field,
			});
		},
		errorMessage: "Failed to save preference",
		onMutate: () => setSaveState("saving"),
		onSuccess: () => {
			setSaveState("saved");
			setTimeout(() => setSaveState("idle"), 1500);
		},
		onError: () => {
			setSaveState("idle");
		},
	});

	function handleToggle(key: PrefKey, value: boolean) {
		mutation.mutate({ [key]: value });
	}

	// ─── Guard: no org selected ───────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage notification preferences.
			</div>
		);
	}

	// ─── Loading state ────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="p-6 space-y-6">
				{/* Page header skeleton */}
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-brand-primary-1/10">
						<Bell className="size-6 text-brand-primary-1" />
					</div>
					<div className="space-y-1">
						<div className="h-6 w-52 rounded bg-muted animate-pulse" />
						<div className="h-3 w-72 rounded bg-muted animate-pulse" />
					</div>
				</div>
				<SkeletonCard rows={3} />
				<SkeletonCard rows={4} />
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="p-6 space-y-6">
			{/* Page header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-brand-primary-1/10">
						<Bell className="size-6 text-brand-primary-1" />
					</div>
					<div>
						<h1 className="text-2xl font-semibold font-heading text-brand-primary-1">
							Notification Preferences
						</h1>
						<p className="text-brand-secondary-1 text-sm">
							Control how and when you receive notifications.
						</p>
					</div>
				</div>

				{/* Save state indicator */}
				<div className="text-sm text-muted-foreground min-w-16 text-right">
					{saveState === "saving" && (
						<span className="flex items-center gap-1.5 justify-end">
							{/* Activity indicator dot — approved exception per §2.5 (sub-6px dots paired with text are allowed) */}
							<span className="size-2 rounded-full bg-amber-400 animate-pulse" />
							Saving…
						</span>
					)}
					{saveState === "saved" && (
						<span className="flex items-center gap-1.5 justify-end text-green-600">
							{/* Activity indicator dot — approved exception per §2.5 (sub-6px dots paired with text are allowed) */}
							<span className="size-2 rounded-full bg-green-500" />
							Saved
						</span>
					)}
				</div>
			</div>

			{/* Notification Channels card */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base font-semibold text-brand-primary-1">
						Notification Channels
					</CardTitle>
					<CardDescription>
						Choose which channels you want to receive notifications through.
					</CardDescription>
				</CardHeader>
				<CardContent className="divide-y">
					{CHANNEL_SETTINGS.map((setting) => (
						<SettingRow
							key={setting.key}
							setting={setting}
							checked={prefs[setting.key]}
							disabled={mutation.isPending}
							onToggle={handleToggle}
						/>
					))}
				</CardContent>
			</Card>

			{/* Notification Content card */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base font-semibold text-brand-primary-1">
						Notification Content
					</CardTitle>
					<CardDescription>
						Select which types of notifications you want to receive.
					</CardDescription>
				</CardHeader>
				<CardContent className="divide-y">
					{CONTENT_SETTINGS.map((setting) => (
						<SettingRow
							key={setting.key}
							setting={setting}
							checked={prefs[setting.key]}
							disabled={mutation.isPending}
							onToggle={handleToggle}
						/>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
