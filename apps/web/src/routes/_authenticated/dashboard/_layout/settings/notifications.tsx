import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Lock } from "lucide-react";

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
		<div className="flex items-center justify-between py-4 border-b border-[#e5e5e5] last:border-0">
			<div className="space-y-1.5">
				<div className="h-4 w-40 rounded bg-[#e5e5e5] animate-pulse" />
				<div className="h-3 w-56 rounded bg-[#e5e5e5] animate-pulse" />
			</div>
			<div className="h-6 w-11 rounded-full bg-[#e5e5e5] animate-pulse" />
		</div>
	);
}

function SkeletonSection({ title, rows }: { title: string; rows: number }) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<div className="h-5 w-44 rounded bg-[#e5e5e5] animate-pulse mb-1" />
			<div className="h-3 w-64 rounded bg-[#e5e5e5] animate-pulse mt-1 mb-4" />
			<div>
				{Array.from({ length: rows }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no identity
					<SkeletonRow key={i} />
				))}
			</div>
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
			<div className="divide-y divide-[#e5e5e5]">{children}</div>
		</div>
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
					className="text-sm font-semibold text-[#0a0a0a] cursor-pointer"
				>
					{setting.label}
				</label>
				<p className="text-sm text-[#737373]">{setting.description}</p>
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
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex items-center justify-center">
				<div className="flex flex-col items-center justify-center text-[#737373]">
					<Lock className="h-8 w-8 mb-3 opacity-30" />
					<p className="text-sm font-medium text-[#0a0a0a]">No organization selected</p>
					<p className="text-xs mt-1">Select an organization to manage notification preferences.</p>
				</div>
			</div>
		);
	}

	// ─── Loading state ────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
				{/* Page header skeleton */}
				<div className="mb-5 flex items-end justify-between">
					<div>
						<div className="h-3 w-28 rounded bg-[#e5e5e5] animate-pulse mb-2" />
						<div className="h-7 w-56 rounded bg-[#e5e5e5] animate-pulse" />
						<div className="h-4 w-72 rounded bg-[#e5e5e5] animate-pulse mt-2" />
					</div>
				</div>
				<div className="max-w-[720px] space-y-5">
					<SkeletonSection title="Notification Channels" rows={3} />
					<SkeletonSection title="Notification Content" rows={4} />
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
						NOTIFICATIONS
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Notification Preferences
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						Control how and when you receive notifications.
					</p>
				</div>

				{/* Save state indicator */}
				<div className="text-sm text-[#737373] min-w-16 text-right">
					{saveState === "saving" && (
						<span className="flex items-center gap-1.5 justify-end">
							<span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
							Saving…
						</span>
					)}
					{saveState === "saved" && (
						<span className="flex items-center gap-1.5 justify-end text-emerald-700">
							<span className="h-2 w-2 rounded-full bg-emerald-500" />
							Saved
						</span>
					)}
				</div>
			</div>

			<div className="max-w-[720px] space-y-5">
				{/* Notification Channels */}
				<FormSection
					title="Notification Channels"
					helper="Choose which channels you want to receive notifications through."
				>
					{CHANNEL_SETTINGS.map((setting) => (
						<SettingRow
							key={setting.key}
							setting={setting}
							checked={prefs[setting.key]}
							disabled={mutation.isPending}
							onToggle={handleToggle}
						/>
					))}
				</FormSection>

				{/* Notification Content */}
				<FormSection
					title="Notification Content"
					helper="Select which types of notifications you want to receive."
				>
					{CONTENT_SETTINGS.map((setting) => (
						<SettingRow
							key={setting.key}
							setting={setting}
							checked={prefs[setting.key]}
							disabled={mutation.isPending}
							onToggle={handleToggle}
						/>
					))}
				</FormSection>
			</div>

		</div>
	);
}
