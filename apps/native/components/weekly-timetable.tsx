import { useMemo } from "react";
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
	rowHeight?: number; // px per day row
	hourWidth?: number; // px per hour — controls horizontal density
	weekLabel?: string;
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

const DAY_LABEL_WIDTH = 40;

function hhmmToMinutes(hhmm: string): number {
	const parts = hhmm.split(":");
	const h = Number(parts[0]);
	const m = Number(parts[1]);
	if (!Number.isFinite(h) || !Number.isFinite(m)) {
		if (__DEV__) {
			console.warn(`[weekly-timetable] invalid time format: "${hhmm}"`);
		}
		return 0;
	}
	return h * 60 + m;
}

export function WeeklyTimetable({
	slots,
	startHour: startHourProp,
	endHour: endHourProp,
	rowHeight = 36,
	hourWidth = 64,
	weekLabel,
}: WeeklyTimetableProps) {
	const { slotsByDay, computedStartHour, computedEndHour } = useMemo(() => {
		const byDay: TimetableSlot[][] = Array.from({ length: 7 }, () => []);
		let minHour = 24;
		let maxHour = 0;
		for (const slot of slots) {
			const dayIdx = DAY_ORDER[slot.dayOfWeek.toLowerCase()];
			if (dayIdx !== undefined) {
				byDay[dayIdx]?.push(slot);
				const sH = Math.floor(hhmmToMinutes(slot.startTime) / 60);
				const eH = Math.ceil(hhmmToMinutes(slot.endTime) / 60);
				if (sH < minHour) minHour = sH;
				if (eH > maxHour) maxHour = eH;
			}
		}
		return {
			slotsByDay: byDay,
			computedStartHour: slots.length > 0 ? minHour : 7,
			computedEndHour: slots.length > 0 ? maxHour : 20,
		};
	}, [slots]);

	const startHour = startHourProp ?? computedStartHour;
	const endHour = endHourProp ?? computedEndHour;
	const totalHours = Math.max(endHour - startHour, 1);
	const trackWidth = totalHours * hourWidth;

	const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

	const hasSlots = slots.length > 0;

	const pxFromMinutes = (minutes: number) =>
		((minutes - startHour * 60) / 60) * hourWidth;

	return (
		<View style={{ padding: 8 }}>
			{weekLabel ? (
				<Text
					className="mb-2 text-center text-xs font-medium"
					style={{ color: colors.secondary[1] }}
				>
					{weekLabel}
				</Text>
			) : null}

			<View style={{ flexDirection: "row" }}>
				{/* Fixed day-label column */}
				<View style={{ width: DAY_LABEL_WIDTH }}>
					{/* Spacer to align with time header */}
					<View style={{ height: 22 }} />
					{DAY_SHORT.map((day) => (
						<View
							key={day}
							style={{
								height: rowHeight,
								marginBottom: 4,
								alignItems: "flex-end",
								justifyContent: "center",
								paddingRight: 8,
							}}
						>
							<Text
								style={{
									fontSize: 12,
									fontWeight: "700",
									color: colors.primary[1],
								}}
							>
								{day}
							</Text>
						</View>
					))}
				</View>

				{/* Scrollable time grid */}
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator
					style={{ flex: 1 }}
					contentContainerStyle={{ paddingRight: 8 }}
				>
					<View style={{ width: trackWidth }}>
						{/* Time header */}
						<View
							style={{
								height: 22,
								position: "relative",
								marginBottom: 0,
							}}
						>
							{hours.map((h) => (
								<Text
									key={h}
									style={{
										position: "absolute",
										left: pxFromMinutes(h * 60),
										transform: [{ translateX: -16 }],
										fontSize: 12,
										color: colors.secondary[1],
										fontWeight: "600",
									}}
								>
									{String(h).padStart(2, "0")}:00
								</Text>
							))}
						</View>

						{/* Day tracks */}
						{DAY_SHORT.map((day, dayIdx) => {
							const daySlots = slotsByDay[dayIdx] ?? [];
							return (
								<View
									key={day}
									style={{
										height: rowHeight,
										marginBottom: 4,
										position: "relative",
										backgroundColor: colors.secondary[3],
										borderRadius: 6,
										overflow: "hidden",
									}}
								>
									{/* Hour tick lines */}
									{hours.map((h) =>
										h === startHour || h === endHour ? null : (
											<View
												key={h}
												style={{
													position: "absolute",
													top: 0,
													bottom: 0,
													left: pxFromMinutes(h * 60),
													width: 1,
													backgroundColor: "rgba(0,0,0,0.06)",
												}}
											/>
										),
									)}

									{daySlots.map((slot) => {
										const startMin = hhmmToMinutes(slot.startTime);
										const endMin = hhmmToMinutes(slot.endTime);
										const durationMin = Math.max(endMin - startMin, 15);
										const left = pxFromMinutes(startMin);
										const width = Math.max(
											(durationMin / 60) * hourWidth,
											48,
										);

										return (
											<View
												key={`${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}`}
												style={{
													position: "absolute",
													top: 2,
													bottom: 2,
													left,
													width,
													backgroundColor: "rgba(0,0,0,0.5)",
													borderRadius: 6,
													borderWidth: 2,
													borderStyle: "solid",
													borderColor: colors.primary[1],
													paddingHorizontal: 8,
													flexDirection: "row",
													alignItems: "center",
													justifyContent: "center",
													gap: 4,
												}}
											>
												<Text
													numberOfLines={1}
													style={{
														color: colors.primary[2],
														fontSize: 12,
														fontWeight: "700",
													}}
												>
													{slot.label ?? slot.startTime}
												</Text>
												{!slot.label ? (
													<>
														<Text
															style={{
																color: colors.primary[2],
																fontSize: 12,
																fontWeight: "700",
																opacity: 0.6,
															}}
														>
															/
														</Text>
														<Text
															numberOfLines={1}
															style={{
																color: colors.primary[2],
																fontSize: 12,
																fontWeight: "700",
															}}
														>
															{slot.endTime}
														</Text>
													</>
												) : null}
											</View>
										);
									})}
								</View>
							);
						})}
					</View>
				</ScrollView>
			</View>

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
