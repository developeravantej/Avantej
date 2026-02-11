import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Calendar } from "react-native-calendars";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

// Generate dummy booking data with current dates
const getBookingsData = () => {
	const today = new Date();
	const currentYear = today.getFullYear();
	const currentMonth = today.getMonth();

	// Helper to format date as YYYY-MM-DD
	const formatDate = (date: Date) => {
		return date.toISOString().split("T")[0];
	};

	// Generate dates for current and next month
	const dates: Record<
		string,
		{
			marked: boolean;
			dotColor: string;
			bookings: Array<{
				id: number;
				name: string;
				time: string;
				credits: number;
				icon: string;
				trainer?: string;
				instructor?: string;
				studio?: string;
			}>;
		}
	> = {};

	// Add bookings for various dates
	const bookingDates = [
		{
			day: 3,
			bookings: [
				{
					id: 1,
					name: "HIIT Class",
					time: "9:00 AM",
					credits: -1,
					icon: "flash",
					studio: "PowerFit Studio",
				},
				{
					id: 2,
					name: "Personal Training",
					time: "2:00 PM",
					credits: -1,
					icon: "person",
					trainer: "Sarah Johnson",
				},
			],
		},
		{
			day: 7,
			bookings: [
				{
					id: 3,
					name: "Strength Training",
					time: "10:00 AM",
					credits: -1,
					icon: "fitness",
					trainer: "Mike Chen",
				},
			],
		},
		{
			day: 12,
			bookings: [
				{
					id: 4,
					name: "Yoga Flow",
					time: "6:00 PM",
					credits: -1,
					icon: "leaf-outline",
					instructor: "Mindful Movement",
				},
			],
		},
		{
			day: 15,
			bookings: [
				{
					id: 5,
					name: "HIIT Class",
					time: "8:00 AM",
					credits: -1,
					icon: "flash",
					studio: "PowerFit Studio",
				},
				{
					id: 6,
					name: "Strength Training",
					time: "4:00 PM",
					credits: -1,
					icon: "fitness",
					trainer: "Mike Chen",
				},
			],
		},
		{
			day: 18,
			bookings: [
				{
					id: 7,
					name: "Personal Training",
					time: "11:00 AM",
					credits: -1,
					icon: "person",
					trainer: "Sarah Johnson",
				},
			],
		},
		{
			day: 22,
			bookings: [
				{
					id: 8,
					name: "Yoga Flow",
					time: "5:30 PM",
					credits: -1,
					icon: "leaf-outline",
					instructor: "Mindful Movement",
				},
				{
					id: 9,
					name: "HIIT Class",
					time: "7:00 AM",
					credits: -1,
					icon: "flash",
					studio: "PowerFit Studio",
				},
			],
		},
		{
			day: 25,
			bookings: [
				{
					id: 10,
					name: "Strength Training",
					time: "3:00 PM",
					credits: -1,
					icon: "fitness",
					trainer: "Mike Chen",
				},
			],
		},
		{
			day: 28,
			bookings: [
				{
					id: 11,
					name: "Personal Training",
					time: "1:00 PM",
					credits: -1,
					icon: "person",
					trainer: "Sarah Johnson",
				},
				{
					id: 12,
					name: "Yoga Flow",
					time: "6:30 PM",
					credits: -1,
					icon: "leaf-outline",
					instructor: "Mindful Movement",
				},
			],
		},
	];

	// Add bookings for current month
	bookingDates.forEach(({ day, bookings }) => {
		const date = new Date(currentYear, currentMonth, day);
		const dateKey = formatDate(date);
		dates[dateKey] = {
			marked: true,
			dotColor: "#2563EB",
			bookings: bookings,
		};
	});

	// Add some bookings for next month
	const nextMonth = currentMonth + 1;
	[
		{
			day: 2,
			bookings: [
				{
					id: 13,
					name: "HIIT Class",
					time: "9:30 AM",
					credits: -1,
					icon: "flash",
					studio: "PowerFit Studio",
				},
			],
		},
		{
			day: 5,
			bookings: [
				{
					id: 14,
					name: "Strength Training",
					time: "11:00 AM",
					credits: -1,
					icon: "fitness",
					trainer: "Mike Chen",
				},
				{
					id: 15,
					name: "Personal Training",
					time: "3:00 PM",
					credits: -1,
					icon: "person",
					trainer: "Sarah Johnson",
				},
			],
		},
		{
			day: 10,
			bookings: [
				{
					id: 16,
					name: "Yoga Flow",
					time: "7:00 PM",
					credits: -1,
					icon: "leaf-outline",
					instructor: "Mindful Movement",
				},
			],
		},
	].forEach(({ day, bookings }) => {
		const date = new Date(currentYear, nextMonth, day);
		const dateKey = formatDate(date);
		dates[dateKey] = {
			marked: true,
			dotColor: "#2563EB",
			bookings: bookings,
		};
	});

	return dates;
};

const bookingsData = getBookingsData();

