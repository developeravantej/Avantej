import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
// TODO(pr-23-merge): requireSystemAdmin not exported / usePermissions module missing, restore or remove dependent UI
// @ts-expect-error - not exported
import { requireSystemAdmin } from "@/lib/route-guards";
// @ts-expect-error - module missing
import { useIsSystemAdmin } from "@/hooks/usePermissions";
import { Lock, RefreshCw, Zap } from "lucide-react";

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
	beforeLoad: async () => {
		await requireSystemAdmin("/dashboard");
	},
	component: GoHighLevelIntegrationPage,
});

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
			{children}
		</div>
	);
}

function GoHighLevelIntegrationPage() {
	const { isSystemAdmin, loading: adminLoading } = useIsSystemAdmin();
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

	const extractParsedFieldsPreview = (event: GhlSyncEvent) => {
		const payload = event.rawPayload ?? {};
		const asRecord = (v: unknown) =>
			v && typeof v === "object" && !Array.isArray(v)
				? (v as Record<string, unknown>)
				: null;
		const asText = (v: unknown) =>
			(typeof v === "string" || typeof v === "number" || typeof v === "boolean")
				&& String(v).trim().length > 0
				? String(v).trim()
				: null;
		const pickField = (keys: string[]) => {
			const payloadRecord = payload as Record<string, unknown>;
			const contact = asRecord(payloadRecord.contact);
			for (const key of keys) {
				const contactValue = asText(contact?.[key]);
				if (contactValue) {
					return contactValue;
				}
				const payloadValue = asText(payloadRecord[key]);
				if (payloadValue) {
					return payloadValue;
				}
			}
			return null;
		};

		const firstName = pickField(["first_name", "firstName"]);
		const lastName = pickField(["last_name", "lastName"]);
		const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
		const preferredBranch = pickField(["select_preferred_branch_1"]) || "";
		const mainBranch =
			pickField(["select_main_branch_assigned_in_contract_for_service_thailand"]) || "";
		const computedLocation = `${preferredBranch}${mainBranch}`.trim();
		const location = pickField(["location"]) || computedLocation || null;

		return {
			id: pickField(["id", "contactId", "contact_id"]) || event.ghlContactId || null,
			name: pickField(["name"]) || fallbackName,
			first_name: firstName,
			last_name: lastName,
			email: pickField(["email_update_override", "email", "contact_email"]) || event.email || null,
			phone: pickField(["phone_update_override", "phone", "contact_phone"]),
			id_passport: pickField(["id_passport", "nric_no__id_no"]),
			address_type: pickField(["address_type", "homework_address_indicator"]),
			address: pickField(["full_address", "address"]),
			dob: pickField(["dob", "date_of_birth", "dateOfBirth"]),
			emergency_name: pickField(["emergency_name", "emergency_contact_name"]),
			emergency_phone: pickField([
				"emergency_phone",
				"emergency_contact_no",
				"emergency_contact_phone",
			]),
			emergency_relationship: pickField([
				"emergency_relationship",
				"emergency_contact_relationship",
			]),
			country: pickField(["country_to_determine_branch__new", "country"]),
			location,
			service: pickField(["service", "client_purchase"]),
			service_start_date: pickField(["service_start_date", "commencement_date"]),
			currency: pickField(["currency_picker", "currency"]),
			payment_method: pickField(["payment_method"]),
			remark: pickField(["remark_on_paymentpackage", "remark"]),
			primary_coach: pickField(["primary_coach"]),
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

	// stable reference — initial mount only; selectedLocationId changes are handled by the second useEffect below
	const refresh = useCallback(async () => {
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
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
	}, [refresh]);

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

	// ─── Guards (must come AFTER all hook calls per Rules of Hooks) ────────────

	if (adminLoading) return null;

	if (!isSystemAdmin) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex items-center justify-center">
				<div className="flex flex-col items-center justify-center text-[#737373]">
					<Lock className="h-8 w-8 mb-3 opacity-30" />
					<p className="text-sm font-medium text-[#0a0a0a]">You don&apos;t have access to this page</p>
					<p className="text-xs mt-1">Ask a system admin to grant access.</p>
				</div>
			</div>
		);
	}

	// ─── Status badge helper ───────────────────────────────────────────────────

	function statusPill(status: string) {
		const isSuccess = status === "success" || status === "processed";
		const isError = status === "error" || status === "failed";
		if (isSuccess) {
			return (
				<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
					{status}
				</span>
			);
		}
		if (isError) {
			return (
				<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-600">
					<span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
					{status}
				</span>
			);
		}
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
				<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
				{status}
			</span>
		);
	}

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* Page header */}
			<div className="mb-5 flex items-end justify-between">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						GHL INTEGRATION
					</p>
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e5e5e5] bg-white">
							<Zap className="h-4 w-4 text-[#0a0a0a]" />
						</div>
						<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
							GoHighLevel Integration
						</h1>
					</div>
					<p className="mt-1 text-sm text-[#737373]">
						GHL custom webhook sync to Avantej backend.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void refresh()}
					disabled={loading}
					className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition disabled:opacity-50"
				>
					<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
					{loading ? "Loading…" : "Refresh"}
				</button>
			</div>

			{/* Error banner */}
			{error ? (
				<div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</div>
			) : null}

			<div className="space-y-5">
				{/* Webhook Setup */}
				<FormSection
					title="Webhook Setup"
					helper="Configure your GHL webhook endpoint and authentication."
				>
					<div className="space-y-3 text-sm text-[#404040]">
						<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">Endpoint URL</p>
							<code className="font-mono tabular-nums text-[#0a0a0a] text-xs break-all">{webhookUrlPreview}</code>
						</div>
						<p>Required fields in payload: <code className="font-mono text-xs bg-[#f3f3f3] px-1 py-0.5 rounded border border-[#e5e5e5]">contact.id</code> and <code className="font-mono text-xs bg-[#f3f3f3] px-1 py-0.5 rounded border border-[#e5e5e5]">email</code>.</p>
						<p>URL locationId is the primary tenant router.</p>
						<p>
							Security (recommended): set <code className="font-mono text-xs bg-[#f3f3f3] px-1 py-0.5 rounded border border-[#e5e5e5]">Authorization: Bearer &lt;webhookSecret&gt;</code> in
							GHL Custom Webhook and save the same secret here.
						</p>
					</div>
				</FormSection>

				{/* Connected Locations */}
				<FormSection
					title="Connected Locations"
					helper="Add GHL location IDs and select the active location to inspect."
				>
					<div className="space-y-3">
						<div className="grid gap-2 md:grid-cols-3">
							<input
								className="rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:ring-1 focus:ring-[#0a0a0a] placeholder:text-[#737373]"
								placeholder="New locationId"
								value={newLocationId}
								onChange={(e) => setNewLocationId(e.target.value)}
							/>
							<input
								className="rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:ring-1 focus:ring-[#0a0a0a] placeholder:text-[#737373]"
								placeholder="Webhook secret (optional)"
								value={newSecret}
								onChange={(e) => setNewSecret(e.target.value)}
							/>
							<button
								type="button"
								onClick={() => void saveLocationMapping()}
								disabled={loading}
								className="inline-flex items-center justify-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50"
							>
								Save Mapping
							</button>
						</div>
						<select
							className="w-full rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#0a0a0a] outline-none focus:ring-1 focus:ring-[#0a0a0a]"
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
						<p className="text-xs text-[#737373]">
							<span className="font-mono tabular-nums">{locations.length}</span> location(s) linked
						</p>
					</div>
				</FormSection>

				{/* Recent Sync Events */}
				<FormSection title="Recent Sync Events">
					<div className="rounded-2xl border border-[#e5e5e5] overflow-hidden">
						<table className="w-full">
							<thead className="bg-[#f3f3f3]">
								<tr className="border-b border-[#e5e5e5]">
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Time</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Type</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Contact ID</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Email</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Status</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Error</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Payload</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-[#e5e5e5]">
								{events.map((event) => (
									<tr key={event.id} className="hover:bg-[#fafafa] transition-colors">
										<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">
											{new Date(event.createdAt).toLocaleString()}
										</td>
										<td className="px-4 py-3 text-sm text-[#0a0a0a]">{event.eventType}</td>
										<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">{event.ghlContactId || "—"}</td>
										<td className="px-4 py-3 text-sm text-[#737373]">{event.email || "—"}</td>
										<td className="px-4 py-3">{statusPill(event.status)}</td>
										<td className="px-4 py-3 text-xs text-rose-600 max-w-[160px] truncate" title={event.errorMessage ?? undefined}>
											{event.errorMessage || "—"}
										</td>
										<td className="px-4 py-3">
											{event.rawPayload ? (
												<details>
													<summary className="cursor-pointer text-[13px] font-medium text-[#0a0a0a] hover:text-[#737373]">View</summary>
													<div className="mt-2 space-y-3">
														<div>
															<div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
																Full Payload
															</div>
															<pre className="max-h-64 overflow-auto rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-2 font-mono text-xs">
																{formatPayload(event.rawPayload)}
															</pre>
														</div>
														<div>
															<div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
																Parsed Fields
															</div>
															<pre className="max-h-64 overflow-auto rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-2 font-mono text-xs">
																{JSON.stringify(extractParsedFieldsPreview(event), null, 2)}
															</pre>
														</div>
													</div>
												</details>
											) : (
												<span className="font-mono tabular-nums text-xs text-[#737373]">—</span>
											)}
										</td>
									</tr>
								))}
								{events.length === 0 ? (
									<tr>
										<td className="py-12 text-center text-sm text-[#737373]" colSpan={7}>
											No sync events yet.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</FormSection>

				{/* Contact Links */}
				<FormSection title="Contact Links">
					<div className="rounded-2xl border border-[#e5e5e5] overflow-hidden">
						<table className="w-full">
							<thead className="bg-[#f3f3f3]">
								<tr className="border-b border-[#e5e5e5]">
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">GHL Contact ID</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">User ID</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Profile ID</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Sync Status</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Profile Deleted</th>
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">Last Synced</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-[#e5e5e5]">
								{links.map((link) => (
									<tr key={link.id} className="hover:bg-[#fafafa] transition-colors">
										<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#0a0a0a]">{link.ghlContactId}</td>
										<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">{link.userId}</td>
										<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">{link.customerProfileId || "—"}</td>
										<td className="px-4 py-3">{statusPill(link.syncStatus)}</td>
										<td className="px-4 py-3 text-sm text-[#737373]">{link.profileIsDeleted ? "yes" : "no"}</td>
										<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">
											{link.lastSyncedAt ? new Date(link.lastSyncedAt).toLocaleString() : "—"}
										</td>
									</tr>
								))}
								{links.length === 0 ? (
									<tr>
										<td className="py-12 text-center text-sm text-[#737373]" colSpan={6}>
											No contact links yet.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</FormSection>
			</div>
		</div>
	);
}
