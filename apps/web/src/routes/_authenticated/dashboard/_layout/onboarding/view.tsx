import { createFileRoute } from "@tanstack/react-router";
import {
	AlertTriangle,
	Lock,
	QrCode,
	RefreshCw,
	Search,
	Store,
	Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { requirePermission } from "@/lib/route-guards";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	useAllBranchInvites,
	useCreateBranchInviteFromIndex,
	useRegenerateBranchInviteFromIndex,
	useRevokeBranchInviteFromIndex,
} from "@/features/branch-invites/api";
import { ShareActions } from "@/features/branch-invites/components/share-actions";
import { useUserContext } from "@/hooks/useUserContext";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/onboarding/view",
)({
	beforeLoad: async () => {
		await requirePermission("hierarchy_management:read");
	},
	component: OnboardingIndexPage,
});

type InviteShape = {
	id: string;
	token: string;
	url: string;
	usesCount: number;
	maxUses: number | null;
	isActive: boolean;
	expiresAt: string | Date;
	createdAt: string | Date;
};

type Row = {
	branchId: string;
	branchName: string;
	invite: InviteShape | null;
};

function relativeTime(date: string | Date): string {
	const diff = Date.now() - new Date(date).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function formatExpiry(date: string | Date): string {
	return new Date(date).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0]?.toUpperCase())
		.join("");
}

// ---------------------------------------------------------------------------
// Left sidebar item
// ---------------------------------------------------------------------------

interface BranchListItemProps {
	row: Row;
	isSelected: boolean;
	onSelect: () => void;
}

