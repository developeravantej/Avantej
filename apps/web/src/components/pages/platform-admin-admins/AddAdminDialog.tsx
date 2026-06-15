import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useDebounce } from "@/hooks/useDebounce";
import { client, orpc } from "@/utils/orpc";
import type { AdminRole, UserRow } from "./types";

// ─── Add Admin Dialog ─────────────────────────────────────────────────────────

export function AddAdminDialog({
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
		...orpc.admin.listUsers.queryOptions({
			input: {
				search: debouncedSearch || undefined,
				page: 1,
				limit: 10,
			},
		}),
		enabled: debouncedSearch.length > 0,
	});

	const { mutate: grant, isPending: isGranting } = useApiMutation({
		mutationFn: ({ userId, role }: { userId: string; role: AdminRole }) =>
			client.admin.grantPlatformAdmin({ userId, role }),
		successMessage: "Platform admin access granted.",
		errorMessage: "Failed to grant admin access. Please try again.",
		invalidate: [orpc.admin.listAdmins.key(), orpc.admin.listUsers.key()],
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
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v) handleClose();
				else onOpenChange(true);
			}}
		>
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
						<label htmlFor="admin-user-search" className="text-sm font-medium">
							Search user by email or name
						</label>
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
													<span className="block font-medium">
														{user.email}
													</span>
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
						<label htmlFor="admin-role-select" className="text-sm font-medium">
							Role
						</label>
						<Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
							<SelectTrigger id="admin-role-select">
								<SelectValue placeholder="Select role" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="super_admin">
									Super Admin: Full access
								</SelectItem>
								<SelectItem value="support">
									Support: Impersonation + read access
								</SelectItem>
								<SelectItem value="billing">
									Billing: Billing access only
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				<DialogFooter>
					<DialogClose asChild>
						<Button
							variant="outline"
							disabled={isGranting}
							onClick={handleClose}
						>
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
