import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ServicePriceOverrideDialog } from "./service-price-override-dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { StatusCallout } from "@/components/ui/status-callout";

function formatDateOrOpen(date: Date | null | undefined): string {
	if (!date) return "Open-ended";
	return new Date(date).toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function ServicePricingPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
		null,
	);
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [expireConfirmId, setExpireConfirmId] = useState<string | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [isExpiring, setIsExpiring] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { data: services = [] } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const { data: hierarchyData } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const branchMap = new Map(
		(hierarchyData?.nodes ?? []).map((n: { id: string; name: string }) => [
			n.id,
			n.name,
		]),
	);

	const {
		data: overrides = [],
		isLoading: overridesLoading,
		isError: overridesError,
		refetch: refetchOverrides,
	} = useQuery({
		...orpc.services.listPriceOverrides.queryOptions({
			input: { organizationId: organizationId!, serviceId: selectedServiceId! },
		}),
		enabled: !!organizationId && !!selectedServiceId,
	});

	function invalidateOverrides() {
		void queryClient.invalidateQueries(
			orpc.services.listPriceOverrides.queryOptions({
				input: {
					organizationId: organizationId!,
					serviceId: selectedServiceId!,
				},
			}),
		);
	}

	async function handleExpire() {
		if (!expireConfirmId || !organizationId) return;
		setIsExpiring(true);
		try {
			await client.services.expireBranchPrice({
				organizationId,
				priceId: expireConfirmId,
			});
			toast.success("Price override expired.");
			invalidateOverrides();
			setExpireConfirmId(null);
		} catch {
			toast.error("Failed to expire price override.");
		} finally {
			setIsExpiring(false);
		}
	}

	async function handleDelete() {
		if (!deleteConfirmId || !organizationId) return;
		setIsDeleting(true);
		try {
			await client.services.deleteBranchPrice({
				organizationId,
				priceId: deleteConfirmId,
			});
			toast.success("Price override deleted.");
			invalidateOverrides();
			setDeleteConfirmId(null);
		} catch {
			toast.error("Failed to delete price override.");
		} finally {
			setIsDeleting(false);
		}
	}

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#737373]">
				Select an organization to manage pricing.
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-auto">
			{/* Filter bar */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="w-72">
					<Select
						value={selectedServiceId ?? ""}
						onValueChange={(v) => setSelectedServiceId(v || null)}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a service to view overrides..." />
						</SelectTrigger>
						<SelectContent>
							{services.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<button
					type="button"
					onClick={() => setAddDialogOpen(true)}
					disabled={!selectedServiceId}
					className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-40 disabled:cursor-not-allowed"
				>
					<Plus className="h-4 w-4" />
					Add Override
				</button>
			</div>

			{/* Table */}
			{!selectedServiceId ? (
				<div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[#e5e5e5] text-[#737373] text-[13px]">
					Select a service above to view its price overrides.
				</div>
			) : overridesLoading ? (
				<div className="flex flex-1 items-center justify-center text-[#737373] text-[13px]">
					Loading...
				</div>
			) : overridesError ? (
				<div className="flex flex-1 items-start justify-center pt-8">
					<StatusCallout
						variant="error"
						title="Failed to load price overrides"
						onRetry={() => refetchOverrides()}
					>
						Something went wrong while fetching overrides. Please try again.
					</StatusCallout>
				</div>
			) : overrides.length === 0 ? (
				<div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[#e5e5e5] text-[#737373] text-[13px]">
					No price overrides configured for this service.
				</div>
			) : (
				<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
					<table className="w-full">
						<thead>
							<tr className="border-b border-[#e5e5e5] bg-[#f3f3f3]">
								{[
									"Branch",
									"Customer Type",
									"Price",
									"Effective From",
									"Effective Until",
									"",
								].map((h, i) => (
									<th
										key={i}
										className="py-3 px-3 text-[10px] uppercase tracking-widest font-bold text-[#737373] text-left whitespace-nowrap"
									>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{overrides.map((row) => (
								<tr
									key={row.id}
									className="border-b border-[#e5e5e5] transition-colors hover:bg-[#f3f3f3]/60"
								>
									<td className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap">
										{row.branchId
											? ((branchMap.get(row.branchId) as string | undefined) ??
												row.branchId)
											: "Org-wide / All branches"}
									</td>
									<td className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap">
										{row.customerType === "member"
											? "Member"
											: row.customerType === "walk_in"
												? "Walk-in"
												: "All"}
									</td>
									<td className="py-3 px-3 text-[13px] font-mono tabular-nums text-[#0a0a0a] whitespace-nowrap">
										{formatPrice(row.priceCents)}
									</td>
									<td className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap">
										{formatDateOrOpen(row.effectiveFrom)}
										{new Date(row.effectiveFrom) > new Date() && (
											<span className="ml-1 inline-flex items-center rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
												Scheduled
											</span>
										)}
									</td>
									<td className="py-3 px-3 text-[13px] text-[#0a0a0a] whitespace-nowrap">
										{formatDateOrOpen(row.effectiveUntil)}
									</td>
									<td className="py-3 px-3 whitespace-nowrap">
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={() => setExpireConfirmId(row.id)}
												className="rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#262626] hover:bg-[#f3f3f3] transition"
											>
												Expire
											</button>
											<button
												type="button"
												onClick={() => setDeleteConfirmId(row.id)}
												className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition"
											>
												Delete
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Add override dialog */}
			{selectedServiceId && (
				<ServicePriceOverrideDialog
					open={addDialogOpen}
					onOpenChange={setAddDialogOpen}
					organizationId={organizationId}
					defaultServiceId={selectedServiceId}
					onSuccess={() => {
						invalidateOverrides();
						setAddDialogOpen(false);
					}}
				/>
			)}

			{/* Expire confirmation */}
			<Dialog
				open={!!expireConfirmId}
				onOpenChange={() => setExpireConfirmId(null)}
			>
				<DialogContent
					className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							SERVICE CATALOG
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Expire price override?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							This will set the effective-until date to now, ending the override
							immediately.
						</DialogDescription>
					</DialogHeader>
					<div className="px-6 pt-4 pb-2 overflow-y-auto" />
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button variant="outline" onClick={() => setExpireConfirmId(null)}>
							Cancel
						</Button>
						<Button
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
							onClick={handleExpire}
							disabled={isExpiring}
						>
							{isExpiring ? "Expiring..." : "Expire Override"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation */}
			<Dialog
				open={!!deleteConfirmId}
				onOpenChange={() => setDeleteConfirmId(null)}
			>
				<DialogContent
					className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							SERVICE CATALOG
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Delete price override?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							This will permanently remove the override. This action cannot be
							undone.
						</DialogDescription>
					</DialogHeader>
					<div className="px-6 pt-4 pb-2 overflow-y-auto" />
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={handleDelete}
							disabled={isDeleting}
						>
							{isDeleting ? "Deleting..." : "Delete Override"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
