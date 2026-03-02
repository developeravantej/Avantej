import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Image,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

const SERVICE_CATEGORY = {
	PRIVATE: 1, // Personal Training
	SEMI_PRIVATE: 2, // Classes
} as const;

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: true },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Review", active: false },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

// Days of the week
const DAYS_OF_WEEK = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

// Helper function to format time from Date to string
const formatTime = (date: Date): string => {
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const period = hours >= 12 ? "PM" : "AM";
	const displayHours = hours % 12 || 12;
	const displayMinutes = minutes.toString().padStart(2, "0");
	return `${displayHours}:${displayMinutes} ${period}`;
};

// Generate hours (1-12)
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

// Generate minutes (00-59, in 5-minute intervals)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5).map((m) =>
	m.toString().padStart(2, "0"),
);

// Custom Android Time Picker Component (inline, no dialog, always visible)
const AndroidTimePicker = ({
	selectedTime,
	onTimeChange,
}: {
	selectedTime: Date;
	onTimeChange: (date: Date) => void;
}) => {
	const hourRef = useRef<ScrollView>(null);
	const minuteRef = useRef<ScrollView>(null);
	const itemHeight = 50;

	const hours = selectedTime.getHours();
	const minutes = selectedTime.getMinutes();
	const isPM = hours >= 12;
	const displayHour = hours % 12 || 12;
	const displayMinute = Math.round(minutes / 5) * 5;
	const displayMinuteStr = displayMinute.toString().padStart(2, "0");
	const minuteIndex = MINUTES.indexOf(displayMinuteStr);

	const handleHourChange = (hour: number) => {
		const newDate = new Date(selectedTime);
		const currentHours = newDate.getHours();
		const isCurrentlyPM = currentHours >= 12;
		const newHour = isCurrentlyPM
			? hour === 12
				? 12
				: hour + 12
			: hour === 12
				? 0
				: hour;
		newDate.setHours(newHour);
		onTimeChange(newDate);
	};

	const handleMinuteChange = (minute: string) => {
		const newDate = new Date(selectedTime);
		newDate.setMinutes(Number.parseInt(minute, 10));
		onTimeChange(newDate);
	};

	const handlePeriodChange = (period: "AM" | "PM") => {
		const newDate = new Date(selectedTime);
		const currentHours = newDate.getHours();
		if (period === "PM" && currentHours < 12) {
			newDate.setHours(currentHours + 12);
		} else if (period === "AM" && currentHours >= 12) {
			newDate.setHours(currentHours - 12);
		}
		onTimeChange(newDate);
	};

	// Initialize scroll positions
	useEffect(() => {
		const hourIndex = HOURS.indexOf(displayHour);
		if (hourIndex !== -1 && hourRef.current) {
			hourRef.current.scrollTo({
				y: hourIndex * itemHeight,
				animated: false,
			});
		}
	}, [displayHour]);

	useEffect(() => {
		if (minuteIndex !== -1 && minuteRef.current) {
			minuteRef.current.scrollTo({
				y: minuteIndex * itemHeight,
				animated: false,
			});
		}
	}, [minuteIndex]);

	return (
		<View
			className="flex-row items-center justify-center"
			style={{ height: itemHeight * 3 }}
		>
			{/* Hour Picker */}
			<View style={{ flex: 1, height: itemHeight * 3, position: "relative" }}>
				<View
					style={{
						position: "absolute",
						top: itemHeight,
						left: 0,
						right: 0,
						height: itemHeight,
						borderTopWidth: 1,
						borderBottomWidth: 1,
						borderColor: colors.primary[1],
						zIndex: 1,
						pointerEvents: "none",
					}}
				/>
				<ScrollView
					ref={hourRef}
					showsVerticalScrollIndicator={false}
					snapToInterval={itemHeight}
					decelerationRate="fast"
					contentContainerStyle={{ paddingVertical: itemHeight }}
					nestedScrollEnabled={true}
					onMomentumScrollEnd={(e) => {
						const index = Math.round(
							e.nativeEvent.contentOffset.y / itemHeight,
						);
						if (index >= 0 && index < HOURS.length) {
							handleHourChange(HOURS[index]);
						}
					}}
				>
					{HOURS.map((hour) => {
						const isSelected = displayHour === hour;
						return (
							<View
								key={hour}
								style={{
									height: itemHeight,
									justifyContent: "center",
									alignItems: "center",
								}}
							>
								<Text
									style={{
										fontSize: isSelected ? 20 : 16,
										fontWeight: isSelected ? "bold" : "normal",
										color: isSelected ? colors.primary[1] : colors.secondary[1],
									}}
								>
									{hour}
								</Text>
							</View>
						);
					})}
				</ScrollView>
			</View>

			<Text
				style={{ fontSize: 24, marginHorizontal: 8, color: colors.primary[1] }}
			>
				:
			</Text>

			{/* Minute Picker */}
			<View style={{ flex: 1, height: itemHeight * 3, position: "relative" }}>
				<View
					style={{
						position: "absolute",
						top: itemHeight,
						left: 0,
						right: 0,
						height: itemHeight,
						borderTopWidth: 1,
						borderBottomWidth: 1,
						borderColor: colors.primary[1],
						zIndex: 1,
						pointerEvents: "none",
					}}
				/>
				<ScrollView
					ref={minuteRef}
					showsVerticalScrollIndicator={false}
					snapToInterval={itemHeight}
					decelerationRate="fast"
					contentContainerStyle={{ paddingVertical: itemHeight }}
					nestedScrollEnabled={true}
					onMomentumScrollEnd={(e) => {
						const index = Math.round(
							e.nativeEvent.contentOffset.y / itemHeight,
						);
						if (index >= 0 && index < MINUTES.length) {
							handleMinuteChange(MINUTES[index]);
						}
					}}
				>
					{MINUTES.map((minute) => {
						const isSelected = displayMinuteStr === minute;
						return (
							<View
								key={minute}
								style={{
									height: itemHeight,
									justifyContent: "center",
									alignItems: "center",
								}}
							>
								<Text
									style={{
										fontSize: isSelected ? 20 : 16,
										fontWeight: isSelected ? "bold" : "normal",
										color: isSelected ? colors.primary[1] : colors.secondary[1],
									}}
								>
									{minute}
								</Text>
							</View>
						);
					})}
				</ScrollView>
			</View>

			{/* AM/PM Picker */}
			<View style={{ flex: 0.8, height: itemHeight * 3, position: "relative" }}>
				<View
					style={{
						position: "absolute",
						top: itemHeight,
						left: 0,
						right: 0,
						height: itemHeight,
						borderTopWidth: 1,
						borderBottomWidth: 1,
						borderColor: colors.primary[1],
						zIndex: 1,
						pointerEvents: "none",
					}}
				/>
				<ScrollView
					showsVerticalScrollIndicator={false}
					snapToInterval={itemHeight}
					decelerationRate="fast"
					contentContainerStyle={{ paddingVertical: itemHeight }}
					nestedScrollEnabled={true}
					onMomentumScrollEnd={(e) => {
						const index = Math.round(
							e.nativeEvent.contentOffset.y / itemHeight,
						);
						if (index >= 0 && index < 2) {
							const period = index === 0 ? "AM" : "PM";
							handlePeriodChange(period);
						}
					}}
				>
					{(["AM", "PM"] as const).map((period) => {
						const isSelected = isPM === (period === "PM");
						return (
							<View
								key={period}
								style={{
									height: itemHeight,
									justifyContent: "center",
									alignItems: "center",
								}}
							>
								<Text
									style={{
										fontSize: isSelected ? 20 : 16,
										fontWeight: isSelected ? "bold" : "normal",
										color: isSelected ? colors.primary[1] : colors.secondary[1],
									}}
								>
									{period}
								</Text>
							</View>
						);
					})}
				</ScrollView>
			</View>
		</View>
	);
};

