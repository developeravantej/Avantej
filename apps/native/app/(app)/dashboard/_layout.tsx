import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { colors } from "@/lib/colors";

export default function DashboardLayout() {
	const insets = useSafeAreaInsets();
	usePushNotifications();

	return (
		<View style={{ flex: 1, backgroundColor: colors.primary[2] }}>
			<Tabs
				screenOptions={{
					headerShown: false,
					sceneStyle: { backgroundColor: colors.primary[2] },
					tabBarActiveTintColor: colors.primary[1], // #000000 - Black for active tab
					tabBarInactiveTintColor: colors.secondary[1], // #8A8F91 - Gray for inactive tabs
					tabBarStyle: {
						backgroundColor: colors.primary[2], // #FFFFFF - White background
						borderTopColor: colors.secondary[3], // #EDEDE4 - Light gray border
						borderTopWidth: 1,
						paddingBottom: Math.max(insets.bottom, 8), // Use safe area bottom or minimum 8px
						paddingTop: 8,
						height: 60 + Math.max(insets.bottom, 8), // Fixed height with safe area
						elevation: 0,
						shadowOpacity: 0,
						borderTopLeftRadius: 0,
						borderTopRightRadius: 0,
					},
					tabBarLabelStyle: {
						fontSize: 12,
						fontWeight: "500",
					},
				}}
			>
				<Tabs.Screen
					name="index"
					options={{
						title: "Home",
						tabBarIcon: ({ color, focused }) => (
							<Ionicons
								name={focused ? "home" : "home-outline"}
								size={24}
								color={color}
							/>
						),
					}}
				/>
				<Tabs.Screen
					name="explore"
					options={{
						title: "Explore",
						tabBarIcon: ({ color, focused }) => (
							<Ionicons
								name={focused ? "compass" : "compass-outline"}
								size={24}
								color={color}
							/>
						),
					}}
				/>
				<Tabs.Screen
					name="bookings"
					options={{
						title: "Bookings",
						tabBarIcon: ({ color, focused }) => (
							<Ionicons
								name={focused ? "calendar" : "calendar-outline"}
								size={24}
								color={color}
							/>
						),
					}}
				/>
				<Tabs.Screen
					name="profile"
					options={{
						title: "Profile",
						tabBarIcon: ({ color, focused }) => (
							<Ionicons
								name={focused ? "person" : "person-outline"}
								size={24}
								color={color}
							/>
						),
					}}
				/>
				{/* Hidden tabs: not in the tab bar, AND hide the tab bar itself
				    while these routes are focused. Declared here (not dynamically
				    via setOptions from a child layout) because the per-screen
				    tabBarStyle override is the most reliable way Expo Router /
				    React Navigation hides the bar — no race conditions, no
				    safe-area drift on return. */}
				<Tabs.Screen
					name="book-workout"
					options={{
						href: null,
						tabBarStyle: { display: "none" },
					}}
				/>
				<Tabs.Screen
					name="notifications"
					options={{
						href: null,
						tabBarStyle: { display: "none" },
					}}
				/>
				<Tabs.Screen
					name="buy-package"
					options={{
						href: null,
						tabBarStyle: { display: "none" },
					}}
				/>
				<Tabs.Screen
					name="packages"
					options={{
						href: null,
						tabBarStyle: { display: "none" },
					}}
				/>
				<Tabs.Screen
					name="calendar"
					options={{
						href: null,
						tabBarStyle: { display: "none" },
					}}
				/>
				<Tabs.Screen
					name="activity"
					options={{
						href: null,
						tabBarStyle: { display: "none" },
					}}
				/>
			</Tabs>
		</View>
	);
}
