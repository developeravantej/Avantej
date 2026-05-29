import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceFormOutput } from "@/features/services/service-form-schema";

const { createSpy, updateSpy, invalidateSpy, listKey } = vi.hoisted(() => ({
	createSpy: vi.fn(),
	updateSpy: vi.fn(),
	invalidateSpy: vi.fn(),
	listKey: ["services", "list"],
}));

vi.mock("@/utils/orpc", () => ({
	client: { services: { create: createSpy, update: updateSpy } },
	orpc: { services: { list: { key: () => listKey } } },
	queryClient: { invalidateQueries: invalidateSpy },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useServiceFormMutation } from "@/features/services/useServiceFormMutation";

const ORG = "org-1";

function wrapper({ children }: { children: React.ReactNode }) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function appointmentValues(
	overrides: Partial<ServiceFormOutput> = {},
): ServiceFormOutput {
	return {
		name: "PT",
		categoryId: "11111111-1111-4111-8111-111111111111",
		sessionDurationMinutes: 60,
		maxAttendees: 1,
		price: 10000, // already cents (schema output)
		sessions: 5,
		taxable: false,
		expirable: false,
		availablePaymentPlans: [],
		schedulingType: "appointment-based",
		...overrides,
	} as ServiceFormOutput;
}

describe("useServiceFormMutation", () => {
	beforeEach(() => {
		createSpy.mockReset().mockResolvedValue({ id: "new-svc" });
		updateSpy.mockReset().mockResolvedValue({ id: "svc-1" });
		invalidateSpy.mockReset();
	});

	it("calls services.create with wire schedulingType 'appointment' for appointment-based", async () => {
		const onClose = vi.fn();
		const { result } = renderHook(
			() =>
				useServiceFormMutation({
					organizationId: ORG,
					mode: "create",
					plansMap: new Map(),
					onClose,
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(appointmentValues());
		});

		expect(updateSpy).not.toHaveBeenCalled();
		expect(createSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: ORG,
				name: "PT",
				price: 10000,
				schedulingType: "appointment",
				durationUnitType: "minutes",
				sessionCount: 5,
				expiryDays: null,
				timePresetConfig: null,
			}),
		);
		expect(onClose).toHaveBeenCalled();
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: listKey });
	});

	it("maps time-preset to wire 'class_slot' and forwards timePresetConfig", async () => {
		const { result } = renderHook(
			() =>
				useServiceFormMutation({
					organizationId: ORG,
					mode: "create",
					plansMap: new Map(),
					onClose: vi.fn(),
				}),
			{ wrapper },
		);

		const cfg = { recurringDays: ["Mon"], timeSlotsPerDay: { Mon: ["09:00"] } };
		await act(async () => {
			await result.current.mutateAsync(
				appointmentValues({
					schedulingType: "time-preset",
					timePresetConfig: cfg,
				} as Partial<ServiceFormOutput>),
			);
		});

		expect(createSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				schedulingType: "class_slot",
				timePresetConfig: cfg,
			}),
		);
	});

	it("calls services.update with the initialData id in edit mode", async () => {
		const { result } = renderHook(
			() =>
				useServiceFormMutation({
					organizationId: ORG,
					mode: "edit",
					initialData: { id: "svc-1" } as never,
					plansMap: new Map(),
					onClose: vi.fn(),
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(appointmentValues());
		});

		expect(createSpy).not.toHaveBeenCalled();
		expect(updateSpy).toHaveBeenCalledWith(
			expect.objectContaining({ id: "svc-1", schedulingType: "appointment" }),
		);
	});

	it("includes installment fields only when a multi-installment plan is selected", async () => {
		const plansMap = new Map([["PLAN_3", { numInstallments: 3 }]]);
		const { result } = renderHook(
			() =>
				useServiceFormMutation({
					organizationId: ORG,
					mode: "create",
					plansMap,
					onClose: vi.fn(),
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(
				appointmentValues({
					availablePaymentPlans: ["PLAN_3"],
					installmentIntervalDays: 14,
					gracePeriodDays: 5,
				}),
			);
		});

		expect(createSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				availablePaymentPlans: ["PLAN_3"],
				installmentIntervalDays: 14,
				gracePeriodDays: 5,
			}),
		);
	});

	it("omits installment interval when only single-installment plans are selected", async () => {
		const plansMap = new Map([["PLAN_1", { numInstallments: 1 }]]);
		const { result } = renderHook(
			() =>
				useServiceFormMutation({
					organizationId: ORG,
					mode: "create",
					plansMap,
					onClose: vi.fn(),
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(
				appointmentValues({
					availablePaymentPlans: ["PLAN_1"],
					installmentIntervalDays: 14,
				}),
			);
		});

		const arg = createSpy.mock.calls[0][0];
		expect(arg.installmentIntervalDays).toBeUndefined();
		expect(arg.gracePeriodDays).toBeNull();
	});
});
