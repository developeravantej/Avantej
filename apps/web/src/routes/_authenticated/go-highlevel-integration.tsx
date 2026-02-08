import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type GhlLocation = {
	locationId: string;
	organizationId: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
};

type GhlSyncEvent = {
	id: string;
	eventKey: string;
	eventType: string;
	ghlContactId: string | null;
	email: string | null;
	status: string;
	errorMessage: string | null;
	rawPayload: Record<string, unknown> | null;
	createdAt: string;
};

type GhlContactLink = {
	id: string;
	ghlContactId: string;
	userId: string;
	customerProfileId: string | null;
	syncStatus: string;
	lastSyncedAt: string | null;
	updatedAt: string;
	profileIsDeleted: boolean | null;
	profileDeletedAt: string | null;
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

export const Route = createFileRoute("/_authenticated/go-highlevel-integration")({
	component: GoHighLevelIntegrationPage,
});

function GoHighLevelIntegrationPage() {
	const [locations, setLocations] = useState<GhlLocation[]>([]);
	const [selectedLocationId, setSelectedLocationId] = useState("");
	const [events, setEvents] = useState<GhlSyncEvent[]>([]);
	const [links, setLinks] = useState<GhlContactLink[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [newLocationId, setNewLocationId] = useState("");
	const [newSecret, setNewSecret] = useState("");

	const formatPayload = (payload: Record<string, unknown> | null) => {
		if (!payload) {
			return "-";
		}
		try {
			return JSON.stringify(payload, null, 2);
		} catch {
			return String(payload);
		}
	};

	const extractCoreFieldsPreview = (
		event: GhlSyncEvent
	): { id: string | null; name: string | null; email: string | null; phone: string | null } => {
		const payload = event.rawPayload ?? {};
		const asRecord = (v: unknown) =>
			v && typeof v === "object" && !Array.isArray(v)
				? (v as Record<string, unknown>)
				: null;
		const asText = (v: unknown) =>
			typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

		const contact = asRecord(payload.contact);

		return {
			id:
				asText(contact?.id) ||
				asText((payload as Record<string, unknown>).contactId) ||
				asText((payload as Record<string, unknown>).contact_id) ||
				event.ghlContactId ||
				asText((payload as Record<string, unknown>).id),
			name:
				asText(contact?.name) ||
				asText((payload as Record<string, unknown>).name) ||
				null,
			email:
				asText(contact?.email) ||
				event.email ||
				asText((payload as Record<string, unknown>).email),
			phone:
				asText(contact?.phone) ||
				asText((payload as Record<string, unknown>).phone) ||
				null,
		};
	};

	const webhookUrlPreview = useMemo(() => {
		if (!selectedLocationId) {
			return `${SERVER_URL}/webhooks/gohighlevel/<locationId>`;
		}
		return `${SERVER_URL}/webhooks/gohighlevel/${selectedLocationId}`;
	}, [selectedLocationId]);

	const loadLocations = async () => {
		const response = await fetch(`${SERVER_URL}/webhooks/gohighlevel/locations`, {
			credentials: "include",
		});
		if (!response.ok) {
			throw new Error(`Failed to load locations (${response.status})`);
		}
		const data = (await response.json()) as { locations: GhlLocation[] };
		setLocations(data.locations || []);
		if (!selectedLocationId && data.locations.length > 0) {
			setSelectedLocationId(data.locations[0].locationId);
		}
	};

	const loadLocationData = async (locationId: string) => {
		const [eventsResponse, linksResponse] = await Promise.all([
			fetch(`${SERVER_URL}/webhooks/gohighlevel/${locationId}/events?limit=25`, {
				credentials: "include",
			}),
			fetch(`${SERVER_URL}/webhooks/gohighlevel/${locationId}/links?limit=50`, {
				credentials: "include",
			}),
		]);

		if (!eventsResponse.ok) {
			throw new Error(`Failed to load events (${eventsResponse.status})`);
		}
		if (!linksResponse.ok) {
			throw new Error(`Failed to load links (${linksResponse.status})`);
		}

		const eventData = (await eventsResponse.json()) as { events: GhlSyncEvent[] };
		const linkData = (await linksResponse.json()) as { links: GhlContactLink[] };
		setEvents(eventData.events || []);
		setLinks(linkData.links || []);
	};

	const refresh = async () => {
		try {
			setLoading(true);
			setError("");
			await loadLocations();
			if (selectedLocationId) {
				await loadLocationData(selectedLocationId);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load integration data");
		} finally {
			setLoading(false);
		}
	};

	const saveLocationMapping = async () => {
		if (!newLocationId.trim()) {
			setError("Location ID is required");
			return;
		}

		try {
			setLoading(true);
			setError("");
			const response = await fetch(`${SERVER_URL}/webhooks/gohighlevel/locations`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					locationId: newLocationId.trim(),
					webhookSecret: newSecret.trim() || undefined,
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to save location mapping (${response.status})`);
			}

			setNewLocationId("");
			setNewSecret("");
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save location mapping");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!selectedLocationId) {
			return;
		}
		void (async () => {
			try {
				setLoading(true);
				setError("");
				await loadLocationData(selectedLocationId);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load location data");
			} finally {
				setLoading(false);
			}
		})();
	}, [selectedLocationId]);

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">GoHighLevel Integration</h1>
					<p className="text-muted-foreground">
						Demo sync flow: GHL custom webhook to Avantej backend to frontend.
					</p>
				</div>
				<Button onClick={() => void refresh()} disabled={loading}>
					{loading ? "Loading..." : "Refresh"}
				</Button>
			</div>

			{error ? (
				<div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</div>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Webhook Setup</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3 text-sm">
					<p>
						Endpoint format: <code>{webhookUrlPreview}</code>
					</p>
					<p>Required fields in payload: <code>contact.id</code> and <code>email</code>.</p>
					<p>URL locationId is the primary tenant router.</p>
					<p>
						Security (recommended): set <code>Authorization: Bearer &lt;webhookSecret&gt;</code> in
						GHL Custom Webhook and save the same secret here.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Connected Locations</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="grid gap-2 md:grid-cols-3">
						<input
							className="rounded-md border bg-background px-3 py-2 text-sm"
							placeholder="New locationId"
							value={newLocationId}
							onChange={(e) => setNewLocationId(e.target.value)}
						/>
						<input
							className="rounded-md border bg-background px-3 py-2 text-sm"
							placeholder="Webhook secret (optional)"
							value={newSecret}
							onChange={(e) => setNewSecret(e.target.value)}
						/>
						<Button type="button" onClick={() => void saveLocationMapping()} disabled={loading}>
							Save Mapping
						</Button>
					</div>
					<select
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
						value={selectedLocationId}
						onChange={(e) => setSelectedLocationId(e.target.value)}
					>
						<option value="">Select a location</option>
						{locations.map((location) => (
							<option key={location.locationId} value={location.locationId}>
								{location.locationId} ({location.organizationId})
							</option>
						))}
					</select>
					<div className="text-xs text-muted-foreground">
						{locations.length} location(s) linked
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Sync Events</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-left">
									<th className="py-2 pr-4">Time</th>
									<th className="py-2 pr-4">Type</th>
									<th className="py-2 pr-4">Contact ID</th>
									<th className="py-2 pr-4">Email</th>
									<th className="py-2 pr-4">Status</th>
									<th className="py-2 pr-4">Error</th>
									<th className="py-2 pr-4">Payload Viewer</th>
								</tr>
							</thead>
							<tbody>
								{events.map((event) => (
									<tr key={event.id} className="border-b">
										<td className="py-2 pr-4">{new Date(event.createdAt).toLocaleString()}</td>
										<td className="py-2 pr-4">{event.eventType}</td>
										<td className="py-2 pr-4">{event.ghlContactId || "-"}</td>
										<td className="py-2 pr-4">{event.email || "-"}</td>
										<td className="py-2 pr-4">{event.status}</td>
										<td className="py-2 pr-4 text-red-600">{event.errorMessage || "-"}</td>
										<td className="py-2 pr-4">
											{event.rawPayload ? (
												<details>
													<summary className="cursor-pointer text-blue-600">View Full + Parsed</summary>
													<div className="mt-2 space-y-3">
														<div>
															<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
																Full Payload (exactly received)
															</div>
															<pre className="max-h-64 overflow-auto rounded border bg-muted p-2 text-xs">
																{formatPayload(event.rawPayload)}
															</pre>
														</div>
														<div>
															<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
																Parsed Core Fields (id/name/email/phone)
															</div>
															<pre className="max-h-64 overflow-auto rounded border bg-muted p-2 text-xs">
																{JSON.stringify(extractCoreFieldsPreview(event), null, 2)}
															</pre>
														</div>
													</div>
												</details>
											) : (
												"-"
											)}
										</td>
									</tr>
								))}
								{events.length === 0 ? (
									<tr>
										<td className="py-3 text-muted-foreground" colSpan={7}>
											No events yet.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Contact Links</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-left">
									<th className="py-2 pr-4">GHL Contact ID</th>
									<th className="py-2 pr-4">User ID</th>
									<th className="py-2 pr-4">Profile ID</th>
									<th className="py-2 pr-4">Sync Status</th>
									<th className="py-2 pr-4">Profile Deleted</th>
									<th className="py-2 pr-4">Last Synced</th>
								</tr>
							</thead>
							<tbody>
								{links.map((link) => (
									<tr key={link.id} className="border-b">
										<td className="py-2 pr-4">{link.ghlContactId}</td>
										<td className="py-2 pr-4">{link.userId}</td>
										<td className="py-2 pr-4">{link.customerProfileId || "-"}</td>
										<td className="py-2 pr-4">{link.syncStatus}</td>
										<td className="py-2 pr-4">{link.profileIsDeleted ? "yes" : "no"}</td>
										<td className="py-2 pr-4">
											{link.lastSyncedAt ? new Date(link.lastSyncedAt).toLocaleString() : "-"}
										</td>
									</tr>
								))}
								{links.length === 0 ? (
									<tr>
										<td className="py-3 text-muted-foreground" colSpan={6}>
											No links yet.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
