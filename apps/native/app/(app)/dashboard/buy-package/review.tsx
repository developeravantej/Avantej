import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

const SERVICE_CATEGORY = {
	PRIVATE: 1,
	SEMI_PRIVATE: 2,
} as const;

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Review", active: true },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

// Dummy service data
const services = [
	{ id: 1, title: "2×12-Week Personal Training", credits: 24 },
	{ id: 2, title: "2×24-Week Personal Training", credits: 48 },
	{ id: 3, title: "Class A", schedule: "Mon/Wed/Fri 7:00 PM" },
	{ id: 4, title: "Class B", schedule: "Tue 8:00 AM" },
];

const coaches = [
	{ id: 1, name: "Sarah Johnson" },
	{ id: 2, name: "Mike Chen" },
	{ id: 3, name: "Emma Wilson" },
];

export default function ReviewScreen() {
	const navigation = useNavigation();
	const params = useLocalSearchParams<{
		serviceId?: string;
		categoryId?: string;
		coachId?: string;
		date?: string;
		time?: string;
		preferredTimes?: string;
		remark?: string;
	}>();

	const serviceId = params.serviceId
		? Number.parseInt(params.serviceId, 10)
		: null;
	const categoryId = params.categoryId
		? Number.parseInt(params.categoryId, 10)
		: null;
	const coachId =
		params.coachId === "auto"
			? "auto"
			: params.coachId
				? Number.parseInt(params.coachId, 10)
				: null;
	const selectedDate = params.date ? new Date(params.date) : null;
	const selectedTime = params.time || null;

	const isPersonalTraining = categoryId === SERVICE_CATEGORY.PRIVATE;

	const currentStep = 4;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const selectedService = services.find((s) => s.id === serviceId);
	const _selectedCoach =
		coachId === "auto"
			? "Auto-assign best available coach"
			: coaches.find((c) => c.id === coachId)?.name || "Not selected";

	// Parse preferredTimes from params
	const preferredTimes = params.preferredTimes
		? (JSON.parse(params.preferredTimes) as Array<{
				day: string;
				time: string;
			}>)
		: [];

	// Get remark from params
	const remark = params.remark || "";

	useFocusEffect(
		useCallback(() => {
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
				)?.setOptions?.({ tabBarStyle: { display: "none" } });
			}
		}, [navigation]),
	);

	const _formatDate = (date: Date | null) => {
		if (!date) return "Not selected";
		return date.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		});
	};

	const handleContinue = () => {
		router.push({
			pathname: "./sign" as never,
			params: {
				serviceId: serviceId?.toString(),
				categoryId: categoryId?.toString(),
				coachId: coachId === "auto" ? "auto" : coachId?.toString(),
				date: selectedDate?.toISOString(),
				time: selectedTime || undefined,
				preferredTimes: params.preferredTimes || JSON.stringify([]),
				remark: params.remark || undefined,
			},
		});
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<TouchableOpacity
							onPress={() => router.back()}
							className="mr-3 h-10 w-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</TouchableOpacity>
						<Text className="flex-1 font-bold text-2xl text-black">
							Review Details
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
							<View
								className="absolute rounded-full"
								style={{
									left: "10%",
									right: "10%",
									top: "24%",
									height: 2,
									backgroundColor: colors.secondary[2],
									zIndex: 0,
								}}
							/>
							<View className="absolute inset-0 flex-row items-center justify-between">
								{steps.map((step) => {
									const isCompleted = step.number < currentStep;
									const isActive = step.active;

									return (
										<View
											key={step.number}
											className="items-center justify-center"
											style={{ flex: 1, zIndex: 1 }}
										>
											{isCompleted ? (
												<View className="mb-1 items-center justify-center">
													<View
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-primary-1"
														style={{
															backgroundColor: colors.primary[1],
															zIndex: 2,
														}}
													>
														<Ionicons
															name="checkmark"
															size={12}
															color={colors.primary[2]}
														/>
													</View>
												</View>
											) : isActive ? (
												<View className="mb-1 items-center justify-center">
													<View
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-primary-1"
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
													<View
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
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
													isActive ? "font-bold" : "font-medium"
												}`}
												style={{
													color:
														isActive || isCompleted
															? colors.primary[1]
															: colors.secondary[1],
												}}
											>
												{step.label}
											</Text>
										</View>
									);
								})}
							</View>
						</View>
					</View>

					{/* Review Section */}
					<View className="mb-4">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							REVIEW YOUR PACKAGE
						</Text>

						{/* Service */}
						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-2 flex-row items-center">
								<Ionicons
									name="cube-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Package
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{selectedService?.title || "Not selected"}
							</Text>
							{selectedService && "credits" in selectedService && (
								<Text
									className="mt-1 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									{selectedService.credits} credits
								</Text>
							)}
							{selectedService && "schedule" in selectedService && (
								<Text
									className="mt-1 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									{selectedService.schedule}
								</Text>
							)}
						</View>

						{/* Preferred Times (Personal Training only) */}
						{isPersonalTraining && preferredTimes.length > 0 && (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<View className="mb-2 flex-row items-center">
									<Ionicons
										name="time-outline"
										size={20}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-2 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Preferred Times
									</Text>
								</View>
								{preferredTimes.map((pt) => (
									<Text
										key={`${pt.day}-${pt.time}`}
										className="mb-1 font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										{pt.day} at {pt.time}
									</Text>
								))}
							</View>
						)}

						{/* Remark */}
						{remark && (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<View className="mb-2 flex-row items-center">
									<Ionicons
										name="document-text-outline"
										size={20}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-2 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Remark
									</Text>
								</View>
								<Text
									className="text-base"
									style={{ color: colors.primary[1] }}
								>
									{remark}
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>

			{/* Continue Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="px-4 py-4">
					<TouchableOpacity
						onPress={handleContinue}
						className="items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Continue
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
