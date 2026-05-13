import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { TabContainer, useTabBarHeight } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { orpc } from "@/utils/orpc";

// ─── Helpers ──────────────────────────────────────────────────────

const formatTimeOnly = (dateStr: string | Date) => {
	const d = new Date(dateStr);
	const hours = d.getHours();
	const minutes = d.getMinutes();
	const h = hours % 12 || 12;
	return `${h}:${minutes.toString().padStart(2, "0")}`;
};

const formatAmPm = (dateStr: string | Date) => {
	const d = new Date(dateStr);
	return d.getHours() >= 12 ? "PM" : "AM";
};

const getStatusLabel = (status: string) => {
	switch (status) {
		case "completed":
			return "Done";
		case "cancelled":
			return "Cancelled";
		case "no-show":
			return "No Show";
		case "confirmed":
			return "Confirmed";
		case "pending":
			return "Pending";
		default:
			return status;
	}
};

const getStatusBadgeColors = (status: string) => {
	switch (status) {
		case "confirmed":
			return { bg: "#DCFCE7", text: "#16A34A" };
		case "completed":
			return { bg: colors.secondary[3], text: colors.secondary[1] };
		case "cancelled":
			return { bg: "#FEE2E2", text: "#B91C1C" };
		case "pending":
			return { bg: "#FEF3C7", text: "#D97706" };
		case "no-show":
			return { bg: "#FEF3C7", text: "#D97706" };
		default:
			return { bg: colors.secondary[3], text: colors.secondary[1] };
	}
};

const getDateGroupLabel = (dateStr: string | Date) => {
	const d = new Date(dateStr);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const diffDays = Math.round(
		(target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Tomorrow";
	return d.toLocaleDateString("en-US", { weekday: "long" });
};

const getDateSublabel = (dateStr: string | Date) => {
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
};

const getDateKey = (dateStr: string | Date) => {
	const d = new Date(dateStr);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const getServiceName = (booking: any) =>
	booking.serviceName ||
	(booking.type === "semi-private"
		? "Semi-Private Session"
		: booking.type === "private"
			? "Private Session"
			: "Appointment");

// ─── Types ──────────────────────────────────────────────────────

interface DateGroup {
	dateKey: string;
	label: string;
	sublabel: string;
	isPast: boolean;
	isFuture: boolean;
	bookings: any[];
}

// ─── Skeleton Components ──────────────────────────────────────────

function SkeletonBox({ className }: { className: string }) {
	return (
		<View className={`animate-pulse rounded-lg bg-secondary-3 ${className}`} />
	);
}

function TimelineCardSkeleton() {
	return (
		<View
			className="mb-2 flex-row items-center rounded-[14px] border bg-primary-2 px-3.5 py-3"
			style={{ borderColor: colors.secondary[3] }}
		>
			<View className="mr-2.5 min-w-[44px] items-center">
				<SkeletonBox className="h-4 w-10" />
				<SkeletonBox className="mt-1 h-2.5 w-6" />
			</View>
			<View
				className="mx-2.5 h-9"
				style={{ width: 1, backgroundColor: colors.secondary[3] }}
			/>
			<View className="flex-1">
				<SkeletonBox className="mb-1 h-4 w-28" />
				<SkeletonBox className="h-3 w-36" />
			</View>
			<SkeletonBox className="h-5 w-16 rounded-full" />
		</View>
	);
}

function StatsStripSkeleton() {
	return (
		<View
			className="mx-5 mb-4 flex-row overflow-hidden rounded-xl border bg-primary-2"
			style={{ borderColor: colors.secondary[3] }}
		>
			{[0, 1, 2].map((i) => (
				<View
					key={i}
					className="flex-1 items-center py-2.5"
					style={
						i < 2
							? { borderRightWidth: 1, borderRightColor: colors.secondary[3] }
							: undefined
					}
				>
					<SkeletonBox className="mb-1 h-6 w-8" />
					<SkeletonBox className="h-3 w-14" />
				</View>
			))}
		</View>
	);
}

// ─── Sub-Components ──────────────────────────────────────────────

function StatsStrip({
	upcomingCount,
	completedCount,
	creditsLeft,
}: {
	upcomingCount: number;
	completedCount: number;
	creditsLeft: number | null;
}) {
	return (
		<View
			className="mx-5 mb-4 flex-row overflow-hidden rounded-xl border bg-primary-2"
			style={{ borderColor: colors.secondary[3] }}
		>
			<View
				className="flex-1 items-center py-2.5"
				style={{
					borderRightWidth: 1,
					borderRightColor: colors.secondary[3],
				}}
			>
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 20,
						color: colors.primary[1],
					}}
				>
					{upcomingCount}
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 10,
						color: colors.secondary[1],
						textTransform: "uppercase",
						letterSpacing: 1,
						marginTop: 2,
					}}
				>
					Upcoming
				</Text>
			</View>
			<View
				className="flex-1 items-center py-2.5"
				style={{
					borderRightWidth: 1,
					borderRightColor: colors.secondary[3],
				}}
			>
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 20,
						color: colors.primary[1],
					}}
				>
					{completedCount}
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 10,
						color: colors.secondary[1],
						textTransform: "uppercase",
						letterSpacing: 1,
						marginTop: 2,
					}}
				>
					Completed
				</Text>
			</View>
			<View className="flex-1 items-center py-2.5">
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 20,
						color: colors.primary[1],
					}}
				>
					{creditsLeft ?? "--"}
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 10,
						color: colors.secondary[1],
						textTransform: "uppercase",
						letterSpacing: 1,
						marginTop: 2,
					}}
				>
					Credits left
				</Text>
			</View>
		</View>
	);
}

