import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { type FormState, type Priority, type TargetAudience } from "./types";

// ─── Hierarchy node shape (local) ────────────────────────────────────────────

type HierarchyNode = { id: string; name: string; depth: number };

// ─── Create / Edit announcement dialog ───────────────────────────────────────

interface AnnouncementFormDialogProps {
	open: boolean;
	editingId: string | null;
	form: FormState;
	hierarchyNodes: HierarchyNode[] | undefined;
	isSaving: boolean;
	onOpenChange: (open: boolean) => void;
	onFormChange: (updater: (prev: FormState) => FormState) => void;
	onSubmit: (e: React.FormEvent) => void;
	onCancel: () => void;
}

export function AnnouncementFormDialog({
	open,
	editingId,
	form,
	hierarchyNodes,
	isSaving,
	onOpenChange,
	onFormChange,
	onSubmit,
	onCancel,
}: AnnouncementFormDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INTERNAL COMMUNICATIONS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{editingId ? "Edit Announcement" : "New Announcement"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{editingId
							? "Update the details of this announcement."
							: "Fill in the details to publish a new announcement."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit}>
					<div className="px-6 pt-4 pb-2 overflow-y-auto max-h-[65vh] flex flex-col gap-5">
						{/* Title */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-title">
								Title <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="ann-title"
								placeholder="Announcement title"
								value={form.title}
								onChange={(e) =>
									onFormChange((f) => ({ ...f, title: e.target.value }))
								}
								required
							/>
						</div>

						{/* Message */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-message">
								Message <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="ann-message"
								placeholder="Announcement body text"
								rows={4}
								value={form.message}
								onChange={(e) =>
									onFormChange((f) => ({ ...f, message: e.target.value }))
								}
								required
							/>
						</div>

						{/* Priority */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-priority">Priority</Label>
							<Select
								value={form.priority}
								onValueChange={(v) =>
									onFormChange((f) => ({ ...f, priority: v as Priority }))
								}
							>
								<SelectTrigger id="ann-priority">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="low">Low</SelectItem>
									<SelectItem value="normal">Normal</SelectItem>
									<SelectItem value="high">High</SelectItem>
									<SelectItem value="urgent">Urgent</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Target Audience */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ann-audience">Target Audience</Label>
							<Select
								value={form.targetAudience}
								onValueChange={(v) =>
									onFormChange((f) => ({
										...f,
										targetAudience: v as TargetAudience,
									}))
								}
							>
								<SelectTrigger id="ann-audience">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All</SelectItem>
									<SelectItem value="staff">Staff</SelectItem>
									<SelectItem value="clients">Members</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Branch Scope */}
						<div className="flex flex-col gap-1.5">
							<Label>Branch Scope</Label>
							<p className="text-xs text-[#737373]">
								Leave empty to show org-wide to all branches.
							</p>
							<div className="border border-[#e5e5e5] rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
								{(hierarchyNodes ?? []).map((node) => (
									<div key={node.id} className="flex items-center gap-2">
										<Checkbox
											id={`scope-${node.id}`}
											checked={form.scopedBranchIds.includes(node.id)}
											onCheckedChange={(checked) =>
												onFormChange((f) => ({
													...f,
													scopedBranchIds: checked
														? [...f.scopedBranchIds, node.id]
														: f.scopedBranchIds.filter((id) => id !== node.id),
												}))
											}
										/>
										<Label
											htmlFor={`scope-${node.id}`}
											className="cursor-pointer font-normal text-sm"
											style={{ paddingLeft: `${node.depth * 12}px` }}
										>
											{node.name}
										</Label>
									</div>
								))}
								{(hierarchyNodes ?? []).length === 0 && (
									<p className="text-xs text-[#737373] py-2 text-center">
										No branches available.
									</p>
								)}
							</div>
						</div>

						{/* Date range */}
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="ann-start">Start Date</Label>
								<Input
									id="ann-start"
									type="datetime-local"
									value={form.startDate}
									onChange={(e) =>
										onFormChange((f) => ({
											...f,
											startDate: e.target.value,
										}))
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="ann-end">End Date</Label>
								<Input
									id="ann-end"
									type="datetime-local"
									value={form.endDate}
									onChange={(e) =>
										onFormChange((f) => ({
											...f,
											endDate: e.target.value,
										}))
									}
								/>
							</div>
						</div>

						{/* Pin to top */}
						<div className="flex items-center gap-2">
							<Checkbox
								id="ann-pinned"
								checked={form.isPinned}
								onCheckedChange={(checked) =>
									onFormChange((f) => ({ ...f, isPinned: checked === true }))
								}
							/>
							<Label
								htmlFor="ann-pinned"
								className="cursor-pointer font-normal"
							>
								Pin to top
							</Label>
						</div>

						{/* Requires acknowledgement */}
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<Checkbox
									id="ann-requires-ack"
									checked={form.requiresAcknowledgement}
									onCheckedChange={(checked) =>
										onFormChange((f) => ({
											...f,
											requiresAcknowledgement: checked === true,
										}))
									}
								/>
								<Label
									htmlFor="ann-requires-ack"
									className="cursor-pointer font-normal"
								>
									Requires acknowledgement
								</Label>
							</div>
							<p className="text-xs text-[#737373] pl-6">
								Members will see an Acknowledge button. Tracking arrives in a
								future release.
							</p>
						</div>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={onCancel}
							disabled={isSaving}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
							disabled={isSaving}
						>
							{isSaving ? "Saving…" : editingId ? "Save Changes" : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
