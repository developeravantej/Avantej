import { Stack } from "expo-router";
import { PurchaseFlowProvider } from "@/contexts/purchase-flow-context";

// Tab bar is hidden via tabBarStyle on the parent <Tabs.Screen name="buy-package">
// in dashboard/_layout.tsx — no dynamic hide needed here.
export default function BuyPackageLayout() {
	return (
		<PurchaseFlowProvider>
			<Stack
				screenOptions={{
					headerShown: false,
				}}
			>
				<Stack.Screen name="setup" />
				<Stack.Screen name="trainer" />
				<Stack.Screen name="schedule" />
				<Stack.Screen name="info" />
				<Stack.Screen name="plan" />
				<Stack.Screen name="review" />
				<Stack.Screen name="sign" />
				<Stack.Screen name="terms" />
				<Stack.Screen name="pay" />
				<Stack.Screen name="done" />
			</Stack>
		</PurchaseFlowProvider>
	);
}
