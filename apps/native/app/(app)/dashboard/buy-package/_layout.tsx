import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { PurchaseFlowProvider } from "@/contexts/purchase-flow-context";
import { colors } from "@/lib/colors";

export default function BuyPackageLayout() {
	const navigation = useNavigation();
	const hideTabBarRef = useRef(false);

	// Helper function to find Tabs navigator
	const findTabsNavigator = useCallback((nav: unknown, depth = 0): unknown => {
		if (depth > 5) return null;
		const parent = (nav as { getParent?: () => unknown })?.getParent?.();
		if (!parent) return null;
		try {
			const state = (
				parent as {
					getState?: () => { type?: string; routes?: Array<{ name?: string }> };
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

	const hideTabBar = useCallback(() => {
		const tabsNavigator = findTabsNavigator(navigation);
		if (tabsNavigator && !hideTabBarRef.current) {
			hideTabBarRef.current = true;
			(
				tabsNavigator as {
					setOptions?: (options: { tabBarStyle: { display: string } }) => void;
				}
			)?.setOptions?.({
				tabBarStyle: { display: "none" },
			});
		}
	}, [navigation, findTabsNavigator]);

	const showTabBar = useCallback(() => {
		const tabsNavigator = findTabsNavigator(navigation);
		if (tabsNavigator && hideTabBarRef.current) {
			hideTabBarRef.current = false;
			(
				tabsNavigator as {
					setOptions?: (options: {
						tabBarStyle: {
							backgroundColor: string;
							borderTopColor: string;
							borderTopWidth: number;
							height: number;
							paddingBottom: number;
							paddingTop: number;
						};
					}) => void;
				}
			)?.setOptions?.({
				tabBarStyle: {
					backgroundColor: colors.primary[2],
					borderTopColor: colors.secondary[3],
					borderTopWidth: 1,
					height: 80,
					paddingBottom: 8,
					paddingTop: 8,
				},
			});
		}
	}, [navigation, findTabsNavigator]);

	// Hide tab bar when any screen in this stack is focused
	useFocusEffect(
		useCallback(() => {
			hideTabBar();
			return () => {
				// Don't restore here - only when completely leaving the stack
			};
		}, [hideTabBar]),
	);

	// Also hide on mount and set up navigation listener
	useEffect(() => {
		hideTabBar();

		const unsubscribe = navigation.addListener("state", () => {
			hideTabBar();
		});

		return () => {
			unsubscribe();
			showTabBar();
		};
	}, [navigation, hideTabBar, showTabBar]);

	return (
		<PurchaseFlowProvider>
			<Stack
				screenOptions={{
					headerShown: false,
				}}
			>
				<Stack.Screen name="setup" />
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
