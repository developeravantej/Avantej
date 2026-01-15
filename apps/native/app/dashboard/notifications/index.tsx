import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Dummy notification data
const notifications = [
	{
		id: 1,
		type: "booking",
		title: "Booking Confirmed",
		message:
			"Your Personal Training session on March 15 at 2:00 PM has been confirmed",
		time: "2 hours ago",
		read: false,
		icon: "checkmark-circle",
		color: "#16A34A",
	},
	{
		id: 2,
		type: "reminder",
		title: "Upcoming Session",
		message: "You have a HIIT Class scheduled for tomorrow at 10:00 AM",
		time: "5 hours ago",
		read: false,
		icon: "time",
		color: "#2563EB",
	},
	{
		id: 3,
		type: "promotion",
		title: "Special Offer",
		message: "Get 20% off on your next booking. Limited time only!",
		time: "1 day ago",
		read: true,
		icon: "gift",
		color: "#DC2626",
	},
	{
		id: 4,
		type: "system",
		title: "Profile Updated",
		message: "Your profile information has been successfully updated",
		time: "2 days ago",
		read: true,
		icon: "person",
		color: colors.secondary[1],
	},
	{
		id: 5,
		type: "booking",
		title: "Class Reminder",
		message: "Don't forget your Yoga Flow class today at 3:00 PM",
		time: "3 days ago",
		read: true,
		icon: "calendar",
		color: "#7C3AED",
	},
	{
		id: 6,
		type: "system",
		title: "Welcome!",
		message: "Welcome to Avantej! Start your fitness journey today",
		time: "1 week ago",
		read: true,
		icon: "star",
		color: "#F59E0B",
	},
];

export default function NotificationsScreen() {
	const navigation = useNavigation();
	const hideTabBarRef = useRef(false);
	const [notificationList, setNotificationList] = useState(notifications);

	const unreadCount = notificationList.filter((n) => !n.read).length;

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

	const hideTabBar = useCallback(() => {
		const tabsNavigator = findTabsNavigator(navigation);
		if (tabsNavigator) {
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

	// Hide tab bar when screen is focused
	useFocusEffect(
		useCallback(() => {
			hideTabBar();
			const timer = setTimeout(() => {
				hideTabBar();
			}, 50);
			return () => {
				clearTimeout(timer);
				showTabBar();
			};
		}, [hideTabBar, showTabBar]),
	);

	// Also hide on mount
	useEffect(() => {
		hideTabBar();
		const timer = setTimeout(() => {
			hideTabBar();
		}, 100);
		return () => {
			clearTimeout(timer);
			showTabBar();
		};
	}, [hideTabBar, showTabBar]);

	const markAsRead = (id: number) => {
		setNotificationList((prev) =>
			prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif)),
		);
	};

	const markAllAsRead = () => {
		setNotificationList((prev) =>
			prev.map((notif) => ({ ...notif, read: true })),
		);
	};

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				<View className="px-4 pt-4">
					{/* Header */}
					<View className="mb-6 flex-row items-center justify-between">
						<View className="flex-row items-center">
							<TouchableOpacity onPress={() => router.back()} className="mr-4">
								<Ionicons
									name="arrow-back"
									size={24}
									color={colors.primary[1]}
								/>
							</TouchableOpacity>
							<Text
								className="font-bold text-2xl"
								style={{ color: colors.primary[1] }}
							>
								Notifications
							</Text>
							{unreadCount > 0 && (
								<View
									className="ml-2 rounded-full px-2 py-1"
									style={{ backgroundColor: "#2563EB" }}
								>
									<Text className="font-semibold text-white text-xs">
										{unreadCount}
									</Text>
								</View>
							)}
						</View>
						{unreadCount > 0 && (
							<TouchableOpacity onPress={markAllAsRead}>
								<Text
									className="font-medium text-sm"
									style={{ color: "#2563EB" }}
								>
									Mark all read
								</Text>
							</TouchableOpacity>
						)}
					</View>

					{/* Notifications List */}
					{notificationList.length === 0 ? (
						<View className="items-center justify-center py-20">
							<Ionicons
								name="notifications-off-outline"
								size={64}
								color={colors.secondary[1]}
							/>
							<Text
								className="mt-4 font-semibold text-lg"
								style={{ color: colors.secondary[1] }}
							>
								No notifications
							</Text>
						</View>
					) : (
						notificationList.map((notification) => (
							<TouchableOpacity
								key={notification.id}
								onPress={() => markAsRead(notification.id)}
								className={`mb-3 rounded-2xl bg-white p-4 shadow-sm ${
									!notification.read ? "border-l-4" : ""
								}`}
								style={{
									borderLeftColor: !notification.read
										? "#2563EB"
										: "transparent",
									borderLeftWidth: !notification.read ? 4 : 0,
									opacity: notification.read ? 0.7 : 1,
								}}
							>
								<View className="flex-row">
									{/* Icon */}
									<View
										className="mr-3 h-12 w-12 items-center justify-center rounded-full"
										style={{
											backgroundColor: `${notification.color}20`,
										}}
									>
										<Ionicons
											name={notification.icon as never}
											size={24}
											color={notification.color}
										/>
									</View>

									{/* Content */}
									<View className="flex-1">
										<View className="mb-1 flex-row items-start justify-between">
											<Text
												className="flex-1 font-bold text-base"
												style={{ color: colors.primary[1] }}
											>
												{notification.title}
											</Text>
											{!notification.read && (
												<View
													className="ml-2 h-2 w-2 rounded-full"
													style={{ backgroundColor: "#2563EB" }}
												/>
											)}
										</View>
										<Text
											className="mb-2 text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{notification.message}
										</Text>
										<Text
											className="text-xs"
											style={{ color: colors.secondary[1] }}
										>
											{notification.time}
										</Text>
									</View>
								</View>
							</TouchableOpacity>
						))
					)}
				</View>
			</ScrollView>
		</Container>
	);
}
