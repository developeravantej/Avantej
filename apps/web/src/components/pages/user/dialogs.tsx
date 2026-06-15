import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/useApiMutation";
import { toast } from "sonner";
import type { MemberRow } from "./types";
import { getDisplayName } from "./helpers";

// ─── Impersonation dialog ────────────────────────────────────────────────────
export function ImpersonateDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const displayName = getDisplayName(member);
	const mutation = useApiMutation({
		mutationFn: () =>
			client.tenantAdmin.impersonateMember({
				targetMemberId: member.id,
				organizationId,
			}),
		errorMessage: (err) =>
			err.message || "Failed to start impersonation session",
		onSuccess: (result) => {
			window.location.href = result.redirectTo;
		},
		onError: () => onClose(),
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Log in as {displayName}?</DialogTitle>
					<DialogDescription>
						You will be impersonating this staff member. This session is audited
						and expires in 1 hour. You can return to your own account at any
						time using the banner that appears at the top of the page.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Starting…" : "Confirm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Deactivate dialog ───────────────────────────────────────────────────────
export function DeactivateDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const displayName = getDisplayName(member);
	const mutation = useMutation({
		mutationFn: () =>
			client.members.deactivate({ memberId: member.id, organizationId }),
		onSuccess: () => {
			toast.success(`${displayName} deactivated.`);
			qc.invalidateQueries(
				orpc.members.list.queryOptions({ input: { organizationId } }),
			);
			onClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to deactivate.");
			onClose();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Deactivate {displayName}?</DialogTitle>
					<DialogDescription>
						This revokes all access immediately. Audit history is preserved. You
						can reactivate them at any time.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Deactivating…" : "Deactivate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Reactivate dialog ───────────────────────────────────────────────────────
export function ReactivateDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const displayName = getDisplayName(member);
	const mutation = useMutation({
		mutationFn: () =>
			client.members.reactivate({ memberId: member.id, organizationId }),
		onSuccess: () => {
			toast.success(`${displayName} reactivated.`);
			qc.invalidateQueries(
				orpc.members.list.queryOptions({ input: { organizationId } }),
			);
			onClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to reactivate.");
			onClose();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reactivate {displayName}?</DialogTitle>
					<DialogDescription>
						This will restore their access to the organization. They will be
						able to log in and use the platform again.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Reactivating…" : "Reactivate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Remove dialog ───────────────────────────────────────────────────────────
export function RemoveDialog({
	member,
	organizationId,
	open,
	onClose,
}: {
	member: MemberRow;
	organizationId: string;
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const displayName = getDisplayName(member);
	const mutation = useMutation({
		mutationFn: () =>
			client.members.softDelete({ memberId: member.id, organizationId }),
		onSuccess: () => {
			toast.success(`${displayName} removed from organization.`);
			qc.invalidateQueries(
				orpc.members.list.queryOptions({ input: { organizationId } }),
			);
			onClose();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to remove member.");
			onClose();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove {displayName}?</DialogTitle>
					<DialogDescription>
						This removes them from the organization. Their data is preserved and
						they can be restored later from Staff Access if needed.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Removing…" : "Remove"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
