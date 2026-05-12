import { Stack } from "expo-router";

// Tab bar is hidden via tabBarStyle on the parent <Tabs.Screen name="packages">
// in dashboard/_layout.tsx.
export default function PackagesLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
			}}
		>
			<Stack.Screen name="index" />
			<Stack.Screen name="[id]" />
		</Stack>
	);
}
