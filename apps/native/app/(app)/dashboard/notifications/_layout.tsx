import { Stack } from "expo-router";

// Tab bar is hidden via tabBarStyle on the parent <Tabs.Screen name="notifications">
// in dashboard/_layout.tsx.
export default function NotificationsLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
			}}
		>
			<Stack.Screen name="index" />
		</Stack>
	);
}
