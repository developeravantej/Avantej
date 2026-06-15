import { RoleBadge } from "@/components/ui/role-badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ActorAvatar } from "./badges";
import { formatAbsoluteTime } from "./helpers";
import type { AuditRowEnriched } from "./types";

// ─── Changes dialog ───────────────────────────────────────────────────────────

export function ChangesDialog({
	row,
	open,
	onOpenChange,
}: {
	row: AuditRowEnriched | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	if (!row) return null;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						AUDIT LOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a] flex flex-col gap-1">
						<span>Audit Entry Detail</span>
						<span className="font-normal text-sm text-[#737373] font-mono tabular-nums">
							{formatAbsoluteTime(row.createdAt)}
						</span>
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Full details of this audit log entry.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4">
						<div>
							<p className="mb-1 font-medium text-sm text-[#0a0a0a]">Summary</p>
							<p className="text-sm text-[#737373]">{row.summary}</p>
						</div>

						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Actor</p>
								<div className="flex items-center gap-2">
									<ActorAvatar initials={row.actorInitials} />
									<div>
										<p className="text-[#737373]">
											{row.actorName ?? "Unknown"}
										</p>
										<p className="font-mono text-[#737373] text-xs tabular-nums">
											{row.actorUserId}
										</p>
									</div>
								</div>
							</div>
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Role</p>
								<RoleBadge role={row.actorRole} />
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Entity</p>
								<p className="text-[#737373]">
									{row.entityType}{" "}
									{row.entityLabel ? `(${row.entityLabel})` : ""}
								</p>
							</div>
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Entity ID</p>
								<p className="break-all font-mono text-[#737373] text-xs tabular-nums">
									{row.entityId ?? "—"}
								</p>
							</div>
						</div>

						{row.branchName && (
							<div className="text-sm">
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Branch</p>
								<p className="text-[#737373]">{row.branchName}</p>
							</div>
						)}

						<div>
							<p className="mb-1 font-medium text-sm text-[#0a0a0a]">
								Changes Payload
							</p>
							{row.changes ? (
								<pre className="max-h-64 overflow-auto rounded-xl bg-[#f3f3f3] border border-[#e5e5e5] p-3 font-mono text-xs leading-relaxed text-[#404040]">
									{JSON.stringify(row.changes, null, 2)}
								</pre>
							) : (
								<p className="text-sm text-[#737373]">
									No change payload recorded.
								</p>
							)}
						</div>

						{(row.ipAddress || row.userAgent) && (
							<div className="space-y-1 border-t border-[#e5e5e5] pt-3 text-xs text-[#737373]">
								{row.ipAddress && (
									<p className="font-mono tabular-nums">IP: {row.ipAddress}</p>
								)}
								{row.userAgent && (
									<p className="truncate" title={row.userAgent}>
										UA: {row.userAgent}
									</p>
								)}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
