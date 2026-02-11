import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useNavigation } from "expo-router";
import { useCallback, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Service Categories
const SERVICE_CATEGORY = {
	PRIVATE: 1, // Personal Training
	SEMI_PRIVATE: 2, // Classes
	GROUP: 3, // Group Training
	ONLINE: 4, // Online Training
	NUTRITION: 5, // Nutrition Coaching
	RECOVERY: 6, // Recovery & Wellness
} as const;

// Dummy data for service categories
const serviceCategories = [
	{
		id: SERVICE_CATEGORY.PRIVATE,
		name: "Private",
		description:
			"Personal Training - One-on-one sessions with your preferred coach",
	},
	{
		id: SERVICE_CATEGORY.SEMI_PRIVATE,
		name: "Semi-Private",
		description:
			"Classes - Group sessions with fixed schedules and assigned instructors",
	},
	{
		id: SERVICE_CATEGORY.GROUP,
		name: "Group Training",
		description:
			"Small group sessions - Train with 2-4 others for motivation and camaraderie",
	},
	{
		id: SERVICE_CATEGORY.ONLINE,
		name: "Online Training",
		description:
			"Virtual sessions - Train from anywhere with live or on-demand coaching",
	},
	{
		id: SERVICE_CATEGORY.NUTRITION,
		name: "Nutrition Coaching",
		description:
			"Meal planning and nutrition guidance - Personalized diet plans and coaching",
	},
	{
		id: SERVICE_CATEGORY.RECOVERY,
		name: "Recovery & Wellness",
		description:
			"Massage, stretching, and recovery - Enhance your performance and well-being",
	},
];

// Dummy data for services
const services = [
	// Personal Training services
	{
		id: 1,
		title: "2×12-Week Personal Training",
		description:
			"24 credits - 12 weeks of personalized training, 2 sessions per week",
		credits: 24,
		categoryId: SERVICE_CATEGORY.PRIVATE,
	},
	{
		id: 2,
		title: "2×24-Week Personal Training",
		description:
			"48 credits - 24 weeks of personalized training, 2 sessions per week",
		credits: 48,
		categoryId: SERVICE_CATEGORY.PRIVATE,
	},
	{
		id: 3,
		title: "3×8-Week Personal Training",
		description:
			"24 credits - 8 weeks of intensive training, 3 sessions per week",
		credits: 24,
		categoryId: SERVICE_CATEGORY.PRIVATE,
	},
	{
		id: 4,
		title: "1×16-Week Personal Training",
		description:
			"16 credits - 16 weeks of flexible training, 1 session per week",
		credits: 16,
		categoryId: SERVICE_CATEGORY.PRIVATE,
	},
	// Semi-Private Class services
	{
		id: 5,
		title: "Class A",
		description: "Every Mon/Wed/Fri at 7:00 PM",
		schedule: "Mon/Wed/Fri 7:00 PM",
		categoryId: SERVICE_CATEGORY.SEMI_PRIVATE,
	},
	{
		id: 6,
		title: "Class B",
		description: "Every Tue at 8:00 AM",
		schedule: "Tue 8:00 AM",
		categoryId: SERVICE_CATEGORY.SEMI_PRIVATE,
	},
	{
		id: 7,
		title: "Class C - Morning Bootcamp",
		description: "Every Mon/Wed/Fri at 6:30 AM",
		schedule: "Mon/Wed/Fri 6:30 AM",
		categoryId: SERVICE_CATEGORY.SEMI_PRIVATE,
	},
	{
		id: 8,
		title: "Class D - Evening Yoga",
		description: "Every Tue/Thu at 6:00 PM",
		schedule: "Tue/Thu 6:00 PM",
		categoryId: SERVICE_CATEGORY.SEMI_PRIVATE,
	},
	{
		id: 9,
		title: "Class E - Weekend Warrior",
		description: "Every Sat at 9:00 AM",
		schedule: "Sat 9:00 AM",
		categoryId: SERVICE_CATEGORY.SEMI_PRIVATE,
	},
	// Group Training services
	{
		id: 10,
		title: "4×8-Week Group Training",
		description:
			"32 credits - 8 weeks of small group training, 4 sessions per week",
		credits: 32,
		categoryId: SERVICE_CATEGORY.GROUP,
	},
	{
		id: 11,
		title: "3×12-Week Group Training",
		description: "36 credits - 12 weeks of group sessions, 3 sessions per week",
		credits: 36,
		categoryId: SERVICE_CATEGORY.GROUP,
	},
	{
		id: 12,
		title: "2×16-Week Group Training",
		description: "32 credits - 16 weeks of group training, 2 sessions per week",
		credits: 32,
		categoryId: SERVICE_CATEGORY.GROUP,
	},
	// Online Training services
	{
		id: 13,
		title: "Monthly Online Coaching",
		description:
			"12 credits - Live sessions and on-demand workouts for one month",
		credits: 12,
		categoryId: SERVICE_CATEGORY.ONLINE,
	},
	{
		id: 14,
		title: "3-Month Online Program",
		description:
			"36 credits - 3 months of virtual training with weekly check-ins",
		credits: 36,
		categoryId: SERVICE_CATEGORY.ONLINE,
	},
	{
		id: 15,
		title: "On-Demand Library Access",
		description:
			"Unlimited access to workout library and pre-recorded sessions",
		credits: 0,
		categoryId: SERVICE_CATEGORY.ONLINE,
	},
	// Nutrition Coaching services
	{
		id: 16,
		title: "4-Week Nutrition Plan",
		description: "8 credits - Personalized meal plan with weekly consultations",
		credits: 8,
		categoryId: SERVICE_CATEGORY.NUTRITION,
	},
	{
		id: 17,
		title: "12-Week Nutrition Coaching",
		description:
			"24 credits - 3 months of nutrition guidance and meal planning",
		credits: 24,
		categoryId: SERVICE_CATEGORY.NUTRITION,
	},
	{
		id: 18,
		title: "One-Time Nutrition Consultation",
		description:
			"2 credits - Initial assessment and personalized recommendations",
		credits: 2,
		categoryId: SERVICE_CATEGORY.NUTRITION,
	},
	// Recovery & Wellness services
	{
		id: 19,
		title: "Monthly Recovery Package",
		description: "8 credits - 4 sessions of massage or stretching per month",
		credits: 8,
		categoryId: SERVICE_CATEGORY.RECOVERY,
	},
	{
		id: 20,
		title: "Deep Tissue Massage",
		description: "2 credits per session - 60-minute deep tissue massage",
		credits: 2,
		categoryId: SERVICE_CATEGORY.RECOVERY,
	},
	{
		id: 21,
		title: "Stretching & Mobility Session",
		description: "1 credit per session - 30-minute guided stretching session",
		credits: 1,
		categoryId: SERVICE_CATEGORY.RECOVERY,
	},
	{
		id: 22,
		title: "Wellness Assessment",
		description:
			"1 credit - Comprehensive wellness evaluation and recommendations",
		credits: 1,
		categoryId: SERVICE_CATEGORY.RECOVERY,
	},
];

const steps = [
	{ number: 1, label: "Setup", active: true },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Info", active: false },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

export default function SetupScreen() {
	const navigation = useNavigation();
	const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
	const [selectedService, setSelectedService] = useState<number | null>(null);
	const currentStep = 1;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	// Check if selected category is Personal Training
	const _isPersonalTraining = selectedCategory === SERVICE_CATEGORY.PRIVATE;

	// Filter services by selected category
	const availableServices = selectedCategory
		? services.filter((service) => service.categoryId === selectedCategory)
		: [];

	useFocusEffect(
		useCallback(() => {
			// Hide tab bar when this screen is focused
			const findTabsNavigator = (nav: unknown, depth = 0): unknown => {
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
								r.name === "calendar" ||
								r.name === "notifications" ||
								r.name === "profile",
						)
					) {
						return parent;
					}
				} catch {
					// Continue searching
				}
				return findTabsNavigator(parent, depth + 1);
			};

			const tabsNavigator = findTabsNavigator(navigation);
			if (tabsNavigator) {
				(
					tabsNavigator as {
						setOptions?: (options: {
							tabBarStyle: { display: string };
						}) => void;
					}
				)?.setOptions?.({
					tabBarStyle: { display: "none" },
				});
			}
			// Don't restore in cleanup - layout handles it
		}, [navigation]),
	);

	return (
		<Container>
			<ScrollView className="flex-1 bg-white">
				{/* Header with Title */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<TouchableOpacity
							onPress={() => router.back()}
							className="mr-3 h-10 w-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</TouchableOpacity>
						<Text className="flex-1 font-bold text-2xl text-black">
							Buy Package
						</Text>
					</View>
				</View>

				{/* Header Image */}
				<View className="relative mx-4 mb-4 h-64 w-full overflow-hidden rounded-2xl">
					<Image
						source={{
							uri: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800",
						}}
						className="h-full w-full"
						resizeMode="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Progress Indicator */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="text-sm" style={{ color: colors.secondary[1] }}>
								Step {currentStep} of {totalSteps}
							</Text>
							<Text className="text-sm" style={{ color: colors.secondary[1] }}>
								{progressPercentage}%
							</Text>
						</View>

						{/* Progress Bar */}
						<View
							className="mb-4 h-1 rounded-full"
							style={{ backgroundColor: colors.secondary[3] }}
						>
							<View
								className="h-full rounded-full"
								style={{
									width: `${progressPercentage}%`,
									backgroundColor: "#2563EB",
								}}
							/>
						</View>

						{/* Step Navigation */}
						<View className="relative" style={{ height: 50 }}>
							{/* Background connector line - positioned behind indicators */}
							<View
								className="absolute h-px"
								style={{
									left: "15%",
									right: "14%",
									top: "27%",
									backgroundColor: colors.secondary[3],
									zIndex: 0,
								}}
							/>
							{/* Steps - positioned on top of line */}
							<View className="absolute inset-0 flex-row items-center justify-between">
								{steps.map((step, _index) => (
									<View
										key={step.number}
										className="items-center justify-center"
										style={{ flex: 1, zIndex: 1 }}
									>
										{step.active ? (
											<View className="mb-1 items-center justify-center">
												{/* Active step: Blue circle with white dot inside - covers the line */}
												<View
													className="h-6 w-6 items-center justify-center rounded-full"
													style={{
														backgroundColor: "#2563EB",
														zIndex: 2,
													}}
												>
													<View
														className="h-2 w-2 rounded-full"
														style={{ backgroundColor: colors.primary[2] }}
													/>
												</View>
											</View>
										) : (
											<View className="mb-1 items-center justify-center">
												{/* Inactive step: Number with white background to cover line */}
												<View
													style={{
														backgroundColor: colors.primary[2],
														borderRadius: 10,
														width: 20,
														height: 20,
														alignItems: "center",
														justifyContent: "center",
														zIndex: 2,
													}}
												>
													<Text
														className="text-xs"
														style={{ color: colors.secondary[1] }}
													>
														{step.number}
													</Text>
												</View>
											</View>
										)}
										<Text
											className={`mt-1 text-center text-xs ${
												step.active ? "font-bold" : ""
											}`}
											style={{
												color: step.active ? "#2563EB" : colors.secondary[1],
											}}
										>
											{step.label}
										</Text>
									</View>
								))}
							</View>
						</View>
					</View>

					{/* Category Selection Section */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT CATEGORY
						</Text>
						<Text
							className="mb-4 text-base"
							style={{ color: colors.primary[1] }}
						>
							Choose a category to explore available services
						</Text>

						{/* Category Cards */}
						{serviceCategories.map((category) => (
							<TouchableOpacity
								key={category.id}
								onPress={() => {
									setSelectedCategory(category.id);
									setSelectedService(null); // Reset service selection when category changes
								}}
								className={`mb-3 rounded-2xl border bg-white p-4 ${
									selectedCategory === category.id
										? "border-blue-500"
										: "border-gray-200"
								} shadow-sm`}
							>
								<View className="mb-2 flex-row items-start justify-between">
									<Text
										className="flex-1 font-bold text-lg"
										style={{ color: colors.primary[1] }}
									>
										{category.name}
									</Text>
								</View>
								<Text
									className="text-sm"
									style={{ color: colors.secondary[1] }}
								>
									{category.description}
								</Text>
							</TouchableOpacity>
						))}
					</View>

					{/* Service Selection Section */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT SERVICE
						</Text>
						<Text
							className="mb-4 text-base"
							style={{ color: colors.primary[1] }}
						>
							What would you like to focus on today?
						</Text>

						{selectedCategory ? (
							/* Service Cards */
							availableServices.map((service) => (
								<TouchableOpacity
									key={service.id}
									onPress={() => setSelectedService(service.id)}
									className={`mb-3 rounded-2xl border bg-white p-4 ${
										selectedService === service.id
											? "border-blue-500"
											: "border-gray-200"
									} shadow-sm`}
								>
									<View className="mb-2 flex-row items-start justify-between">
										<Text
											className="flex-1 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{service.title}
										</Text>
										{"credits" in service && (
											<View
												className="ml-2 rounded-full px-2 py-1"
												style={{ backgroundColor: colors.secondary[3] }}
											>
												<Text
													className="font-medium text-xs"
													style={{ color: colors.primary[1] }}
												>
													{service.credits} credits
												</Text>
											</View>
										)}
									</View>
									<Text
										className="text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{service.description}
									</Text>
								</TouchableOpacity>
							))
						) : (
							<View className="mb-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
								<Text
									className="text-center text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Please select a category first
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>

			{/* Continue Button */}
			{selectedCategory && selectedService && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-gray-200 border-t bg-white"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={() =>
								router.push({
									pathname: "./schedule" as never,
									params: {
										serviceId: selectedService,
										categoryId: selectedCategory,
									},
								})
							}
							className="items-center justify-center rounded-xl bg-blue-600 py-4"
							style={{ backgroundColor: "#2563EB" }}
						>
							<Text className="font-semibold text-base text-white">
								Continue
							</Text>
						</TouchableOpacity>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
