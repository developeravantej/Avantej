import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from "react";

export interface PurchaseFlowState {
	// Step 1 - Setup
	categoryId: string | null;
	categoryName: string | null;
	serviceId: string | null;
	serviceName: string | null;
	serviceType: "private" | "semi_private" | null;
	packageId: string | null;
	packageName: string | null;
	creditsTotal: number | null;
	price: number | null;
	validityDays: number | null;
	// Step 2 - Schedule
	preferredTimes: Array<{ day: string; time: string }>;
	// Step 3 - Info
	remark: string | null;
	// Step 5 - Sign
	signature: string | null;
	termsAgreed: boolean;
	termsAgreedAt: string | null;
	// Step 6 - Pay
	paymentMethod: string | null;
	// Result
	packageInstanceId: string | null;
}

const initialState: PurchaseFlowState = {
	categoryId: null,
	categoryName: null,
	serviceId: null,
	serviceName: null,
	serviceType: null,
	packageId: null,
	packageName: null,
	creditsTotal: null,
	price: null,
	validityDays: null,
	preferredTimes: [],
	remark: null,
	signature: null,
	termsAgreed: false,
	termsAgreedAt: null,
	paymentMethod: null,
	packageInstanceId: null,
};

interface PurchaseFlowContextValue {
	state: PurchaseFlowState;
	update: (partial: Partial<PurchaseFlowState>) => void;
	reset: () => void;
}

const PurchaseFlowContext = createContext<PurchaseFlowContextValue | null>(null);

export function PurchaseFlowProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<PurchaseFlowState>(initialState);

	const update = useCallback((partial: Partial<PurchaseFlowState>) => {
		setState((prev) => ({ ...prev, ...partial }));
	}, []);

	const reset = useCallback(() => {
		setState(initialState);
	}, []);

	const value = useMemo(
		() => ({ state, update, reset }),
		[state, update, reset],
	);

	return (
		<PurchaseFlowContext.Provider value={value}>
			{children}
		</PurchaseFlowContext.Provider>
	);
}

export function usePurchaseFlow() {
	const context = useContext(PurchaseFlowContext);
	if (!context) {
		throw new Error(
			"usePurchaseFlow must be used within a PurchaseFlowProvider",
		);
	}
	return context;
}
