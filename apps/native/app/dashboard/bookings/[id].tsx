import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Combined dummy data for all bookings (upcoming and past)
const allBookings = [
	{
		id: 1,
		type: "upcoming",
		serviceName: "Personal Training",
		date: "March 15, 2024",
		time: "2:00 PM",
		location: "Downtown Studio",
		trainer: "Sarah Johnson",
		imageUrl:
			"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop",
		duration: "60 minutes",
		status: "Confirmed",
		bookingId: "BK-2024-001",
		price: 75,
		priceUnit: "session",
		description:
			"One-on-one personal training session with a certified trainer. Focus on strength building and personalized workout plan.",
	},
	{
		id: 2,
		type: "upcoming",
		serviceName: "HIIT Class",
		date: "March 20, 2024",
		time: "10:00 AM",
		location: "Westside Gym",
		studio: "PowerFit Studio",
		imageUrl:
			"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop",
		duration: "45 minutes",
		status: "Confirmed",
		bookingId: "BK-2024-002",
		price: 25,
		priceUnit: "class",
		description:
			"High-intensity interval training class designed to maximize calorie burn and improve cardiovascular fitness.",
	},
	{
		id: 3,
		type: "past",
		title: "Yoga Flow",
		date: "March 5, 2024",
		time: "3:00 PM",
		location: "Downtown Studio",
		instructor: "Mindful Movement",
		imageUrl:
			"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=300&fit=crop",
		duration: "60 minutes",
		status: "Completed",
		bookingId: "BK-2024-003",
		price: 20,
		priceUnit: "class",
		description:
			"Gentle yoga flow class focusing on flexibility, balance, and mindfulness. Perfect for all levels.",
	},
	{
		id: 4,
		type: "past",
		title: "Strength Training",
		date: "March 1, 2024",
		time: "11:00 AM",
		location: "Westside Gym",
		instructor: "Mike Chen",
		imageUrl:
			"https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=300&fit=crop",
		duration: "60 minutes",
		status: "Completed",
		bookingId: "BK-2024-004",
		price: 30,
		priceUnit: "class",
		description:
			"Progressive strength training session focusing on building muscle mass and increasing power.",
	},
];

export default function BookingDetailScreen() {
	const navigation = useNavigation();
	const hideTabBarRef = useRef(false);
	const params = useLocalSearchParams<{ id: string }>();
	const bookingId = params.id ? Number.parseInt(params.id, 10) : null;
	const booking = bookingId
		? allBookings.find((b) => b.id === bookingId)
		: null;

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

	if (!booking) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center p-6">
					<Text
						className="mb-2 font-bold text-xl"
						style={{ color: colors.primary[1] }}
					>
						Booking not found
					</Text>
					<TouchableOpacity
						onPress={() => router.back()}
						className="mt-4 rounded-xl px-6 py-3"
						style={{ backgroundColor: "#2563EB" }}
					>
						<Text className="font-semibold text-white">Go Back</Text>
					</TouchableOpacity>
				</View>
			</Container>
		);
	}

	const isUpcoming = booking.type === "upcoming";
	const serviceTitle = booking.serviceName || booking.title;

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header with Back Button */}
				<View className="px-4 pt-4 pb-2">
					<TouchableOpacity
						onPress={() => router.back()}
						className="mb-4 flex-row items-center"
					>
						<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
					</TouchableOpacity>
				</View>

				{/* Booking Image */}
				<View className="mb-4 px-4">
					<Image
						source={{ uri: booking.imageUrl }}
						className="h-64 w-full rounded-2xl"
						resizeMode="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Booking Title and Status */}
					<View className="mb-4 flex-row items-start justify-between">
						<View className="mr-4 flex-1">
							<Text
								className="mb-2 font-bold text-2xl"
								style={{ color: colors.primary[1] }}
							>
								{serviceTitle}
							</Text>
							<Text
								className="mb-1 text-sm"
								style={{ color: colors.secondary[1] }}
							>
								Booking ID: {booking.bookingId}
							</Text>
						</View>
						<View
							className="rounded-full px-3 py-1"
							style={{
								backgroundColor: isUpcoming ? "#DCFCE7" : "#E0E7FF",
							}}
						>
							<Text
								className="font-semibold text-xs"
								style={{
									color: isUpcoming ? "#16A34A" : "#4F46E5",
								}}
							>
								{booking.status}
							</Text>
						</View>
					</View>

					{/* Booking Info Cards */}
					<View className="mb-4 flex-row">
						<View className="mr-2 flex-1 rounded-xl bg-white p-3">
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="calendar-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Date
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{booking.date}
							</Text>
						</View>
						<View className="ml-2 flex-1 rounded-xl bg-white p-3">
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="time-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Time
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{booking.time}
							</Text>
						</View>
					</View>

					<View className="mb-4 flex-row">
						<View className="mr-2 flex-1 rounded-xl bg-white p-3">
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="hourglass-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Duration
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{booking.duration}
							</Text>
						</View>
						<View className="ml-2 flex-1 rounded-xl bg-white p-3">
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="cash-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Price
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								${booking.price} / {booking.priceUnit}
							</Text>
						</View>
					</View>

					{/* Location and Trainer/Instructor */}
					<View className="mb-4 rounded-xl bg-white p-4">
						<View className="mb-3 flex-row items-center">
							<Ionicons
								name="location-outline"
								size={20}
								color={colors.secondary[1]}
							/>
							<Text
								className="ml-2 flex-1 text-sm"
								style={{ color: colors.primary[1] }}
							>
								{booking.location}
							</Text>
						</View>
						{(booking.trainer || booking.instructor) && (
							<View className="flex-row items-center">
								<Ionicons
									name="person-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 flex-1 text-sm"
									style={{ color: colors.primary[1] }}
								>
									{booking.trainer || booking.instructor}
								</Text>
							</View>
						)}
						{booking.studio && (
							<View className="mt-2 flex-row items-center">
								<Ionicons
									name="business-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 flex-1 text-sm"
									style={{ color: colors.primary[1] }}
								>
									{booking.studio}
								</Text>
							</View>
						)}
					</View>

					{/* Description */}
					{booking.description && (
						<View className="mb-4">
							<Text
								className="mb-2 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.secondary[1] }}
							>
								ABOUT
							</Text>
							<Text
								className="text-base leading-6"
								style={{ color: colors.primary[1] }}
							>
								{booking.description}
							</Text>
						</View>
					)}
				</View>
			</ScrollView>

			{/* Action Buttons - Only show for upcoming bookings */}
			{isUpcoming && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-gray-200 border-t bg-white"
				>
					<View className="px-4 py-4">
						<View className="flex-row">
							<TouchableOpacity
								onPress={() => {
									// TODO: Implement reschedule functionality
									console.log("Reschedule booking:", booking.id);
								}}
								className="mr-2 flex-1 items-center justify-center rounded-xl bg-white py-4"
								style={{
									borderWidth: 1,
									borderColor: colors.secondary[2],
								}}
							>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									Reschedule
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={() => {
									// TODO: Implement cancel functionality
									console.log("Cancel booking:", booking.id);
								}}
								className="ml-2 flex-1 items-center justify-center rounded-xl bg-white py-4"
								style={{
									borderWidth: 1,
									borderColor: "#EF4444",
								}}
							>
								<Text
									className="font-semibold text-base"
									style={{ color: "#EF4444" }}
								>
									Cancel
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
