import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw, Trash2 } from "lucide-react";

function relativeTime(date: string | Date): string {
	const diff = Date.now() - new Date(date).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
import { useState } from "react";
import {
	useBranchInvites,
	useRegenerateBranchInvite,
	useRevokeBranchInvite,
} from "../api";

interface BranchInviteListProps {
	organizationId: string;
	branchId: string;
}

export function BranchInviteList({
	organizationId,
	branchId,
}: BranchInviteListProps) {
	const { data: invites, isLoading } = useBranchInvites(
		organizationId,
		branchId,
	);

	const revokeMutation = useRevokeBranchInvite(organizationId, branchId);
	const regenerateMutation = useRegenerateBranchInvite(
		organizationId,
		branchId,
	);

	const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
	const [confirmRegenerateId, setConfirmRegenerateId] = useState<
		string | null
	>(null);

	if (isLoading) {
		return (
			<div className="space-y-2 mt-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	const active = invites?.filter((i: { isActive: boolean }) => i.isActive) ?? [];

	if (active.length === 0) {
		return null;
	}

	return (
		<>
			<div className="mt-4">
				<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
					Active Invites
				</p>
				<div className="space-y-2">
					{active.map(
						(invite: {
							id: string;
							isActive: boolean;
							usesCount: number;
							maxUses?: number | null;
							createdAt: string | Date;
						}) => (
							<div
								key={invite.id}
								className="flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-sm"
							>
								<div className="flex items-center gap-3">
									<Badge
										variant="outline"
										className="text-xs font-normal text-muted-foreground"
									>
										{invite.usesCount}
										{invite.maxUses != null ? `/${invite.maxUses}` : ""} uses
									</Badge>
									<span className="text-xs text-muted-foreground">
										Created {relativeTime(invite.createdAt)}
									</span>
								</div>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-muted-foreground hover:text-foreground"
										onClick={() => setConfirmRegenerateId(invite.id)}
										disabled={regenerateMutation.isPending}
										title="Regenerate invite link"
									>
										<RotateCcw className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-muted-foreground hover:text-destructive"
										onClick={() => setConfirmRevokeId(invite.id)}
										disabled={revokeMutation.isPending}
										title="Revoke invite"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
						),
					)}
				</div>
			</div>

			{/* Revoke confirm */}
			<Dialog
				open={confirmRevokeId !== null}
				onOpenChange={(open) => !open && setConfirmRevokeId(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Revoke invite?</DialogTitle>
						<DialogDescription>
							This QR code will stop working immediately. Customers who have
							already signed up will not be affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmRevokeId(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={revokeMutation.isPending}
							onClick={() => {
								if (confirmRevokeId) {
									revokeMutation.mutate(confirmRevokeId, {
										onSuccess: () => setConfirmRevokeId(null),
									});
								}
							}}
						>
							{revokeMutation.isPending ? "Revoking..." : "Revoke"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Regenerate confirm */}
			<Dialog
				open={confirmRegenerateId !== null}
				onOpenChange={(open) => !open && setConfirmRegenerateId(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Regenerate QR code?</DialogTitle>
						<DialogDescription>
							The current QR code will be revoked and a new one will be issued.
							Print and distribute the new code after confirming.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmRegenerateId(null)}
						>
							Cancel
						</Button>
						<Button
							disabled={regenerateMutation.isPending}
							onClick={() => {
								if (confirmRegenerateId) {
									regenerateMutation.mutate(confirmRegenerateId, {
										onSuccess: () => setConfirmRegenerateId(null),
									});
								}
							}}
						>
							{regenerateMutation.isPending ? "Regenerating..." : "Regenerate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
