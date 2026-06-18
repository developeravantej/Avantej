import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import {
	FlatList,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { WeeklyTimetable } from "@/components/weekly-timetable";
import { useOrganizationContext } from "@/contexts/organization-context";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

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

// Custom Android Time Picker Component
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
					style={[
						pickerStyles.indicator,
						{ top: itemHeight, height: itemHeight },
					]}
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
					{/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list -- fixed-size snap-picker (12 hours), FlatList breaks snapToInterval UX */}
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
					style={[
						pickerStyles.indicator,
						{ top: itemHeight, height: itemHeight },
					]}
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
					{/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list -- fixed-size snap-picker (12 minutes), FlatList breaks snapToInterval UX */}
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
					style={[
						pickerStyles.indicator,
						{ top: itemHeight, height: itemHeight },
					]}
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
					{/* react-doctor-disable-next-line react-doctor/rn-no-scrollview-mapped-list -- fixed-size snap-picker (2 items AM/PM), FlatList breaks snapToInterval UX */}
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

type PreferredTime = {
	day: string;
	time: string;
};

const trainerRowStyles = StyleSheet.create({
	name: { color: colors.primary[1] },
	email: { color: colors.secondary[1] },
});

const pickerStyles = StyleSheet.create({
	indicator: {
		position: "absolute",
		left: 0,
		right: 0,
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: colors.primary[1],
		zIndex: 1,
		pointerEvents: "none",
	},
});

const slotCardStyles = StyleSheet.create({
	closeButton: {
		position: "absolute",
		top: 8,
		right: 8,
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "rgba(255,255,255,0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
	addCard: {
		width: "48%",
		minHeight: 110,
		borderRadius: 16,
		borderStyle: "dashed",
		borderWidth: 1.5,
		borderColor: colors.secondary[1],
		alignItems: "center",
		justifyContent: "center",
		padding: 14,
	},
});

type TrainerLike = {
	trainerId: string;
	trainerName: string;
	trainerEmail?: string | null;
};

const TrainerRow = memo(function TrainerRow({
	item,
	onPick,
}: {
	item: TrainerLike;
	onPick: (id: string, name: string) => void;
}) {
	const handlePress = useCallback(
		() => onPick(item.trainerId, item.trainerName),
		[item.trainerId, item.trainerName, onPick],
	);
	return (
		<Pressable
			onPress={handlePress}
			className="border-b border-secondary-3 py-3"
		>
			<Text style={trainerRowStyles.name} className="font-medium text-base">
				{item.trainerName}
			</Text>
			{item.trainerEmail ? (
				<Text style={trainerRowStyles.email} className="text-xs">
					{item.trainerEmail}
				</Text>
			) : null}
		</Pressable>
	);
});

// react-doctor-disable-next-line react-doctor/prefer-useReducer, react-doctor/no-giant-component -- prefer-useReducer: independent state vars with no cross-state transitions; no-giant-component: buy-package schedule with nested snap pickers, calendar, recurrence config, needs further refactor PR
export default function ScheduleScreen() {
	const { organizationId } = useOrganization();
	const { organizations } = useOrganizationContext();
	const { state, update } = usePurchaseFlow();

	// Appointment-style services let the user pick preferred days/times.
	// Class-slot services have a fixed recurring schedule on the service row.
	const isAppointment = state.schedulingType !== "class_slot";

	const currentStep = 2;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const [preferredTimes, setPreferredTimes] = useState<PreferredTime[]>(
		state.preferredTimes,
	);
	const [expandedDay, setExpandedDay] = useState<string | null>(null);
	const [selectedTime, setSelectedTime] = useState<Date>(new Date());
	const [pickerOpen, setPickerOpen] = useState(false);

	// Trainer selection (merged from former trainer.tsx step)
	const currentOrg = organizations.find((o) => o.id === organizationId);
	const customerHierarchyScopeId =
		currentOrg?.hierarchy?.member?.hierarchyScopeId ?? undefined;

	const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(
		state.preferredTrainerId ?? null,
	);
	const [trainerDropdownOpen, setTrainerDropdownOpen] = useState(false);

	const trainersQuery = useQuery(
		orpc.coachIntake.listByBranch.queryOptions({
			input: {
				organizationId,
				...(customerHierarchyScopeId
					? { branchId: customerHierarchyScopeId }
					: {}),
			},
		}),
	);

	const trainers =
		(trainersQuery.data as
			| Array<{
					trainerId: string;
					trainerName: string;
					trainerEmail: string;
					slots: Array<{
						dayOfWeek: string;
						startTime: string;
						endTime: string;
					}>;
			  }>
			| undefined) ?? [];

	const selectedTrainer = trainers.find(
		(t) => t.trainerId === selectedTrainerId,
	);

	const handlePickTrainerFromList = useCallback(
		(id: string, name: string) => {
			update({
				preferredTrainerId: id,
				preferredTrainerName: name,
			});
			setSelectedTrainerId(id);
			setTrainerDropdownOpen(false);
		},
		[update],
	);

	const renderTrainerItem = useCallback(
		({ item }: { item: TrainerLike }) => (
			<TrainerRow item={item} onPick={handlePickTrainerFromList} />
		),
		[handlePickTrainerFromList],
	);

	const canContinue = isAppointment
		? !!selectedTrainerId && preferredTimes.length > 0
		: true;

	// Add preferred time directly
	const handleAddPreferredTime = (day: string, time: string) => {
		if (preferredTimes.length < 4) {
			const exists = preferredTimes.some(
				(pt) => pt.day === day && pt.time === time,
			);
			if (!exists) {
				setPreferredTimes((prev) => [...prev, { day, time }]);
			}
		}
	};

	// Remove preferred time
	const handleRemovePreferredTime = (index: number) => {
		setPreferredTimes(preferredTimes.filter((_, i) => i !== index));
	};

	const handleContinue = () => {
		if (!canContinue) return;
		update({ preferredTimes });
		router.push("./info");
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<Pressable
							onPress={() => router.back()}
							className="mr-3 size-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</Pressable>
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
						contentFit="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Progress Indicator */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="font-semibold text-primary-1 text-sm">
								Step {currentStep} of {totalSteps}
							</Text>
							<Text className="font-semibold text-primary-1 text-sm">
								{progressPercentage}%
							</Text>
						</View>

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
														className="size-6 items-center justify-center rounded-full border-2 border-primary-1"
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
														className="size-6 items-center justify-center rounded-full border-2 border-primary-1"
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
													<View
														className="size-6 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
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

					{isAppointment && (
						<>
							{/* Trainer Selection */}
							<View className="mb-4">
								<Text
									className="mb-2 font-bold text-sm uppercase tracking-wide"
									style={{ color: colors.primary[1] }}
								>
									CHOOSE YOUR TRAINER
								</Text>
								<Text
									className="mb-4 text-base"
									style={{ color: colors.primary[1] }}
								>
									Select a trainer to view their intake availability for new
									clients.
								</Text>

								{trainersQuery.isLoading ? (
									<View className="h-12 rounded-xl bg-secondary-3" />
								) : (
									<Pressable
										onPress={() => setTrainerDropdownOpen(true)}
										className="flex-row items-center justify-between rounded-xl border border-secondary-3 bg-primary-2 px-4 py-3"
									>
										<Text
											style={{
												color: selectedTrainerId
													? colors.primary[1]
													: colors.secondary[1],
											}}
										>
											{selectedTrainer?.trainerName ?? "Select a trainer..."}
										</Text>
										<Ionicons
											name="chevron-down"
											size={16}
											color={colors.secondary[1]}
										/>
									</Pressable>
								)}
							</View>

							{/* Trainer Availability Preview */}
							{selectedTrainerId && (
								<View className="mb-6">
									<Text
										className="mb-3 font-bold text-sm uppercase tracking-wide"
										style={{ color: colors.primary[1] }}
									>
										Trainer Availability
									</Text>
									{(selectedTrainer?.slots ?? []).length === 0 ? (
										<View className="items-center rounded-2xl border border-secondary-3 bg-card py-8">
											<Ionicons
												name="calendar-outline"
												size={32}
												color={colors.secondary[1]}
											/>
											<Text
												className="mt-2 text-sm italic"
												style={{ color: colors.secondary[1] }}
											>
												No intake slots this week
											</Text>
										</View>
									) : (
										<View className="rounded-2xl border border-secondary-3 bg-card overflow-hidden">
											<WeeklyTimetable slots={selectedTrainer?.slots ?? []} />
										</View>
									)}
								</View>
							)}

							{/* Trainer Dropdown Modal */}
							<Modal
								visible={trainerDropdownOpen}
								transparent
								animationType="fade"
								onRequestClose={() => setTrainerDropdownOpen(false)}
							>
								<Pressable
									style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
									onPress={() => setTrainerDropdownOpen(false)}
								>
									<View className="mx-4 mt-32 rounded-2xl bg-primary-2 p-4">
										<Text
											className="mb-3 font-bold text-base"
											style={{ color: colors.primary[1] }}
										>
											Select a Trainer
										</Text>
										<FlatList
											data={trainers}
											keyExtractor={(item) => item.trainerId}
											renderItem={renderTrainerItem}
										/>
										<Pressable
											onPress={() => setTrainerDropdownOpen(false)}
											className="mt-3 items-center py-3"
										>
											<Text style={{ color: colors.secondary[1] }}>Cancel</Text>
										</Pressable>
									</View>
								</Pressable>
							</Modal>
						</>
					)}

					{/* Schedule Selection */}
					{isAppointment ? (
						/* Appointment: 4-slot deck of preferred day+time picks */
						<View className="mb-4">
							<Text
								className="mb-2 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								Your Preferences
							</Text>
							<Text
								className="mb-4 text-sm"
								style={{ color: colors.secondary[1] }}
							>
								Pick up to 4 day + time combinations.
							</Text>

							{/* Progress card */}
							<View
								className="mb-4 flex-row items-center justify-between rounded-2xl border border-secondary-3 px-4 py-3"
								style={{ backgroundColor: colors.secondary[3] }}
							>
								<Text
									className="font-bold text-sm"
									style={{ color: colors.primary[1] }}
								>
									{preferredTimes.length} of 4 added
								</Text>
								<Text
									className="text-xs"
									style={{ color: colors.secondary[1] }}
								>
									{4 - preferredTimes.length === 0
										? "All slots filled"
										: `${4 - preferredTimes.length} slot${
												4 - preferredTimes.length === 1 ? "" : "s"
											} remaining`}
								</Text>
							</View>

							{/* 2x2 slot deck */}
							<View
								style={{
									flexDirection: "row",
									flexWrap: "wrap",
									gap: 10,
								}}
							>
								{[0, 1, 2, 3].map((slotIdx) => {
									const pref = preferredTimes[slotIdx];
									const label = `PREF ${String(slotIdx + 1).padStart(2, "0")}`;

									if (pref) {
										return (
											<View
												key={`pref-${slotIdx}`}
												style={{
													width: "48%",
													minHeight: 110,
													borderRadius: 16,
													backgroundColor: colors.primary[1],
													padding: 14,
													justifyContent: "space-between",
													position: "relative",
												}}
											>
												<Pressable
													onPress={() => handleRemovePreferredTime(slotIdx)}
													style={slotCardStyles.closeButton}
												>
													<Ionicons
														name="close"
														size={14}
														color={colors.primary[2]}
													/>
												</Pressable>
												<Text
													style={{
														color: colors.primary[2],
														fontSize: 12,
														fontWeight: "800",
														// react-doctor-disable-next-line react-doctor/no-wide-letter-spacing -- short uppercase label, rule permits
														letterSpacing: 1.4,
														opacity: 0.6,
													}}
												>
													{label}
												</Text>
												<View>
													<Text
														style={{
															color: colors.primary[2],
															fontSize: 22,
															fontWeight: "900",
															letterSpacing: -0.5,
														}}
													>
														{pref.day.substring(0, 3)}
													</Text>
													<Text
														style={{
															color: colors.primary[2],
															fontSize: 13,
															fontWeight: "700",
															opacity: 0.85,
															marginTop: 2,
														}}
													>
														{pref.time}
													</Text>
												</View>
											</View>
										);
									}

									return (
										<Pressable
											key={`pref-${slotIdx}`}
											onPress={() => {
												if (!expandedDay) setExpandedDay(DAYS_OF_WEEK[0]);
												setPickerOpen(true);
											}}
											style={slotCardStyles.addCard}
										>
											<Text
												style={{
													color: colors.secondary[1],
													fontSize: 32,
													fontWeight: "300",
													lineHeight: 36,
												}}
											>
												+
											</Text>
											<Text
												style={{
													color: colors.secondary[1],
													fontSize: 12,
													fontWeight: "700",
													marginTop: 4,
													// react-doctor-disable-next-line react-doctor/no-wide-letter-spacing -- short uppercase label, rule permits
													letterSpacing: 1.2,
												}}
											>
												ADD {String(slotIdx + 1).padStart(2, "0")}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</View>
					) : (
						/* Class slot: read-only display of the preset time slots */
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
									{state.serviceName ?? "Class"}
								</Text>

								{state.timePresetConfig &&
								state.timePresetConfig.recurringDays.length > 0 ? (
									<View className="mt-3">
										{state.timePresetConfig.recurringDays.map((day) => {
											const slots =
												state.timePresetConfig?.timeSlotsPerDay[day] ?? [];
											return (
												<View
													key={day}
													className="mb-3 border-secondary-3 border-b pb-3 last:border-b-0 last:mb-0 last:pb-0"
												>
													<Text
														className="mb-2 font-semibold text-sm uppercase tracking-wide"
														style={{ color: colors.primary[1] }}
													>
														{day}
													</Text>
													<View className="flex-row flex-wrap gap-2">
														{slots.length > 0 ? (
															slots.map((time) => (
																<View
																	key={`${day}-${time}`}
																	className="rounded-full border border-secondary-3 bg-secondary-3 px-3 py-1.5"
																>
																	<Text
																		className="font-medium text-xs"
																		style={{ color: colors.primary[1] }}
																	>
																		{time}
																	</Text>
																</View>
															))
														) : (
															<Text
																className="text-xs italic"
																style={{ color: colors.secondary[1] }}
															>
																No slots configured
															</Text>
														)}
													</View>
												</View>
											);
										})}
									</View>
								) : (
									<Text
										className="mt-2 text-sm italic"
										style={{ color: colors.secondary[1] }}
									>
										No recurring schedule configured for this class.
									</Text>
								)}
							</View>
						</View>
					)}
				</View>
			</ScrollView>

			{/* Continue Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="p-4">
					<Pressable
						onPress={handleContinue}
						disabled={!canContinue}
						className="items-center justify-center rounded-xl bg-primary-1 py-4"
						style={{ opacity: canContinue ? 1 : 0.4 }}
					>
						<Text className="font-semibold text-base text-primary-2">
							Continue
						</Text>
					</Pressable>
				</View>
			</SafeAreaView>

			{/* Add-slot picker modal */}
			<Modal
				visible={pickerOpen && preferredTimes.length < 4}
				transparent
				animationType="slide"
				onRequestClose={() => setPickerOpen(false)}
			>
				<View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
					<Pressable style={{ flex: 1 }} onPress={() => setPickerOpen(false)} />
					<View
						style={{
							backgroundColor: colors.primary[2],
							borderTopLeftRadius: 28,
							borderTopRightRadius: 28,
							paddingHorizontal: 20,
							paddingTop: 12,
							paddingBottom: 32,
						}}
					>
						<View
							style={{
								width: 36,
								height: 4,
								borderRadius: 99,
								backgroundColor: colors.secondary[3],
								alignSelf: "center",
								marginBottom: 14,
							}}
						/>

						<View className="mb-4 flex-row items-center justify-between">
							<Text
								className="font-bold text-base uppercase"
								style={{
									color: colors.primary[1],
									// react-doctor-disable-next-line react-doctor/no-wide-letter-spacing -- short uppercase label, rule permits
									letterSpacing: 1.4,
								}}
							>
								Add slot {String(preferredTimes.length + 1).padStart(2, "0")}
							</Text>
							<Pressable
								onPress={() => setPickerOpen(false)}
								style={{
									width: 32,
									height: 32,
									borderRadius: 16,
									alignItems: "center",
									justifyContent: "center",
									backgroundColor: colors.secondary[3],
								}}
							>
								<Ionicons name="close" size={18} color={colors.primary[1]} />
							</Pressable>
						</View>

						<Text
							className="mb-2 font-semibold text-xs uppercase"
							style={{
								color: colors.secondary[1],
								// react-doctor-disable-next-line react-doctor/no-wide-letter-spacing -- short uppercase label, rule permits
								letterSpacing: 1.2,
							}}
						>
							Day
						</Text>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							className="mb-4"
						>
							<View className="flex-row gap-2">
								{DAYS_OF_WEEK.map((day) => {
									const active = expandedDay === day;
									return (
										<Pressable
											key={day}
											onPress={() => setExpandedDay(day)}
											className="rounded-xl border px-4 py-3"
											style={{
												backgroundColor: active
													? colors.primary[1]
													: colors.primary[2],
												borderColor: active
													? colors.primary[1]
													: colors.secondary[3],
											}}
										>
											<Text
												className="font-semibold text-sm"
												style={{
													color: active ? colors.primary[2] : colors.primary[1],
												}}
											>
												{day.substring(0, 3)}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</ScrollView>

						<Text
							className="mb-2 font-semibold text-xs uppercase"
							style={{
								color: colors.secondary[1],
								// react-doctor-disable-next-line react-doctor/no-wide-letter-spacing -- short uppercase label, rule permits
								letterSpacing: 1.2,
							}}
						>
							Time
						</Text>
						<View
							className="mb-4 rounded-xl p-4"
							style={{ backgroundColor: colors.secondary[3] }}
						>
							<Text
								className="mb-2 font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{formatTime(selectedTime)}
							</Text>
							{Platform.OS === "ios" ? (
								<DateTimePicker
									value={selectedTime}
									mode="time"
									is24Hour={false}
									display="spinner"
									onChange={(event: { type: string }, date?: Date) => {
										if (event.type !== "dismissed" && date) {
											setSelectedTime(date);
										}
									}}
									style={{ alignSelf: "center", height: 180 }}
								/>
							) : (
								<AndroidTimePicker
									selectedTime={selectedTime}
									onTimeChange={setSelectedTime}
								/>
							)}
						</View>

						<Pressable
							onPress={() => {
								if (!expandedDay) return;
								const timeString = formatTime(selectedTime);
								handleAddPreferredTime(expandedDay, timeString);
								setPickerOpen(false);
							}}
							className="flex-row items-center justify-center rounded-xl py-4"
							style={{ backgroundColor: colors.primary[1] }}
						>
							<Ionicons
								name="checkmark"
								size={20}
								color={colors.primary[2]}
								style={{ marginRight: 8 }}
							/>
							<Text className="font-semibold text-base text-primary-2">
								Add This Slot
							</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</Container>
	);
}
