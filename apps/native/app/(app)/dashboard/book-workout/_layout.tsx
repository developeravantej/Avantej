import { Stack } from "expo-router";
import { BookingFlowProvider } from "@/contexts/booking-flow-context";

// Tab bar is hidden via tabBarStyle on the parent <Tabs.Screen name="book-workout">
// in dashboard/_layout.tsx — no dynamic hide needed here.
export default function BookWorkoutLayout() {
	return (
		<BookingFlowProvider>
			<Stack
				screenOptions={{
					headerShown: false,
				}}
			>
				<Stack.Screen name="book-workout" />
				<Stack.Screen name="schedule" />
				<Stack.Screen name="review" />
				<Stack.Screen name="done" />
			</Stack>
		</BookingFlowProvider>
	);
}
