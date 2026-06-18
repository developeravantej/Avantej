import { Mail, Phone, Edit, Users, Award } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { TrainerRow } from "./TrainerCard";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
	trainer: TrainerRow | null;
	onClose: () => void;
	onEdit: (trainer: TrainerRow) => void;
	onSuspend: (memberId: string) => void;
	onReactivate: (memberId: string) => void;
	isMutating: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
	return name
		.split(" ")
		.flatMap((p) => (p[0] ? [p[0]] : []))
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TrainerDetailDialog({
	trainer,
	onClose,
	onEdit,
	onSuspend,
	onReactivate,
	isMutating,
}: Props) {
	if (!trainer) return null;

	const initials = getInitials(trainer.displayName ?? trainer.name);
	const isActive = trainer.status === "active";
	const isSuspended = trainer.status === "suspended";

	return (
		<Dialog
			open={trainer !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				{/* Header */}
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<div className="flex items-start gap-4">
						<div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-secondary-2 text-brand-primary-1 text-xl font-bold">
							{initials}
						</div>
						<div className="flex-1 min-w-0 pt-1">
							<div className="p-0 space-y-0">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									TRAINER DIRECTORY
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									{trainer.displayName ?? trainer.name}
								</DialogTitle>
								{trainer.specialization && (
									<DialogDescription className="text-sm text-[#737373] mt-0.5">
										{trainer.specialization}
									</DialogDescription>
								)}
							</div>
							<div className="mt-2">
								<StatusBadge
									status={isActive ? "active" : "inactive"}
									label={
										isActive
											? "Active"
											: isSuspended
												? "Suspended"
												: trainer.status
									}
									className="text-xs"
								/>
							</div>
						</div>
					</div>
				</DialogHeader>

				{/* Detail rows */}
				<div className="px-6 pt-4 pb-2 overflow-y-auto space-y-1 bg-white">
					<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
							<Mail className="size-3.5 text-[#737373]" />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-[11px] text-[#737373] font-medium">Email</p>
							<p className="text-sm text-foreground font-medium">
								{trainer.email}
							</p>
						</div>
					</div>
					{trainer.phoneNumber && (
						<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
								<Phone className="size-3.5 text-[#737373]" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-[11px] text-[#737373] font-medium">Phone</p>
								<p className="text-sm text-foreground font-medium">
									{trainer.phoneNumber}
								</p>
							</div>
						</div>
					)}
					{trainer.bio && (
						<div className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
								<Users className="size-3.5 text-[#737373]" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-[11px] text-[#737373] font-medium">Bio</p>
								<p className="text-sm text-foreground leading-relaxed">
									{trainer.bio}
								</p>
							</div>
						</div>
					)}
					{trainer.certifications && trainer.certifications.length > 0 && (
						<div className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors">
							<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-secondary-3">
								<Award className="size-3.5 text-[#737373]" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-[11px] text-[#737373] font-medium">
									Certifications
								</p>
								<div className="flex flex-wrap gap-1.5 mt-1">
									{trainer.certifications.map((cert) => (
										<span
											key={cert}
											className="inline-flex items-center rounded-full bg-brand-secondary-3 px-2.5 py-0.5 text-xs text-foreground font-medium"
										>
											{cert}
										</span>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Footer actions */}
				<div className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<button
						type="button"
						onClick={() => {
							onClose();
							onEdit(trainer);
						}}
						className="flex items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] px-4 py-2.5 text-sm font-medium text-[#737373] hover:bg-accent transition-colors"
					>
						<Edit className="size-3.5" />
						Edit Profile
					</button>
					{isActive && (
						<button
							type="button"
							onClick={() => {
								onClose();
								onSuspend(trainer.id);
							}}
							disabled={isMutating}
							className="flex items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] px-4 py-2.5 text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
						>
							Suspend
						</button>
					)}
					{isSuspended && (
						<button
							type="button"
							onClick={() => {
								onClose();
								onReactivate(trainer.id);
							}}
							disabled={isMutating}
							className="flex items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] px-4 py-2.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
						>
							Reactivate
						</button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
