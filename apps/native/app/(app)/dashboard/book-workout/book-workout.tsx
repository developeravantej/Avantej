import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useNavigation } from "expo-router";
import { useCallback, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Dummy data for service categories
const serviceCategories = [
	{
		id: 1,
		name: "Fitness & Training",
		description: "Personalized training and strength building",
	},
	{
		id: 2,
		name: "Group Classes",
		description: "High-energy group workouts",
	},
	{
		id: 3,
		name: "Wellness & Recovery",
		description: "Yoga, stretching, and recovery sessions",
	},
	{
		id: 4,
		name: "Specialized Programs",
		description: "Targeted programs for specific goals",
	},
];

// Dummy data for services (now includes categoryId)
const services = [
	{
		id: 1,
		title: "Personal Training",
		description: "Personalized one-on-one training",
		tag: "Most booked",
		categoryId: 1, // Fitness & Training
	},
	{
		id: 2,
		title: "HIIT Class",
		description: "High-energy fat burn and endurance",
		categoryId: 2, // Group Classes
	},
	{
		id: 3,
		title: "Yoga Flow",
		description: "Improve flexibility and recovery",
		tag: "Good for recovery days",
		categoryId: 3, // Wellness & Recovery
	},
	{
		id: 4,
		title: "Strength Training",
		description: "Build muscle and functional strength",
		categoryId: 1, // Fitness & Training
	},
	{
		id: 5,
		title: "Pilates",
		description: "Core strength and body alignment",
		categoryId: 3, // Wellness & Recovery
	},
	{
		id: 6,
		title: "Spin Class",
		description: "Indoor cycling for cardio fitness",
		categoryId: 2, // Group Classes
	},
	{
		id: 7,
		title: "Weight Loss Program",
		description: "Structured program for weight management",
		tag: "12-week program",
		categoryId: 4, // Specialized Programs
	},
	{
		id: 8,
		title: "Athletic Performance",
		description: "Sport-specific training and conditioning",
		categoryId: 4, // Specialized Programs
	},
];

// Dummy data for trainers by service
const trainersByService: Record<
	number,
	Array<{ id: number; name: string; specialization: string }>
> = {
	1: [
		// Personal Training
		{ id: 1, name: "Sarah Johnson", specialization: "Strength & Conditioning" },
		{ id: 2, name: "Mike Chen", specialization: "HIIT & Cardio" },
		{ id: 3, name: "Emma Wilson", specialization: "Weight Loss & Nutrition" },
	],
	2: [
		// HIIT Class
		{ id: 4, name: "Alex Martinez", specialization: "High-Intensity Training" },
		{ id: 5, name: "Jordan Taylor", specialization: "Cardio & Endurance" },
	],
	3: [
		// Yoga Flow
		{ id: 6, name: "Luna Patel", specialization: "Vinyasa & Flexibility" },
		{ id: 7, name: "Zen Kim", specialization: "Yin & Restorative Yoga" },
	],
	4: [
		// Strength Training
		{
			id: 8,
			name: "David Strong",
			specialization: "Powerlifting & Bodybuilding",
		},
		{ id: 9, name: "Rachel Power", specialization: "Functional Strength" },
	],
	5: [
		// Pilates
		{
			id: 10,
			name: "Sophie Grace",
			specialization: "Classical Pilates & Core",
		},
		{ id: 11, name: "Maya Rodriguez", specialization: "Contemporary Pilates" },
	],
	6: [
		// Spin Class
		{
			id: 12,
			name: "Chris Thompson",
			specialization: "Indoor Cycling & Endurance",
		},
		{ id: 13, name: "Taylor Swift", specialization: "Rhythm-Based Cycling" },
	],
	7: [
		// Weight Loss Program
		{
			id: 14,
			name: "Dr. Lisa Chen",
			specialization: "Nutrition & Weight Management",
		},
		{
			id: 15,
			name: "Marcus Williams",
			specialization: "Metabolic Conditioning",
		},
	],
	8: [
		// Athletic Performance
		{
			id: 16,
			name: "Coach James",
			specialization: "Sports Performance & Agility",
		},
		{ id: 17, name: "Nina Torres", specialization: "Athletic Conditioning" },
	],
};

const steps = [
	{ number: 1, label: "Setup", active: true },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Done", active: false },
];

export default function BookWorkoutScreen() {
	const navigation = useNavigation();
	const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
	const [selectedService, setSelectedService] = useState<number | null>(null);
	const [selectedTrainer, setSelectedTrainer] = useState<
		number | "auto" | null
	>(null);
	const currentStep = 1;
	const totalSteps = 4;
	const progressPercentage = 25;

	// Filter services by selected category
	const availableServices = selectedCategory
		? services.filter((service) => service.categoryId === selectedCategory)
		: [];

	// Get trainers for selected service
	const availableTrainers = selectedService
		? trainersByService[selectedService] || []
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
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header with Title */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<TouchableOpacity
							onPress={() => router.back()}
							className="mr-3 h-10 w-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</TouchableOpacity>
						<Text className="flex-1 font-bold text-2xl text-primary-1">
							Book Workout
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
					{/* Progress Indicator - high contrast for visibility */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="font-semibold text-primary-1 text-sm">
								Step {currentStep} of {totalSteps}
							</Text>
							<Text className="font-semibold text-primary-1 text-sm">
								{progressPercentage}%
							</Text>
						</View>

						{/* Progress Bar - visible track and fill */}
						<View
							className="mb-4 h-2 overflow-hidden rounded-full"
							style={{ backgroundColor: colors.secondary[2] }}
						>
							<View
								className="h-full rounded-full"
								style={{
									width: `${progressPercentage}%`,
									backgroundColor: colors.primary[1],
								}}
							/>
						</View>

						{/* Step Navigation */}
						<View className="relative" style={{ height: 50 }}>
							{/* Connector line - visible against background */}
							<View
								className="absolute rounded-full"
								style={{
									left: "15%",
									right: "14%",
									top: "24%",
									height: 2,
									backgroundColor: colors.secondary[2],
									zIndex: 0,
								}}
							/>
							{/* Steps - positioned on top of line */}
							<View className="absolute inset-0 flex-row items-center justify-between">
								{steps.map((step) => (
									<View
										key={step.number}
										className="items-center justify-center"
										style={{ flex: 1, zIndex: 1 }}
									>
										{step.active ? (
											<View className="mb-1 items-center justify-center">
												{/* Active step: filled circle with white dot */}
												<View
													className="h-7 w-7 items-center justify-center rounded-full border-2 border-primary-1"
													style={{
														backgroundColor: colors.primary[1],
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
												{/* Inactive step: bordered circle, dark number */}
												<View
													className="h-7 w-7 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
													style={{ zIndex: 2 }}
												>
													<Text className="font-semibold text-primary-1 text-xs">
														{step.number}
													</Text>
												</View>
											</View>
										)}
										<Text
											className={`mt-1 text-center text-xs ${
												step.active ? "font-bold" : "font-medium"
											}`}
											style={{
												color: step.active
													? colors.primary[1]
													: colors.secondary[1],
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
									setSelectedTrainer(null); // Reset trainer selection when category changes
								}}
								className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
									selectedCategory === category.id
										? "border-primary-1"
										: "border-secondary-3"
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
									onPress={() => {
										setSelectedService(service.id);
										setSelectedTrainer(null); // Reset trainer selection when service changes
									}}
									className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
										selectedService === service.id
											? "border-primary-1"
											: "border-secondary-3"
									} shadow-sm`}
								>
									<View className="mb-2 flex-row items-start justify-between">
										<Text
											className="flex-1 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{service.title}
										</Text>
										{service.tag && (
											<View
												className="ml-2 rounded-full px-2 py-1"
												style={{ backgroundColor: colors.secondary[3] }}
											>
												<Text
													className="font-medium text-xs"
													style={{ color: colors.primary[1] }}
												>
													{service.tag}
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
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
								<Text className="text-center text-secondary-1 text-sm">
									Please select a category first
								</Text>
							</View>
						)}
					</View>

					{/* Trainer Selection Section */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT PROVIDER
						</Text>

						{selectedService ? (
							<>
								{/* Auto-assign Option */}
								<TouchableOpacity
									onPress={() => setSelectedTrainer("auto")}
									className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
										selectedTrainer === "auto"
											? "border-primary-1"
											: "border-secondary-3"
									} relative shadow-sm`}
								>
									<View className="flex-row items-start justify-between">
										<View className="mr-2 flex-1">
											<Text
												className="mb-1 font-bold text-lg"
												style={{ color: colors.primary[1] }}
											>
												Auto-assign best available
											</Text>
											<Text
												className="text-sm"
												style={{ color: colors.secondary[1] }}
											>
												We'll match you with the best trainer for your needs
											</Text>
										</View>
										{selectedTrainer === "auto" && (
											<View className="h-6 w-6 items-center justify-center rounded-full bg-primary-1">
												<Ionicons
													name="checkmark"
													size={16}
													color={colors.primary[2]}
												/>
											</View>
										)}
									</View>
								</TouchableOpacity>

								{/* Trainer Cards */}
								{availableTrainers.map((trainer) => (
									<TouchableOpacity
										key={trainer.id}
										onPress={() => setSelectedTrainer(trainer.id)}
										className={`mb-3 rounded-2xl border bg-primary-2 p-4 ${
											selectedTrainer === trainer.id
												? "border-primary-1"
												: "border-secondary-3"
										} relative shadow-sm`}
									>
										<View className="flex-row items-start justify-between">
											<View className="mr-2 flex-1">
												<Text
													className="mb-1 font-bold text-lg"
													style={{ color: colors.primary[1] }}
												>
													{trainer.name}
												</Text>
												<Text
													className="text-sm"
													style={{ color: colors.secondary[1] }}
												>
													{trainer.specialization}
												</Text>
											</View>
											{selectedTrainer === trainer.id && (
												<View className="h-6 w-6 items-center justify-center rounded-full bg-primary-1">
													<Ionicons
														name="checkmark"
														size={16}
														color={colors.primary[2]}
													/>
												</View>
											)}
										</View>
									</TouchableOpacity>
								))}
							</>
						) : (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
								<Text className="text-center text-secondary-1 text-sm">
									Please select a service first
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>

			{/* Continue Button - Only shows when category, service and trainer are selected */}
			{selectedCategory && selectedService && selectedTrainer && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-secondary-3 border-t bg-primary-2"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={() =>
								router.push({
									pathname: "./schedule" as never,
									params: { serviceId: selectedService },
								})
							}
							className="items-center justify-center rounded-xl bg-primary-1 py-4"
						>
							<Text className="font-semibold text-base text-primary-2">
								Continue
							</Text>
						</TouchableOpacity>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
