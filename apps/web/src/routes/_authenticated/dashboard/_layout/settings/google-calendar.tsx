import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	RefreshCw,
	Info,
	AlertTriangle,
	XCircle,
	CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/google-calendar",
)({
	validateSearch: z.object({
		gcal: z.enum(["connected", "error"]).optional(),
		message: z.string().optional(),
	}),
	component: GoogleCalendarPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string | null): string {
	if (!isoString) return "—";
	const diff = Date.now() - new Date(isoString).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Google G SVG logo
// ---------------------------------------------------------------------------

function GoogleGLogo() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24">
			<path
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
				fill="#4285F4"
			/>
			<path
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				fill="#34A853"
			/>
			<path
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
				fill="#FBBC05"
			/>
			<path
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				fill="#EA4335"
			/>
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Org Status Strip (stat pills row)
// ---------------------------------------------------------------------------

interface StatPillProps {
	label: string;
	value: string | number | null | undefined;
	valueClass?: string;
	nullTooltip?: string;
}

function StatPill({ label, value, valueClass, nullTooltip }: StatPillProps) {
	const isNull = value == null;
	const display = isNull ? "—" : String(value);

	return (
		<div className="flex flex-1 flex-col gap-1 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3">
			<div className="flex items-center gap-1">
				<span className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">{label}</span>
				{isNull && nullTooltip && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Info className="size-3 cursor-help text-[#737373]/60" />
							</TooltipTrigger>
							<TooltipContent side="bottom" className="max-w-52 text-xs">
								{nullTooltip}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>
			<span
				className={`font-mono tabular-nums text-xl font-bold leading-none text-[#0a0a0a] ${valueClass ?? ""}`}
			>
				{display}
			</span>
		</div>
	);
}

function OrgStatusStrip() {
	const { data: orgStatusRaw, isLoading } = useQuery({
		...(orpc.googleCalendar.orgStatus as any).queryOptions({}),
	});
	const orgStatus = orgStatusRaw as any;

	if (isLoading) {
		return (
			<div className="flex gap-3">
				{[...Array(4)].map((_, i) => (
					<Skeleton key={i} className="h-16 flex-1 rounded-xl" />
				))}
			</div>
		);
	}

	const trainersLabel = orgStatus
		? `${orgStatus.connectedCount} of ${orgStatus.totalTrainerCount}`
		: null;

	return (
		<div className="flex gap-3">
			<StatPill label="Trainers connected" value={trainersLabel} />
			<StatPill
				label="Events synced today"
				value={orgStatus?.eventsSyncedToday ?? null}
				valueClass="text-emerald-700"
				nullTooltip="Event sync tracking not yet enabled"
			/>
			<StatPill
				label="Conflicts detected"
				value={orgStatus?.conflictsDetected ?? null}
				valueClass="text-rose-600"
				nullTooltip="Conflict tracking not yet enabled"
			/>
			<StatPill
				label="Last org sync"
				value={orgStatus?.lastOrgSyncAt ? formatRelativeTime(orgStatus.lastOrgSyncAt) : null}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// My Connection Banner
// ---------------------------------------------------------------------------

function MyConnectionCard({
	organizationId,
	isUserContextLoading,
}: {
	organizationId: string;
	isUserContextLoading: boolean;
}) {
	const {
		data: status,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["googleCalendar", "status", organizationId],
		queryFn: () => client.googleCalendar.status({ organizationId }),
		enabled: !!organizationId,
	});

	const disconnectMutation = useApiMutation({
		mutationFn: (_: void) => client.googleCalendar.disconnect({ organizationId }),
		successMessage: "Google Calendar disconnected",
		errorMessage: "Failed to disconnect Google Calendar",
		invalidate: [["googleCalendar", "status", organizationId]],
	});

	const handleConnect = () => {
		const params = new URLSearchParams({
			organizationId,
			returnUrl: "/dashboard/settings/google-calendar",
		});
		window.location.href = `/auth/google-calendar/initiate?${params.toString()}`;
	};

	const handleDisconnect = () => {
		if (
			window.confirm(
				"Are you sure? Future appointments will no longer sync to Google Calendar. Existing events will remain.",
			)
		) {
			disconnectMutation.mutate();
		}
	};

	if (isLoading) {
		return <Skeleton className="h-16 w-full rounded-2xl" />;
	}

	if (isError) {
		return (
			<div className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-4">
				<p className="flex-1 text-sm text-[#737373]">
					Failed to load connection status.
				</p>
				<button
					type="button"
					onClick={() => refetch()}
					className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition"
				>
					<RefreshCw className="size-3.5" />
					Retry
				</button>
			</div>
		);
	}

	if (!status?.connected) {
		return (
			<div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
				<AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
				<div className="flex-1">
					<div className="text-sm font-semibold text-amber-800">My calendar not connected</div>
					<div className="mt-0.5 text-xs text-amber-700/80">
						Connect to start syncing your appointments with Google Calendar.
					</div>
				</div>
				<button
					type="button"
					onClick={handleConnect}
					disabled={!organizationId || isUserContextLoading}
					className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition disabled:opacity-50"
				>
					{isUserContextLoading ? "Loading…" : "Connect"}
				</button>
			</div>
		);
	}

	// Connected state
	return (
		<>
			<div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
				<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
				<div className="flex-1 min-w-0">
					<div className="text-sm font-semibold text-emerald-800">Your calendar is connected</div>
					{status.googleEmail && (
						<div className="mt-0.5 text-xs text-emerald-700/80">
							Connected as{" "}
							<span className="font-mono tabular-nums">{status.googleEmail}</span>
							{status.lastSyncAt && (
								<> · Last sync {formatRelativeTime(status.lastSyncAt)}</>
							)}
						</div>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
						{status.syncScope === "all" ? "All appointments" : "Your appointments"}
					</span>
					<button
						type="button"
						onClick={handleDisconnect}
						disabled={disconnectMutation.isPending}
						className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-rose-600 px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-rose-50 transition disabled:opacity-50"
					>
						{disconnectMutation.isPending ? (
							<RefreshCw className="size-3 animate-spin" />
						) : (
							<XCircle className="size-3" />
						)}
						Disconnect
					</button>
				</div>
			</div>

			{status.lastSyncError && (
				<div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-700" />
					<div className="flex-1">
						<div className="text-sm font-semibold text-rose-800">Last sync failed</div>
						<div className="mt-0.5 text-xs text-rose-700/80">{status.lastSyncError}</div>
					</div>
					<button
						type="button"
						onClick={handleConnect}
						className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition"
					>
						Reconnect
					</button>
				</div>
			)}
		</>
	);
}

// ---------------------------------------------------------------------------
// Settings Sidebar
// ---------------------------------------------------------------------------

const SYNC_DIRECTION_OPTIONS = [
	{ value: "two_way", label: "Two-way (recommended)" },
	{ value: "one_way_to_google", label: "Avantej → Google only" },
	{ value: "one_way_from_google", label: "Google → Avantej only" },
] as const;

const CONFLICT_POLICY_OPTIONS = [
	{ value: "avantej_wins", label: "Avantej wins" },
	{ value: "google_wins", label: "Google Calendar wins" },
	{ value: "keep_both", label: "Keep both" },
	{ value: "manual_review", label: "Ask me each time" },
] as const;

type SyncDirection = (typeof SYNC_DIRECTION_OPTIONS)[number]["value"];
type ConflictPolicy = (typeof CONFLICT_POLICY_OPTIONS)[number]["value"];

function SettingsSidebar() {
	const [syncDirection, setSyncDirection] = useState<SyncDirection>("two_way");
	const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("avantej_wins");
	const [countdown, setCountdown] = useState(0);

	const updateSettingsMutation = useApiMutation({
		mutationFn: (input: { syncDirection?: SyncDirection; conflictPolicy?: ConflictPolicy }) =>
			client.googleCalendar.updateSettings(input),
		successMessage: "Settings saved",
		errorMessage: "Failed to save settings",
	});

	const syncNowMutation = useApiMutation({
		mutationFn: () => client.googleCalendar.syncNow({}),
		successMessage: false,
		errorMessage: false,
		onSuccess: () => {
			toast.success("Sync queued");
			setCountdown(60);
		},
		onError: (err: { message?: string }) => {
			const message = err?.message ?? "";
			if (
				message.toLowerCase().includes("too_many_requests") ||
				message.includes("60 seconds")
			) {
				toast.error("Sync already enqueued — please wait at least 60 seconds.");
				setCountdown(60);
			} else {
				toast.error("Failed to enqueue sync. Please try again.");
			}
		},
	});

	// Calendar list
	const { data: calendarDataRaw, isLoading: calsLoading } = useQuery({
		...(orpc.googleCalendar.listConnectedCalendars as any).queryOptions({}),
	});
	const calendarData = calendarDataRaw as any;
	const calendars: any[] = calendarData?.calendars ?? [];

	useEffect(() => {
		if (countdown <= 0) return;
		const id = setInterval(() => {
			setCountdown((prev) => {
				if (prev <= 1) {
					clearInterval(id);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => clearInterval(id);
	}, [countdown]);

	const handleSave = () => {
		updateSettingsMutation.mutate({ syncDirection, conflictPolicy });
	};

	const isSyncBusy = syncNowMutation.isPending || countdown > 0;

	return (
		<div className="flex flex-col gap-5 bg-[#f3f3f3] p-5 h-full">
			<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
				Sync Settings
			</p>

			{/* Sync direction */}
			<div className="flex flex-col gap-2">
				<label className="text-xs font-semibold text-[#0a0a0a]">Sync direction</label>
				<div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3">
					{SYNC_DIRECTION_OPTIONS.map((opt) => (
						<label key={opt.value} className="flex cursor-pointer items-center gap-2.5">
							<input
								type="radio"
								name="syncDirection"
								value={opt.value}
								checked={syncDirection === opt.value}
								onChange={() => setSyncDirection(opt.value)}
								className="accent-[#0a0a0a]"
							/>
							<span
								className={`text-sm ${syncDirection === opt.value ? "text-[#0a0a0a] font-medium" : "text-[#737373]"}`}
							>
								{opt.label}
							</span>
						</label>
					))}
				</div>
			</div>

			{/* Conflict resolution */}
			<div className="flex flex-col gap-2">
				<label className="text-xs font-semibold text-[#0a0a0a]">Conflict resolution</label>
				<div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3">
					{CONFLICT_POLICY_OPTIONS.map((opt) => (
						<label key={opt.value} className="flex cursor-pointer items-center gap-2.5">
							<input
								type="radio"
								name="conflictPolicy"
								value={opt.value}
								checked={conflictPolicy === opt.value}
								onChange={() => setConflictPolicy(opt.value)}
								className="accent-[#0a0a0a]"
							/>
							<span
								className={`text-sm ${conflictPolicy === opt.value ? "text-[#0a0a0a] font-medium" : "text-[#737373]"}`}
							>
								{opt.label}
							</span>
						</label>
					))}
				</div>
			</div>

			{/* Calendars synced */}
			<div className="flex flex-col gap-2">
				<label className="text-xs font-semibold text-[#0a0a0a]">Calendars synced</label>
				{calsLoading ? (
					<Skeleton className="h-10 w-full rounded-xl" />
				) : calendars.length === 0 ? (
					<p className="text-xs text-[#737373]">
						No calendars found. Connect your Google Calendar first.
					</p>
				) : (
					<div className="rounded-xl border border-[#e5e5e5] bg-white p-3">
						<Select>
							<SelectTrigger className="w-full border-0 p-0 text-sm shadow-none focus:ring-0">
								<SelectValue placeholder="Select a calendar…" />
							</SelectTrigger>
							<SelectContent>
								{calendars.map((cal) => (
									<SelectItem key={cal.id} value={cal.id}>
										<span className="flex items-center gap-2">
											{cal.summary}
											{cal.primary && (
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
													Primary
												</span>
											)}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{calendarData?.cachedAt && (
							<p className="mt-1 text-xs text-[#737373]">
								Cached {formatRelativeTime(calendarData.cachedAt)}
							</p>
						)}
					</div>
				)}
			</div>

			{/* Action buttons */}
			<div className="flex gap-2 pt-1 mt-auto">
				<button
					type="button"
					onClick={handleSave}
					disabled={updateSettingsMutation.isPending}
					className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
				>
					{updateSettingsMutation.isPending ? "Saving…" : "Save settings"}
				</button>
				<button
					type="button"
					onClick={() => syncNowMutation.mutate()}
					disabled={isSyncBusy}
					className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition disabled:opacity-50"
				>
					<RefreshCw
						className={`size-3 ${syncNowMutation.isPending ? "animate-spin" : ""}`}
					/>
					{countdown > 0 ? (
						<span className="font-mono tabular-nums">{countdown}s</span>
					) : (
						"Sync now"
					)}
				</button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function GoogleCalendarPage() {
	const { data: userContext, isLoading: isUserContextLoading } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? "";
	const { gcal, message } = Route.useSearch();
	const navigate = Route.useNavigate();

	useEffect(() => {
		if (!gcal) return;

		if (gcal === "connected") {
			toast.success("Google Calendar connected successfully");
		} else if (gcal === "error") {
			if (message === "auth_denied") {
				toast.error("Authorization was denied");
			} else if (message === "invalid_state") {
				toast.error("Invalid OAuth state — please try again");
			} else if (message === "token_exchange_failed") {
				toast.error("Connection failed — please try again.");
			} else {
				toast.error("Failed to connect Google Calendar");
			}
		}

		navigate({ search: {}, replace: true });
	}, [gcal, message, navigate]);

	const handleConnect = () => {
		if (!organizationId) return;
		const params = new URLSearchParams({
			organizationId,
			returnUrl: "/dashboard/settings/google-calendar",
		});
		window.location.href = `/auth/google-calendar/initiate?${params.toString()}`;
	};

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Settings</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Google Calendar</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={handleConnect}
						disabled={!organizationId || isUserContextLoading}
						className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626] disabled:opacity-50"
					>
						{isUserContextLoading ? "Loading…" : "Connect My Calendar"}
					</button>
				</div>
			</header>

			<div className="flex flex-col gap-5 px-6 py-6 flex-1">

			{/* Master-detail split */}
			<div
				className="grid grid-cols-[1fr_300px] rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden flex-1"
				style={{ minHeight: "calc(100vh - 200px)" }}
			>
				{/* Main scroll area */}
				<div className="flex flex-col gap-5 overflow-auto p-5 border-r border-[#e5e5e5]">
					{/* Org stat pills */}
					{organizationId && <OrgStatusStrip />}

					{/* My connection banner */}
					<MyConnectionCard
						organizationId={organizationId}
						isUserContextLoading={isUserContextLoading}
					/>
				</div>

				{/* Settings sidebar */}
				<div className="overflow-auto">
					<SettingsSidebar />
				</div>
			</div>
			</div>
		</div>
	);
}
