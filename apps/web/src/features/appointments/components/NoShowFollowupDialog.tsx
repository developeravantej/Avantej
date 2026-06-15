import { Loader2, Undo2, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";

/**
 * Shown right after a session is marked no-show. Offers to reinstate the package
 * credit and book a replacement session in one step (Journey D). The original
 * appointment stays no-show; reinstate returns the credit, then the caller opens
 * the single-slot scheduler funded by that credit.
 */
export function NoShowFollowupDialog({
	appointmentId,
	organizationId,
	onClose,
	onReinstated,
}: {
	appointmentId: string | null;
	organizationId: string;
	onClose: () => void;
	/** Called with the package instance whose credit was reinstated. */
	onReinstated: (packageInstanceId: string) => void;
}) {
	const reinstate = useApiMutation({
		mutationFn: () =>
			client.appointments.reinstateCredits({
				organizationId,
				appointmentId: appointmentId!,
				reason: "No-show — credit reinstated for replacement session",
			}),
		successMessage: "Credit reinstated.",
		errorMessage: (err) => err.message || "Failed to reinstate credit",
		invalidate: [orpc.appointments.list.key(), orpc.packageInstances.key()],
		onSuccess: (res) => {
			if (res.packageInstanceId) {
				onReinstated(res.packageInstanceId);
			} else {
				onClose();
			}
		},
	});

	return (
		<Dialog open={appointmentId !== null} onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						APPOINTMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Client didn't attend
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Reinstate the package credit and book a replacement session?
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-2 py-1">
						<button
							type="button"
							disabled={reinstate.isPending}
							onClick={() => reinstate.mutate()}
							className="group flex items-center gap-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-all hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 group-hover:bg-emerald-100">
								{reinstate.isPending ? (
									<Loader2 className="h-4.5 w-4.5 animate-spin text-gray-400" />
								) : (
									<Undo2 className="h-4.5 w-4.5 text-gray-400 group-hover:text-emerald-600" />
								)}
							</div>
							<div>
								<p className="text-sm font-semibold text-gray-900">
									Reinstate &amp; reschedule
								</p>
								<p className="text-xs text-gray-400 mt-0.5">
									Return the credit and book a replacement
								</p>
							</div>
						</button>

						<button
							type="button"
							disabled={reinstate.isPending}
							onClick={onClose}
							className="group flex items-center gap-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-all hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
								<X className="h-4.5 w-4.5 text-gray-400" />
							</div>
							<div>
								<p className="text-sm font-semibold text-gray-900">
									Just mark no-show
								</p>
								<p className="text-xs text-gray-400 mt-0.5">
									Keep the credit consumed, no replacement
								</p>
							</div>
						</button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
