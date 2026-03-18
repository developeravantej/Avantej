import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const invitationSchema = z.object({
	email: z.string().email("Invalid email address"),
	role: z.enum(["admin", "trainer", "staff", "client"]),
	hierarchyScopeId: z.string().uuid("Please select a hierarchy scope"),
});

type InvitationFormData = z.infer<typeof invitationSchema>;

interface CreateInvitationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	onSuccess?: () => void;
}

interface HierarchyNode {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId?: string | null;
	code?: string | null;
}

export function CreateInvitationDialog({
	open,
	onOpenChange,
	organizationId,
	onSuccess,
}: CreateInvitationDialogProps) {
	const {
		register,
		handleSubmit,
		formState: { errors },
		setValue,
		watch,
		reset,
	} = useForm<InvitationFormData>({
		resolver: zodResolver(invitationSchema),
		defaultValues: {
			email: "",
			role: "staff",
			hierarchyScopeId: "",
		},
	});

	const selectedRole = watch("role");
	const selectedHierarchyScopeId = watch("hierarchyScopeId");

	// Fetch hierarchy nodes for scope selection
	const { data: hierarchyData, isLoading: isLoadingHierarchy } = useQuery({
		queryKey: ["hierarchy-nodes", organizationId],
		queryFn: async () => {
			const result = await client.hierarchy.listNodes({ organizationId });
			return result.nodes;
		},
		enabled: !!organizationId && open,
		staleTime: 30 * 1000,
	});

	const hierarchyNodes: HierarchyNode[] = hierarchyData || [];

	// Filter hierarchy nodes based on role
	// Admins can be assigned to organization root, others to branches/areas
	const availableScopes = hierarchyNodes.filter((node) => {
		if (selectedRole === "admin") {
			return node.type === "organization" && node.depth === 0;
		}
		// For non-admin roles, allow branches, areas, regions, countries
		return ["branch", "area", "region", "country"].includes(node.type);
	});

	// Create invitation mutation
	const createMutation = useMutation({
		mutationFn: async (data: InvitationFormData) => {
			const result = await client.invitations.create({
				organizationId,
				email: data.email,
				role: data.role,
				hierarchyScopeId: data.hierarchyScopeId,
			});

			// Send email via oRPC
			await client.invitations.sendEmail({
				invitation: {
					token: result.invitation.token,
					email: result.invitation.email,
					role: result.invitation.role,
				},
				organizationId: result.organizationId,
				organizationName: result.organizationName,
				inviterName: result.inviterName,
			});

			return result;
		},
		onSuccess: () => {
			toast.success("Invitation sent successfully");
			reset();
			onSuccess?.();
		},
		onError: (error: Error) => {
			toast.error(`Failed to create invitation: ${error.message}`);
		},
	});

	const onSubmit = async (data: InvitationFormData) => {
		createMutation.mutate(data);
	};

	const getScopeDisplayName = (node: HierarchyNode) => {
		const typeLabels: Record<string, string> = {
			organization: "Organization",
			country: "Country",
			region: "Region",
			area: "Area",
			branch: "Branch",
		};

		const typeLabel = typeLabels[node.type] || node.type;
		return `${typeLabel}: ${node.name}${node.code ? ` (${node.code})` : ""}`;
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Invite Member</DialogTitle>
					<DialogDescription>
						Send an invitation to join your organization. The invitee will
						receive an email with a link to accept the invitation.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					{/* Email */}
					<div className="space-y-2">
						<Label htmlFor="email">
							Email Address <span className="text-destructive">*</span>
						</Label>
						<Input
							id="email"
							type="email"
							placeholder="user@example.com"
							{...register("email")}
							disabled={createMutation.isPending}
						/>
						{errors.email && (
							<p className="text-sm text-destructive">{errors.email.message}</p>
						)}
					</div>

					{/* Role */}
					<div className="space-y-2">
						<Label htmlFor="role">
							Role <span className="text-destructive">*</span>
						</Label>
						<Select
							value={selectedRole}
							onValueChange={(value) => {
								setValue("role", value as any);
								// Reset hierarchy scope when role changes
								setValue("hierarchyScopeId", "");
							}}
							disabled={createMutation.isPending}
						>
							<SelectTrigger id="role">
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="admin">Admin</SelectItem>
								<SelectItem value="trainer">Trainer</SelectItem>
								<SelectItem value="staff">Staff</SelectItem>
								<SelectItem value="client">Client</SelectItem>
							</SelectContent>
						</Select>
						{errors.role && (
							<p className="text-sm text-destructive">{errors.role.message}</p>
						)}
					</div>

					{/* Hierarchy Scope */}
					<div className="space-y-2">
						<Label htmlFor="hierarchyScopeId">
							Hierarchy Scope <span className="text-destructive">*</span>
						</Label>
						{isLoadingHierarchy ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading hierarchy...
							</div>
						) : (
							<Select
								value={selectedHierarchyScopeId}
								onValueChange={(value) => setValue("hierarchyScopeId", value)}
								disabled={createMutation.isPending || availableScopes.length === 0}
							>
								<SelectTrigger id="hierarchyScopeId">
									<SelectValue placeholder="Select hierarchy scope" />
								</SelectTrigger>
								<SelectContent>
									{availableScopes.length === 0 ? (
										<div className="px-2 py-1.5 text-sm text-muted-foreground">
											No available scopes for this role
										</div>
									) : (
										availableScopes.map((node) => (
											<SelectItem key={node.id} value={node.id}>
												{getScopeDisplayName(node)}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
						)}
						{errors.hierarchyScopeId && (
							<p className="text-sm text-destructive">
								{errors.hierarchyScopeId.message}
							</p>
						)}
						<p className="text-xs text-muted-foreground">
							{selectedRole === "admin"
								? "Admins are assigned to the organization root for organization-wide access."
								: "Select the branch, area, region, or country where this member will have access."}
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								reset();
								onOpenChange(false);
							}}
							disabled={createMutation.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={createMutation.isPending}>
							{createMutation.isPending ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Sending...
								</>
							) : (
								<>
									<Mail className="h-4 w-4 mr-2" />
									Send Invitation
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

