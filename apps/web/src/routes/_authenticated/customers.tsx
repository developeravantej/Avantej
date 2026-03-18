import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Users, Mail, Calendar, User } from "lucide-react";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "@/utils/orpc";
import { useState } from "react";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
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
	component: CustomersComponent,
});

function CustomersComponent() {
	const queryClient = useQueryClient();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

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

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberHierarchyScopeId =
		currentOrg?.hierarchy.member?.hierarchyScopeId ?? "";

	const { data: profile, isLoading: profileLoading } = useQuery({
		queryKey: ["customer-profile", organizationId],
		queryFn: async () => {
			if (!organizationId) return null;
			return client.customerProfiles.get({ organizationId });
		},
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
		(n) => n.type === "branch",
	);

	const upsertMutation = useMutation({
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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["customer-profile", organizationId] });
			toast.success("Profile updated");
			setIsProfileDialogOpen(false);
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to update profile");
		},
	});

	const addCustomerMutation = useMutation({
		mutationFn: async () => {
			if (!organizationId) throw new Error("No organization");
			const scopeId = selectedBranchId || memberHierarchyScopeId;
			if (!scopeId) throw new Error("No hierarchy scope");
			return client.members.create({
				organizationId,
				email: newEmail.trim(),
				role: "client",
				hierarchyScopeId: scopeId,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries(
				orpc.members.list.queryOptions({ input: { organizationId: organizationId ?? "", role: "client" } }),
			);
			toast.success("Customer added");
			setIsAddCustomerOpen(false);
			setNewEmail("");
			setSelectedBranchId("");
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to add customer");
		},
	});

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
					<h1 className="text-3xl font-bold tracking-tight">Customers</h1>
					<p className="text-muted-foreground">
						Manage your customer database and relationships
					</p>
				</div>
				<Button onClick={() => setIsAddCustomerOpen(true)}>
					<Plus className="mr-2 h-4 w-4" />
					Add Customer
				</Button>
			</div>

			{organizationId && (
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="flex items-center gap-2">
							<User className="h-5 w-5" />
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
								{profile.phone && <p><span className="text-muted-foreground">Phone:</span> {profile.phone}</p>}
								{profile.address && <p><span className="text-muted-foreground">Address:</span> {profile.address}</p>}
								{profile.emergencyContactName && (
									<p><span className="text-muted-foreground">Emergency:</span> {profile.emergencyContactName}
										{profile.emergencyContactPhone && ` • ${profile.emergencyContactPhone}`}
									</p>
								)}
								{profile.medicalNotes && <p><span className="text-muted-foreground">Medical notes:</span> {profile.medicalNotes}</p>}
								{profile.notes && <p><span className="text-muted-foreground">Notes:</span> {profile.notes}</p>}
								{!profile.phone && !profile.address && !profile.emergencyContactName && !profile.medicalNotes && !profile.notes && (
									<p className="text-muted-foreground">No profile details yet. Click Edit profile to add.</p>
								)}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">No profile yet. Click Edit profile to create one.</p>
						)}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Customer Management</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center space-x-2 mb-4">
						<div className="relative flex-1">
							<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search customers..."
								className="pl-8"
							/>
						</div>
					</div>

					<div className="grid gap-4">
						{customersLoading ? (
							<p className="text-sm text-muted-foreground py-4">Loading customers…</p>
						) : customers.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4">
								No customers yet. Click "Add Customer" to add one.
							</p>
						) : (
							customers.map((customer) => (
								<div key={customer.id} className="border rounded-lg p-4">
									<div className="flex items-center justify-between">
										<div className="flex items-center space-x-4">
											<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
												<Users className="h-5 w-5 text-blue-600" />
											</div>
											<div>
												<h3 className="font-semibold">{customer.name ?? customer.email ?? "Unknown"}</h3>
												<p className="text-sm text-muted-foreground">{customer.email}</p>
											</div>
										</div>
										<div className="flex items-center space-x-2">
											<Badge variant={customer.status === "active" ? "default" : "destructive"}>
												{customer.status}
											</Badge>
											<Button variant="outline" size="sm">
												<Mail className="h-4 w-4 mr-1" />
												Contact
											</Button>
											<Button variant="outline" size="sm">
												<Calendar className="h-4 w-4 mr-1" />
												Schedule
											</Button>
										</div>
									</div>
								</div>
							))
						)}
					</div>
				</CardContent>
			</Card>

			<Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>My profile</DialogTitle>
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
						<Button variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
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
										{branchNodes.map((node) => (
											<SelectItem key={node.id} value={node.id}>
												{node.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsAddCustomerOpen(false)}>
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