// Preferred time preference type
type PreferredTime = {
	day: string;
	time: string;
};

export default function ScheduleScreen() {
	const navigation = useNavigation();
	const params = useLocalSearchParams<{
		serviceId?: string;
		categoryId?: string;
	}>();

	const serviceId = params.serviceId
		? Number.parseInt(params.serviceId, 10)
		: null;
	const categoryId = params.categoryId
		? Number.parseInt(params.categoryId, 10)
		: null;

	const isPersonalTraining = categoryId === SERVICE_CATEGORY.PRIVATE;

	const currentStep = 2;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const [preferredTimes, setPreferredTimes] = useState<PreferredTime[]>([]);
	const [expandedDay, setExpandedDay] = useState<string | null>(null);
	const [selectedTime, setSelectedTime] = useState<Date>(new Date());

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
				tabsNavigator.setOptions({
					tabBarStyle: { display: "none" },
				});
			}
		}, [navigation]),
	);

	// Add preferred time directly
	const handleAddPreferredTime = (day: string, time: string) => {
		if (preferredTimes.length < 4) {
			// Check if this exact combination already exists
			const exists = preferredTimes.some(
				(pt) => pt.day === day && pt.time === time,
			);
			if (!exists) {
				setPreferredTimes([...preferredTimes, { day, time }]);
			}
		}
	};

	// Remove preferred time
	const handleRemovePreferredTime = (index: number) => {
		setPreferredTimes(preferredTimes.filter((_, i) => i !== index));
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
						<Text className="flex-1 font-bold text-2xl text-primary-1">
							Select Schedule
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

					{/* Schedule Selection */}
					{isPersonalTraining ? (
						/* Personal Training: Select up to 4 preferred day and time combinations */
						<View className="mb-4">
							<Text
								className="mb-2 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								SELECT PREFERRED DAY & TIME
							</Text>
							<Text
								className="mb-6 text-sm"
								style={{ color: colors.secondary[1] }}
							>
								Select up to 4 preferred day and time combinations (
								{preferredTimes.length}/4)
							</Text>

							{/* Selected Preferred Times */}
							{preferredTimes.length > 0 && (
								<View className="mb-6">
									<Text
										className="mb-3 font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										Selected Preferences ({preferredTimes.length}/4)
									</Text>
									<View className="flex-row flex-wrap gap-2">
										{preferredTimes.map((pt) => (
											<View
												key={`${pt.day}-${pt.time}`}
												className="flex-row items-center rounded-xl border border-secondary-3 bg-secondary-3 px-4 py-3"
												style={{ minWidth: 140 }}
											>
												<View className="flex-1">
													<Text
														className="font-semibold text-sm"
														style={{ color: colors.primary[1] }}
													>
														{pt.day.substring(0, 3)}
													</Text>
													<Text
														className="mt-0.5 text-xs"
														style={{ color: colors.secondary[1] }}
													>
														{pt.time}
													</Text>
												</View>
												<TouchableOpacity
													onPress={() => handleRemovePreferredTime(index)}
													className="ml-2 h-6 w-6 items-center justify-center rounded-full"
													style={{ backgroundColor: "#EF4444" }}
												>
													<Ionicons
														name="close"
														size={14}
														color={colors.primary[2]}
													/>
												</TouchableOpacity>
											</View>
										))}
									</View>
								</View>
							)}

							{/* Day Selection - Expandable Time Slots */}
							{preferredTimes.length < 4 && (
								<View className="mb-4">
									<Text
										className="mb-3 font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										Select Day & Time
									</Text>
									<Text
										className="mb-4 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Tap a day to see available times, then select your preferred
										slots.
									</Text>

									{/* Days - Horizontal Scroll */}
									<ScrollView
										horizontal
										showsHorizontalScrollIndicator={false}
										className="mb-4"
									>
										<View className="flex-row gap-2">
											{DAYS_OF_WEEK.map((day) => {
												const hasSelections = preferredTimes.some(
													(pt) => pt.day === day,
												);
												const isExpanded = expandedDay === day;

												return (
													<TouchableOpacity
														key={day}
														onPress={() =>
															setExpandedDay(isExpanded ? null : day)
														}
														className="flex-row items-center rounded-xl border px-4 py-3"
														style={{
															backgroundColor: isExpanded
																? colors.primary[1]
																: hasSelections
																	? "#E0F2FE"
																	: colors.primary[2],
															borderColor: isExpanded
																? colors.primary[1]
																: hasSelections
																	? colors.primary[1]
																	: colors.secondary[3],
															borderWidth: 1,
															minWidth: 100,
														}}
													>
														<Text
															className="font-semibold text-sm"
															style={{
																color: isExpanded
																	? colors.primary[2]
																	: colors.primary[1],
															}}
														>
															{day}
														</Text>
														{hasSelections && !isExpanded && (
															<View
																className="ml-2 h-2 w-2 rounded-full"
																style={{ backgroundColor: colors.primary[1] }}
															/>
														)}
														{isExpanded && (
															<Ionicons
																name="chevron-up"
																size={16}
																color={colors.primary[2]}
																style={{ marginLeft: 4 }}
															/>
														)}
													</TouchableOpacity>
												);
											})}
										</View>
									</ScrollView>

									{/* Time Picker - Show only for expanded day */}
									{expandedDay && (
										<View className="rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
											<Text
												className="mb-4 font-semibold text-sm"
												style={{ color: colors.primary[1] }}
											>
												Select time for {expandedDay}
											</Text>

											{/* Display selected time */}
											<View className="mb-4">
												<Text
													className="mb-3 font-semibold text-base"
													style={{ color: colors.primary[1] }}
												>
													{formatTime(selectedTime)}
												</Text>
											</View>

											{/* Time Picker - Custom inline for Android, native spinner for iOS */}
											<View className="mb-4 rounded-xl bg-primary-2 p-4">
												{Platform.OS === "ios" ? (
													<DateTimePicker
														value={selectedTime}
														mode="time"
														is24Hour={false}
														display="spinner"
														onChange={(
															event: { type: string },
															date?: Date,
														) => {
															if (event.type !== "dismissed" && date) {
																setSelectedTime(date);
															}
														}}
														style={{ alignSelf: "center", height: 200 }}
													/>
												) : (
													<AndroidTimePicker
														selectedTime={selectedTime}
														onTimeChange={setSelectedTime}
													/>
												)}
											</View>

											{/* Add Time Button */}
											<TouchableOpacity
												onPress={() => {
													const timeString = formatTime(selectedTime);
													if (preferredTimes.length < 4) {
														handleAddPreferredTime(expandedDay, timeString);
													}
												}}
												disabled={preferredTimes.length >= 4}
												className="flex-row items-center justify-center rounded-xl bg-primary-1 py-3.5"
												style={{
													backgroundColor: colors.primary[1],
													opacity: preferredTimes.length >= 4 ? 0.5 : 1,
												}}
											>
												<Ionicons
													name="add-circle-outline"
													size={20}
													color={colors.primary[2]}
													style={{ marginRight: 8 }}
												/>
												<Text className="font-semibold text-base text-primary-2">
													Add This Time
												</Text>
											</TouchableOpacity>

											{/* Show already selected times for this day */}
											{preferredTimes.filter((pt) => pt.day === expandedDay)
												.length > 0 && (
												<View className="mt-4">
													<Text
														className="mb-2 font-semibold text-xs"
														style={{ color: colors.secondary[1] }}
													>
														Already selected for {expandedDay}:
													</Text>
													<View className="flex-row flex-wrap gap-2">
														{preferredTimes
															.filter((pt) => pt.day === expandedDay)
															.map((pt) => (
																<TouchableOpacity
																	key={`${pt.day}-${pt.time}`}
																	onPress={() => {
																		const removeIndex =
																			preferredTimes.findIndex(
																				(p) =>
																					p.day === pt.day &&
																					p.time === pt.time,
																			);
																		if (removeIndex !== -1) {
																			handleRemovePreferredTime(removeIndex);
																		}
																	}}
																	className="flex-row items-center rounded-lg bg-secondary-3 px-3 py-2"
																>
																	<Text
																		className="font-medium text-xs"
																		style={{ color: colors.primary[1] }}
																	>
																		{pt.time}
																	</Text>
																	<Ionicons
																		name="close"
																		size={14}
																		color={colors.primary[1]}
																		style={{ marginLeft: 6 }}
																	/>
																</TouchableOpacity>
															))}
													</View>
												</View>
											)}
										</View>
									)}
								</View>
							)}
						</View>
					) : (
						/* Classes: Fixed Schedule Display */
						<View className="mb-4">
							<Text
								className="mb-4 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								CLASS SCHEDULE
							</Text>

							<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<Text
									className="mb-2 font-bold text-lg"
									style={{ color: colors.primary[1] }}
								>
									{serviceId === 3 ? "Class A" : "Class B"}
								</Text>
								<Text
									className="mb-1 text-base"
									style={{ color: colors.secondary[1] }}
								>
									{serviceId === 3
										? "Every Mon/Wed/Fri at 7:00 PM"
										: "Every Tue at 8:00 AM"}
								</Text>
								<Text
									className="mt-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									This class has a fixed schedule. Your package will include all
									scheduled sessions.
								</Text>
							</View>
						</View>
					)}
				</View>
			</ScrollView>

			{/* Continue Button */}
			{(isPersonalTraining ? preferredTimes.length > 0 : true) && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-secondary-3 border-t bg-primary-2"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={() =>
								router.push({
									pathname: "./info" as never,
									params: {
										serviceId: serviceId?.toString(),
										categoryId: categoryId?.toString(),
										preferredTimes: JSON.stringify(preferredTimes),
									},
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
