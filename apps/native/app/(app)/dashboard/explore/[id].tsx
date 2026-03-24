import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Mock data for services (same as explore.tsx)
const allServices = [
	{
		id: 1,
		name: "Personal Training",
		description:
			"Build strength and consistency with a personalized workout plan tailored to your goals. Our certified trainers will work with you one-on-one to create a program that fits your schedule and helps you achieve your fitness objectives.",
		imageUrl:
			"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop",
		popularityPercentage: 40,
		price: 75,
		priceUnit: "class",
		category: "Training",
		recommended: true,
		duration: "60 minutes",
		location: "Downtown Studio",
		trainer: "Sarah Johnson",
		features: [
			"Personalized workout plan",
			"Nutrition guidance",
			"Progress tracking",
			"Flexible scheduling",
		],
	},
	{
		id: 2,
		name: "HIIT Class",
		description:
			"High-energy group workout focused on fat burning and cardiovascular fitness. This intense interval training session will push your limits and help you achieve maximum results in minimal time.",
		imageUrl:
			"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop",
		popularityPercentage: 35,
		price: 25,
		priceUnit: "class",
		category: "Classes",
		recommended: true,
		duration: "45 minutes",
		location: "Westside Gym",
		features: [
			"High-intensity intervals",
			"Full-body workout",
			"Group motivation",
			"Calorie burning",
		],
	},
	{
		id: 3,
		name: "Yoga Flow",
		description:
			"Improve flexibility, balance, and recovery with this gentle yet invigorating practice. Perfect for all levels, this class combines movement, breathwork, and mindfulness.",
		imageUrl:
			"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&h=300&fit=crop",
		popularityPercentage: 28,
		price: 20,
		priceUnit: "class",
		category: "Yoga",
		recommended: false,
		duration: "60 minutes",
		location: "Downtown Studio",
		features: [
			"Flexibility training",
			"Stress relief",
			"Mind-body connection",
			"All levels welcome",
		],
	},
	{
		id: 4,
		name: "Strength Training",
		description:
			"Build muscle mass and increase power with progressive resistance training. Learn proper form and technique while building functional strength.",
		imageUrl:
			"https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=300&fit=crop",
		popularityPercentage: 32,
		price: 30,
		priceUnit: "class",
		category: "Training",
		recommended: false,
		duration: "60 minutes",
		location: "Westside Gym",
		features: [
			"Progressive overload",
			"Form correction",
			"Muscle building",
			"Equipment training",
		],
	},
	{
		id: 5,
		name: "Cardio Blast",
		description:
			"High-intensity cardio session designed to boost endurance and burn calories. Get your heart rate up with this dynamic workout.",
		imageUrl:
			"https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400&h=300&fit=crop",
		popularityPercentage: 25,
		price: 22,
		priceUnit: "class",
		category: "Cardio",
		recommended: false,
		duration: "45 minutes",
		location: "Westside Gym",
		features: [
			"Cardiovascular fitness",
			"Calorie burning",
			"Endurance building",
			"Dynamic movements",
		],
	},
	{
		id: 6,
		name: "Pilates Core",
		description:
			"Strengthen your core and improve posture with controlled movements. Focus on precision and control for maximum effectiveness.",
		imageUrl:
			"https://images.unsplash.com/photo-1601925260368-ae2f83d8b3d8?w=400&h=300&fit=crop",
		popularityPercentage: 20,
		price: 18,
		priceUnit: "class",
		category: "Pilates",
		recommended: false,
		duration: "50 minutes",
		location: "Downtown Studio",
		features: [
			"Core strengthening",
			"Posture improvement",
			"Controlled movements",
			"Low impact",
		],
	},
	{
		id: 7,
		name: "Boxing Training",
		description:
			"Learn boxing techniques while getting an intense full-body workout. Improve coordination, agility, and cardiovascular fitness.",
		imageUrl:
			"https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400&h=300&fit=crop",
		popularityPercentage: 30,
		price: 35,
		priceUnit: "class",
		category: "Training",
		recommended: false,
		duration: "60 minutes",
		location: "Westside Gym",
		features: [
			"Boxing techniques",
			"Full-body workout",
			"Coordination training",
			"Stress relief",
		],
	},
	{
		id: 8,
		name: "Spin Class",
		description:
			"Indoor cycling class with energizing music and motivating instructors. Push your limits in this high-energy cardio session.",
		imageUrl:
			"https://images.unsplash.com/photo-1576678927484-cc907957088c?w=400&h=300&fit=crop",
		popularityPercentage: 27,
		price: 24,
		priceUnit: "class",
		category: "Cardio",
		recommended: false,
		duration: "45 minutes",
		location: "Westside Gym",
		features: [
			"Indoor cycling",
			"High-energy workout",
			"Music motivation",
			"Low impact",
		],
	},
];