function StatusBadge({ status }: { status: string }) {
	const c = getStatusBadgeColors(status);
	return (
		<View
			className="rounded-full px-2.5 py-[3px]"
			style={{ backgroundColor: c.bg }}
		>
			<Text
				style={{
					fontFamily: fonts.body,
					fontSize: 10,
					fontWeight: "600",
					color: c.text,
				}}
			>
				{getStatusLabel(status)}
			</Text>
		</View>
	);
}

function TimelineCard({
	booking,
	isPast,
}: { booking: any; isPast: boolean }) {
	return (
		<TouchableOpacity
			activeOpacity={0.7}
			onPress={() =>
				router.push({
					pathname: "/dashboard/bookings/[id]" as never,
					params: { id: booking.id.toString() },
				})
			}
			className="mb-2 flex-row items-center rounded-[14px] border bg-primary-2 px-3.5 py-3"
			style={{
				borderColor: colors.secondary[3],
				opacity: isPast ? 0.55 : 1,
			}}
		>
			{/* Time Column */}
			<View className="min-w-[44px] items-center">
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 13,
						color: colors.primary[1],
						lineHeight: 16,
					}}
				>
					{formatTimeOnly(booking.startTime)}
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 9,
						color: colors.secondary[1],
						textTransform: "uppercase",
						letterSpacing: 0.8,
					}}
				>
					{formatAmPm(booking.startTime)}
				</Text>
			</View>

			{/* Divider */}
			<View
				className="mx-2.5 h-9"
				style={{ width: 1, backgroundColor: colors.secondary[3] }}
			/>

			{/* Service Info */}
			<View className="min-w-0 flex-1">
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 14,
						color: colors.primary[1],
						marginBottom: 2,
					}}
					numberOfLines={1}
				>
					{getServiceName(booking)}
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 11,
						color: colors.secondary[1],
					}}
					numberOfLines={1}
				>
					{booking.trainerName ? `${booking.trainerName} · ` : ""}
					{booking.duration ? `${booking.duration} min` : ""}
					{booking.location ? ` · ${booking.location}` : ""}
				</Text>
			</View>

			{/* Status Badge */}
			<StatusBadge status={booking.status} />
		</TouchableOpacity>
	);
}

function DateGroupHeader({
	group,
}: {
	group: DateGroup;
}) {
	const dotColor = group.isPast
		? colors.secondary[3]
		: colors.primary[1];

	return (
		<View className="mb-2 flex-row items-center" style={{ gap: 12 }}>
			{/* Date dot */}
			<View
				className="z-[1] h-2.5 w-2.5 rounded-full"
				style={
					group.isFuture
						? {
								backgroundColor: colors.primary[2],
								borderWidth: 2,
								borderColor: colors.primary[1],
							}
						: { backgroundColor: dotColor }
				}
			/>
			{/* Label */}
			<View className="flex-row items-center">
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 13,
						color: group.isPast
							? colors.secondary[1]
							: colors.primary[1],
						letterSpacing: 0.3,
					}}
				>
					{group.label}
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 11,
						color: colors.secondary[1],
						marginLeft: 4,
					}}
				>
					{group.sublabel}
				</Text>
			</View>
		</View>
	);
}

