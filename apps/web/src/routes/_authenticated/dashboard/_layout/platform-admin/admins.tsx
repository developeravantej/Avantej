import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, UserPlus, Trash2, Search } from "lucide-react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/admins",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin || result.role !== "super_admin") {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			// Re-throw TanStack Router redirects — do not swallow them
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			throw redirect({ to: "/dashboard" });
		}
	},
	component: PlatformAdminAdminsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminRole = "super_admin" | "support" | "billing";

type AdminRow = {
	userId: string;
	email: string | null;
	name: string | null;
	role: AdminRole;
	grantedAt: Date;
	grantedByEmail: string | null;
};

type UserRow = {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	name: string;
	isPlatformAdmin: boolean;
	platformAdminRole: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<AdminRole, string> = {
	super_admin: "Super Admin",
	support: "Support",
	billing: "Billing",
};

const ROLE_VARIANTS: Record<AdminRole, "default" | "secondary" | "outline"> = {
	super_admin: "default",
	support: "secondary",
	billing: "outline",
};

function formatGrantedAt(date: Date): string {
	return new Date(date).toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

// ─── Revoke Confirmation Dialog ───────────────────────────────────────────────

function RevokeDialog({
	admin,
	open,
	onOpenChange,
	onConfirm,
	isRevoking,
}: {
	admin: AdminRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isRevoking: boolean;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Revoke Platform Admin</DialogTitle>
					<DialogDescription>
						Are you sure you want to revoke platform admin access for{" "}
						<strong>{admin?.email ?? admin?.name ?? "this user"}</strong>? They
						will immediately lose all platform admin privileges.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" disabled={isRevoking}>
							Cancel
						</Button>
					</DialogClose>
					<Button
						variant="destructive"
						onClick={onConfirm}
						disabled={isRevoking}
					>
						{isRevoking ? "Revoking..." : "Revoke Access"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Add Admin Dialog ─────────────────────────────────────────────────────────

function AddAdminDialog({
	open,
	onOpenChange,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}) {
	const [search, setSearch] = useState("");
	const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
	const [role, setRole] = useState<AdminRole>("support");
	const debouncedSearch = useDebounce(search, 300);

	const { data: usersData, isLoading: isSearching } = useQuery({
		queryKey: ["admin", "listUsers", { search: debouncedSearch, limit: 10 }],
		queryFn: () =>
			client.admin.listUsers({
				search: debouncedSearch || undefined,
				page: 1,
				limit: 10,
			}),
		enabled: debouncedSearch.length > 0,
	});

	const { mutate: grant, isPending: isGranting } = useApiMutation({
		mutationFn: ({ userId, role }: { userId: string; role: AdminRole }) =>
			client.admin.grantPlatformAdmin({ userId, role }),
		successMessage: "Platform admin access granted.",
		errorMessage: "Failed to grant admin access. Please try again.",
		invalidate: [["admin", "listAdmins"], ["admin", "listUsers"]],
		onSuccess: () => {
			handleClose();
			onSuccess();
		},
	});

	function handleClose() {
		// Reset all state on close so next open is fresh
		setSearch("");
		setSelectedUser(null);
		setRole("support");
		onOpenChange(false);
	}

	function handleConfirm() {
		if (!selectedUser) return;
		grant({ userId: selectedUser.id, role });
	}

	// Filter out users who are already platform admins
	const eligibleUsers = (usersData?.data ?? []).filter(
		(u) => !u.isPlatformAdmin,
	);

	return (
		<Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Platform Admin</DialogTitle>
					<DialogDescription>
						Search for a user and assign them a platform admin role. Only users
						without existing admin access are shown.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* User search */}
					<div className="space-y-2">
						<label htmlFor="admin-user-search" className="text-sm font-medium">Search user by email or name</label>
						<div className="relative">
							<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="admin-user-search"
								placeholder="Search users..."
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setSelectedUser(null);
								}}
								className="pl-9"
							/>
						</div>

						{/* Search results */}
						{debouncedSearch.length > 0 && (
							<div className="max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
								{isSearching ? (
									<div className="p-3 text-center text-sm text-muted-foreground">
										Searching…
									</div>
								) : eligibleUsers.length === 0 ? (
									<div className="p-3 text-center text-sm text-muted-foreground">
										No eligible users found.
									</div>
								) : (
									<ul>
										{eligibleUsers.map((user) => (
											<li key={user.id}>
												<button
													type="button"
													className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
														selectedUser?.id === user.id
															? "bg-accent font-medium"
															: ""
													}`}
													onClick={() => setSelectedUser(user)}
												>
													<span className="block font-medium">{user.email}</span>
													<span className="block text-xs text-muted-foreground">
														{user.name}
													</span>
												</button>
											</li>
										))}
									</ul>
								)}
							</div>
						)}

						{/* Selected user confirmation */}
						{selectedUser && (
							<div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
								<span className="font-medium text-green-800">Selected:</span>{" "}
								<span className="text-green-700">{selectedUser.email}</span>
							</div>
						)}
					</div>

					{/* Role selection */}
					<div className="space-y-2">
						<label htmlFor="admin-role-select" className="text-sm font-medium">Role</label>
						<Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
							<SelectTrigger id="admin-role-select">
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="super_admin">Super Admin: Full access</SelectItem>
								<SelectItem value="support">Support: Impersonation + read access</SelectItem>
								<SelectItem value="billing">Billing: Billing access only</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" disabled={isGranting} onClick={handleClose}>
							Cancel
						</Button>
					</DialogClose>
					<Button
						onClick={handleConfirm}
						disabled={!selectedUser || isGranting}
					>
						{isGranting ? "Granting..." : "Grant Access"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PlatformAdminAdminsPage() {
	const { data: session } = authClient.useSession();
	const currentUserId = (session?.user as { id?: string } | undefined)?.id;

	const [revokeTarget, setRevokeTarget] = useState<AdminRow | null>(null);
	const [addDialogOpen, setAddDialogOpen] = useState(false);

	const { data: admins, isLoading } = useQuery({
		queryKey: ["admin", "listAdmins"],
		queryFn: () => client.admin.listAdmins({}),
	});

	const { mutate: revoke, isPending: isRevoking } = useApiMutation({
		mutationFn: ({ userId }: { userId: string }) =>
			client.admin.revokePlatformAdmin({ userId }),
		successMessage: "Platform admin access revoked.",
		errorMessage: "Failed to revoke admin access. Please try again.",
		invalidate: [["admin", "listAdmins"], ["admin", "listUsers"]],
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
					<h1 className="text-2xl font-semibold">Platform Admin: Admins</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage platform admin accounts. Only super admins can view or modify
						this list.
					</p>
				</div>
				<Button onClick={() => setAddDialogOpen(true)}>
					<UserPlus className="mr-2 size-4" />
					Add Admin
				</Button>
			</div>

			{/* Admins table */}
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Email</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Granted At</TableHead>
							<TableHead>Granted By</TableHead>
							<TableHead className="w-20">Actions</TableHead>
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
								<TableCell
									colSpan={6}
									className="text-center text-muted-foreground py-8"
								>
									No platform admins found.
								</TableCell>
							</TableRow>
						) : (
							adminList.map((admin) => {
								const isSelf = admin.userId === currentUserId;
								return (
									<TableRow key={admin.userId}>
										<TableCell className="font-medium">
											{admin.email ?? "—"}
											{isSelf && (
												<span className="ml-2 text-xs text-muted-foreground">
													(you)
												</span>
											)}
										</TableCell>
										<TableCell>{admin.name ?? "—"}</TableCell>
										<TableCell>
											<Badge variant={ROLE_VARIANTS[admin.role]}>
												<Shield className="mr-1 size-3" />
												{ROLE_LABELS[admin.role]}
											</Badge>
										</TableCell>
										<TableCell>{formatGrantedAt(admin.grantedAt)}</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{admin.grantedByEmail ?? "—"}
										</TableCell>
										<TableCell>
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
