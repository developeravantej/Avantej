import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Users, Mail, Calendar, User } from "lucide-react";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "@/utils/orpc";
import { useState, useMemo } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import {
	GhlSyncBadge,
	type GhlSyncInfo,
	type GhlSyncStatus,
} from "@/components/ghl-sync-badge";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/customers")({
	beforeLoad: async () => {
		await requirePermission("user_management:read");
	},
	component: CustomersComponent,
});

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
function CustomersComponent() {
	const navigate = useNavigate();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [searchQuery, setSearchQuery] = useState("");
	const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
	const [phone, setPhone] = useState("");
	const [address, setAddress] = useState("");
	const [emergencyContactName, setEmergencyContactName] = useState("");
	const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
	const [medicalNotes, setMedicalNotes] = useState("");
	const [notes, setNotes] = useState("");

	const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
	const [newEmail, setNewEmail] = useState("");
	const [selectedBranchId, setSelectedBranchId] = useState("");
	// === 3.2 lead source ===
	const [newLeadSourceId, setNewLeadSourceId] = useState("");
	const [newCampaignId, setNewCampaignId] = useState("");
	// === /3.2 ===
	const [retryingCustomerProfileId, setRetryingCustomerProfileId] = useState<
		string | null
	>(null);
	const queryClient = useQueryClient();

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberHierarchyScopeId =
		currentOrg?.hierarchy.member?.hierarchyScopeId ?? "";

	const { data: profile, isLoading: profileLoading } = useQuery({
		...orpc.customerProfiles.get.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
		enabled: !!organizationId,
		staleTime: 60 * 1000,
	});

	const { data: customers = [], isLoading: customersLoading } = useQuery({
		...orpc.members.list.queryOptions({
			input: { organizationId: organizationId ?? "", role: "client" },
			enabled: !!organizationId,
		}),
	});

	const { data: hierarchyData } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId ?? "" },
			enabled: !!organizationId,
		}),
	});
	const branchNodes = (hierarchyData?.nodes ?? []).filter(
		(n: any) => n.type === "branch",
	);

	const filteredCustomers = useMemo(
		() =>
			customers.filter(
				(c: any) =>
					!searchQuery ||
					c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
					c.email?.toLowerCase().includes(searchQuery.toLowerCase()),
			),
		[customers, searchQuery],
	);

	const upsertMutation = useApiMutation({
		mutationFn: async () => {
			if (!organizationId) throw new Error("No organization");
			return client.customerProfiles.upsert({
				organizationId,
				phone: phone.trim() || null,
				address: address.trim() || null,
				emergencyContactName: emergencyContactName.trim() || null,
				emergencyContactPhone: emergencyContactPhone.trim() || null,
				medicalNotes: medicalNotes.trim() || null,
				notes: notes.trim() || null,
			});
		},
		successMessage: "Profile updated",
		errorMessage: (err) => err.message || "Failed to update profile",
		invalidate: [orpc.customerProfiles.get.key()],
		onSuccess: () => {
			setIsProfileDialogOpen(false);
		},
	});

	const memberListKey = orpc.members.list.queryOptions({
		input: { organizationId: organizationId ?? "", role: "client" },
	}).queryKey;

	// === 3.2 lead source — picker options for the Add Customer dialog ===
	const { data: leadSources = [] } = useQuery({
		queryKey: ["leadSources", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.customerProfiles.listLeadSources({ organizationId });
		},
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000,
	});
	// === /3.2 ===

	const addCustomerMutation = useApiMutation({
		mutationFn: async () => {
			if (!organizationId) throw new Error("No organization");
			const scopeId = selectedBranchId || memberHierarchyScopeId;
			if (!scopeId) throw new Error("No hierarchy scope");
			const result = await client.members.create({
				organizationId,
				email: newEmail.trim(),
				role: "client",
				hierarchyScopeId: scopeId,
			});
			// === 3.2 lead source — attach attribution if provided ===
			// Best-effort: failure here doesn't roll back the member create.
			if (newLeadSourceId || newCampaignId.trim()) {
				try {
					await client.customerProfiles.upsertForCustomer({
						organizationId,
						targetUserId: result.member.userId,
						leadSourceId: newLeadSourceId || null,
						campaignId: newCampaignId.trim() || null,
					});
				} catch (err) {
					console.warn("Failed to record lead source on new customer", err);
				}
			}
			// === /3.2 ===
			return result;
		},
		successMessage: "Customer added",
		errorMessage: (err) => err.message || "Failed to add customer",
		invalidate: [memberListKey],
		onSuccess: () => {
			setIsAddCustomerOpen(false);
			setNewEmail("");
			setSelectedBranchId("");
			// === 3.2 lead source ===
			setNewLeadSourceId("");
			setNewCampaignId("");
			// === /3.2 ===
		},
	});

	const handleRetryGhlSync = async (customerProfileId: string) => {
		if (!organizationId) return;
		setRetryingCustomerProfileId(customerProfileId);
		try {
			const result = await client.customerProfiles.retryGhlSync({
				organizationId,
				customerProfileId,
			});
			const status = result?.ghlSync?.status;
			if (status === "synced") {
				toast.success("GHL sync succeeded");
			} else if (status === "skipped") {
				toast.info(
					`GHL sync skipped${
						result?.ghlSync &&
						"reason" in result.ghlSync &&
						result.ghlSync.reason
							? `: ${result.ghlSync.reason}`
							: ""
					}`,
				);
			} else {
				toast.error(
					`GHL sync failed${
						result?.ghlSync && "error" in result.ghlSync && result.ghlSync.error
							? `: ${result.ghlSync.error}`
							: ""
					}`,
				);
			}
			await queryClient.invalidateQueries({ queryKey: memberListKey });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to retry GHL sync",
			);
		} finally {
			setRetryingCustomerProfileId(null);
		}
	};

	const openEditProfile = () => {
		if (profile) {
			setPhone(profile.phone ?? "");
			setAddress(profile.address ?? "");
			setEmergencyContactName(profile.emergencyContactName ?? "");
			setEmergencyContactPhone(profile.emergencyContactPhone ?? "");
			setMedicalNotes(profile.medicalNotes ?? "");
			setNotes(profile.notes ?? "");
		} else {
			setPhone("");
			setAddress("");
			setEmergencyContactName("");
			setEmergencyContactPhone("");
			setMedicalNotes("");
			setNotes("");
		}
		setIsProfileDialogOpen(true);
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
					<p className="text-muted-foreground">
						Manage your customer database and relationships
					</p>
				</div>
				<Button onClick={() => setIsAddCustomerOpen(true)}>
					<Plus className="mr-2 size-4" />
					Add Customer
				</Button>
			</div>

			{organizationId && (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<User className="size-5" />
							My profile
						</CardTitle>
						<Button variant="outline" size="sm" onClick={openEditProfile}>
							Edit profile
						</Button>
					</CardHeader>
					<CardContent>
						{profileLoading ? (
							<p className="text-sm text-muted-foreground">Loading…</p>
						) : profile ? (
							<div className="grid gap-2 text-sm">
								{profile.phone && (
									<p>
										<span className="text-muted-foreground">Phone:</span>{" "}
										{profile.phone}
									</p>
								)}
								{profile.address && (
									<p>
										<span className="text-muted-foreground">Address:</span>{" "}
										{profile.address}
									</p>
								)}
								{profile.emergencyContactName && (
									<p>
										<span className="text-muted-foreground">Emergency:</span>{" "}
										{profile.emergencyContactName}
										{profile.emergencyContactPhone &&
											` • ${profile.emergencyContactPhone}`}
									</p>
								)}
								{profile.medicalNotes && (
									<p>
										<span className="text-muted-foreground">
											Medical notes:
										</span>{" "}
										{profile.medicalNotes}
									</p>
								)}
								{profile.notes && (
									<p>
										<span className="text-muted-foreground">Notes:</span>{" "}
										{profile.notes}
									</p>
								)}
								{!profile.phone &&
									!profile.address &&
									!profile.emergencyContactName &&
									!profile.medicalNotes &&
									!profile.notes && (
										<p className="text-muted-foreground">
											No profile details yet. Click Edit profile to add.
										</p>
									)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								No profile yet. Click Edit profile to create one.
							</p>
						)}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Customer Management</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-2 mb-4">
						<div className="relative flex-1">
							<Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
							<Input
								placeholder="Search customers..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-8"
							/>
						</div>
					</div>

					<div className="grid gap-4">
						{customersLoading ? (
							<p className="text-sm text-muted-foreground py-4">
								Loading customers…
							</p>
						) : filteredCustomers.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4">
								{searchQuery
									? "No customers match your search."
									: 'No customers yet. Click "Add Customer" to add one.'}
							</p>
						) : (
							filteredCustomers.map((customer: any) => {
								const ghlSync: GhlSyncInfo | null = customer.ghlSync
									? {
											syncStatus: customer.ghlSync.syncStatus as GhlSyncStatus,
											lastError: customer.ghlSync.lastError ?? null,
											lastSyncedAt: customer.ghlSync.lastSyncedAt ?? null,
											ghlContactId: customer.ghlSync.ghlContactId ?? undefined,
											customerProfileId:
												customer.ghlSync.customerProfileId ?? undefined,
											kind: "customer",
										}
									: null;
								const customerProfileId = ghlSync?.customerProfileId;
								return (
									<div key={customer.id} className="border rounded-lg p-4">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-4">
												<div className="size-10 bg-blue-100 rounded-full flex items-center justify-center">
													<Users className="size-5 text-blue-600" />
												</div>
												<div>
													<h3 className="font-semibold">
														{customer.name ?? customer.email ?? "Unknown"}
													</h3>
													<p className="text-sm text-muted-foreground">
														{customer.email}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-2">
												<Badge
													variant={
														customer.status === "active"
															? "default"
															: "destructive"
													}
												>
													{customer.status}
												</Badge>
												<GhlSyncBadge
													ghlSync={ghlSync}
													onRetry={
														customerProfileId
															? () => handleRetryGhlSync(customerProfileId)
															: undefined
													}
													isRetrying={
														!!customerProfileId &&
														retryingCustomerProfileId === customerProfileId
													}
												/>
												<Button
													variant="outline"
													size="sm"
													onClick={() => {
														window.location.href = `mailto:${customer.email}`;
													}}
												>
													<Mail className="size-4 mr-1" />
													Contact
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														navigate({ to: "/dashboard/appointment/view" })
													}
												>
													<Calendar className="size-4 mr-1" />
													Schedule
												</Button>
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>
				</CardContent>
			</Card>

			<Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>My profile</DialogTitle>
						<DialogDescription>Update your contact details.</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div>
							<Label htmlFor="phone">Phone</Label>
							<Input
								id="phone"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder="Phone number"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="address">Address</Label>
							<Input
								id="address"
								value={address}
								onChange={(e) => setAddress(e.target.value)}
								placeholder="Address"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="emergencyName">Emergency contact name</Label>
							<Input
								id="emergencyName"
								value={emergencyContactName}
								onChange={(e) => setEmergencyContactName(e.target.value)}
								placeholder="Name"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="emergencyPhone">Emergency contact phone</Label>
							<Input
								id="emergencyPhone"
								value={emergencyContactPhone}
								onChange={(e) => setEmergencyContactPhone(e.target.value)}
								placeholder="Phone"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="medicalNotes">Medical notes</Label>
							<Input
								id="medicalNotes"
								value={medicalNotes}
								onChange={(e) => setMedicalNotes(e.target.value)}
								placeholder="Medical notes"
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="notes">Notes</Label>
							<Input
								id="notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Notes"
								className="mt-1"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsProfileDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={() => upsertMutation.mutate()}
							disabled={upsertMutation.isPending}
						>
							{upsertMutation.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Add Customer</DialogTitle>
						<DialogDescription>
							Create a new customer account.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div>
							<Label htmlFor="newEmail">Email address</Label>
							<Input
								id="newEmail"
								type="email"
								value={newEmail}
								onChange={(e) => setNewEmail(e.target.value)}
								placeholder="customer@example.com"
								className="mt-1"
							/>
							<p className="text-xs text-muted-foreground mt-1">
								The user must already have an account in the system.
							</p>
						</div>
						{branchNodes.length > 0 && (
							<div>
								<Label htmlFor="branch">Branch</Label>
								<Select
									value={selectedBranchId}
									onValueChange={setSelectedBranchId}
								>
									<SelectTrigger className="mt-1">
										<SelectValue placeholder="Select a branch…" />
									</SelectTrigger>
									<SelectContent>
										{branchNodes.map((node: any) => (
											<SelectItem key={node.id} value={node.id}>
												{node.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						{/* === 3.2 lead source === */}
						<div>
							<Label htmlFor="leadSource">Lead source (optional)</Label>
							<Select
								value={newLeadSourceId}
								onValueChange={setNewLeadSourceId}
							>
								<SelectTrigger className="mt-1">
									<SelectValue placeholder="How did they hear about us?" />
								</SelectTrigger>
								<SelectContent>
									{leadSources.length === 0 ? (
										<SelectItem value="__none__" disabled>
											No sources configured
										</SelectItem>
									) : (
										leadSources.map(
											(s: {
												id: string;
												name: string;
												category?: string | null;
											}) => (
												<SelectItem key={s.id} value={s.id}>
													{s.name}
													{s.category ? ` · ${s.category}` : ""}
												</SelectItem>
											),
										)
									)}
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label htmlFor="campaign">Campaign tag (optional)</Label>
							<Input
								id="campaign"
								value={newCampaignId}
								onChange={(e) => setNewCampaignId(e.target.value)}
								placeholder="e.g. spring-2026"
								className="mt-1"
							/>
						</div>
						{/* === /3.2 === */}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsAddCustomerOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={() => addCustomerMutation.mutate()}
							disabled={addCustomerMutation.isPending || !newEmail.trim()}
						>
							{addCustomerMutation.isPending ? "Adding…" : "Add Customer"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
