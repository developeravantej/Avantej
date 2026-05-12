import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

export default function CalendarScreen() {
	const { organizationId } = useOrganization();

	const [selectedDate, setSelectedDate] = useState<string>(
		new Date().toISOString().split("T")[0],
	);

	const [currentMonth, setCurrentMonth] = useState(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	});

	// Compute month boundaries for API query
	const monthStart = `${currentMonth}-01T00:00:00.000Z`;
	const monthEnd = useMemo(() => {
		const [y, m] = currentMonth.split("-").map(Number);
		const lastDay = new Date(y, m, 0).getDate();
		return `${currentMonth}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;
	}, [currentMonth]);

	const {
		data: appointments,
		isLoading,
		refetch,
		isRefetching,
	} = useQuery(
		orpc.appointments.listForUser.queryOptions({
			input: {
				organizationId,
				startFrom: monthStart,
				startTo: monthEnd,
			},
		}),
	);

	const markedDates = useMemo(() => {
		const marks: Record<string, any> = {};
		for (const apt of appointments ?? []) {
			const dateKey = new Date(apt.startTime).toISOString().split("T")[0];
			marks[dateKey] = { marked: true, dotColor: colors.primary[1] };
		}
		if (selectedDate) {
			marks[selectedDate] = {
				...marks[selectedDate],
				selected: true,
				selectedColor: colors.primary[1],
			};
		}
		return marks;
	}, [appointments, selectedDate]);

	const selectedDateBookings = useMemo(() => {
		return (appointments ?? []).flatMap((apt: any) => {
			const dateKey = new Date(apt.startTime).toISOString().split("T")[0];
			if (dateKey !== selectedDate) return [];
			return [
				{
					id: apt.id,
					name:
						apt.type === "private" ? "Personal Training" : "Class Session",
					time: new Date(apt.startTime).toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
						hour12: true,
					}),
					credits: apt.creditsUsed ?? 1,
					icon: apt.type === "private" ? "person" : "people",
					location: apt.location ?? undefined,
					status: apt.status,
				},
			];
		});
	}, [appointments, selectedDate]);

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={isRefetching}
						onRefresh={refetch}
						tintColor={colors.primary[1]}
					/>
				}
			>
				<View className="px-4 pt-4">
					{/* Header Section */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center">
							<TouchableOpacity
								onPress={() => router.back()}
								className="mr-3 size-10 items-center justify-center"
							>
								<Ionicons
									name="arrow-back"
									size={24}
									color={colors.primary[1]}
								/>
							</TouchableOpacity>
							<Text className="flex-1 font-bold text-2xl text-primary-1">
								Calendar
							</Text>
						</View>
						<Text className="text-secondary-1 text-sm">
							View and manage your scheduled sessions
						</Text>
					</View>

					{/* Calendar */}
					<View className="mb-4 overflow-hidden rounded-2xl border border-secondary-3 bg-primary-2 shadow-sm">
						<Calendar
							current={selectedDate}
							onDayPress={(day) => {
								setSelectedDate(day.dateString);
							}}
							onMonthChange={(month) => {
								setCurrentMonth(
									`${month.year}-${String(month.month).padStart(2, "0")}`,
								);
							}}
							markedDates={markedDates}
							markingType="dot"
							theme={{
								backgroundColor: colors.primary[2],
								calendarBackground: colors.primary[2],
								textSectionTitleColor: colors.primary[1],
								selectedDayBackgroundColor: colors.primary[1],
								selectedDayTextColor: colors.primary[2],
								todayTextColor: colors.primary[1],
								dayTextColor: colors.primary[1],
								textDisabledColor: colors.secondary[1],
								dotColor: colors.primary[1],
								selectedDotColor: colors.primary[2],
								arrowColor: colors.primary[1],
								monthTextColor: colors.primary[1],
								indicatorColor: colors.primary[1],
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

					{/* Loading Indicator */}
					{isLoading && (
						<View className="mb-4 items-center py-8">
							<ActivityIndicator
								size="large"
								color={colors.primary[1]}
							/>
							<Text className="mt-2 text-secondary-1 text-sm">
								Loading appointments…
							</Text>
						</View>
					)}

					{/* Selected Date Bookings */}
					{!isLoading &&
						selectedDate &&
						selectedDateBookings.length > 0 && (
							<View className="mb-4">
								<Text className="mb-3 font-bold text-secondary-1 text-sm uppercase tracking-wide">
									BOOKINGS ON{" "}
									{new Date(selectedDate)
										.toLocaleDateString("en-US", {
											month: "long",
											day: "numeric",
											year: "numeric",
										})
										.toUpperCase()}
								</Text>
								{selectedDateBookings.map((booking: any) => (
									<View
										key={booking.id}
										className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
									>
										<View className="mb-2 flex-row items-center justify-between">
											<View className="flex-1 flex-row items-center">
												<Ionicons
													name={booking.icon as any}
													size={20}
													color={colors.primary[1]}
													style={{ marginRight: 8 }}
												/>
												<Text className="flex-1 font-bold text-lg text-primary-1">
													{booking.name}
												</Text>
											</View>
											<View className="flex-row items-center">
												<Ionicons
													name="wallet-outline"
													size={14}
													color={colors.secondary[1]}
												/>
												<Text className="ml-1 font-semibold text-secondary-1 text-sm">
													{booking.credits} credit
													{booking.credits !== 1 ? "s" : ""}
												</Text>
											</View>
										</View>
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="time-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text className="ml-1 text-secondary-1 text-sm">
												{booking.time}
											</Text>
										</View>
										{booking.location && (
											<View className="flex-row items-center">
												<Ionicons
													name="location-outline"
													size={14}
													color={colors.secondary[1]}
												/>
												<Text className="ml-1 text-secondary-1 text-sm">
													{booking.location}
												</Text>
											</View>
										)}
									</View>
								))}
							</View>
						)}

					{/* No Bookings Message */}
					{!isLoading &&
						selectedDate &&
						selectedDateBookings.length === 0 && (
							<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-6 shadow-sm">
								<View className="items-center">
									<Ionicons
										name="calendar-outline"
										size={48}
										color={colors.secondary[1]}
									/>
									<Text className="mt-4 mb-2 text-center font-semibold text-base text-primary-1">
										No Bookings
									</Text>
									<Text className="text-center text-secondary-1 text-sm">
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
