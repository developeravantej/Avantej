import { Stack } from "expo-router";
import { useCallback } from "react";

export default function ExploreLayout() {
	// Helper function to find Tabs navigator
	const findTabsNavigator = useCallback((nav: unknown, depth = 0): unknown => {
		if (depth > 5) return null;
		const parent = (nav as { getParent?: () => unknown })?.getParent?.();
		if (!parent) return null;
		try {
			const state = (
				parent as {
					getState?: () => {
						type?: string;
						routes?: Array<{ name?: string }>;
					};
				}
			)?.getState?.();
			if (
				state?.type === "tab" ||
				state?.routes?.some(
					(r) =>
						r.name === "index" ||
						r.name === "explore" ||
						r.name === "bookings" ||
						r.name === "profile",
				)
			) {
				return parent;
			}
		} catch {
			// Continue searching
		}
		return findTabsNavigator(parent, depth + 1);
	}, []);

	// Hide tab bar when any screen in this stack is focused (except index)
	// The index screen will show the tab bar since it's the main explore tab
	useFocusEffect(
		useCallback(() => {
			// Only hide if we're not on the index route
			// This will be handled per-screen, so we don't hide here for index
			return () => {
				// Don't restore here - only when completely leaving the stack
			};
		}, []),
	);

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
