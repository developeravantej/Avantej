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
import type { AdminRow } from "./types";

// ─── Revoke Confirmation Dialog ───────────────────────────────────────────────

export function RevokeDialog({
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
