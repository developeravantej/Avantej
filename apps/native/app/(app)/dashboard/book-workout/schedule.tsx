import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { useBookingFlow } from "@/contexts/booking-flow-context";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: true },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Done", active: false },
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

// Generate 1-on-1 time slots from 8AM to 7PM
const generatePrivateTimeSlots = () => {
	const slots = [];
	for (let hour = 8; hour <= 19; hour++) {
		const period = hour >= 12 ? "PM" : "AM";
		const displayHour = hour > 12 ? hour - 12 : hour;
		slots.push(`${displayHour}:00 ${period}`);
	}
	return slots;
};

// Parse time string like "10:00 AM" into [hours24, minutes]
const parseTime = (timeStr: string): [number, number] => {
	const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
	if (!match) return [0, 0];
	let hours = Number.parseInt(match[1], 10);
	const minutes = Number.parseInt(match[2], 10);
	const period = match[3].toUpperCase();
	if (period === "PM" && hours !== 12) hours += 12;
	if (period === "AM" && hours === 12) hours = 0;
	return [hours, minutes];
};

// Format ISO time string to display format
const formatTime = (isoString: string): string => {
	const date = new Date(isoString);
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const period = hours >= 12 ? "PM" : "AM";
	const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
	return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
};

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
export default function ScheduleScreen() {
	const { organizationId } = useOrganization();
	const { state, update } = useBookingFlow();

	const isClassSlot = state.schedulingType === "class_slot";
	const isPrivate = !isClassSlot && state.serviceType === "private";

	const currentStep = 2;
	const totalSteps = 4;
	const progressPercentage = 50;

	const [viewMode, setViewMode] = useState<"week" | "month">("week");
	const [selectedDate, setSelectedDate] = useState<Date | null>(null);
	const [selectedTime, setSelectedTime] = useState<string | null>(null);
	const [selectedClassSlotId, setSelectedClassSlotId] = useState<
		string | null
	>(null);
	// Class-slot recurring picker state
	const [selectedRecurringDay, setSelectedRecurringDay] = useState<
		string | null
	>(null);

	const dates = generateDates();
	const privateTimeSlots = generatePrivateTimeSlots();

	// Resolve the next upcoming concrete date (>= today) for a given day name
	// like "Monday" so downstream review/done can show a real date.
	const nextDateForDayName = (dayName: string): Date | null => {
		const map: Record<string, number> = {
			sunday: 0,
			monday: 1,
			tuesday: 2,
			wednesday: 3,
			thursday: 4,
			friday: 5,
			saturday: 6,
		};
		const target = map[dayName.toLowerCase()];
		if (target === undefined) return null;
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		const diff = (target - d.getDay() + 7) % 7;
		d.setDate(d.getDate() + diff);
		return d;
	};

	// Build ISO date range for class slots query
	const selectedDateISO = useMemo(() => {
		if (!selectedDate) return "";
		const d = new Date(selectedDate);
		d.setHours(0, 0, 0, 0);
		return d.toISOString();
	}, [selectedDate]);

	const nextDayISO = useMemo(() => {
		if (!selectedDate) return "";
		const d = new Date(selectedDate);
		d.setDate(d.getDate() + 1);
		d.setHours(0, 0, 0, 0);
		return d.toISOString();
	}, [selectedDate]);

	// Fetch class slots for the selected date (only for non-private services)
	const {
		data: classSlots,
		isLoading: classSlotsLoading,
	} = useQuery({
		...orpc.classSlots.list.queryOptions({
			input: {
				organizationId,
				serviceId: state.serviceId!,
				from: selectedDateISO,
				to: nextDayISO,
			},
		}),
		enabled: !isPrivate && !isClassSlot && !!selectedDate && !!state.serviceId,
	});

	const handleContinue = () => {
		// Class-slot path: pick a recurring day + preset time, then resolve the
		// next upcoming concrete date for that day.
		if (isClassSlot) {
			if (!selectedRecurringDay || !selectedTime) return;
			const dt = nextDateForDayName(selectedRecurringDay);
			if (!dt) return;
			const [hours, minutes] = parseTime(selectedTime);
			dt.setHours(hours, minutes, 0, 0);

			update({
				date: dt.toISOString().split("T")[0],
				startTime: dt.toISOString(),
				duration: state.serviceDuration ?? 60,
				classSlotId: null,
			});
			router.push("./review");
			return;
		}

		if (!selectedDate || !selectedTime) return;

		if (isPrivate) {
			// Build ISO datetime from selected date and time
			const [hours, minutes] = parseTime(selectedTime);
			const dt = new Date(selectedDate);
			dt.setHours(hours, minutes, 0, 0);

			update({
				date: selectedDate.toISOString().split("T")[0],
				startTime: dt.toISOString(),
				duration: state.serviceDuration ?? 60,
				classSlotId: null,
			});
		} else {
			// For class, use the class slot's startTime
			const selectedSlot = classSlots?.find(
				(s: any) => s.id === selectedClassSlotId,
			);

			update({
				date: selectedDate.toISOString().split("T")[0],
				startTime: selectedSlot?.startTime ?? selectedTime,
				duration: state.serviceDuration ?? 60,
				classSlotId: selectedClassSlotId,
			});
		}
		router.push("./review");
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header with Title */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<Pressable
							onPress={() => router.back()}
							className="mr-3 size-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</Pressable>
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
						contentFit="cover"
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
														className="size-6 items-center justify-center rounded-full"
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
													{/* Active step: Blue circle with white dot inside - covers the line */}
													<View
														className="size-6 items-center justify-center rounded-full"
														style={{
															backgroundColor: colors.primary[1],
															zIndex: 2,
														}}
													>
														<View
															className="size-2 rounded-full"
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

					{/* Schedule Selection Section */}
					{isClassSlot ? (
						/* Class-slot: pick from preset recurring day + time */
						<View className="mb-4">
							<Text
								className="mb-4 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								SELECT DAY & TIME
							</Text>

							{!state.timePresetConfig ||
							state.timePresetConfig.recurringDays.length === 0 ? (
								<View className="rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
									<Text className="text-center text-secondary-1 text-sm">
										No recurring schedule configured for this class.
									</Text>
								</View>
							) : (
								<>
									{/* Recurring days */}
									<View className="mb-4">
										<Text
											className="mb-2 text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Select Day
										</Text>
										<ScrollView
											horizontal
											showsHorizontalScrollIndicator={false}
										>
											{state.timePresetConfig.recurringDays.map((day) => {
												const isSelected = selectedRecurringDay === day;
												return (
													<Pressable
														key={day}
														onPress={() => {
															setSelectedRecurringDay(day);
															setSelectedTime(null);
														}}
														className={`mr-3 rounded-2xl p-3 ${
															isSelected ? "" : "border border-secondary-3"
														}`}
														style={{
															backgroundColor: isSelected
																? colors.primary[1]
																: colors.primary[2],
															minWidth: 96,
															alignItems: "center",
														}}
													>
														<Text
															className="font-semibold text-sm"
															style={{
																color: isSelected
																	? colors.primary[2]
																	: colors.primary[1],
															}}
														>
															{day}
														</Text>
													</Pressable>
												);
											})}
										</ScrollView>
									</View>

									{/* Time slots for selected day */}
									<View>
										<Text
											className="mb-3 text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Select Time
										</Text>
										{!selectedRecurringDay ? (
											<View className="rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
												<Text className="text-center text-secondary-1 text-sm">
													Please select a day first
												</Text>
											</View>
										) : (state.timePresetConfig.timeSlotsPerDay[
												selectedRecurringDay
											]?.length ?? 0) === 0 ? (
											<View className="rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
												<Text className="text-center text-secondary-1 text-sm">
													No time slots configured for {selectedRecurringDay}
												</Text>
											</View>
										) : (
											<View className="flex-row flex-wrap">
												{state.timePresetConfig.timeSlotsPerDay[
													selectedRecurringDay
												]!.map((time) => {
													const isSelected = selectedTime === time;
													return (
														<Pressable
															key={time}
															onPress={() => setSelectedTime(time)}
															className={`mr-3 mb-3 rounded-xl p-3 ${
																isSelected
																	? "border-2"
																	: "border border-secondary-3"
															}`}
															style={{
																backgroundColor: colors.primary[2],
																borderColor: isSelected
																	? colors.primary[1]
																	: "transparent",
																width: "30%",
																minWidth: 100,
															}}
														>
															<Text
																className="text-center text-sm"
																style={{ color: colors.primary[1] }}
															>
																{time}
															</Text>
														</Pressable>
													);
												})}
											</View>
										)}
									</View>
								</>
							)}
						</View>
					) : isPrivate ? (
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
											<Pressable
												key={date.toISOString()}
												onPress={() => setSelectedDate(date)}
												className={`mr-3 rounded-2xl p-3 ${
													isSelected ? "" : "border border-secondary-3"
												}`}
												style={{
													backgroundColor: isSelected
														? colors.primary[1]
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
											</Pressable>
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
									{privateTimeSlots.map((time) => {
										const isSelected = selectedTime === time;
										return (
											<Pressable
												key={time}
												onPress={() => setSelectedTime(time)}
												className={`mr-3 mb-3 rounded-xl p-3 ${
													isSelected ? "border-2" : "border border-secondary-3"
												}`}
												style={{
													backgroundColor: colors.primary[2],
													borderColor: isSelected
														? colors.primary[1]
														: "transparent",
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
											</Pressable>
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
										<Pressable
											onPress={() => setViewMode("week")}
											className={`mr-2 rounded-lg px-3 py-1 ${
												viewMode === "week"
													? "border border-secondary-3 bg-primary-2"
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
										</Pressable>
										<Pressable
											onPress={() => setViewMode("month")}
											className={`rounded-lg px-3 py-1 ${
												viewMode === "month"
													? "border border-secondary-3 bg-primary-2"
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
										</Pressable>
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
											<Pressable
												key={date.toISOString()}
												onPress={() => {
													setSelectedDate(date);
													setSelectedTime(null);
													setSelectedClassSlotId(null);
												}}
												className={`mr-3 rounded-2xl p-3 ${
													isSelected ? "" : "border border-secondary-3"
												}`}
												style={{
													backgroundColor: isSelected
														? colors.primary[1]
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
											</Pressable>
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
								{!selectedDate ? (
									<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
										<Text className="text-center text-secondary-1 text-sm">
											Please select a date first
										</Text>
									</View>
								) : classSlotsLoading ? (
									<View className="items-center py-8">
										<ActivityIndicator
											size="large"
											color={colors.primary[1]}
										/>
									</View>
								) : !classSlots || classSlots.length === 0 ? (
									<View className="mb-3 rounded-2xl border border-secondary-3 bg-secondary-3 p-4">
										<Text className="text-center text-secondary-1 text-sm">
											No available slots for this date
										</Text>
									</View>
								) : (
									<View className="flex-row flex-wrap">
										{classSlots.map((slot: any) => {
											const spotsLeft =
												slot.capacity - (slot.currentBookings ?? 0);
											const isFull = spotsLeft <= 0;
											const isSelected = selectedClassSlotId === slot.id;
											const isUnavailable =
												isFull || slot.status === "cancelled";
											const displayTime = formatTime(slot.startTime);

											return (
												<Pressable
													key={slot.id}
													onPress={() => {
														if (!isUnavailable) {
															setSelectedTime(displayTime);
															setSelectedClassSlotId(slot.id);
														}
													}}
													disabled={isUnavailable}
													className={`mr-3 mb-3 rounded-xl p-3 ${
														isSelected
															? "border-2"
															: isUnavailable
																? ""
																: "border border-secondary-3"
													}`}
													style={{
														backgroundColor: isUnavailable
															? colors.secondary[3]
															: colors.primary[2],
														borderColor: isSelected
															? colors.primary[1]
															: "transparent",
														width: "30%",
														minWidth: 100,
													}}
												>
													<Text
														className="text-center text-sm"
														style={{
															color: isUnavailable
																? colors.secondary[1]
																: colors.primary[1],
														}}
													>
														{displayTime}
													</Text>
													{isFull ? (
														<Text
															className="mt-1 text-center text-xs"
															style={{ color: colors.secondary[1] }}
														>
															Full
														</Text>
													) : (
														<Text
															className="mt-1 text-center text-xs"
															style={{ color: colors.secondary[1] }}
														>
															{spotsLeft} spots left
														</Text>
													)}
												</Pressable>
											);
										})}
									</View>
								)}

								{/* Waitlist Option */}
								<Pressable className="mt-2 items-center">
									<Text className="text-primary-1 text-sm">Join waitlist</Text>
								</Pressable>
							</View>
						</View>
					)}
				</View>
			</ScrollView>

			{/* Continue Button — gate depends on schedulingType */}
			{(isClassSlot
				? !!selectedRecurringDay && !!selectedTime
				: !!selectedDate && !!selectedTime) && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-secondary-3 border-t bg-primary-2"
				>
					<View className="p-4">
						<Pressable
							onPress={handleContinue}
							className="items-center justify-center rounded-xl bg-primary-1 py-4"
						>
							<Text className="font-semibold text-base text-primary-2">
								Continue
							</Text>
						</Pressable>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
