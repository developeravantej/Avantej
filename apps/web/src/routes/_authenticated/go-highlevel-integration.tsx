import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { requirePermission } from "@/lib/route-guards";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";

export const Route = createFileRoute(
	"/_authenticated/go-highlevel-integration",
)({
	beforeLoad: async () => {
		await requirePermission("user_management:update");
	},
	component: GoHighLevelIntegrationPage,
});

type HierarchyNode = {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
function GoHighLevelIntegrationPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [connectBranchId, setConnectBranchId] = useState<string | null>(null);
	const [locationId, setLocationId] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [existingBranchCustomFieldId, setExistingBranchCustomFieldId] =
		useState("");

	const { data: hierarchyData, isLoading: nodesLoading } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId ?? "" },
			enabled: !!organizationId,
		}),
	});

	const { data: branchLinks = [], isLoading: linksLoading } = useQuery({
		...orpc.ghl.listBranchLinks.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: !!organizationId,
	});

	// Phase G.2 — org-shared GHL connection state
	const [orgLocationId, setOrgLocationId] = useState("");
	const [orgApiKey, setOrgApiKey] = useState("");

	const { data: orgShared, isLoading: orgSharedLoading } = useQuery({
		...orpc.ghl.getOrgShared.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: !!organizationId,
	});

	const { data: syncEvents } = useQuery({
		queryKey: ["ghlSync", "events", organizationId],
		queryFn: () =>
			client.ghlSync.listEvents({ organizationId: organizationId!, limit: 25 }),
		enabled: !!organizationId,
		staleTime: 30_000,
	});

	const orgConnectMutation = useApiMutation({
		mutationFn: async (vars: { ghlLocationId: string; ghlApiKey: string }) => {
			if (!organizationId) throw new Error("No organization");
			return client.ghl.connectOrgShared({
				organizationId,
				ghlLocationId: vars.ghlLocationId,
				ghlApiKey: vars.ghlApiKey,
			});
		},
		successMessage: "Connected to GHL (organization-wide)",
		invalidate: [orpc.ghl.getOrgShared.key()],
		onSuccess: () => {
			setOrgLocationId("");
			setOrgApiKey("");
		},
	});

	const orgDisconnectMutation = useApiMutation({
		mutationFn: async () => {
			if (!organizationId) throw new Error("No organization");
			return client.ghl.disconnectOrgShared({ organizationId });
		},
		successMessage: "Disconnected organization-wide GHL link",
		invalidate: [orpc.ghl.getOrgShared.key()],
	});

	const branchNodes: HierarchyNode[] = (hierarchyData?.nodes ?? []).filter(
		(n: HierarchyNode) => n.type === "branch",
	);

	const connectMutation = useApiMutation({
		mutationFn: async (vars: {
			tenantBranchId: string;
			ghlLocationId: string;
			ghlApiKey: string;
			existingBranchCustomFieldId: string | null;
		}) => {
			if (!organizationId) throw new Error("No organization");
			return client.ghl.connectBranch({
				organizationId,
				tenantBranchId: vars.tenantBranchId,
				ghlLocationId: vars.ghlLocationId,
				ghlApiKey: vars.ghlApiKey,
				existingBranchCustomFieldId: vars.existingBranchCustomFieldId,
			});
		},
		successMessage: "GHL connected for branch",
		invalidate: [orpc.ghl.listBranchLinks.key()],
		onSuccess: () => {
			setConnectBranchId(null);
			setLocationId("");
			setApiKey("");
			setExistingBranchCustomFieldId("");
		},
	});

	const disconnectMutation = useApiMutation({
		mutationFn: async (vars: { tenantBranchId: string }) => {
			if (!organizationId) throw new Error("No organization");
			return client.ghl.disconnectBranch({
				organizationId,
				tenantBranchId: vars.tenantBranchId,
			});
		},
		successMessage: "GHL disconnected for branch",
		invalidate: [orpc.ghl.listBranchLinks.key()],
	});

	const retryMutation = useApiMutation({
		mutationFn: async (vars: { tenantBranchId: string }) => {
			if (!organizationId) throw new Error("No organization");
			return client.ghl.retryFailedSyncs({
				organizationId,
				tenantBranchId: vars.tenantBranchId,
			});
		},
		successMessage: (result: {
			attempted: number;
			recovered: number;
			stillFailing: number;
		}) =>
			`Retried ${result.attempted}: ${result.recovered} recovered, ${result.stillFailing} still failing`,
		invalidate: [orpc.ghl.listBranchLinks.key()],
	});

	const isLoading = nodesLoading || linksLoading;

	const handleConnect = () => {
		if (!connectBranchId || !locationId.trim() || !apiKey.trim()) return;
		const trimmedFieldId = existingBranchCustomFieldId.trim();
		connectMutation.mutate({
			tenantBranchId: connectBranchId,
			ghlLocationId: locationId.trim(),
			ghlApiKey: apiKey.trim(),
			existingBranchCustomFieldId:
				trimmedFieldId.length > 0 ? trimmedFieldId : null,
		});
	};

	const handleDisconnect = (branchId: string) => {
		if (!window.confirm("Disconnect GHL for this branch?")) return;
		disconnectMutation.mutate({ tenantBranchId: branchId });
	};

	const handleRetry = (branchId: string) => {
		retryMutation.mutate({ tenantBranchId: branchId });
	};

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-semibold tracking-tight">
					GoHighLevel Integration
				</h1>
				<p className="text-muted-foreground">
					Connect each branch to its GoHighLevel sub-account location.
				</p>
			</div>

			{/* Phase G.2 — Organization-wide GHL connection (Option Y) */}
			<Card>
				<CardHeader>
					<CardTitle>Organization-Wide GHL Connection (Recommended)</CardTitle>
					<p className="text-sm text-muted-foreground mt-1">
						Connect once for the whole organization. All branches use the same
						GHL sub-account, differentiated by custom field.
					</p>
				</CardHeader>
				<CardContent>
					{orgSharedLoading ? (
						<p className="text-sm text-muted-foreground py-4">Loading…</p>
					) : orgShared?.ghlSyncModel === "org-shared" &&
						orgShared.ghlLocationId ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<Badge className="bg-green-100 text-green-800 hover:bg-green-100">
									✓ Connected
								</Badge>
								<span className="text-sm font-medium">
									GHL location: {orgShared.ghlLocationId}
								</span>
							</div>
							<div className="text-sm text-muted-foreground">
								Country fields configured: {orgShared.countryFieldCount}
							</div>
							{orgShared.ghlProvisionedAt && (
								<div className="text-sm text-muted-foreground">
									Connected at:{" "}
									{new Date(orgShared.ghlProvisionedAt).toLocaleString()}
								</div>
							)}
							<Button
								variant="outline"
								size="sm"
								data-testid="org-shared-disconnect-btn"
								onClick={() => {
									if (
										!window.confirm(
											"Disconnect the organization-wide GHL connection? Branches will fall back to the legacy per-branch model.",
										)
									)
										return;
									orgDisconnectMutation.mutate(undefined as never);
								}}
								disabled={orgDisconnectMutation.isPending}
							>
								{orgDisconnectMutation.isPending
									? "Disconnecting…"
									: "Disconnect"}
							</Button>
						</div>
					) : (
						<div className="grid gap-4 max-w-md">
							<div>
								<Label htmlFor="orgGhlLocationId">GHL Location ID</Label>
								<Input
									id="orgGhlLocationId"
									value={orgLocationId}
									onChange={(e) => setOrgLocationId(e.target.value)}
									placeholder="e.g. abc123xyz"
									className="mt-1"
								/>
							</div>
							<div>
								<Label htmlFor="orgGhlApiKey">Private Integration Token</Label>
								<Input
									id="orgGhlApiKey"
									type="password"
									value={orgApiKey}
									onChange={(e) => setOrgApiKey(e.target.value)}
									placeholder="Private Integration API key"
									className="mt-1"
								/>
							</div>
							<div>
								<Button
									data-testid="org-shared-connect-btn"
									onClick={() => {
										if (!orgLocationId.trim() || !orgApiKey.trim()) return;
										orgConnectMutation.mutate({
											ghlLocationId: orgLocationId.trim(),
											ghlApiKey: orgApiKey.trim(),
										});
									}}
									disabled={
										orgConnectMutation.isPending ||
										!orgLocationId.trim() ||
										!orgApiKey.trim()
									}
								>
									{orgConnectMutation.isPending ? "Connecting…" : "Connect"}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<div className="border-t pt-2" />

			<div>
				<p className="text-xs text-muted-foreground italic">
					Legacy per-branch connection (Option X). Use only if your franchise
					model requires separate GHL locations per branch.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Branch Connections</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<p className="text-sm text-muted-foreground py-4">Loading…</p>
					) : branchNodes.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4">
							No branches found. Set up your hierarchy first.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b text-left">
										<th className="py-2 pr-4 font-medium">Branch</th>
										<th className="py-2 pr-4 font-medium">GHL Location ID</th>
										<th className="py-2 pr-4 font-medium">Status</th>
										<th className="py-2 pr-4 font-medium">Sync Errors</th>
										<th className="py-2 font-medium">Action</th>
									</tr>
								</thead>
								<tbody>
									{branchNodes.map((branch) => {
										const link = branchLinks.find(
											(l) => l.tenantBranchId === branch.id,
										);
										const connected = link?.isActive === true;
										const errorCount = link?.errorCount ?? 0;
										return (
											<tr key={branch.id} className="border-b last:border-0">
												<td className="py-3 pr-4 font-medium">{branch.name}</td>
												<td className="py-3 pr-4 text-muted-foreground">
													{link?.ghlLocationId ?? "—"}
												</td>
												<td className="py-3 pr-4">
													{connected ? (
														<Badge className="bg-green-100 text-green-800 hover:bg-green-100">
															Connected
														</Badge>
													) : (
														<Badge variant="secondary">Not connected</Badge>
													)}
												</td>
												<td className="py-3 pr-4">
													{errorCount > 0 ? (
														<Badge className="bg-red-100 text-red-800 hover:bg-red-100">
															{errorCount} failed
														</Badge>
													) : (
														<span className="text-muted-foreground">-</span>
													)}
												</td>
												<td className="py-3">
													<div className="flex gap-2">
														{connected && errorCount > 0 && (
															<Button
																variant="outline"
																size="sm"
																data-testid={`retry-btn-${branch.id}`}
																onClick={() => handleRetry(branch.id)}
																disabled={retryMutation.isPending}
															>
																{retryMutation.isPending
																	? "Retrying…"
																	: "Retry"}
															</Button>
														)}
														{connected ? (
															<Button
																variant="outline"
																size="sm"
																data-testid={`disconnect-btn-${branch.id}`}
																onClick={() => handleDisconnect(branch.id)}
																disabled={disconnectMutation.isPending}
															>
																Disconnect
															</Button>
														) : (
															<Button
																size="sm"
																data-testid={`connect-btn-${branch.id}`}
																onClick={() => {
																	setConnectBranchId(branch.id);
																	setLocationId(link?.ghlLocationId ?? "");
																	setExistingBranchCustomFieldId(
																		link?.existingBranchCustomFieldId ?? "",
																	);
																}}
															>
																Connect
															</Button>
														)}
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Sync Events</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{!syncEvents || syncEvents.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							No sync events yet.
						</p>
					) : (
						syncEvents.map((e) => (
							<details
								key={e.id}
								className="rounded-md border px-3 py-2 text-sm"
							>
								<summary className="flex cursor-pointer flex-wrap items-center gap-2">
									<Badge
										variant={
											e.status === "processed"
												? "default"
												: e.status === "failed"
													? "destructive"
													: "secondary"
										}
									>
										{e.status}
									</Badge>
									<span className="font-medium">{e.eventType}</span>
									<span className="text-muted-foreground">
										{e.email ?? "—"}
									</span>
									<span className="text-muted-foreground text-xs">
										{new Date(e.createdAt)
											.toISOString()
											.slice(0, 19)
											.replace("T", " ")}
									</span>
									{e.errorMessage && (
										<span className="text-red-600 text-xs">
											{e.errorMessage}
										</span>
									)}
								</summary>
								<pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
									{JSON.stringify(e.rawPayload, null, 2)}
								</pre>
							</details>
						))
					)}
				</CardContent>
			</Card>

			<Dialog
				open={connectBranchId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConnectBranchId(null);
						setLocationId("");
						setApiKey("");
						setExistingBranchCustomFieldId("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							Connect GHL:{" "}
							{branchNodes.find((b) => b.id === connectBranchId)?.name ?? ""}
						</DialogTitle>
						<DialogDescription>
							Enter your GoHighLevel API key to connect this branch.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div>
							<Label htmlFor="ghlLocationId">GHL Location ID</Label>
							<Input
								id="ghlLocationId"
								value={locationId}
								onChange={(e) => setLocationId(e.target.value)}
								placeholder="e.g. abc123xyz"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="ghlApiKey">GHL API Key</Label>
							<Input
								id="ghlApiKey"
								type="password"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder="Private Integration API key"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="ghlExistingBranchCustomFieldId">
								Existing Branch custom field ID (optional)
							</Label>
							<Input
								id="ghlExistingBranchCustomFieldId"
								value={existingBranchCustomFieldId}
								onChange={(e) => setExistingBranchCustomFieldId(e.target.value)}
								placeholder="e.g. abc123CustomFieldId"
								className="mt-1"
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								GHL custom field ID to receive the new branch name when a staff
								member is reassigned. Leave blank to skip.
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setConnectBranchId(null);
								setLocationId("");
								setApiKey("");
								setExistingBranchCustomFieldId("");
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={handleConnect}
							disabled={
								connectMutation.isPending ||
								!locationId.trim() ||
								!apiKey.trim()
							}
						>
							{connectMutation.isPending ? "Connecting…" : "Connect"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
