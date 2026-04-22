import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Calendar,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	RefreshCw,
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

function formatRelativeTime(isoString: string | null): string {
	if (!isoString) return "Never";
	const diff = Date.now() - new Date(isoString).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}

function GoogleCalendarPage() {
	const { data: userContext, isLoading: isUserContextLoading } =
		useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? "";
	const { gcal, message } = Route.useSearch();
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();

	// Fix 1 + 4: Show toast on redirect back from OAuth, then clear the params
	// so remounts don't re-fire the toast.
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
				// Fix 4: explicit branch for token exchange failures
				toast.error("Connection failed — please try again.");
			} else {
				toast.error("Failed to connect Google Calendar");
			}
		}

		// Fix 1: Remove ?gcal= params so this toast doesn't re-fire on remount
		navigate({ search: {}, replace: true });
	}, [gcal, message, navigate]);

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

	const disconnectMutation = useMutation({
		mutationFn: () => client.googleCalendar.disconnect({ organizationId }),
		onSuccess: () => {
			toast.success("Google Calendar disconnected");
			queryClient.invalidateQueries({
				queryKey: ["googleCalendar", "status", organizationId],
			});
		},
		onError: () => {
			toast.error("Failed to disconnect Google Calendar");
		},
	});

	// Fix 2: Disable Connect when organizationId is not yet resolved
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

	return (
		<div className="container max-w-2xl py-8 space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Google Calendar Integration
				</h1>
				<p className="text-muted-foreground mt-1">
					Sync your appointments to Google Calendar automatically.
				</p>
			</div>

			{isLoading && (
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-4 w-72 mt-1" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-10 w-40" />
					</CardContent>
				</Card>
			)}

			{isError && (
				<Card>
					<CardContent className="pt-6 flex items-center gap-4">
						<p className="text-muted-foreground text-sm">
							Failed to load connection status. Please try again.
						</p>
						{/* Fix 3: Retry button so the user doesn't have to reload the page */}
						<Button variant="outline" size="sm" onClick={() => refetch()}>
							<RefreshCw className="size-3.5 mr-1.5" />
							Retry
						</Button>
					</CardContent>
				</Card>
			)}

			{status && !isLoading && (
				<>
					<Card>
						<CardHeader>
							<div className="flex items-center gap-2">
								<Calendar className="size-5 text-primary" />
								<CardTitle>Connection Status</CardTitle>
							</div>
							<CardDescription>
								{status.connected
									? "Your Google Calendar is connected."
									: "Connect your Google Calendar to sync appointments."}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{status.connected ? (
								<>
									<div className="flex items-center gap-2">
										<CheckCircle2 className="size-4 text-green-600" />
										<span className="text-sm font-medium">Connected</span>
										<Badge variant="secondary">
											{status.syncScope === "all"
												? "All appointments"
												: "Your appointments"}
										</Badge>
									</div>

									{status.googleEmail && (
										<p className="text-sm text-muted-foreground">
											Google account:{" "}
											<span className="font-medium text-foreground">
												{status.googleEmail}
											</span>
										</p>
									)}

									<p className="text-sm text-muted-foreground">
										Last synced:{" "}
										<span className="font-medium text-foreground">
											{formatRelativeTime(status.lastSyncAt)}
										</span>
									</p>

									<Button
										variant="destructive"
										onClick={handleDisconnect}
										disabled={disconnectMutation.isPending}
										className="mt-2"
									>
										{disconnectMutation.isPending ? (
											<>
												<RefreshCw className="size-4 mr-2 animate-spin" />
												Disconnecting…
											</>
										) : (
											<>
												<XCircle className="size-4 mr-2" />
												Disconnect
											</>
										)}
									</Button>
								</>
							) : (
								<>
									<div className="flex items-center gap-2">
										<XCircle className="size-4 text-muted-foreground" />
										<span className="text-sm text-muted-foreground">
											Not connected
										</span>
									</div>

									{/* Fix 2: Disable when organizationId is empty (context still loading) */}
									<Button
										onClick={handleConnect}
										disabled={!organizationId || isUserContextLoading}
										className="mt-2"
									>
										<Calendar className="size-4 mr-2" />
										{isUserContextLoading
											? "Loading…"
											: "Connect Google Calendar"}
									</Button>
								</>
							)}
						</CardContent>
					</Card>

					{status.connected && status.lastSyncError && (
						<Alert variant="destructive">
							<AlertTriangle className="size-4" />
							<AlertDescription>
								<span className="font-medium">Last sync failed: </span>
								{status.lastSyncError}
								{/* Fix 5: Show Reconnect for any sync error, not just "revoked" */}
								{status.lastSyncError && (
									<Button
										variant="link"
										className="ml-2 h-auto p-0 text-destructive underline"
										onClick={handleConnect}
									>
										Reconnect
									</Button>
								)}
							</AlertDescription>
						</Alert>
					)}
				</>
			)}
		</div>
	);
}