function TimelineItems({
	group,
}: {
	group: DateGroup;
}) {
	return (
		<View
			className="pb-4"
			style={{
				paddingLeft: 22,
				marginLeft: 4,
				borderLeftWidth: 1.5,
				borderLeftColor: colors.secondary[3],
			}}
		>
			{group.bookings.map((booking: any) => (
				<TimelineCard
					key={booking.id}
					booking={booking}
					isPast={group.isPast}
				/>
			))}
		</View>
	);
}

// ─── Main Component ───────────────────────────────────────────────

export default function BookingsScreen() {
	const tabBarHeight = useTabBarHeight();
	const { organizationId, isLoading: orgLoading } = useOrganization();
	const queryClient = useQueryClient();

	// ─── API Queries ──────────────────────────────────────────────

	const {
		data: bookings,
		isPending: bookingsLoading,
		isError: bookingsError,
	} = useQuery({
		...orpc.appointments.listForUser.queryOptions({
			input: {
				organizationId,
				statuses: [
					"pending",
					"confirmed",
					"completed",
					"cancelled",
					"no-show",
				],
				limit: 100,
			},
		}),
		enabled: !!organizationId,
	});

	const { data: packageInstances } = useQuery({
		...orpc.packageInstances.listForClient.queryOptions({
			input: { organizationId, status: "active" },
		}),
		enabled: !!organizationId,
	});

	const totalCreditsLeft = useMemo(() => {
		if (!packageInstances) return null;
		return (packageInstances as any[]).reduce(
			(sum: number, p: any) => sum + (p.creditsRemaining ?? 0),
			0,
		);
	}, [packageInstances]);

	// ─── Derived Data ─────────────────────────────────────────────

	const { upcomingGroups, pastGroups, upcomingCount, completedCount } =
		useMemo(() => {
			const now = Date.now();
			const all = (bookings ?? []) as any[];

			const upcoming = all
				.filter(
					(apt) =>
						(apt.status === "confirmed" || apt.status === "pending") &&
						new Date(apt.startTime).getTime() >= now,
				)
				.sort(
					(a, b) =>
						new Date(a.startTime).getTime() -
						new Date(b.startTime).getTime(),
				);

			const past = all
				.filter(
					(apt) =>
						apt.status === "completed" ||
						apt.status === "cancelled" ||
						apt.status === "no-show" ||
						new Date(apt.startTime).getTime() < now,
				)
				.sort(
					(a, b) =>
						new Date(b.startTime).getTime() -
						new Date(a.startTime).getTime(),
				);

			// Group by date
			const groupByDate = (
				list: any[],
				isPast: boolean,
			): DateGroup[] => {
				const map = new Map<string, any[]>();
				for (const b of list) {
					const key = getDateKey(b.startTime);
					if (!map.has(key)) map.set(key, []);
					map.get(key)!.push(b);
				}
				return Array.from(map.entries()).map(([key, items]) => ({
					dateKey: key,
					label: getDateGroupLabel(items[0].startTime),
					sublabel: getDateSublabel(items[0].startTime),
					isPast,
					isFuture: !isPast && getDateGroupLabel(items[0].startTime) !== "Today",
					bookings: items,
				}));
			};

			return {
				upcomingGroups: groupByDate(upcoming, false),
				pastGroups: groupByDate(past, true),
				upcomingCount: upcoming.length,
				completedCount: past.length,
			};
		}, [bookings]);

	// ─── Pull to Refresh ──────────────────────────────────────────

	const onRefresh = useCallback(() => {
		queryClient.invalidateQueries({
			predicate: (query) => {
				const key = query.queryKey[0];
				return key === "appointments";
			},
		});
	}, [queryClient]);

	// ─── Loading State ────────────────────────────────────────────

	if (orgLoading) {
		return (
			<TabContainer>
				<View className="flex-1 items-center justify-center bg-secondary-3">
					<ActivityIndicator size="large" color={colors.primary[1]} />
				</View>
			</TabContainer>
		);
	}

	return (
		<TabContainer>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: tabBarHeight + 8 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={false}
						onRefresh={onRefresh}
						tintColor={colors.primary[1]}
					/>
				}
			>
				{/* Header */}
				<View className="px-5 pt-5">
					<Text
						style={{
							fontFamily: fonts.heading,
							fontSize: 28,
							color: colors.primary[1],
							letterSpacing: -0.5,
						}}
					>
						My Bookings
					</Text>
					<Text
						style={{
							fontFamily: fonts.body,
							fontSize: 13,
							color: colors.secondary[1],
							marginTop: 4,
							marginBottom: 20,
						}}
					>
						Your training timeline
					</Text>
				</View>

				{/* Stats Strip */}
				{bookingsLoading ? (
					<StatsStripSkeleton />
				) : (
					<StatsStrip
						upcomingCount={upcomingCount}
						completedCount={completedCount}
						creditsLeft={totalCreditsLeft}
					/>
				)}

				{/* Packages & Credits Link */}
				<TouchableOpacity
					className="mx-5 mb-4 flex-row items-center justify-between rounded-xl border bg-primary-2 px-4 py-3"
					style={{ borderColor: colors.secondary[3] }}
					activeOpacity={0.7}
					onPress={() => router.push("/dashboard/packages" as never)}
				>
					<View className="flex-row items-center" style={{ gap: 10 }}>
						<Ionicons name="cube-outline" size={18} color={colors.primary[1]} />
						<Text
							style={{
								fontFamily: fonts.subheading,
								fontSize: 14,
								color: colors.primary[1],
							}}
						>
							My Packages & Credits
						</Text>
					</View>
					<Ionicons name="chevron-forward" size={16} color={colors.secondary[1]} />
				</TouchableOpacity>

				{/* Timeline Section */}
				<View className="px-5">
					{bookingsLoading ? (
						<>
							{/* Skeleton date group */}
							<View className="mb-2 flex-row items-center" style={{ gap: 12 }}>
								<SkeletonBox className="h-2.5 w-2.5 rounded-full" />
								<SkeletonBox className="h-3.5 w-32" />
							</View>
							<View
								style={{
									paddingLeft: 22,
									marginLeft: 4,
									borderLeftWidth: 1.5,
									borderLeftColor: colors.secondary[3],
									paddingBottom: 16,
								}}
							>
								<TimelineCardSkeleton />
								<TimelineCardSkeleton />
							</View>
							<View className="mb-2 flex-row items-center" style={{ gap: 12 }}>
								<SkeletonBox className="h-2.5 w-2.5 rounded-full" />
								<SkeletonBox className="h-3.5 w-24" />
							</View>
							<View
								style={{
									paddingLeft: 22,
									marginLeft: 4,
									borderLeftWidth: 1.5,
									borderLeftColor: colors.secondary[3],
									paddingBottom: 16,
								}}
							>
								<TimelineCardSkeleton />
							</View>
						</>
					) : bookingsError ? (
						<View className="items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5">
							<Text
								style={{
									fontFamily: fonts.body,
									fontSize: 14,
									color: colors.secondary[1],
								}}
							>
								Unable to load bookings. Pull down to retry.
							</Text>
						</View>
					) : upcomingGroups.length === 0 && pastGroups.length === 0 ? (
						<View className="items-center rounded-2xl border border-secondary-3 bg-primary-2 p-8">
							<Ionicons
								name="calendar-outline"
								size={32}
								color={colors.secondary[1]}
							/>
							<Text
								style={{
									fontFamily: fonts.subheading,
									fontSize: 16,
									color: colors.primary[1],
									marginTop: 8,
								}}
							>
								No bookings yet
							</Text>
							<Text
								style={{
									fontFamily: fonts.body,
									fontSize: 13,
									color: colors.secondary[1],
									marginTop: 4,
									textAlign: "center",
								}}
							>
								Book a session to get started
							</Text>
						</View>
					) : (
						<>
							{/* Upcoming groups */}
							{upcomingGroups.map((group) => (
								<View key={group.dateKey} className="mb-1">
									<DateGroupHeader group={group} />
									<TimelineItems group={group} />
								</View>
							))}

							{/* Past section separator */}
							{pastGroups.length > 0 && (
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 11,
										fontWeight: "700",
										color: colors.secondary[1],
										letterSpacing: 1.2,
										textTransform: "uppercase",
										paddingTop: 8,
										paddingBottom: 12,
									}}
								>
									Past Sessions
								</Text>
							)}

							{/* Past groups */}
							{pastGroups.map((group, idx) => (
								<View
									key={group.dateKey}
									style={
										idx === pastGroups.length - 1
											? { marginBottom: 24 }
											: { marginBottom: 4 }
									}
								>
									<DateGroupHeader group={group} />
									<TimelineItems group={group} />
								</View>
							))}
						</>
					)}
				</View>
			</ScrollView>
		</TabContainer>
	);
}