export default function ServiceDetailScreen() {
	const navigation = useNavigation();
	const hideTabBarRef = useRef(false);
	const params = useLocalSearchParams<{ id: string }>();
	const serviceId = params.id ? Number.parseInt(params.id, 10) : null;
	const service = serviceId
		? allServices.find((s) => s.id === serviceId)
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

	if (!service) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center p-6">
					<Text
						className="mb-2 font-bold text-xl"
						style={{ color: colors.primary[1] }}
					>
						Service not found
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

				{/* Service Image */}
				<View className="mb-4 px-4">
					<Image
						source={{ uri: service.imageUrl }}
						className="h-64 w-full rounded-2xl"
						resizeMode="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Service Title and Price */}
					<View className="mb-4 flex-row items-start justify-between">
						<View className="mr-4 flex-1">
							<Text
								className="mb-2 font-bold text-2xl"
								style={{ color: colors.primary[1] }}
							>
								{service.name}
							</Text>
							<Text
								className="mb-1 text-sm"
								style={{ color: colors.secondary[1] }}
							>
								{service.category}
							</Text>
						</View>
						<View className="items-end">
							<View className="flex-row items-baseline">
								<Text
									className="font-bold text-2xl"
									style={{ color: "#2563EB" }}
								>
									${service.price}
								</Text>
								<Text
									className="ml-1 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									/ {service.priceUnit}
								</Text>
							</View>
						</View>
					</View>

					{/* Service Info Cards */}
					<View className="mb-4 flex-row">
						<View className="mr-2 flex-1 rounded-xl bg-white p-3">
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
									Duration
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{service.duration}
							</Text>
						</View>
						<View className="ml-2 flex-1 rounded-xl bg-white p-3">
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="people-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Popularity
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{service.popularityPercentage}% chose this
							</Text>
						</View>
					</View>

					{/* Location and Trainer (if available) */}
					<View className="mb-4 rounded-xl bg-white p-4">
						{service.location && (
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
									{service.location}
								</Text>
							</View>
						)}
						{service.trainer && (
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
									{service.trainer}
								</Text>
							</View>
						)}
					</View>

					{/* Description */}
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
							{service.description}
						</Text>
					</View>

					{/* Features */}
					<View className="mb-4">
						<Text
							className="mb-3 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.secondary[1] }}
						>
							FEATURES
						</Text>
						<View className="rounded-xl bg-white p-4">
							{service.features.map((feature) => (
								<View
									key={feature}
									className="mb-2 flex-row items-center last:mb-0"
								>
									<Ionicons name="checkmark-circle" size={18} color="#2563EB" />
									<Text
										className="ml-2 text-sm"
										style={{ color: colors.primary[1] }}
									>
										{feature}
									</Text>
								</View>
							))}
						</View>
					</View>
				</View>
			</ScrollView>

			{/* Book Now Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-gray-200 border-t bg-white"
			>
				<View className="px-4 py-4">
					<TouchableOpacity
						onPress={() =>
							router.push(
								`/dashboard/book-workout/book-workout?serviceId=${service.id}` as never,
							)
						}
						className="items-center justify-center rounded-xl bg-blue-600 py-4"
						style={{ backgroundColor: "#2563EB" }}
					>
						<Text className="font-semibold text-base text-white">Book Now</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
