import type React from "react";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";

export const Container = ({ children }: { children: React.ReactNode }) => {
	return (
		<SafeAreaView className="flex-1 bg-background">{children}</SafeAreaView>
	);
};

const TAB_BAR_BASE_HEIGHT = 60;

/**
 * Tab bar height for dashboard (matches dashboard _layout.tsx).
 * Use with ScrollView contentContainerStyle paddingBottom so content isn't hidden under the tab bar.
 */
export function useTabBarHeight(): number {
	const { bottom: insetBottom } = useSafeAreaInsets();
	return TAB_BAR_BASE_HEIGHT + Math.max(insetBottom, 8);
}

/**
 * Use inside dashboard tab screens (Home, Explore, Bookings, Profile) so content
 * extends to the tab bar with no strip. Safe area applied only to top/sides.
 * Add paddingBottom: useTabBarHeight() (or 8 + useTabBarHeight()) to your ScrollView contentContainerStyle.
 */
export function TabContainer({ children }: { children: React.ReactNode }) {
	return (
		<SafeAreaView
			edges={["top", "left", "right"]}
			className="flex-1 bg-background"
		>
			{children}
		</SafeAreaView>
	);
}
