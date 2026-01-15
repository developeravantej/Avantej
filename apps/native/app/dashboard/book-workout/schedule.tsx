import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: true },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Done", active: false },
];

// Service types - 1 is Personal Training (1-on-1), others are classes
const isOneOnOneService = (serviceId: number) => serviceId === 1;

// Dummy time slots for class services
const timeSlots = [
	{ time: "9:00 AM", available: true, spotsLeft: null },
	{ time: "10:00 AM", available: true, spotsLeft: 3 },
	{ time: "11:00 AM", available: false, spotsLeft: null },
	{ time: "12:00 PM", available: true, spotsLeft: null },
	{ time: "1:00 PM", available: false, spotsLeft: null, full: true },
	{ time: "2:00 PM", available: true, spotsLeft: null },
	{ time: "3:00 PM", available: false, spotsLeft: null },
	{ time: "4:00 PM", available: true, spotsLeft: null },
];

// Generate dates for the next 7 days
const generateDates = () => {
	const dates = [];
	const today = new Date();
	for (let i = 0; i < 7; i++) {
		const date = new Date(today);
		date.setDate(today.getDate() + i);
		dates.push(date);
	}
	return dates;
};

export default function ScheduleScreen() {
	const navigation = useNavigation();
	const params = useLocalSearchParams<{ serviceId?: string }>();
	const serviceId = params.serviceId
		? Number.parseInt(params.serviceId, 10)
		: null;
	const isOneOnOne = serviceId ? isOneOnOneService(serviceId) : false;

	const currentStep = 2;
	const totalSteps = 4;
	const progressPercentage = 50;

	const [viewMode, setViewMode] = useState<"week" | "month">("week");
	const [selectedDate, setSelectedDate] = useState<Date | null>(null);
	const [selectedTime, setSelectedTime] = useState<string | null>(null);

	const dates = generateDates();

	// Time options for 1-on-1 service
	const timeOptions = [
		"8:00 AM",
		"9:00 AM",
		"10:00 AM",
		"11:00 AM",
		"12:00 PM",
		"1:00 PM",
		"2:00 PM",
		"3:00 PM",
		"4:00 PM",
		"5:00 PM",
		"6:00 PM",
		"7:00 PM",
	];

	useFocusEffect(
		useCallback(() => {
			// Hide tab bar when this screen is focused
			// Try to find the Tabs navigator by going up the navigation tree
			const findTabsNavigator = (nav: unknown, depth = 0): unknown => {
				if (depth > 5) return null; // Prevent infinite loop

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
					// Check if this is a Tabs navigator by looking for tab-specific routes
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
			// Don't restore in cleanup - layout handles it when leaving the entire stack
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
													{/* Completed step: Check icon with blue background */}
													<View
														className="h-6 w-6 items-center justify-center rounded-full"
														style={{
															backgroundColor: "#2563EB",
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
													isActive ? "font-bold" : ""
												}`}
												style={{
													color:
														isActive || isCompleted
															? "#2563EB"
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

					{/* Schedule Selection Section */}
					{isOneOnOne ? (
						/* 1-on-1 Service: Date and Time Picker */
						<View className="mb-4">
							<Text
								className="mb-4 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								SELECT DATE & TIME
							</Text>

							{/* Date Selection - Scrollable dates */}
							<View className="mb-4">
								<Text
									className="mb-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Select Date
								</Text>
								<ScrollView horizontal showsHorizontalScrollIndicator={false}>
									{dates.map((date) => {
										const isSelected =
											selectedDate &&
											date.toDateString() === selectedDate.toDateString();
										const dayName = date.toLocaleDateString("en-US", {
											weekday: "short",
										});
										const dayNumber = date.getDate();
										const monthName = date.toLocaleDateString("en-US", {
											month: "short",
										});

										return (
											<TouchableOpacity
												key={date.toISOString()}
												onPress={() => setSelectedDate(date)}
												className={`mr-3 rounded-2xl p-3 ${
													isSelected ? "" : "border border-gray-200"
												}`}
												style={{
													backgroundColor: isSelected
														? "#2563EB"
														: colors.primary[2],
													minWidth: 80,
													alignItems: "center",
												}}
											>
												<Text
													className="mb-1 text-xs"
													style={{
														color: isSelected
															? colors.primary[2]
															: colors.secondary[1],
													}}
												>
													{dayName}
												</Text>
												<Text
													className="mb-1 font-bold text-xl"
													style={{
														color: isSelected
															? colors.primary[2]
															: colors.primary[1],
													}}
												>
													{dayNumber}
												</Text>
												<Text
													className="text-xs"
													style={{
														color: isSelected
															? colors.primary[2]
															: colors.secondary[1],
													}}
												>
													{monthName}
												</Text>
											</TouchableOpacity>
										);
									})}
								</ScrollView>
							</View>

							{/* Time Selection - Grid of time options */}
							<View>
								<Text
									className="mb-3 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Select Time
								</Text>
								<View className="flex-row flex-wrap">
									{timeOptions.map((time) => {
										const isSelected = selectedTime === time;
										return (
											<TouchableOpacity
												key={time}
												onPress={() => setSelectedTime(time)}
												className={`mr-3 mb-3 rounded-xl p-3 ${
													isSelected ? "border-2" : "border border-gray-200"
												}`}
												style={{
													backgroundColor: colors.primary[2],
													borderColor: isSelected ? "#2563EB" : "transparent",
													width: "30%",
													minWidth: 100,
												}}
											>
												<Text
													className="text-center text-sm"
													style={{
														color: colors.primary[1],
													}}
												>
													{time}
												</Text>
											</TouchableOpacity>
										);
									})}
								</View>
							</View>
						</View>
					) : (
						/* Class Service: Date Selector and Time Slots */
						<View className="mb-4">
							{/* SELECT DATE Section */}
							<View className="mb-6">
								<View className="mb-3 flex-row items-center justify-between">
									<Text
										className="font-bold text-sm uppercase tracking-wide"
										style={{ color: colors.primary[1] }}
									>
										SELECT DATE
									</Text>
									<View className="flex-row">
										<TouchableOpacity
											onPress={() => setViewMode("week")}
											className={`mr-2 rounded-lg px-3 py-1 ${
												viewMode === "week"
													? "border border-gray-200 bg-white"
													: ""
											}`}
										>
											<Text
												className={`text-sm ${
													viewMode === "week" ? "font-semibold" : ""
												}`}
												style={{
													color:
														viewMode === "week"
															? colors.primary[1]
															: colors.secondary[1],
												}}
											>
												Week
											</Text>
										</TouchableOpacity>
										<TouchableOpacity
											onPress={() => setViewMode("month")}
											className={`rounded-lg px-3 py-1 ${
												viewMode === "month"
													? "border border-gray-200 bg-white"
													: ""
											}`}
										>
											<Text
												className={`text-sm ${
													viewMode === "month" ? "font-semibold" : ""
												}`}
												style={{
													color:
														viewMode === "month"
															? colors.primary[1]
															: colors.secondary[1],
												}}
											>
												Month
											</Text>
										</TouchableOpacity>
									</View>
								</View>

								{/* Date Cards */}
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									className="mb-4"
								>
									{dates.map((date) => {
										const isSelected =
											selectedDate &&
											date.toDateString() === selectedDate.toDateString();
										const dayName = date.toLocaleDateString("en-US", {
											weekday: "short",
										});
										const dayNumber = date.getDate();
										const monthName = date.toLocaleDateString("en-US", {
											month: "short",
										});

										return (
											<TouchableOpacity
												key={date.toISOString()}
												onPress={() => setSelectedDate(date)}
												className={`mr-3 rounded-2xl p-3 ${
													isSelected ? "" : "border border-gray-200"
												}`}
												style={{
													backgroundColor: isSelected
														? "#2563EB"
														: colors.primary[2],
													minWidth: 80,
													alignItems: "center",
												}}
											>
												<Text
													className="mb-1 text-xs"
													style={{
														color: isSelected
															? colors.primary[2]
															: colors.secondary[1],
													}}
												>
													{dayName}
												</Text>
												<Text
													className="mb-1 font-bold text-xl"
													style={{
														color: isSelected
															? colors.primary[2]
															: colors.primary[1],
													}}
												>
													{dayNumber}
												</Text>
												<Text
													className="text-xs"
													style={{
														color: isSelected
															? colors.primary[2]
															: colors.secondary[1],
													}}
												>
													{monthName}
												</Text>
											</TouchableOpacity>
										);
									})}
								</ScrollView>
							</View>

							{/* SELECT TIME Section */}
							<View>
								<Text
									className="mb-3 font-bold text-sm uppercase tracking-wide"
									style={{ color: colors.primary[1] }}
								>
									SELECT TIME
								</Text>

								{/* Time Slot Grid */}
								<View className="flex-row flex-wrap">
									{timeSlots.map((slot) => {
										const isSelected = selectedTime === slot.time;
										const isUnavailable = !slot.available;

										return (
											<TouchableOpacity
												key={slot.time}
												onPress={() => {
													if (slot.available && !slot.full) {
														setSelectedTime(slot.time);
													}
												}}
												disabled={isUnavailable || slot.full}
												className={`mr-3 mb-3 rounded-xl p-3 ${
													isSelected
														? "border-2"
														: isUnavailable || slot.full
															? ""
															: "border border-gray-200"
												}`}
												style={{
													backgroundColor:
														isUnavailable || slot.full
															? colors.secondary[3]
															: colors.primary[2],
													borderColor: isSelected ? "#2563EB" : "transparent",
													width: "30%",
													minWidth: 100,
												}}
											>
												<Text
													className={`text-center text-sm ${
														slot.time === "10:00 AM" ? "font-bold" : ""
													}`}
													style={{
														color:
															isUnavailable || slot.full
																? colors.secondary[1]
																: colors.primary[1],
													}}
												>
													{slot.time}
												</Text>
												{slot.spotsLeft !== null && (
													<Text
														className="mt-1 text-center text-xs"
														style={{ color: colors.secondary[1] }}
													>
														{slot.spotsLeft} spots left
													</Text>
												)}
												{slot.full && (
													<Text
														className="mt-1 text-center text-xs"
														style={{ color: colors.secondary[1] }}
													>
														Full
													</Text>
												)}
											</TouchableOpacity>
										);
									})}
								</View>

								{/* Waitlist Option */}
								<TouchableOpacity className="mt-2 items-center">
									<Text className="text-sm" style={{ color: "#2563EB" }}>
										Join waitlist
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}
				</View>
			</ScrollView>

			{/* Continue Button - Only shows when date and time are selected */}
			{(isOneOnOne
				? selectedDate && selectedTime
				: selectedDate && selectedTime) && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-gray-200 border-t bg-white"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={() => router.push("./review" as never)}
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
