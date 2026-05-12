import { ScrollView, Text, View } from "react-native";
import { colors } from "@/lib/colors";

type TimetableSlot = {
	dayOfWeek: string; // "monday" through "sunday"
	startTime: string; // HH:MM
	endTime: string; // HH:MM
	label?: string;
};

type WeeklyTimetableProps = {
	slots: TimetableSlot[];
	startHour?: number; // default 7
	endHour?: number; // default 20
	hourHeight?: number; // px per hour, default 60
	weekLabel?: string; // e.g. "May 5 - May 11"
};

const DAY_ORDER: Record<string, number> = {
	monday: 0,
	tuesday: 1,
	wednesday: 2,
	thursday: 3,
	friday: 4,
	saturday: 5,
	sunday: 6,
};

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COL_WIDTH = 72;
const TIME_COL_WIDTH = 44;

function hhmmToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

export function WeeklyTimetable({
	slots,
	startHour = 7,
	endHour = 20,
	hourHeight = 60,
	weekLabel,
}: WeeklyTimetableProps) {
	const totalHours = endHour - startHour;
	const gridHeight = totalHours * hourHeight;
	const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

	// Group slots by day index
	const slotsByDay: TimetableSlot[][] = Array.from({ length: 7 }, () => []);
	for (const slot of slots) {
		const dayIdx = DAY_ORDER[slot.dayOfWeek.toLowerCase()];
		if (dayIdx !== undefined) {
			slotsByDay[dayIdx]?.push(slot);
		}
	}

	const hasSlots = slots.length > 0;

	return (
		<View>
			{weekLabel ? (
				<Text
					className="mb-2 text-center text-xs font-medium"
					style={{ color: colors.secondary[1] }}
				>
					{weekLabel}
				</Text>
			) : null}

			{/* Scrollable timetable, max height ~400 */}
			<ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
				<View style={{ flexDirection: "row" }}>
					{/* Time label column */}
					<View style={{ width: TIME_COL_WIDTH }}>
						{/* Header spacer */}
						<View style={{ height: 24 }} />
						{/* Hour labels */}
						{hours.map((h) => (
							<View
								key={h}
								style={{
									height: h === endHour ? 0 : hourHeight,
									justifyContent: "flex-start",
									alignItems: "flex-end",
									paddingRight: 6,
								}}
							>
								<Text
									style={{
										fontSize: 9,
										color: colors.secondary[1],
										lineHeight: 12,
									}}
								>
									{String(h).padStart(2, "0")}:00
								</Text>
							</View>
						))}
					</View>

					{/* Day columns in horizontal scroll */}
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						<View>
							{/* Day header row */}
							<View style={{ flexDirection: "row", height: 24 }}>
								{DAY_SHORT.map((day) => (
									<View
										key={day}
										style={{
											width: COL_WIDTH,
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<Text
											style={{
												fontSize: 10,
												fontWeight: "600",
												color: colors.primary[1],
											}}
										>
											{day}
										</Text>
									</View>
								))}
							</View>

							{/* Grid + slots */}
							<View style={{ flexDirection: "row" }}>
								{DAY_SHORT.map((day, dayIdx) => (
									<View
										key={day}
										style={{
											width: COL_WIDTH,
											height: gridHeight,
											position: "relative",
											borderLeftWidth: 1,
											borderLeftColor: colors.secondary[3],
										}}
									>
										{/* Hour grid lines */}
										{hours.map((h) => (
											<View
												key={h}
												style={{
													position: "absolute",
													top: (h - startHour) * hourHeight,
													left: 0,
													right: 0,
													height: 1,
													backgroundColor: colors.secondary[3],
												}}
											/>
										))}

										{/* Slots */}
										{(slotsByDay[dayIdx] ?? []).map((slot) => {
											const startMin = hhmmToMinutes(slot.startTime);
											const endMin = hhmmToMinutes(slot.endTime);
											const top =
												((startMin - startHour * 60) / 60) * hourHeight;
											const height = ((endMin - startMin) / 60) * hourHeight;

											return (
												<View
													key={`${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}`}
													style={{
														position: "absolute",
														top,
														left: 2,
														right: 2,
														height: Math.max(height, 12),
														backgroundColor: colors.primary[1],
														borderRadius: 4,
														padding: 2,
														zIndex: 1,
													}}
												>
													<Text
														style={{
															color: colors.primary[2],
															fontSize: 8,
															lineHeight: 10,
														}}
														numberOfLines={2}
													>
														{slot.label ?? `${slot.startTime}–${slot.endTime}`}
													</Text>
												</View>
											);
										})}
									</View>
								))}
							</View>
						</View>
					</ScrollView>
				</View>
			</ScrollView>

			{/* Empty state */}
			{!hasSlots ? (
				<View className="items-center py-4">
					<Text
						className="text-sm italic"
						style={{ color: colors.secondary[1] }}
					>
						No intake slots this week
					</Text>
				</View>
			) : null}
		</View>
	);
}
