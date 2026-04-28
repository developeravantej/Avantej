import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
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
	/** When set, locks role to this value and hides the role selector. */
	lockedRole?: "admin" | "trainer" | "staff" | "client";
	/** Override the dialog title (e.g. "Add Customer"). */
	title?: string;
	/** Override the dialog description. */
	description?: string;
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
	lockedRole,
	title,
	description,
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
			role: lockedRole ?? "staff",
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
	const createMutation = useApiMutation({
		mutationFn: async (data: InvitationFormData) => {
			const result = await client.invitations.create({
				organizationId,
				email: data.email,
				role: data.role,
				hierarchyScopeId: data.hierarchyScopeId,
			});

			// Email send is best-effort — if it fails (e.g. RESEND not configured in dev)
			// we still consider the invitation creation a success.
			try {
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
			} catch (e) {
				console.warn("Invitation email failed to send (invitation still created):", e);
			}

			return result;
		},
		successMessage: "Invitation sent successfully",
		errorMessage: (error) => `Failed to create invitation: ${error.message}`,
		onSuccess: () => {
			reset();
			onSuccess?.();
			onOpenChange(false);
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
			<DialogContent className="sm:max-w-md rounded-2xl bg-white p-6">
				<DialogHeader className="mb-4">
					<DialogTitle className="text-lg font-medium leading-6 text-brand-primary-1">
						{title ?? "Invite Member"}
					</DialogTitle>
					<DialogDescription className="text-sm text-brand-secondary-1">
						{description ??
							"Send an invitation to join your organization. The invitee will receive an email with a link to accept the invitation."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					{/* Email */}
					<div>
						<Label htmlFor="email" className="block text-sm font-medium text-brand-primary-1">
							Email Address <span className="text-destructive">*</span>
						</Label>
						<Input
							id="email"
							type="email"
							placeholder="user@example.com"
							{...register("email")}
							disabled={createMutation.isPending}
							className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
						/>
						{errors.email && (
							<p className="text-sm text-destructive">{errors.email.message}</p>
						)}
					</div>

					{/* Role — hidden when locked */}
					{!lockedRole && (
					<div>
						<Label htmlFor="role" className="block text-sm font-medium text-brand-primary-1">
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
							<SelectTrigger id="role" className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm">
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
					)}

					{/* Hierarchy Scope */}
					<div>
						<Label htmlFor="hierarchyScopeId" className="block text-sm font-medium text-brand-primary-1">
							Hierarchy Scope <span className="text-destructive">*</span>
						</Label>
						{isLoadingHierarchy ? (
							<div className="flex items-center gap-2 mt-1 text-sm text-brand-secondary-1">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading hierarchy...
							</div>
						) : (
							<Select
								value={selectedHierarchyScopeId}
								onValueChange={(value) => setValue("hierarchyScopeId", value)}
								disabled={createMutation.isPending || availableScopes.length === 0}
							>
								<SelectTrigger id="hierarchyScopeId" className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm">
									<SelectValue placeholder="Select hierarchy scope" />
								</SelectTrigger>
								<SelectContent>
									{availableScopes.length === 0 ? (
										<div className="px-2 py-1.5 text-sm text-brand-secondary-1">
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
						<p className="text-xs text-brand-secondary-1 mt-1">
							{selectedRole === "admin"
								? "Admins are assigned to the organization root for organization-wide access."
								: "Select the branch, area, region, or country where this member will have access."}
						</p>
					</div>

					<DialogFooter className="mt-6 flex justify-end space-x-3 gap-0">
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								reset();
								onOpenChange(false);
							}}
							disabled={createMutation.isPending}
							className="border-brand-secondary-3 bg-white text-brand-primary-1 hover:bg-brand-secondary-3/50"
						>
							Cancel
						</Button>
						<Button type="submit" disabled={createMutation.isPending} className="bg-black text-white hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed">
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

