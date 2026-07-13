import { queryClient, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { MemberReassignment } from "@/components/branch/member-reassignment";
import { MemberSelector } from "@/components/branch/member-selector";

import type { HierarchyNode, NodeWithStats, OpeningHoursShape } from "./types";
import { OpeningHoursEditor } from "./OpeningHoursEditor";

// ─── Edit dialog ───────────────────────────────────────────────────────────

export function EditBranchDialog({
	open,
	onDismiss,
	onCancel,
	organizationId,
	editingNode,
	editName,
	setEditName,
	editAddress,
	setEditAddress,
	editPicUserId,
	setEditPicUserId,
	editCountryId,
	setEditCountryId,
	editRegionId,
	setEditRegionId,
	editAreaId,
	setEditAreaId,
	editCompanyLegalName,
	setEditCompanyLegalName,
	editRegistrationNumber,
	setEditRegistrationNumber,
	editTaxId,
	setEditTaxId,
	editInvoicePrefix,
	setEditInvoicePrefix,
	editReceiptPrefix,
	setEditReceiptPrefix,
	editBranchTaxRateId,
	setEditBranchTaxRateId,
	editOpeningHours,
	setEditOpeningHours,
	taxRates,
	allNodes,
	countries,
	regions,
	areas,
	onSubmit,
	isPending,
}: {
	open: boolean;
	onDismiss: () => void;
	onCancel: () => void;
	organizationId: string | null;
	editingNode: NodeWithStats | null;
	editName: string;
	setEditName: (v: string) => void;
	editAddress: string;
	setEditAddress: (v: string) => void;
	editPicUserId: string;
	setEditPicUserId: (v: string) => void;
	editCountryId: string;
	setEditCountryId: (v: string) => void;
	editRegionId: string;
	setEditRegionId: (v: string) => void;
	editAreaId: string;
	setEditAreaId: (v: string) => void;
	editCompanyLegalName: string;
	setEditCompanyLegalName: (v: string) => void;
	editRegistrationNumber: string;
	setEditRegistrationNumber: (v: string) => void;
	editTaxId: string;
	setEditTaxId: (v: string) => void;
	editInvoicePrefix: string;
	setEditInvoicePrefix: (v: string) => void;
	editReceiptPrefix: string;
	setEditReceiptPrefix: (v: string) => void;
	editBranchTaxRateId: string;
	setEditBranchTaxRateId: (v: string) => void;
	editOpeningHours: OpeningHoursShape;
	setEditOpeningHours: (v: OpeningHoursShape) => void;
	taxRates: { id: string; name: string; rateInBasisPoints: number }[];
	allNodes: HierarchyNode[];
	countries: HierarchyNode[];
	regions: HierarchyNode[];
	areas: HierarchyNode[];
	onSubmit: () => void;
	isPending: boolean;
}) {
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onDismiss()}>
			<DialogContent
				className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						BRANCH MANAGEMENT
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Edit {editingNode?.name}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Update the details for this hierarchy node.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto max-h-[60vh]">
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="edit-name">Name *</Label>
							<Input
								id="edit-name"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								placeholder="Branch name"
								autoFocus
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-country">Country</Label>
							<Select
								value={editCountryId}
								onValueChange={(v) => {
									setEditCountryId(v);
									setEditRegionId("");
									setEditAreaId("");
								}}
							>
								<SelectTrigger id="edit-country">
									<SelectValue placeholder="Select country" />
								</SelectTrigger>
								<SelectContent>
									{countries.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-region">Region</Label>
							<Select
								value={editRegionId}
								onValueChange={(v) => {
									setEditRegionId(v);
									setEditAreaId("");
								}}
								disabled={!editCountryId}
							>
								<SelectTrigger id="edit-region">
									<SelectValue
										placeholder={
											editCountryId ? "Select region" : "Select country first"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{regions.map((r) => (
										<SelectItem key={r.id} value={r.id}>
											{r.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-area">Area</Label>
							<Select
								value={editAreaId}
								onValueChange={setEditAreaId}
								disabled={!editRegionId}
							>
								<SelectTrigger id="edit-area">
									<SelectValue
										placeholder={
											editRegionId ? "Select area" : "Select region first"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{areas.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-address">Address</Label>
							<Input
								id="edit-address"
								value={editAddress}
								onChange={(e) => setEditAddress(e.target.value)}
								placeholder="Branch address"
							/>
						</div>

						{organizationId && (
							<div className="space-y-2">
								<Label>Person In Charge</Label>
								<MemberSelector
									organizationId={organizationId}
									value={editPicUserId}
									onChange={setEditPicUserId}
									placeholder="Select Person In Charge"
									allowClear
									disabled={isPending}
								/>
							</div>
						)}

						{editingNode?.type === "branch" && (
							<div className="space-y-4 pt-4 border-t border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
									Company &amp; Tax
								</p>

								<div className="space-y-2">
									<Label htmlFor="edit-company-legal-name">
										Company Legal Name
									</Label>
									<Input
										id="edit-company-legal-name"
										value={editCompanyLegalName}
										onChange={(e) => setEditCompanyLegalName(e.target.value)}
										placeholder="Registered company name"
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="edit-registration-number">
										Registration No.
									</Label>
									<Input
										id="edit-registration-number"
										value={editRegistrationNumber}
										onChange={(e) => setEditRegistrationNumber(e.target.value)}
										placeholder="Company registration number"
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="edit-tax-id">Tax ID</Label>
									<Input
										id="edit-tax-id"
										value={editTaxId}
										onChange={(e) => setEditTaxId(e.target.value)}
										placeholder="Tax identification number"
									/>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-2">
										<Label htmlFor="edit-invoice-prefix">Invoice Prefix</Label>
										<Input
											id="edit-invoice-prefix"
											value={editInvoicePrefix}
											onChange={(e) => setEditInvoicePrefix(e.target.value)}
											placeholder="e.g. INV-KL-"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="edit-receipt-prefix">Receipt Prefix</Label>
										<Input
											id="edit-receipt-prefix"
											value={editReceiptPrefix}
											onChange={(e) => setEditReceiptPrefix(e.target.value)}
											placeholder="e.g. RCP-KL-"
										/>
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="edit-tax-rate">Tax Rate</Label>
									<Select
										value={editBranchTaxRateId || "__none__"}
										onValueChange={(v) =>
											setEditBranchTaxRateId(v === "__none__" ? "" : v)
										}
									>
										<SelectTrigger id="edit-tax-rate">
											<SelectValue placeholder="Use country / org default" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__none__">
												Use country / org default
											</SelectItem>
											{taxRates.map((r) => (
												<SelectItem key={r.id} value={r.id}>
													{r.name} · {r.rateInBasisPoints / 100}%
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="edit-opening-hours">Opening Hours</Label>
									<OpeningHoursEditor
										value={editOpeningHours}
										onChange={setEditOpeningHours}
									/>
								</div>
							</div>
						)}

						{editingNode?.id && organizationId && (
							<div className="pt-4 border-t border-[#e5e5e5]">
								<MemberReassignment
									branchId={editingNode.id}
									organizationId={organizationId}
									allBranches={allNodes.filter((n) => n.type === "branch")}
									picUserId={editPicUserId || null}
									onReassigned={() => {
										queryClient.invalidateQueries(
											orpc.hierarchy.listNodesWithStats.queryOptions({
												input: { organizationId: organizationId! },
											}),
										);
										queryClient.invalidateQueries({
											queryKey: ["user-context"],
										});
									}}
								/>
							</div>
						)}
					</div>
				</div>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button
						onClick={onSubmit}
						disabled={!editName.trim() || isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isPending ? "Saving…" : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
