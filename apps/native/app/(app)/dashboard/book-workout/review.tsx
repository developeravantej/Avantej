import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useNavigation } from "expo-router";
import { useCallback } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: true },
	{ number: 4, label: "Done", active: false },
];

export default function ReviewScreen() {
	const navigation = useNavigation();
	const currentStep = 3;
	const totalSteps = 4;
	const progressPercentage = 75;

	// Dummy booking data - in real app, this would come from state/context
	const bookingData = {
		service: "Personal Training",
		trainer: "Auto-assign best available",
		date: "Sun, Dec 28",
		time: "10:00 AM",
	};

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
			// Don't restore in cleanup - layout handles it when leaving the entire stack
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
									backgroundColor: colors.primary[1],
								}}
							/>
						</View>

						{/* Step Navigation */}
						<View className="relative" style={{ height: 50 }}>
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
														className="h-6 w-6 items-center justify-center rounded-full"
														style={{
															backgroundColor: colors.primary[1],
															zIndex: 2,
														}}
													>
														<Ionicons
															name="checkmark"
															size={14}
															color={colors.primary[2]}
														/>
													</View>
												</View>
											) : isActive ? (
												<View className="mb-1 items-center justify-center">
													<View
														className="h-6 w-6 items-center justify-center rounded-full"
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
													isActive ? "font-bold" : ""
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
							REVIEW YOUR BOOKING
						</Text>

						{/* Booking Summary Cards */}
						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<Ionicons
									name="fitness-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Service
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{bookingData.service}
							</Text>
						</View>

						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<Ionicons
									name="person-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Trainer
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{bookingData.trainer}
							</Text>
						</View>

						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<Ionicons
									name="calendar-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Date & Time
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{bookingData.date} at {bookingData.time}
							</Text>
						</View>
					</View>
				</View>
			</ScrollView>

			{/* Confirm Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="px-4 py-4">
					<TouchableOpacity
						onPress={() => router.push("./done" as never)}
						className="items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Confirm Booking
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
