import { createContext, useCallback, use, useMemo, useState, type ReactNode } from "react";

export interface BookingFlowState {
	packageInstanceId: string | null;
	packageName: string | null;
	categoryId: string | null;
	categoryName: string | null;
	serviceId: string | null;
	serviceName: string | null;
	serviceType: "private" | "semi-private" | "semi_private";
	schedulingType: "appointment" | "class_slot" | null;
	timePresetConfig: {
		recurringDays: string[];
		timeSlotsPerDay: Record<string, string[]>;
	} | null;
	serviceDuration: number | null;
	trainerId: string | null;
	trainerName: string | null;
	date: string | null;
	startTime: string | null;
	duration: number | null;
	classSlotId: string | null;
	branchId: string | null;
	branchName: string | null;
}

const initialState: BookingFlowState = {
	packageInstanceId: null,
	packageName: null,
	categoryId: null,
	categoryName: null,
	serviceId: null,
	serviceName: null,
	serviceType: "private",
	schedulingType: null,
	timePresetConfig: null,
	serviceDuration: null,
	trainerId: null,
	trainerName: null,
	date: null,
	startTime: null,
	duration: null,
	classSlotId: null,
	branchId: null,
	branchName: null,
};

interface BookingFlowContextValue {
	state: BookingFlowState;
	update: (partial: Partial<BookingFlowState>) => void;
	reset: () => void;
}

const BookingFlowContext = createContext<BookingFlowContextValue | null>(null);

export function BookingFlowProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<BookingFlowState>(initialState);

	const update = useCallback((partial: Partial<BookingFlowState>) => {
		setState((prev) => ({ ...prev, ...partial }));
	}, []);

	const reset = useCallback(() => {
		setState(initialState);
	}, []);

	const value = useMemo(() => ({ state, update, reset }), [state, update, reset]);

	return (
		<BookingFlowContext.Provider value={value}>
			{children}
		</BookingFlowContext.Provider>
	);
}

export function useBookingFlow() {
	const context = use(BookingFlowContext);
	if (!context) {
		throw new Error("useBookingFlow must be used within a BookingFlowProvider");
	}
	return context;
}
