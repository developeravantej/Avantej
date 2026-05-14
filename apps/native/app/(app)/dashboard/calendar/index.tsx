import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { orpc } from "@/utils/orpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** Return calendar grid cells for a given year/month. Each cell is { day, inMonth, dateString }. */
function buildMonthGrid(year: number, month: number) {
	const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const daysInPrevMonth = new Date(year, month, 0).getDate();

	const cells: { day: number; inMonth: boolean; dateString: string }[] = [];

	// Leading days from previous month
	for (let i = firstDay - 1; i >= 0; i--) {
		const d = daysInPrevMonth - i;
		const prevMonth = month === 0 ? 11 : month - 1;
		const prevYear = month === 0 ? year - 1 : year;
		cells.push({
			day: d,
			inMonth: false,
			dateString: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
		});
	}

	// Current month days
	for (let d = 1; d <= daysInMonth; d++) {
		cells.push({
			day: d,
			inMonth: true,
			dateString: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
		});
	}

	// Trailing days from next month (fill to complete last week row)
	const remaining = 7 - (cells.length % 7);
	if (remaining < 7) {
		const nextMonth = month === 11 ? 0 : month + 1;
		const nextYear = month === 11 ? year + 1 : year;
		for (let d = 1; d <= remaining; d++) {
			cells.push({
				day: d,
				inMonth: false,
				dateString: `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
			});
		}
	}

	return cells;
}

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

function todayString() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Status badge config
const STATUS_BADGE: Record<
	string,
	{ label: string; bg: string; text: string }
> = {
	confirmed: { label: "Confirmed", bg: "#DCFCE7", text: "#16A34A" },
	completed: {
		label: "Completed",
		bg: colors.secondary[3],
		text: colors.secondary[1],
	},
	pending: { label: "Pending", bg: "#FEF3C7", text: "#D97706" },
	cancelled: { label: "Cancelled", bg: "#FEE2E2", text: "#B91C1C" },
	"no-show": { label: "No-show", bg: "#FEF3C7", text: "#D97706" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CalendarScreen() {
	const { organizationId } = useOrganization();

	const today = useMemo(() => todayString(), []);

	const [selectedDate, setSelectedDate] = useState<string>(today);

	// Track displayed month as { year, month(0-indexed) }
	const [viewMonth, setViewMonth] = useState(() => {
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() };
	});

	// Month string for API query (YYYY-MM)
	const currentMonthKey = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}`;

	const monthStart = useMemo(
		() => `${currentMonthKey}-01T00:00:00.000Z`,
		[currentMonthKey],
	);
	const monthEnd = useMemo(() => {
		const lastDay = new Date(
			viewMonth.year,
			viewMonth.month + 1,
			0,
		).getDate();
		return `${currentMonthKey}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;
	}, [currentMonthKey, viewMonth]);

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

	// Set of dateStrings that have bookings (for dots)
	const bookedDates = useMemo(() => {
		const set = new Set<string>();
		for (const apt of appointments ?? []) {
			set.add(new Date(apt.startTime).toISOString().split("T")[0]);
		}
		return set;
	}, [appointments]);

	// Build grid cells
	const gridCells = useMemo(
		() => buildMonthGrid(viewMonth.year, viewMonth.month),
		[viewMonth],
	);

	// Navigate month
	const goToPrevMonth = useCallback(() => {
		setViewMonth((prev) => {
			if (prev.month === 0)
				return { year: prev.year - 1, month: 11 };
			return { year: prev.year, month: prev.month - 1 };
		});
	}, []);

	const goToNextMonth = useCallback(() => {
		setViewMonth((prev) => {
			if (prev.month === 11)
				return { year: prev.year + 1, month: 0 };
			return { year: prev.year, month: prev.month + 1 };
		});
	}, []);

	// Selected date bookings
	const selectedDateBookings = useMemo(() => {
		return (appointments ?? [])
			.filter((apt) => {
				const dateKey = new Date(apt.startTime).toISOString().split("T")[0];
				return dateKey === selectedDate;
			})
			.map((apt) => ({
				id: apt.id,
				name: apt.serviceName ?? (apt.type === "private" ? "Personal Training" : "Class Session"),
				subtitle:
					apt.type === "private"
						? "1-on-1 session"
						: "Group session",
				time: new Date(apt.startTime).toLocaleTimeString("en-US", {
					hour: "numeric",
					minute: "2-digit",
					hour12: true,
				}),
				duration: apt.duration,
				icon: (apt.type === "private" ? "person-outline" : "people-outline") as keyof typeof Ionicons.glyphMap,
				location: apt.location ?? undefined,
				status: apt.status,
			}));
	}, [appointments, selectedDate]);

	// Formatted selected date label
	const selectedDateLabel = useMemo(() => {
		const d = new Date(selectedDate + "T00:00:00");
		return d
			.toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			})
			.toUpperCase();
	}, [selectedDate]);

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={isRefetching}
						onRefresh={refetch}
						tintColor={colors.primary[1]}
					/>
				}
			>
				<View className="px-4 pt-2">
					{/* ── Header ── */}
					<View className="mb-1 flex-row items-center gap-3 py-2">
						<TouchableOpacity
							onPress={() => router.back()}
							className="h-10 w-10 items-center justify-center"
							activeOpacity={0.7}
						>
							<Ionicons
								name="chevron-back"
								size={20}
								color={colors.primary[1]}
							/>
						</TouchableOpacity>
						<View>
							<Text
								className="text-2xl text-primary-1"
								style={{
									fontFamily: fonts.heading,
									letterSpacing: -0.5,
								}}
							>
								Calendar
							</Text>
							<Text
								className="mt-0.5 text-secondary-1"
								style={{
									fontFamily: fonts.body,
									fontSize: 13,
								}}
							>
								View and manage your scheduled sessions
							</Text>
						</View>
					</View>

					{/* ── Calendar Card ── */}
					<View
						className="mb-4 rounded-[20px] border border-secondary-3 bg-primary-2 p-4"
						style={{
							shadowColor: "#000",
							shadowOffset: { width: 0, height: 1 },
							shadowOpacity: 0.04,
							shadowRadius: 3,
							elevation: 1,
						}}
					>
						{/* Month/year header with arrows */}
						<View className="mb-4 flex-row items-center justify-between px-1">
							<TouchableOpacity
								onPress={goToPrevMonth}
								className="h-8 w-8 items-center justify-center rounded-full bg-primary-3"
								activeOpacity={0.7}
							>
								<Ionicons
									name="chevron-back"
									size={16}
									color={colors.primary[1]}
								/>
							</TouchableOpacity>

							<Text
								className="text-primary-1"
								style={{
									fontFamily: fonts.heading,
									fontSize: 17,
									letterSpacing: -0.3,
								}}
							>
								{MONTH_NAMES[viewMonth.month]} {viewMonth.year}
							</Text>

							<TouchableOpacity
								onPress={goToNextMonth}
								className="h-8 w-8 items-center justify-center rounded-full bg-primary-3"
								activeOpacity={0.7}
							>
								<Ionicons
									name="chevron-forward"
									size={16}
									color={colors.primary[1]}
								/>
							</TouchableOpacity>
						</View>

						{/* Weekday headers */}
						<View className="mb-1 flex-row">
							{WEEKDAYS.map((day, i) => (
								<View
									key={`wd-${i}`}
									className="flex-1 items-center pb-2 pt-1"
								>
									<Text
										className="text-secondary-1 uppercase"
										style={{
											fontFamily: fonts.body,
											fontSize: 11,
											fontWeight: "600",
											letterSpacing: 0.8,
										}}
									>
										{day}
									</Text>
								</View>
							))}
						</View>

						{/* Day grid */}
						<View className="flex-row flex-wrap">
							{gridCells.map((cell, i) => {
								const isToday = cell.dateString === today;
								const isSelected = cell.dateString === selectedDate;
								const hasBooking =
									cell.inMonth && bookedDates.has(cell.dateString);

								return (
									<TouchableOpacity
										key={`cell-${i}`}
										onPress={() => {
											setSelectedDate(cell.dateString);
											// If tapping a date in a different month, navigate there
											if (!cell.inMonth) {
												const [y, m] = cell.dateString
													.split("-")
													.map(Number);
												setViewMonth({
													year: y,
													month: m - 1,
												});
											}
										}}
										activeOpacity={0.7}
										style={{ width: "14.2857%" }}
										className="items-center justify-center"
									>
										<View className="h-11 items-center justify-center">
											<View
												className="items-center justify-center"
												style={[
													{
														width: 36,
														height: 36,
														borderRadius: 18,
													},
													isSelected && {
														backgroundColor:
															colors.primary[1],
													},
													isToday &&
														!isSelected && {
															borderWidth: 1.5,
															borderColor:
																colors.primary[1],
														},
												]}
											>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 14,
														fontWeight:
															isSelected || isToday
																? "600"
																: "500",
														color: isSelected
															? colors.primary[2]
															: cell.inMonth
																? colors.primary[1]
																: "#CDCDCD",
													}}
												>
													{cell.day}
												</Text>
											</View>
											{hasBooking && (
												<View
													className="absolute rounded-full"
													style={{
														width: 4,
														height: 4,
														bottom: 4,
														backgroundColor:
															isSelected
																? colors.primary[2]
																: colors.primary[1],
													}}
												/>
											)}
										</View>
									</TouchableOpacity>
								);
							})}
						</View>
					</View>

					{/* ── Loading ── */}
					{isLoading && (
						<View className="mb-4 items-center py-8">
							<ActivityIndicator
								size="large"
								color={colors.primary[1]}
							/>
							<Text
								className="mt-2 text-secondary-1"
								style={{ fontFamily: fonts.body, fontSize: 13 }}
							>
								Loading appointments...
							</Text>
						</View>
					)}

					{/* ── Bookings section header ── */}
					{!isLoading && selectedDate && (
						<Text
							className="mb-2.5 text-secondary-1 uppercase"
							style={{
								fontFamily: fonts.body,
								fontSize: 11,
								fontWeight: "600",
								letterSpacing: 1.2,
								paddingLeft: 2,
							}}
						>
							BOOKINGS ON {selectedDateLabel}
						</Text>
					)}

					{/* ── Booking cards ── */}
					{!isLoading &&
						selectedDate &&
						selectedDateBookings.length > 0 &&
						selectedDateBookings.map((booking) => {
							const badge = STATUS_BADGE[booking.status] ?? {
								label: booking.status,
								bg: colors.secondary[3],
								text: colors.secondary[1],
							};

							return (
								<View
									key={booking.id}
									className="mb-2.5 rounded-2xl border border-secondary-3 bg-primary-2 p-4"
									style={{
										shadowColor: "#000",
										shadowOffset: { width: 0, height: 1 },
										shadowOpacity: 0.04,
										shadowRadius: 3,
										elevation: 1,
									}}
								>
									{/* Top row: icon+title + status badge */}
									<View className="mb-2.5 flex-row items-start justify-between">
										<View className="flex-1 flex-row items-center gap-2">
											<View className="h-9 w-9 items-center justify-center rounded-[10px] bg-primary-3">
												<Ionicons
													name={booking.icon}
													size={18}
													color={colors.primary[1]}
												/>
											</View>
											<View className="flex-1">
												<Text
													className="text-primary-1"
													style={{
														fontFamily: fonts.heading,
														fontSize: 15,
														letterSpacing: -0.2,
													}}
													numberOfLines={1}
												>
													{booking.name}
												</Text>
												<Text
													className="text-secondary-1"
													style={{
														fontFamily: fonts.body,
														fontSize: 12,
														marginTop: 1,
													}}
												>
													{booking.subtitle}
												</Text>
											</View>
										</View>
										<View
											className="ml-2 rounded-full"
											style={{
												backgroundColor: badge.bg,
												paddingHorizontal: 10,
												paddingVertical: 3,
											}}
										>
											<Text
												style={{
													fontFamily: fonts.body,
													fontSize: 11,
													fontWeight: "600",
													color: badge.text,
													letterSpacing: 0.2,
												}}
											>
												{badge.label}
											</Text>
										</View>
									</View>

									{/* Meta row */}
									<View
										className="flex-row items-center pt-2.5"
										style={{
											borderTopWidth: 1,
											borderTopColor: colors.secondary[3],
											gap: 14,
										}}
									>
										{/* Time */}
										<View className="flex-row items-center gap-1.5">
											<Ionicons
												name="time-outline"
												size={13}
												color={colors.secondary[1]}
											/>
											<Text
												className="text-secondary-1"
												style={{
													fontFamily: fonts.body,
													fontSize: 12,
												}}
											>
												{booking.time}
											</Text>
										</View>

										{/* Divider */}
										<View
											style={{
												width: 1,
												height: 14,
												backgroundColor:
													colors.secondary[3],
											}}
										/>

										{/* Duration */}
										<View className="flex-row items-center gap-1.5">
											<Ionicons
												name="calendar-outline"
												size={13}
												color={colors.secondary[1]}
											/>
											<Text
												className="text-secondary-1"
												style={{
													fontFamily: fonts.body,
													fontSize: 12,
												}}
											>
												{booking.duration} min
											</Text>
										</View>

										{/* Location (if present) */}
										{booking.location && (
											<>
												<View
													style={{
														width: 1,
														height: 14,
														backgroundColor:
															colors.secondary[3],
													}}
												/>
												<View className="flex-row items-center gap-1.5">
													<Ionicons
														name="location-outline"
														size={13}
														color={
															colors.secondary[1]
														}
													/>
													<Text
														className="text-secondary-1"
														style={{
															fontFamily:
																fonts.body,
															fontSize: 12,
														}}
														numberOfLines={1}
													>
														{booking.location}
													</Text>
												</View>
											</>
										)}
									</View>
								</View>
							);
						})}

					{/* ── Empty state ── */}
					{!isLoading &&
						selectedDate &&
						selectedDateBookings.length === 0 && (
							<View
								className="rounded-2xl border border-secondary-3 bg-primary-2 p-6"
								style={{
									shadowColor: "#000",
									shadowOffset: { width: 0, height: 1 },
									shadowOpacity: 0.04,
									shadowRadius: 3,
									elevation: 1,
								}}
							>
								<View className="items-center">
									<Ionicons
										name="calendar-outline"
										size={48}
										color={colors.secondary[1]}
									/>
									<Text
										className="mt-4 mb-2 text-center text-primary-1"
										style={{
											fontFamily: fonts.subheading,
											fontSize: 16,
										}}
									>
										No Bookings
									</Text>
									<Text
										className="text-center text-secondary-1"
										style={{
											fontFamily: fonts.body,
											fontSize: 14,
										}}
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
