import { useQuery } from "@tanstack/react-query";
import { Shield, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useApiMutation } from "@/hooks/useApiMutation";
import { authClient } from "@/lib/auth-client";
import { client, orpc } from "@/utils/orpc";
import { AddAdminDialog } from "./AddAdminDialog";
import { ROLE_LABELS, ROLE_VARIANTS, formatGrantedAt } from "./helpers";
import { RevokeDialog } from "./RevokeDialog";
import type { AdminRow } from "./types";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformAdminAdminsPage() {
	const { data: session } = authClient.useSession();
	const currentUserId = (session?.user as { id?: string } | undefined)?.id;

	const [revokeTarget, setRevokeTarget] = useState<AdminRow | null>(null);
	const [addDialogOpen, setAddDialogOpen] = useState(false);

	const {
		data: admins,
		isLoading,
		error,
		refetch,
	} = useQuery(orpc.admin.listAdmins.queryOptions({ input: {} }));

	const { mutate: revoke, isPending: isRevoking } = useApiMutation({
		mutationFn: ({ userId }: { userId: string }) =>
			client.admin.revokePlatformAdmin({ userId }),
		successMessage: "Platform admin access revoked.",
		errorMessage: "Failed to revoke admin access. Please try again.",
		invalidate: [orpc.admin.listAdmins.key(), orpc.admin.listUsers.key()],
		onSuccess: () => {
			setRevokeTarget(null);
		},
	});

	const adminList: AdminRow[] = admins ?? [];

	return (
		<div className="p-6 space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="text-sm text-muted-foreground">Platform admin</div>
					<h1 className="text-2xl font-semibold">Admins</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage platform admin accounts. Only super admins can view or modify
						this list.
					</p>
				</div>
				<Button variant="default" onClick={() => setAddDialogOpen(true)}>
					<UserPlus className="mr-2 size-4" />
					Add Admin
				</Button>
			</div>

			{/* Admins table */}
			{error ? (
				<StatusCallout
					variant="error"
					title="Couldn't load admins"
					message={error instanceof Error ? error.message : "An error occurred"}
					onRetry={() => refetch()}
				/>
			) : (
				<div className="flex h-full flex-col rounded-2xl border border-brand-secondary-3 bg-card overflow-hidden">
					<div className="flex-1 overflow-y-auto">
						<Table>
							<TableHeader>
								<TableRow className="sticky top-0 z-10 bg-white hover:bg-white">
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Email
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Name
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Role
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Granted At
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Granted By
									</TableHead>
									<TableHead className="w-20 text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoading ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className="text-center text-muted-foreground py-8"
										>
											Loading admins…
										</TableCell>
									</TableRow>
								) : adminList.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6} className="p-0">
											<EmptyState
												icon={ShieldCheck}
												title="No platform admins found"
												description="Add a platform admin to get started."
												action={{
													label: "Add Admin",
													onClick: () => setAddDialogOpen(true),
												}}
											/>
										</TableCell>
									</TableRow>
								) : (
									adminList.map((admin) => {
										const isSelf = admin.userId === currentUserId;
										return (
											<TableRow
												key={admin.userId}
												className="hover:bg-muted/30"
											>
												<TableCell className="text-sm px-6 py-4 whitespace-nowrap font-medium">
													{admin.email ?? "—"}
													{isSelf && (
														<span className="ml-2 text-xs text-muted-foreground">
															(you)
														</span>
													)}
												</TableCell>
												<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
													{admin.name ?? "—"}
												</TableCell>
												<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
													<Badge variant={ROLE_VARIANTS[admin.role]}>
														<Shield className="mr-1 size-3" />
														{ROLE_LABELS[admin.role]}
													</Badge>
												</TableCell>
												<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
													{formatGrantedAt(admin.grantedAt)}
												</TableCell>
												<TableCell className="text-muted-foreground text-sm px-6 py-4 whitespace-nowrap">
													{admin.grantedByEmail ?? "—"}
												</TableCell>
												<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
													{/* Hide Revoke for own row to prevent self-lockout */}
													{!isSelf && (
														<Button
															variant="ghost"
															size="sm"
															className="text-destructive hover:text-destructive hover:bg-destructive/10"
															onClick={() => setRevokeTarget(admin)}
														>
															<Trash2 className="size-4" />
															<span className="sr-only">Revoke</span>
														</Button>
													)}
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</div>
				</div>
			)}

			{/* Revoke confirmation dialog */}
			<RevokeDialog
				admin={revokeTarget}
				open={revokeTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRevokeTarget(null);
				}}
				onConfirm={() => {
					if (revokeTarget) {
						revoke({ userId: revokeTarget.userId });
					}
				}}
				isRevoking={isRevoking}
			/>

			{/* Add admin dialog */}
			<AddAdminDialog
				open={addDialogOpen}
				onOpenChange={setAddDialogOpen}
				onSuccess={() => {
					// queries already invalidated in the dialog's onSuccess
				}}
			/>

			{/* Task 5.3 runbook note (logged, not rendered): */}
			{/* Nightly cleanup of orphaned admin_sessions rows:
			    UPDATE admin_sessions SET ended_at = s.expires_at
			    FROM session s
			    WHERE admin_sessions.session_token = s.token
			      AND s.expires_at < NOW()
			      AND admin_sessions.ended_at IS NULL;
			    — Deferred to production runbook. */}
		</div>
	);
}
