import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrainerAvailabilityEditor } from "@/components/trainers/trainer-availability-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TrainerServicesSection } from "./TrainerServicesSection";
import { TrainerCommissionsSection } from "./TrainerCommissionsSection";
import type { TrainerRow } from "./TrainerCard";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FormState = {
	email: string;
	hierarchyScopeId: string;
	displayName: string;
	bio: string;
	specialization: string;
	phoneNumber: string;
	certifications: string; // comma-separated in the UI
};

type HierarchyNode = {
	id: string;
	name: string;
	type: string;
	depth: number;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
	email: "",
	hierarchyScopeId: "",
	displayName: "",
	bio: "",
	specialization: "",
	phoneNumber: "",
	certifications: "",
};

function trainerToForm(trainer: TrainerRow): FormState {
	return {
		email: trainer.email,
		hierarchyScopeId: trainer.hierarchyScopeId,
		displayName: trainer.displayName ?? "",
		bio: trainer.bio ?? "",
		specialization: trainer.specialization ?? "",
		phoneNumber: trainer.phoneNumber ?? "",
		certifications: trainer.certifications?.join(", ") ?? "",
	};
}

// ─── Section header (replaces Separator pattern) ──────────────────────────────

function SectionHeading({ label }: { label: string }) {
	return (
		<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] pb-2 border-b border-[#e5e5e5]">
			{label}
		</p>
	);
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
	open: boolean;
	onClose: () => void;
	/** null = create mode, non-null = edit mode */
	trainer: TrainerRow | null;
	organizationId: string;
	hierarchyNodes: HierarchyNode[];
	onSubmit: (form: FormState, memberId: string | null) => void;
	isMutating: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TrainerFormDialog({
	open,
	onClose,
	trainer,
	organizationId,
	hierarchyNodes,
	onSubmit,
	isMutating,
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
}: Props) {
	const isEditing = trainer !== null;

	const [form, setForm] = useState<FormState>(
		trainer ? trainerToForm(trainer) : EMPTY_FORM,
	);
	const [profileSectionOpen, setProfileSectionOpen] = useState(true);
	const [availabilitySectionOpen, setAvailabilitySectionOpen] = useState(false);
	const [servicesSectionOpen, setServicesSectionOpen] = useState(false);
	const [commissionsSectionOpen, setCommissionsSectionOpen] = useState(false);

	// Seed form when trainer prop changes
	// react-doctor-disable-next-line react-doctor/no-cascading-set-state -- 4 cohesive setState calls reseeding form + collapse panels on trainer prop change
	useEffect(() => {
		setForm(trainer ? trainerToForm(trainer) : EMPTY_FORM);
		setProfileSectionOpen(true);
		setServicesSectionOpen(false);
		setCommissionsSectionOpen(false);
	}, [trainer]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!isEditing) {
			if (!form.email.trim()) {
				toast.error("Email is required.");
				return;
			}
			if (!form.hierarchyScopeId) {
				toast.error("Hierarchy scope is required.");
				return;
			}
		}
		onSubmit(form, trainer?.id ?? null);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<DialogContent
				hideCloseButton
				className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden flex flex-col max-h-[90vh]"
			>
				{/* ── Header ──────────────────────────────────────────────────── */}
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5] shrink-0">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						TRAINER DIRECTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{isEditing ? "Edit Trainer" : "Add Trainer"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{isEditing
							? "Update this trainer's profile information."
							: "Add an existing user as a trainer in this organisation."}
					</DialogDescription>
				</DialogHeader>

				{/* ── Scrollable form body ─────────────────────────────────────── */}
				<form
					onSubmit={handleSubmit}
					className="flex flex-col gap-5 px-6 pt-4 pb-2 overflow-y-auto flex-1"
				>
					{/* ── Account (create only) ─────────────────────────────────── */}
					{!isEditing && (
						<>
							<SectionHeading label="Account" />

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="trainer-email">
									Email <span className="text-rose-600">*</span>
								</Label>
								<Input
									id="trainer-email"
									type="email"
									placeholder="trainer@example.com"
									value={form.email}
									onChange={(e) =>
										setForm((f) => ({ ...f, email: e.target.value }))
									}
									required
									autoComplete="off"
								/>
								<p className="text-xs text-[#737373]">
									The user must already be registered in the system.
								</p>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="trainer-scope">
									Hierarchy Scope <span className="text-rose-600">*</span>
								</Label>
								<Select
									value={form.hierarchyScopeId}
									onValueChange={(v) =>
										setForm((f) => ({ ...f, hierarchyScopeId: v }))
									}
								>
									<SelectTrigger id="trainer-scope">
										<SelectValue placeholder="Select a location..." />
									</SelectTrigger>
									<SelectContent>
										{hierarchyNodes.length === 0 ? (
											<SelectItem value="" disabled>
												No nodes available
											</SelectItem>
										) : (
											hierarchyNodes.map((node) => (
												<SelectItem key={node.id} value={node.id}>
													<span style={{ paddingLeft: `${node.depth * 12}px` }}>
														{node.name}
														<span className="ml-1 text-xs text-[#737373] capitalize">
															({node.type})
														</span>
													</span>
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
							</div>
						</>
					)}

					{/* ── Profile ──────────────────────────────────────────────── */}
					<Collapsible
						open={profileSectionOpen}
						onOpenChange={setProfileSectionOpen}
					>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center justify-between"
							>
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] pb-2 border-b border-[#e5e5e5] flex-1 text-left">
									Profile
								</p>
								<ChevronDown
									className={cn(
										"size-4 text-[#737373] transition-transform duration-200 ml-2 shrink-0",
										profileSectionOpen && "rotate-180",
									)}
								/>
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent className="flex flex-col gap-4 pt-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="trainer-display-name">Display Name</Label>
								<Input
									id="trainer-display-name"
									placeholder="Public-facing name (e.g. Coach Alex)"
									value={form.displayName}
									onChange={(e) =>
										setForm((f) => ({ ...f, displayName: e.target.value }))
									}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="trainer-specialization">Specialization</Label>
								<Input
									id="trainer-specialization"
									placeholder="e.g. Strength & Conditioning"
									value={form.specialization}
									onChange={(e) =>
										setForm((f) => ({ ...f, specialization: e.target.value }))
									}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="trainer-phone">Phone Number</Label>
								<Input
									id="trainer-phone"
									type="tel"
									placeholder="+60 12-345 6789"
									value={form.phoneNumber}
									onChange={(e) =>
										setForm((f) => ({ ...f, phoneNumber: e.target.value }))
									}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="trainer-bio">Bio</Label>
								<Textarea
									id="trainer-bio"
									placeholder="A short description of the trainer..."
									rows={3}
									value={form.bio}
									onChange={(e) =>
										setForm((f) => ({ ...f, bio: e.target.value }))
									}
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="trainer-certs">Certifications</Label>
								<Input
									id="trainer-certs"
									placeholder="e.g. ACE, NASM, CrossFit L2"
									value={form.certifications}
									onChange={(e) =>
										setForm((f) => ({ ...f, certifications: e.target.value }))
									}
								/>
								<p className="text-xs text-[#737373]">
									Separate multiple certifications with commas.
								</p>
							</div>
						</CollapsibleContent>
					</Collapsible>

					{/* ── Availability (edit only) ─────────────────────────────── */}
					{isEditing && (
						<Collapsible
							open={availabilitySectionOpen}
							onOpenChange={setAvailabilitySectionOpen}
						>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex w-full items-center justify-between"
								>
									<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] pb-2 border-b border-[#e5e5e5] flex-1 text-left">
										Weekly Availability
									</p>
									<ChevronDown
										className={cn(
											"size-4 text-[#737373] transition-transform duration-200 ml-2 shrink-0",
											availabilitySectionOpen && "rotate-180",
										)}
									/>
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="pt-3">
								<TrainerAvailabilityEditor
									organizationId={organizationId}
									trainerId={trainer.id}
									onSaved={() => toast.success("Availability saved")}
								/>
							</CollapsibleContent>
						</Collapsible>
					)}

					{/* ── Services (edit only) ─────────────────────────────────── */}
					{isEditing && (
						<TrainerServicesSection
							organizationId={organizationId}
							memberId={trainer.id}
							isOpen={servicesSectionOpen}
							onOpenChange={setServicesSectionOpen}
						/>
					)}

					{/* ── Commissions (edit only) ──────────────────────────────── */}
					{isEditing && (
						<TrainerCommissionsSection
							organizationId={organizationId}
							trainerUserId={trainer.userId}
							isOpen={commissionsSectionOpen}
							onOpenChange={setCommissionsSectionOpen}
						/>
					)}

					{/* spacer so content doesn't sit flush against footer */}
					<div className="pb-2" />
				</form>

				{/* ── Sticky footer ────────────────────────────────────────────── */}
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2 shrink-0">
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						disabled={isMutating}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={isMutating}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isMutating
							? "Saving…"
							: isEditing
								? "Save Changes"
								: "Add Trainer"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
