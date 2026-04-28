/**
 * useHideTabBar
 *
 * Hides the dashboard's bottom tab bar while a single SCREEN is focused, then
 * restores the tab bar to the same style dashboard/_layout.tsx configures.
 *
 * Use this for screen-level overrides where the parent tab is normally
 * visible (e.g. bookings/[id], explore/[id]). For ENTIRE hidden-tab stacks
 * (book-workout, buy-package, calendar, notifications, packages), declare
 * `tabBarStyle: { display: "none" }` directly on the parent <Tabs.Screen>
 * in dashboard/_layout.tsx instead — that's more reliable and avoids racing
 * with focus events.
 */

import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/colors";

const TAB_ROUTE_NAMES = ["index", "explore", "bookings", "profile"];
const MAX_PARENT_DEPTH = 5;

type TabsNavigator = {
	setOptions?: (opts: { tabBarStyle: Record<string, unknown> }) => void;
	getParent?: () => unknown;
	getState?: () => {
		type?: string;
		routes?: Array<{ name?: string }>;
	};
};

function findTabsNavigator(
	nav: unknown,
	depth = 0,
): TabsNavigator | null {
	if (depth > MAX_PARENT_DEPTH) return null;
	const parent = (nav as { getParent?: () => unknown })?.getParent?.() as
		| TabsNavigator
		| undefined;
	if (!parent) return null;
	try {
		const state = parent?.getState?.();
		if (
			state?.type === "tab" ||
			state?.routes?.some((r) => TAB_ROUTE_NAMES.includes(r.name ?? ""))
		) {
			return parent;
		}
	} catch {
		// keep searching
	}
	return findTabsNavigator(parent, depth + 1);
}

export function useHideTabBar(): void {
	const navigation = useNavigation();
	const insets = useSafeAreaInsets();
	const wasHiddenRef = useRef(false);

	const setTabBar = useCallback(
		(style: Record<string, unknown>) => {
			const tabsNavigator = findTabsNavigator(navigation);
			tabsNavigator?.setOptions?.({ tabBarStyle: style });
		},
		[navigation],
	);

	// Restore style MUST match dashboard/_layout.tsx exactly so the tab bar
	// looks identical when we navigate back. If the dashboard layout changes,
	// update this too.
	const restoreStyle = useCallback(
		() => ({
			backgroundColor: colors.primary[2],
			borderTopColor: colors.secondary[3],
			borderTopWidth: 1,
			paddingBottom: Math.max(insets.bottom, 8),
			paddingTop: 8,
			height: 60 + Math.max(insets.bottom, 8),
			elevation: 0,
			shadowOpacity: 0,
			borderTopLeftRadius: 0,
			borderTopRightRadius: 0,
		}),
		[insets.bottom],
	);

	useFocusEffect(
		useCallback(() => {
			setTabBar({ display: "none" });
			wasHiddenRef.current = true;
			// Re-apply once after a tick — some navigation transitions race
			// with setOptions on first focus.
			const t = setTimeout(() => setTabBar({ display: "none" }), 50);
			return () => {
				clearTimeout(t);
				if (wasHiddenRef.current) {
					wasHiddenRef.current = false;
					setTabBar(restoreStyle());
				}
			};
		}, [setTabBar, restoreStyle]),
	);
}