function BranchListItem({ row, isSelected, onSelect }: BranchListItemProps) {
	const hasQr = row.invite !== null;
	const isNearLimit =
		hasQr &&
		row.invite!.maxUses !== null &&
		row.invite!.usesCount / row.invite!.maxUses >= 0.8;

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full rounded-xl border-l-2 px-3 py-2.5 text-left transition-colors",
				isSelected
					? "bg-[#d6cdb1]/20 border-l-[#0a0a0a]"
					: "border-l-transparent hover:bg-[#f3f3f3]",
			)}
			data-testid={`branch-item-${row.branchId}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2.5 min-w-0">
					<div
						className={cn(
							"flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold",
							isSelected
								? "bg-[#0a0a0a]/10 text-[#0a0a0a]"
								: isNearLimit
									? "bg-amber-100 text-amber-700"
									: "bg-[#f3f3f3] text-[#737373]",
						)}
					>
						{getInitials(row.branchName)}
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium leading-tight text-[#0a0a0a]">
							{row.branchName}
						</p>
						{hasQr && (
							<p className="font-mono text-[10px] text-[#737373] truncate">
								{row.invite!.token.slice(0, 10)}…
							</p>
						)}
					</div>
				</div>
				{hasQr ? (
					<span
						className={cn(
							"inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono tabular-nums",
							isNearLimit
								? "bg-amber-50 text-amber-700"
								: "bg-emerald-50 text-emerald-700",
						)}
					>
						<span
							className={cn(
								"h-1.5 w-1.5 rounded-full",
								isNearLimit ? "bg-amber-500" : "bg-emerald-500",
							)}
						/>
						{row.invite!.usesCount}
						{row.invite!.maxUses != null ? `/${row.invite!.maxUses}` : ""}
					</span>
				) : (
					<span className="inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3f3f3] text-[#737373]">
						No QR
					</span>
				)}
			</div>
		</button>
	);
}

// ---------------------------------------------------------------------------
// Right pane — no QR state
// ---------------------------------------------------------------------------

interface NoQrPaneProps {
	row: Row;
	canCreate: boolean;
	isPending: boolean;
	onGenerate: (branchId: string, maxUses: number | undefined) => void;
}

function NoQrPane({ row, canCreate, isPending, onGenerate }: NoQrPaneProps) {
	const [maxUsesInput, setMaxUsesInput] = useState("");

	const parsedMaxUses = maxUsesInput.trim()
		? parseInt(maxUsesInput.trim(), 10) || undefined
		: undefined;

	return (
		<div className="flex h-full flex-col items-center justify-center px-8 py-12">
			<div className="w-full max-w-sm">
				{/* QR placeholder */}
				<div className="mx-auto mb-8 flex h-48 w-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#e5e5e5] bg-white">
					<QrCode className="h-12 w-12 text-[#737373] opacity-30" />
					<p className="mt-2 text-center text-xs text-[#737373] max-w-[120px]">
						QR code will appear here after generation
					</p>
				</div>

				{/* Branch callout */}
				<div className="mb-4 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 flex items-center justify-between">
					<div>
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
							Branch
						</p>
						<p className="mt-0.5 text-sm font-semibold text-[#0a0a0a]">
							{row.branchName}
						</p>
					</div>
				</div>

				{/* Max uses input */}
				<div className="mb-4 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
					<Label
						htmlFor="max-uses"
						className="text-[10px] font-bold tracking-widest uppercase text-[#737373]"
					>
						Max Uses
					</Label>
					<Input
						id="max-uses"
						type="number"
						min={1}
						placeholder="Unlimited"
						value={maxUsesInput}
						onChange={(e) => setMaxUsesInput(e.target.value)}
						className="mt-1.5 font-mono tabular-nums"
					/>
					<p className="mt-1.5 text-xs text-[#737373]">
						Leave blank for no registration cap.
					</p>
				</div>

				<button
					type="button"
					className="inline-flex w-full items-center justify-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50 disabled:cursor-not-allowed"
					disabled={!canCreate || isPending}
					onClick={() => onGenerate(row.branchId, parsedMaxUses)}
					data-testid={`generate-${row.branchId}`}
				>
					<QrCode className="h-4 w-4" />
					{isPending ? "Generating…" : "Generate QR Code"}
				</button>

				{!canCreate && (
					<p className="mt-3 text-center text-xs text-[#737373]">
						You don't have permission to generate QR codes.
					</p>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Right pane — has QR state
// ---------------------------------------------------------------------------

interface HasQrPaneProps {
	row: Row & { invite: InviteShape };
	canCreate: boolean;
	canDelete: boolean;
	isRegenerating: boolean;
	isRevoking: boolean;
	onRevokeRequest: (id: string) => void;
	onRegenerateRequest: (id: string) => void;
}

function HasQrPane({
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
						<h2 className="text-lg font-bold text-[#0a0a0a]">{row.branchName}</h2>
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
								<p className="text-xs text-[#737373]">of {invite.maxUses} max</p>
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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function OnboardingIndexPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const canRead = hasPermission("hierarchy_management:read");
	const canCreate = hasPermission("hierarchy_management:create");
	const canDelete = hasPermission("hierarchy_management:delete");

	const { data: rows, isLoading, error } = useAllBranchInvites(organizationId);
	const createMutation = useCreateBranchInviteFromIndex(organizationId ?? "");
	const revokeMutation = useRevokeBranchInviteFromIndex(organizationId ?? "");
	const regenerateMutation = useRegenerateBranchInviteFromIndex(
		organizationId ?? "",
	);

	const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
	const [confirmRegenerateId, setConfirmRegenerateId] = useState<string | null>(
		null,
	);

	const filteredRows =
		(rows as Row[] | undefined)?.filter((r) =>
			r.branchName.toLowerCase().includes(search.toLowerCase()),
		) ?? [];

	const effectiveSelection =
		selectedBranchId ??
		(filteredRows.length > 0 ? filteredRows[0]!.branchId : null);

	const selectedRow =
		filteredRows.find((r) => r.branchId === effectiveSelection) ?? null;

	const handleGenerate = (branchId: string, maxUses?: number) => {
		createMutation.mutate({ branchId, maxUses });
	};

	const handleRevokeConfirm = () => {
		if (!confirmRevokeId) return;
		revokeMutation.mutate(confirmRevokeId, {
			onSuccess: () => setConfirmRevokeId(null),
		});
	};

	const handleRegenerateConfirm = () => {
		if (!confirmRegenerateId) return;
		regenerateMutation.mutate(confirmRegenerateId, {
			onSuccess: () => setConfirmRegenerateId(null),
		});
	};

	// Permission denied (Section 11.4)
	if (!canRead) {
		return (
			<div className="-m-6 flex h-screen flex-col items-center justify-center bg-[#f3f3f3]">
				<Lock className="h-8 w-8 mb-3 text-[#737373] opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					You don't have access to this page
				</p>
				<p className="text-xs mt-1 text-[#737373]">
					Ask an admin to grant hierarchy management access.
				</p>
			</div>
		);
	}

	// Loading
	if (isLoading) {
		return (
			<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3] p-6">
				<div className="mb-5 shrink-0">
					<div className="h-3 w-36 rounded bg-[#e5e5e5] animate-pulse mb-2" />
					<div className="h-7 w-56 rounded bg-[#e5e5e5] animate-pulse" />
					<div className="h-4 w-72 rounded bg-[#e5e5e5] animate-pulse mt-2" />
				</div>
				<div className="flex flex-1 min-h-0 rounded-2xl border border-[#e5e5e5] overflow-hidden">
					<div className="w-72 shrink-0 border-r border-[#e5e5e5] bg-white px-4 py-5">
						<div className="h-4 w-24 rounded bg-[#e5e5e5] animate-pulse mb-4" />
						<div className="space-y-2">
							{[1, 2, 3, 4].map((i) => (
								<div key={i} className="h-12 w-full rounded-xl bg-[#e5e5e5] animate-pulse" />
							))}
						</div>
					</div>
					<div className="flex-1 px-8 py-8 space-y-4 bg-[#f3f3f3]">
						<div className="h-8 w-48 rounded bg-[#e5e5e5] animate-pulse" />
						<div className="flex gap-4">
							<div className="h-56 w-56 rounded-2xl bg-[#e5e5e5] animate-pulse" />
							<div className="flex-1 space-y-3">
								<div className="h-24 w-full rounded-2xl bg-[#e5e5e5] animate-pulse" />
								<div className="h-16 w-full rounded-2xl bg-[#e5e5e5] animate-pulse" />
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Error
	if (error) {
		return (
			<div className="-m-6 flex h-screen flex-col items-center justify-center bg-[#f3f3f3]">
				<p className="text-sm font-medium text-rose-600">
					Failed to load branches
				</p>
				<p className="mt-1 text-xs text-[#737373] max-w-md text-center">
					{(error as Error).message ?? "An unknown error occurred."}
				</p>
			</div>
		);
	}

	// Empty
	if (!rows || rows.length === 0) {
		return (
			<div className="-m-6 flex h-screen flex-col items-center justify-center bg-[#f3f3f3]">
				<Store className="h-8 w-8 mb-3 text-[#737373] opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">No branches found</p>
				<p className="text-xs mt-1 text-[#737373] max-w-sm text-center">
					Create a branch first under Branches, then return here to issue an
					onboarding QR code.
				</p>
			</div>
		);
	}

	// Happy path — master-detail split pane
	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3] p-6">
			{/* Page header */}
			<div className="mb-5 shrink-0">
				<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
					CUSTOMER ONBOARDING
				</p>
				<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
					Onboarding QR Codes
				</h1>
				<p className="mt-1 text-sm text-[#737373]">
					Manage QR codes for customer self-registration at each branch.
				</p>
			</div>

			{/* Split layout — Section 14 */}
			<div className="flex flex-1 min-h-0 rounded-2xl border border-[#e5e5e5] overflow-hidden">
				{/* ---- Left sidebar: branch list ---- */}
				<div className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-[#e5e5e5] bg-white">
					{/* Sidebar header */}
					<div className="shrink-0 border-b border-[#e5e5e5] px-4 py-4">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Store className="h-3.5 w-3.5 text-[#737373]" />
								<span className="text-sm font-semibold text-[#0a0a0a]">
									Active QR Codes
								</span>
							</div>
							<span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md bg-[#f3f3f3] px-2 py-0.5 font-mono font-medium tabular-nums text-[#737373] text-xs">
								{filteredRows.length}
							</span>
						</div>
						{/* Search — native input per design guidelines (no double border) */}
						<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
							<Search className="h-3.5 w-3.5 text-[#737373] shrink-0" />
							<input
								className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a]"
								placeholder="Search branches…"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
					</div>

					{/* Branch list */}
					<div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
						{filteredRows.length === 0 ? (
							<p className="py-6 text-center text-xs text-[#737373]">
								No branches match your search.
							</p>
						) : (
							filteredRows.map((row) => (
								<BranchListItem
									key={row.branchId}
									row={row}
									isSelected={row.branchId === effectiveSelection}
									onSelect={() => setSelectedBranchId(row.branchId)}
								/>
							))
						)}
					</div>

					{/* Footer summary */}
					<div className="shrink-0 border-t border-[#e5e5e5] px-4 py-3">
						{(() => {
							const noQrCount = (rows as Row[]).filter(
								(r) => r.invite === null,
							).length;
							const totalCount = (rows as Row[]).length;
							const withQrCount = totalCount - noQrCount;
							return noQrCount > 0 ? (
								<>
									<p className="text-xs text-[#737373]">
										{noQrCount === 1
											? "1 branch still needs a QR code."
											: `${noQrCount} branches still need a QR code.`}
									</p>
									{filteredRows
										.filter((r) => r.invite === null)
										.slice(0, 2)
										.map((r) => (
											<p
												key={r.branchId}
												className="mt-0.5 text-xs font-medium text-[#0a0a0a] truncate"
											>
												{r.branchName}
											</p>
										))}
								</>
							) : (
								<p className="text-xs text-[#737373]">
									<span className="font-medium font-mono tabular-nums text-[#0a0a0a]">
										{withQrCount}
									</span>{" "}
									of {totalCount} branches have a QR code
								</p>
							);
						})()}
					</div>
				</div>

				{/* ---- Right pane: detail ---- */}
				<div className="flex-1 overflow-hidden bg-[#f3f3f3] rounded-r-2xl">
					{selectedRow === null ? (
						<div className="flex h-full flex-col items-center justify-center">
							<QrCode className="h-8 w-8 mb-3 text-[#737373] opacity-30" />
							<p className="text-sm text-[#737373]">
								Select a branch to view or manage its QR code.
							</p>
						</div>
					) : selectedRow.invite === null ? (
						<NoQrPane
							row={selectedRow}
							canCreate={canCreate}
							isPending={createMutation.isPending}
							onGenerate={handleGenerate}
						/>
					) : (
						<HasQrPane
							row={selectedRow as Row & { invite: InviteShape }}
							canCreate={canCreate}
							canDelete={canDelete}
							isRegenerating={regenerateMutation.isPending}
							isRevoking={revokeMutation.isPending}
							onRevokeRequest={(id) => setConfirmRevokeId(id)}
							onRegenerateRequest={(id) => setConfirmRegenerateId(id)}
						/>
					)}
				</div>
			</div>

			{/* ---- Dialogs ---- */}

			{/* Revoke confirm */}
			<Dialog
				open={confirmRevokeId !== null}
				onOpenChange={(open) => !open && setConfirmRevokeId(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Revoke QR code?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							This QR will stop working immediately. Already-registered customers
							are not affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmRevokeId(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={revokeMutation.isPending}
							onClick={handleRevokeConfirm}
						>
							{revokeMutation.isPending ? "Revoking…" : "Revoke"}
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
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Regenerate QR code?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							The current code will be revoked and a new one issued. Update any
							printed materials.
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
							onClick={handleRegenerateConfirm}
						>
							{regenerateMutation.isPending ? "Regenerating…" : "Regenerate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
