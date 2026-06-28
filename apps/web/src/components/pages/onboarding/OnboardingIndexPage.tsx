import { useSearch } from "@tanstack/react-router";
import { Lock, QrCode, Search, Store } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	useAllBranchInvites,
	useCreateBranchInviteFromIndex,
	useRegenerateBranchInviteFromIndex,
	useRevokeBranchInviteFromIndex,
} from "@/features/branch-invites/api";
import { useUserContext } from "@/hooks/useUserContext";
import { BranchListItem } from "./BranchListItem";
import { HasQrPane } from "./HasQrPane";
import { NoQrPane } from "./NoQrPane";
import type { InviteShape, Row } from "./types";

export function OnboardingIndexPage() {
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

	// Preselect a branch when arriving via ?branch=<id> (e.g. from a
	// self-signup invitation row in Staff Access → Invitations).
	const { branch: branchParam } = useSearch({
		from: "/_authenticated/dashboard/_layout/onboarding/view",
	});
	const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
		branchParam ?? null,
	);
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
								<div
									key={i}
									className="h-12 w-full rounded-xl bg-[#e5e5e5] animate-pulse"
								/>
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
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="font-semibold">Onboarding</span>
				</div>
			</header>

			{/* Split layout — Section 14 */}
			<div className="mx-6 my-6 flex flex-1 min-h-0 rounded-2xl border border-[#e5e5e5] overflow-hidden">
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
				<DialogContent
					className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							BRANCH MANAGEMENT
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Revoke QR code?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							This QR will stop working immediately. Already-registered
							customers are not affected.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button variant="outline" onClick={() => setConfirmRevokeId(null)}>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
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
							The current code will be revoked and a new one issued. Update any
							printed materials.
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
