import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { Button } from "@/components/ui/button";
import { Plus, Mail, Loader2 } from "lucide-react";
import { InvitationList, type Invitation } from "./invitation-list";
import { CreateInvitationDialog } from "./create-invitation-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function InvitationsPage() {
	const { data: userContext } = useUserContext();
	const organizationId =
		userContext?.currentOrganizationId || userContext?.organizations?.[0]?.id;
	const queryClient = useQueryClient();
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<string>("all");

	// Fetch invitations
	const {
		data: invitationsData,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["invitations", organizationId, statusFilter],
		queryFn: async () => {
			if (!organizationId) throw new Error("Organization ID is required");

			const result = await client.invitations.list({
				organizationId,
				status:
					statusFilter !== "all"
						? (statusFilter as "pending" | "accepted" | "declined" | "expired")
						: undefined,
			});

			return result.invitations;
		},
		enabled: !!organizationId,
		staleTime: 30 * 1000, // 30 seconds
	});

	const normalizeInvitationStatus = (
		status: string,
		expiresAt: Date | string,
	): Invitation["status"] => {
		if (
			status === "pending" ||
			status === "accepted" ||
			status === "declined"
		) {
			return status;
		}
		const expiresDate = new Date(expiresAt);
		return expiresDate < new Date() ? "expired" : "pending";
	};

	const invitations: Invitation[] = (invitationsData || []).map(
		(invitation) => ({
			id: invitation.id,
			email: invitation.email ?? "",
			role: invitation.role,
			kind: invitation.kind,
			hierarchyScopeId: invitation.hierarchyScopeId,
			status: normalizeInvitationStatus(
				invitation.status,
				invitation.expiresAt,
			),
			expiresAt: invitation.expiresAt,
			createdAt: invitation.createdAt,
		}),
	) as Invitation[];

	// Revoke invitation mutation
	const revokeMutation = useApiMutation({
		mutationFn: async (invitationId: string) => {
			if (!organizationId) throw new Error("Organization ID is required");
			return await client.invitations.revoke({
				organizationId,
				invitationId,
			});
		},
		successMessage: "Invitation revoked successfully",
		errorMessage: (error) => `Failed to revoke invitation: ${error.message}`,
		invalidate: [["invitations", organizationId]],
	});

	// Resend invitation mutation
	const resendMutation = useApiMutation({
		mutationFn: async (invitationId: string) => {
			if (!organizationId) throw new Error("Organization ID is required");
			const result = await client.invitations.resend({
				organizationId,
				invitationId,
			});

			// Send email via oRPC
			await client.invitations.sendEmail({
				invitation: {
					token: result.invitation.token,
					email: result.invitation.email ?? "",
					role: result.invitation.role,
				},
				organizationId,
				organizationName: result.organizationName,
				inviterName: result.inviterName,
			});

			return result;
		},
		successMessage: "Invitation resent successfully",
		errorMessage: (error) => `Failed to resend invitation: ${error.message}`,
		invalidate: [["invitations", organizationId]],
	});

	const handleRevoke = async (invitationId: string) => {
		if (
			!confirm(
				"Are you sure you want to revoke this invitation? This action cannot be undone.",
			)
		) {
			return;
		}
		revokeMutation.mutate(invitationId);
	};

	const handleResend = async (invitationId: string) => {
		resendMutation.mutate(invitationId);
	};

	const statusCounts = {
		pending: invitations.filter((inv) => inv.status === "pending").length,
		accepted: invitations.filter((inv) => inv.status === "accepted").length,
		declined: invitations.filter((inv) => inv.status === "declined").length,
		expired: invitations.filter((inv) => inv.status === "expired").length,
	};

	if (error) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h1 className="text-3xl font-semibold">Invitations</h1>
				</div>
				<div className="rounded-lg border border-destructive bg-destructive/10 p-4">
					<p className="text-destructive">
						Failed to load invitations:{" "}
						{error instanceof Error ? error.message : "Unknown error"}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-semibold">Invitations</h1>
					<p className="text-muted-foreground mt-1">
						Manage invitations to join your organization
					</p>
				</div>
				<Button
					onClick={() => setIsCreateDialogOpen(true)}
					disabled={!organizationId}
				>
					<Plus className="size-4 mr-2" />
					Invite Member
				</Button>
			</div>

			{/* Status Filter and Stats */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Invitations</SelectItem>
							<SelectItem value="pending">Pending</SelectItem>
							<SelectItem value="accepted">Accepted</SelectItem>
							<SelectItem value="declined">Declined</SelectItem>
							<SelectItem value="expired">Expired</SelectItem>
						</SelectContent>
					</Select>

					<div className="flex items-center gap-2">
						<Badge variant="outline" className="gap-1">
							<Mail className="size-3" />
							Pending: {statusCounts.pending}
						</Badge>
						<Badge variant="outline" className="gap-1 text-green-600">
							Accepted: {statusCounts.accepted}
						</Badge>
						<Badge variant="outline" className="gap-1 text-brand-secondary-1">
							Expired: {statusCounts.expired}
						</Badge>
					</div>
				</div>
			</div>

			{/* Invitations List */}
			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : (
				<InvitationList
					invitations={invitations}
					onRevoke={handleRevoke}
					onResend={handleResend}
					isRevoking={revokeMutation.isPending}
					isResending={resendMutation.isPending}
				/>
			)}

			{/* Create Invitation Dialog */}
			{organizationId && (
				<CreateInvitationDialog
					open={isCreateDialogOpen}
					onOpenChange={setIsCreateDialogOpen}
					organizationId={organizationId}
					onSuccess={() => {
						setIsCreateDialogOpen(false);
						queryClient.invalidateQueries({
							queryKey: ["invitations", organizationId],
						});
					}}
				/>
			)}
		</div>
	);
}