export default function CalendarScreen() {
	const navigation = useNavigation();
	const [selectedDate, setSelectedDate] = useState<string>(
		new Date().toISOString().split("T")[0],
	);

	// Create markedDates object for calendar (only marking properties, no bookings data)
	const markedDates = Object.keys(bookingsData).reduce(
		(acc, date) => {
			acc[date] = {
				marked: bookingsData[date].marked,
				dotColor: bookingsData[date].dotColor,
			};
			return acc;
		},
		{} as Record<string, { marked: boolean; dotColor: string }>,
	);

	// Add selected state to the selected date
	const calendarMarkedDates = {
		...markedDates,
		[selectedDate]: {
			...markedDates[selectedDate],
			selected: true,
			selectedColor: "#2563EB",
		},
	};

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
								r.name === "explore" ||
								r.name === "bookings" ||
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
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				<View className="px-4 pt-4">
					{/* Header Section */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center">
							<TouchableOpacity
								onPress={() => router.back()}
								className="mr-3 h-10 w-10 items-center justify-center"
							>
								<Ionicons
									name="arrow-back"
									size={24}
									color={colors.primary[1]}
								/>
							</TouchableOpacity>
							<Text
								className="flex-1 font-bold text-2xl"
								style={{ color: colors.primary[1] }}
							>
								Calendar
							</Text>
						</View>
						<Text className="text-sm" style={{ color: colors.secondary[1] }}>
							View and manage your scheduled sessions
						</Text>
					</View>

					{/* Calendar */}
					<View className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm">
						<Calendar
							current={selectedDate}
							onDayPress={(day) => {
								setSelectedDate(day.dateString);
							}}
							markedDates={calendarMarkedDates}
							markingType="dot"
							theme={{
								backgroundColor: "#ffffff",
								calendarBackground: "#ffffff",
								textSectionTitleColor: colors.primary[1],
								selectedDayBackgroundColor: "#2563EB",
								selectedDayTextColor: "#ffffff",
								todayTextColor: "#2563EB",
								dayTextColor: colors.primary[1],
								textDisabledColor: colors.secondary[1],
								dotColor: "#2563EB",
								selectedDotColor: "#ffffff",
								arrowColor: colors.primary[1],
								monthTextColor: colors.primary[1],
								indicatorColor: "#2563EB",
								textDayFontWeight: "500",
								textMonthFontWeight: "bold",
								textDayHeaderFontWeight: "600",
								textDayFontSize: 14,
								textMonthFontSize: 18,
								textDayHeaderFontSize: 12,
							}}
							style={{
								borderRadius: 16,
							}}
						/>
					</View>

					{/* Selected Date Bookings */}
					{selectedDate &&
						bookingsData[selectedDate as keyof typeof bookingsData] && (
							<View className="mb-4">
								<Text
									className="mb-3 font-bold text-sm uppercase tracking-wide"
									style={{ color: colors.secondary[1] }}
								>
									BOOKINGS ON{" "}
									{new Date(selectedDate)
										.toLocaleDateString("en-US", {
											month: "long",
											day: "numeric",
											year: "numeric",
										})
										.toUpperCase()}
								</Text>
								{bookingsData[
									selectedDate as keyof typeof bookingsData
								].bookings.map((booking) => (
									<View
										key={booking.id}
										className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
									>
										<View className="mb-2 flex-row items-center justify-between">
											<View className="flex-1 flex-row items-center">
												<Ionicons
													name={booking.icon as any}
													size={20}
													color={colors.primary[1]}
													style={{ marginRight: 8 }}
												/>
												<Text
													className="flex-1 font-bold text-lg"
													style={{ color: colors.primary[1] }}
												>
													{booking.name}
												</Text>
											</View>
											<View className="flex-row items-center">
												<Ionicons
													name="wallet-outline"
													size={14}
													color={colors.secondary[1]}
												/>
												<Text
													className="ml-1 font-semibold text-sm"
													style={{ color: colors.secondary[1] }}
												>
													{Math.abs(booking.credits)} credit
													{booking.credits !== -1 ? "s" : ""}
												</Text>
											</View>
										</View>
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="time-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												{booking.time}
											</Text>
										</View>
										{("trainer" in booking && booking.trainer) ||
										("instructor" in booking && booking.instructor) ||
										("studio" in booking && booking.studio) ? (
											<View className="flex-row items-center">
												<Ionicons
													name="person-outline"
													size={14}
													color={colors.secondary[1]}
												/>
												<Text
													className="ml-1 text-sm"
													style={{ color: colors.secondary[1] }}
												>
													{"trainer" in booking
														? booking.trainer
														: "instructor" in booking
															? booking.instructor
															: booking.studio}
												</Text>
											</View>
										) : null}
									</View>
								))}
							</View>
						)}

					{/* No Bookings Message */}
					{selectedDate &&
						!bookingsData[selectedDate as keyof typeof bookingsData] && (
							<View className="mb-4 rounded-2xl bg-white p-6 shadow-sm">
								<View className="items-center">
									<Ionicons
										name="calendar-outline"
										size={48}
										color={colors.secondary[1]}
									/>
									<Text
										className="mt-4 mb-2 text-center font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										No Bookings
									</Text>
									<Text
										className="text-center text-sm"
										style={{ color: colors.secondary[1] }}
									>
										You don't have any bookings on this date
									</Text>
								</View>
							</View>
						)}
				</View>
			</ScrollView>
		</Container>
	);
}
