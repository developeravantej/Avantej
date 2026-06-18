import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ShareActions } from "@/features/branch-invites/components/share-actions";
import { cn } from "@/lib/utils";
import { formatExpiry, relativeTime } from "./helpers";
import type { InviteShape, Row } from "./types";

interface HasQrPaneProps {
	row: Row & { invite: InviteShape };
	canCreate: boolean;
	canDelete: boolean;
	isRegenerating: boolean;
	isRevoking: boolean;
	onRevokeRequest: (id: string) => void;
	onRegenerateRequest: (id: string) => void;
}

export function HasQrPane({
	row,
	canCreate,
	canDelete,
	isRegenerating,
	isRevoking,
	onRevokeRequest,
	onRegenerateRequest,
}: HasQrPaneProps) {
	const invite = row.invite;
	const usagePct =
		invite.maxUses !== null ? invite.usesCount / invite.maxUses : null;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			{/* Header strip */}
			<div className="shrink-0 border-b border-[#e5e5e5] bg-white px-8 py-5">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							Branch
						</p>
						<h2 className="text-lg font-bold text-[#0a0a0a]">
							{row.branchName}
						</h2>
						<p className="mt-0.5 text-sm text-[#737373]">
							Customers scan this code to self-register at this branch.
						</p>
					</div>
					<span className="inline-flex items-center gap-1 mt-1 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
						Active
					</span>
				</div>
			</div>

			{/* Main content */}
			<div className="flex flex-1 flex-col gap-5 px-8 py-6 lg:flex-row lg:items-start">
				{/* Left: QR + share */}
				<div className="flex shrink-0 flex-col items-center gap-4">
					<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
						<QRCodeSVG
							data-qr-download
							id={`qr-${row.branchId}`}
							value={invite.url}
							size={200}
							level="M"
							includeMargin
						/>
					</div>
					<ShareActions
						url={invite.url}
						branchName={row.branchName}
						qrSelector={`#qr-${row.branchId}`}
						variant="compact"
					/>
				</div>

				{/* Right: metadata + actions */}
				<div className="flex-1 space-y-4">
					{/* Stats grid */}
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								Sign-ups
							</p>
							<p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0a0a0a]">
								{invite.usesCount}
							</p>
							{invite.maxUses !== null && (
								<p className="text-xs text-[#737373]">
									of {invite.maxUses} max
								</p>
							)}
						</div>
						<div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								Limit
							</p>
							<p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0a0a0a]">
								{invite.maxUses !== null ? invite.maxUses : "∞"}
							</p>
							<p className="text-xs text-[#737373]">registrations</p>
						</div>
						<div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								Issued
							</p>
							<p className="mt-1 text-sm font-semibold text-[#0a0a0a]">
								{relativeTime(invite.createdAt)}
							</p>
						</div>
						<div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								Expires
							</p>
							<p className="mt-1 text-sm font-semibold text-[#0a0a0a]">
								{formatExpiry(invite.expiresAt)}
							</p>
						</div>
					</div>

					{/* Usage bar */}
					{usagePct !== null && (
						<div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
							<div className="mb-2 flex items-center justify-between">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
									Usage
								</p>
								<p className="font-mono text-xs tabular-nums text-[#737373]">
									{invite.usesCount} / {invite.maxUses}
								</p>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f3f3f3]">
								<div
									className={cn(
										"h-full rounded-full transition-all",
										usagePct >= 0.9
											? "bg-rose-500"
											: usagePct >= 0.7
												? "bg-amber-500"
												: "bg-[#0a0a0a]",
									)}
									style={{ width: `${Math.min(usagePct * 100, 100)}%` }}
								/>
							</div>
							{usagePct >= 0.8 && (
								<p className="mt-1.5 flex items-center gap-1 text-xs text-amber-700">
									<AlertTriangle className="h-3 w-3" />
									Approaching the registration limit.
								</p>
							)}
						</div>
					)}

					{/* Invite URL */}
					<div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
						<p className="mb-1 text-[10px] font-bold tracking-widest uppercase text-[#737373]">
							Invite URL
						</p>
						<p
							className="break-all font-mono text-xs text-[#0a0a0a]"
							data-testid="onboarding-invite-url"
						>
							{invite.url}
						</p>
					</div>

					{/* Share actions — full labelled row */}
					<ShareActions
						url={invite.url}
						branchName={row.branchName}
						qrSelector={`#qr-${row.branchId}`}
						variant="full"
					/>

					{/* Danger actions */}
					<div className="flex flex-wrap items-center gap-2 border-t border-[#e5e5e5] pt-4">
						{canCreate && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={isRegenerating}
								onClick={() => onRegenerateRequest(invite.id)}
								data-testid={`regenerate-${row.branchId}`}
							>
								<RefreshCw className="h-3.5 w-3.5" />
								{isRegenerating ? "Regenerating…" : "Regenerate"}
							</button>
						)}
						{canDelete && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 bg-white border border-rose-200 text-rose-600 px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-rose-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={isRevoking}
								onClick={() => onRevokeRequest(invite.id)}
								data-testid={`revoke-${row.branchId}`}
							>
								<Trash2 className="h-3.5 w-3.5" />
								{isRevoking ? "Revoking…" : "Revoke"}
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
