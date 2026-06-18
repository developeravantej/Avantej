/**
 * Create/update mutation for the service form.
 * Extracted from service-form so the wire-mapping logic
 * (expiry-days computation, installment-plan gating) is isolated and testable.
 */

import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import {
	type ServiceFormOutput,
	type ServiceInitialData,
	toExpiryDays,
} from "./service-form-schema";

/** Minimal shape consumed from an installment plan to decide gating. */
type PlanLike = { numInstallments?: number | null };

interface UseServiceFormMutationParams {
	organizationId: string;
	mode: "create" | "edit";
	initialData?: ServiceInitialData;
	/** Active installment plans keyed by code — used to detect multi-installment plans. */
	plansMap: Map<string, PlanLike>;
	onClose: () => void;
}

export function useServiceFormMutation({
	organizationId,
	mode,
	initialData,
	plansMap,
	onClose,
}: UseServiceFormMutationParams) {
	return useApiMutation({
		mutationFn: (values: ServiceFormOutput) => {
			const hasInstallmentPlan = values.availablePaymentPlans.some(
				(code) => (plansMap.get(code)?.numInstallments ?? 1) > 1,
			);

			const commonFields = {
				organizationId,
				name: values.name,
				categoryId: values.categoryId || null,
				duration: values.sessionDurationMinutes,
				durationUnitType: "minutes" as const,
				maxAttendees: values.maxAttendees ?? 1,
				attendanceThreshold: null,
				branchId: undefined,
				isActive: true,
				price: values.price != null ? values.price : null,
				taxable: values.taxable,
				taxPercentage: values.taxable
					? Math.round(values.taxPercentage ?? 0)
					: 0,
				sessionCount: values.sessions > 0 ? values.sessions : null,
				expirable: values.expirable,
				expiryDays:
					values.expirable && values.duration
						? toExpiryDays(values.duration, values.duration_unit ?? "day")
						: null,
				availablePaymentPlans:
					values.availablePaymentPlans.length > 0
						? values.availablePaymentPlans
						: undefined,
				installmentIntervalDays: hasInstallmentPlan
					? values.installmentIntervalDays
					: undefined,
				gracePeriodDays: hasInstallmentPlan ? values.gracePeriodDays : null,
				timePresetConfig: values.timePresetConfig ?? null,
			};

			if (mode === "edit") {
				return client.services.update({
					...commonFields,
					id: initialData!.id,
				});
			}
			return client.services.create(commonFields);
		},
		successMessage:
			mode === "create"
				? "Service created successfully"
				: "Service updated successfully",
		errorMessage: (err) => err?.message || "Failed to save service",
		invalidate: [orpc.services.list.key()],
		onSuccess: () => onClose(),
	});
}
