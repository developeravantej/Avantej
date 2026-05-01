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
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { requirePermission } from "@/lib/route-guards";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";

export const Route = createFileRoute("/_authenticated/go-highlevel-integration")({
	beforeLoad: async () => {
		await requirePermission("user_management:update");
	},
	component: GoHighLevelIntegrationPage,
});

type BranchLink = {
	id: string;
	tenantBranchId: string;
	ghlLocationId: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	errorCount: number;
};

type HierarchyNode = {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
};

function GoHighLevelIntegrationPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [connectBranchId, setConnectBranchId] = useState<string | null>(null);
	const [locationId, setLocationId] = useState("");
	const [apiKey, setApiKey] = useState("");

	const { data: hierarchyData, isLoading: nodesLoading } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId ?? "" },
			enabled: !!organizationId,
		}),
	});

	const { data: branchLinks = [], isLoading: linksLoading } = useQuery({
		queryKey: ["ghlBranchLinks", organizationId],
		queryFn: async () => {
			if (!organizationId) return [] as BranchLink[];
			return client.ghl.listBranchLinks({ organizationId }) as Promise<BranchLink[]>;
		},
		enabled: !!organizationId,
	});

	const branchNodes: HierarchyNode[] = (hierarchyData?.nodes ?? []).filter(
		(n: HierarchyNode) => n.type === "branch",
	);

	const connectMutation = useApiMutation({
		mutationFn: async (vars: {
			tenantBranchId: string;
			ghlLocationId: string;
			ghlApiKey: string;
		}) => {
			if (!organizationId) throw new Error("No organization");
			return client.ghl.connectBranch({
				organizationId,
				tenantBranchId: vars.tenantBranchId,
				ghlLocationId: vars.ghlLocationId,
				ghlApiKey: vars.ghlApiKey,
			});
		},
		successMessage: "GHL connected for branch",
		invalidate: [["ghlBranchLinks", organizationId]],
		onSuccess: () => {
			setConnectBranchId(null);
			setLocationId("");
			setApiKey("");
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
		invalidate: [["ghlBranchLinks", organizationId]],
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
		invalidate: [["ghlBranchLinks", organizationId]],
	});

	const isLoading = nodesLoading || linksLoading;

	const handleConnect = () => {
		if (!connectBranchId || !locationId.trim() || !apiKey.trim()) return;
		connectMutation.mutate({
			tenantBranchId: connectBranchId,
			ghlLocationId: locationId.trim(),
			ghlApiKey: apiKey.trim(),
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
				<h1 className="text-3xl font-bold tracking-tight">GoHighLevel Integration</h1>
				<p className="text-muted-foreground">
					Connect each branch to its GoHighLevel sub-account location.
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
														<span className="text-muted-foreground">—</span>
													)}
												</td>
												<td className="py-3">
													<div className="flex gap-2">
														{connected && errorCount > 0 && (
															<Button
																variant="outline"
																size="sm"
																onClick={() => handleRetry(branch.id)}
																disabled={retryMutation.isPending}
															>
																{retryMutation.isPending ? "Retrying…" : "Retry"}
															</Button>
														)}
														{connected ? (
															<Button
																variant="outline"
																size="sm"
																onClick={() => handleDisconnect(branch.id)}
																disabled={disconnectMutation.isPending}
															>
																Disconnect
															</Button>
														) : (
															<Button
																size="sm"
																onClick={() => setConnectBranchId(branch.id)}
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

			<Dialog
				open={connectBranchId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConnectBranchId(null);
						setLocationId("");
						setApiKey("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							Connect GHL —{" "}
							{branchNodes.find((b) => b.id === connectBranchId)?.name ?? ""}
						</DialogTitle>
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
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setConnectBranchId(null);
								setLocationId("");
								setApiKey("");
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
