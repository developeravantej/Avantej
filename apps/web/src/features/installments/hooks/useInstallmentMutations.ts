import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import type { Installment, InstallmentOverviewItem } from "../types";

interface UseInstallmentMutationsOptions {
	organizationId: string | null;
	selectedInstance: InstallmentOverviewItem | null;
	setSelectedInstance: React.Dispatch<React.SetStateAction<InstallmentOverviewItem | null>>;
	setConfirmInstallment: (v: null) => void;
	resetConfirmForm: () => void;
	setShowUnlockDialog: (v: boolean) => void;
	setUnlockReason: (v: string) => void;
	setShowAdjustCreditsDialog: (v: boolean) => void;
	setAdjustUnlocked: (v: string) => void;
	setAdjustUsed: (v: string) => void;
	setAdjustReason: (v: string) => void;
	setShowOverdraftDialog: (v: boolean) => void;
	setOverdraftReason: (v: string) => void;
	setRescheduleInstallment: (v: Installment | null) => void;
	setWaiveInstallment: (v: Installment | null) => void;
}

export function useInstallmentMutations({
	organizationId,
	selectedInstance,
	setSelectedInstance,
	setConfirmInstallment,
	resetConfirmForm,
	setShowUnlockDialog,
	setUnlockReason,
	setShowAdjustCreditsDialog,
	setAdjustUnlocked,
	setAdjustUsed,
	setAdjustReason,
	setShowOverdraftDialog,
	setOverdraftReason,
	setRescheduleInstallment,
	setWaiveInstallment,
}: UseInstallmentMutationsOptions) {
	const queryClient = useQueryClient();

	const confirmPaymentMutation = useMutation({
		mutationFn: (vars: {
			installmentId: string;
			paymentMethod: string;
			notes?: string;
			nextIntervalDays?: number;
		}) =>
			client.installments.confirmPayment({
				organizationId: organizationId ?? "",
				installmentId: vars.installmentId,
				paymentMethod: vars.paymentMethod as "manual_transfer" | "cash" | "card" | "fpx" | "stripe",
				notes: vars.notes || undefined,
				nextIntervalDays: vars.nextIntervalDays,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			queryClient.invalidateQueries({
				queryKey: ["installments-by-instance", organizationId, selectedInstance?.id],
			});
			toast.success("Payment confirmed successfully.");
			setConfirmInstallment(null);
			resetConfirmForm();
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to confirm payment."),
	});

	const manualUnlockMutation = useMutation({
		mutationFn: (vars: { packageInstanceId: string; reason: string }) =>
			client.installments.manualUnlock({
				organizationId: organizationId ?? "",
				packageInstanceId: vars.packageInstanceId,
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			queryClient.invalidateQueries({
				queryKey: ["installments-by-instance", organizationId, selectedInstance?.id],
			});
			toast.success("Package unlocked successfully.");
			setShowUnlockDialog(false);
			setUnlockReason("");
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to unlock package."),
	});

	const adjustCreditsMutation = useMutation({
		mutationFn: (vars: {
			packageInstanceId: string;
			creditsUnlocked?: number;
			creditsUsed?: number;
			reason: string;
		}) =>
			client.installments.adjustCredits({
				organizationId: organizationId ?? "",
				packageInstanceId: vars.packageInstanceId,
				creditsUnlocked: vars.creditsUnlocked,
				creditsUsed: vars.creditsUsed,
				reason: vars.reason,
			}),
		onSuccess: (updated) => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			setSelectedInstance((prev: any) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
			toast.success("Credits adjusted successfully.");
			setShowAdjustCreditsDialog(false);
			setAdjustUnlocked("");
			setAdjustUsed("");
			setAdjustReason("");
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to adjust credits."),
	});

	const setOverdraftMutation = useMutation({
		mutationFn: (input: {
			organizationId: string;
			packageInstanceId: string;
			enabled: boolean;
			reason: string;
		}) => client.installments.setOverdraft(input),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			toast.success("Overdraft updated");
			setShowOverdraftDialog(false);
			setOverdraftReason("");
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const rescheduleMutation = useMutation({
		mutationFn: (vars: { installmentId: string; newDueDate: string; reason: string }) =>
			client.installments.reschedule({
				organizationId: organizationId ?? "",
				installmentId: vars.installmentId,
				newDueDate: vars.newDueDate,
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			queryClient.invalidateQueries({ queryKey: ["installments-by-instance", organizationId, selectedInstance?.id] });
			toast.success("Installment rescheduled.");
			setRescheduleInstallment(null);
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to reschedule."),
	});

	const waiveMutation = useMutation({
		mutationFn: (vars: { installmentId: string; reason: string }) =>
			client.installments.waive({
				organizationId: organizationId ?? "",
				installmentId: vars.installmentId,
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			queryClient.invalidateQueries({ queryKey: ["installments-by-instance", organizationId, selectedInstance?.id] });
			toast.success("Installment waived.");
			setWaiveInstallment(null);
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to waive."),
	});

	const resetOverrideMutation = useMutation({
		mutationFn: (vars: { packageInstanceId: string; reason: string }) =>
			client.installments.resetOverride({
				organizationId: organizationId ?? "",
				packageInstanceId: vars.packageInstanceId,
				reason: vars.reason,
			}),
		onSuccess: (updated) => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			setSelectedInstance(((prev: any) =>
				prev?.id === (updated as { id?: string })?.id ? { ...prev, ...(updated as object) } : prev) as any,
			);
			toast.success("Credits override reset. Credits will now follow installment formula.");
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to reset credits override."),
	});

	return { confirmPaymentMutation, manualUnlockMutation, adjustCreditsMutation, setOverdraftMutation, rescheduleMutation, waiveMutation, resetOverrideMutation };
}
