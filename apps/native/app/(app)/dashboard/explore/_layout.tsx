import { Stack } from "expo-router";

// Note: explore is a tab root — the tab bar should stay visible on the index
// list. Only the detail screen (`[id].tsx`) hides it via useHideTabBar().
export default function ExploreLayout() {
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
