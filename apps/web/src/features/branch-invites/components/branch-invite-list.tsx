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
	const [confirmRegenerateId, setConfirmRegenerateId] = useState<string | null>(
		null,
	);

	if (isLoading) {
		return (
			<div className="space-y-2 mt-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	const active =
		invites?.filter((i: { isActive: boolean }) => i.isActive) ?? [];

	if (active.length === 0) {
		return null;
	}

	return (
		<>
			<div className="mt-4">
				<p className="text-xs font-medium text-[#737373] uppercase tracking-wide mb-2">
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
								className="flex items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-sm"
							>
								<div className="flex items-center gap-3">
									<Badge
										variant="outline"
										className="text-xs font-normal text-[#737373]"
									>
										{invite.usesCount}
										{invite.maxUses != null ? `/${invite.maxUses}` : ""} uses
									</Badge>
									<span className="text-xs text-[#737373]">
										Created {relativeTime(invite.createdAt)}
									</span>
								</div>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-[#737373] hover:text-[#0a0a0a]"
										onClick={() => setConfirmRegenerateId(invite.id)}
										disabled={regenerateMutation.isPending}
										title="Regenerate invite link"
									>
										<RotateCcw className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-[#737373] hover:text-rose-600"
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
				<DialogContent
					className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							BRANCH MANAGEMENT
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Revoke invite?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							This QR code will stop working immediately. Customers who have
							already signed up will not be affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button variant="outline" onClick={() => setConfirmRevokeId(null)}>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
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
				<DialogContent
					className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							BRANCH MANAGEMENT
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Regenerate QR code?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							The current QR code will be revoked and a new one will be issued.
							Print and distribute the new code after confirming.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={() => setConfirmRegenerateId(null)}
						>
							Cancel
						</Button>
						<Button
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
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
