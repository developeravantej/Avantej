import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import {
	ActivityIndicator,
	Image,
	RefreshControl,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { TabContainer, useTabBarHeight } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { orpc } from "@/utils/orpc";

// ─── Helpers ──────────────────────────────────────────────────────

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop";

const formatBookingDate = (dateStr: string | Date) => {
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
};

const formatBookingTime = (dateStr: string | Date) => {
	const d = new Date(dateStr);
	return d.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
};

const getStatusLabel = (status: string) => {
	switch (status) {
		case "completed":
			return "Completed";
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

// ─── Skeleton Components ──────────────────────────────────────────

function SkeletonBox({ className }: { className: string }) {
	return (
		<View className={`animate-pulse rounded-lg bg-secondary-3 ${className}`} />
	);
}

function BookingCardSkeleton() {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View className="mb-4 flex-row">
				<SkeletonBox className="mr-4 size-24 rounded-xl" />
				<View className="flex-1">
					<SkeletonBox className="mb-3 h-5 w-36" />
					<SkeletonBox className="mb-2 h-4 w-28" />
					<SkeletonBox className="mb-2 h-4 w-24" />
					<SkeletonBox className="h-4 w-32" />
				</View>
			</View>
			<View className="flex-row justify-between">
				<SkeletonBox className="mr-2 h-12 flex-1 rounded-xl" />
				<SkeletonBox className="ml-2 h-12 flex-1 rounded-xl" />
			</View>
		</View>
	);
}

function PastBookingCardSkeleton() {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View className="mb-4 flex-row">
				<SkeletonBox className="mr-4 size-24 rounded-xl" />
				<View className="flex-1">
					<SkeletonBox className="mb-3 h-5 w-36" />
					<SkeletonBox className="mb-2 h-4 w-28" />
					<SkeletonBox className="mb-2 h-4 w-24" />
					<SkeletonBox className="h-4 w-32" />
				</View>
			</View>
			<SkeletonBox className="h-12 w-full rounded-xl" />
		</View>
	);
}

// ─── Main Component ───────────────────────────────────────────────

export default function BookingsScreen() {
	const tabBarHeight = useTabBarHeight();
	const { organizationId, isLoading: orgLoading } = useOrganization();
	const queryClient = useQueryClient();

	// ─── API Queries ──────────────────────────────────────────────

	// Single query: fetch the user's bookings across the relevant statuses,
	// then split client-side by start time. This avoids two queries with
	// overlapping coverage and makes "cancelled-future" / "pending" bookings
	// reachable in either list.
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

	const upcomingLoading = bookingsLoading;
	const pastLoading = bookingsLoading;
	const upcomingError = bookingsError;
	const pastError = bookingsError;

	// ─── Derived Data ─────────────────────────────────────────────

	const { upcomingList, pastList } = useMemo(() => {
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
		return { upcomingList: upcoming, pastList: past };
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
				contentInset={{ bottom: tabBarHeight + 8 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={false}
						onRefresh={onRefresh}
						tintColor={colors.primary[1]}
					/>
				}
			>
				<View className="px-4 pt-4">
					{/* Header Section */}
					<View className="mb-6">
						<Text className="mb-2 font-bold text-2xl text-primary-1">
							My Bookings
						</Text>
						<Text className="text-secondary-1 text-sm">
							View and manage your upcoming and past sessions
						</Text>
					</View>

					{/* Quick Link to Packages */}
					<TouchableOpacity
						onPress={() => router.push("/dashboard/packages" as never)}
						className="mb-6 flex-row items-center justify-between rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
					>
						<View className="flex-1 flex-row items-center">
							<View className="mr-3 size-12 items-center justify-center rounded-xl bg-secondary-3">
								<Ionicons
									name="cube-outline"
									size={24}
									color={colors.primary[1]}
								/>
							</View>
							<View className="flex-1">
								<Text className="font-semibold text-base text-primary-1">
									View My Packages & Credits
								</Text>
								<Text className="mt-1 text-secondary-1 text-xs">
									Manage your purchased packages
								</Text>
							</View>
						</View>
						<Ionicons
							name="chevron-forward"
							size={20}
							color={colors.primary[1]}
						/>
					</TouchableOpacity>

					{/* UPCOMING Section */}
					<Text className="mb-4 font-bold text-secondary-1 text-sm uppercase tracking-wide">
						UPCOMING
					</Text>

					{upcomingLoading ? (
						<>
							<BookingCardSkeleton />
							<BookingCardSkeleton />
						</>
					) : upcomingError ? (
						<View className="mb-4 items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Text className="text-secondary-1 text-sm">
								Unable to load upcoming bookings. Pull down to retry.
							</Text>
						</View>
					) : upcomingList.length === 0 ? (
						<View className="mb-4 items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Ionicons
								name="calendar-outline"
								size={32}
								color={colors.secondary[1]}
							/>
							<Text className="mt-2 font-semibold text-base text-primary-1">
								No upcoming bookings
							</Text>
							<Text className="mt-1 text-center text-secondary-1 text-sm">
								Book a session to get started
							</Text>
						</View>
					) : (
						upcomingList.map((booking: any) => (
							<View
								key={booking.id}
								className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
							>
								{/* Image and Details Row */}
								<View className="mb-4 flex-row">
									{/* Image */}
									<Image
										source={{
											uri: booking.imageUrl || DEFAULT_IMAGE,
										}}
										className="mr-4 size-24 rounded-xl"
										resizeMode="cover"
									/>

									{/* Details */}
									<View className="flex-1">
										<Text
											className="mb-2 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{booking.serviceName ||
												(booking.type === "semi-private"
													? "Semi-Private Session"
													: booking.type === "private"
														? "Private Session"
														: "Appointment")}
										</Text>

										{/* Date */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="calendar-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{
													color: colors.secondary[1],
												}}
											>
												{formatBookingDate(
													booking.startTime,
												)}
											</Text>
										</View>

										{/* Time */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="time-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{
													color: colors.secondary[1],
												}}
											>
												{formatBookingTime(
													booking.startTime,
												)}{" "}
												({booking.duration} min)
											</Text>
										</View>

										{/* Location */}
										{booking.location && (
											<Text
												className="text-sm"
												style={{
													color: colors.secondary[1],
												}}
											>
												{booking.location}
											</Text>
										)}

										{/* Booking Number */}
										{booking.bookingNumber && (
											<Text
												className="mt-1 text-xs"
												style={{
													color: colors.secondary[1],
												}}
											>
												#{booking.bookingNumber}
											</Text>
										)}
									</View>
								</View>

								{/* Action Buttons */}
								<View className="flex-row justify-between">
									<TouchableOpacity
										onPress={() => {
											router.push({
												pathname:
													"/dashboard/bookings/[id]" as never,
												params: {
													id: booking.id.toString(),
												},
											});
										}}
										className="mr-2 flex-1 items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-3"
									>
										<Text className="font-medium text-base text-primary-1">
											View details
										</Text>
									</TouchableOpacity>

									<TouchableOpacity className="ml-2 flex-1 items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-3">
										<Text className="font-medium text-base text-primary-1">
											Reschedule
										</Text>
									</TouchableOpacity>
								</View>
							</View>
						))
					)}

					{/* PAST Section */}
					<Text className="mt-2 mb-4 font-bold text-secondary-1 text-sm uppercase tracking-wide">
						PAST
					</Text>

					{pastLoading ? (
						<>
							<PastBookingCardSkeleton />
							<PastBookingCardSkeleton />
						</>
					) : pastError ? (
						<View className="mb-4 items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Text className="text-secondary-1 text-sm">
								Unable to load past bookings. Pull down to retry.
							</Text>
						</View>
					) : pastList.length === 0 ? (
						<View className="mb-4 items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Ionicons
								name="time-outline"
								size={32}
								color={colors.secondary[1]}
							/>
							<Text className="mt-2 font-semibold text-base text-primary-1">
								No past bookings
							</Text>
							<Text className="mt-1 text-center text-secondary-1 text-sm">
								Your completed sessions will appear here
							</Text>
						</View>
					) : (
						pastList.map((booking: any) => (
							<View
								key={booking.id}
								className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
							>
								{/* Image and Details Row */}
								<View className="mb-4 flex-row">
									{/* Image */}
									<Image
										source={{
											uri: booking.imageUrl || DEFAULT_IMAGE,
										}}
										className="mr-4 size-24 rounded-xl"
										resizeMode="cover"
									/>

									{/* Details */}
									<View className="flex-1">
										<Text
											className="mb-2 font-bold text-lg"
											style={{ color: colors.primary[1] }}
										>
											{booking.serviceName ||
												(booking.type === "semi-private"
													? "Semi-Private Session"
													: booking.type === "private"
														? "Private Session"
														: "Appointment")}
										</Text>

										{/* Date */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="calendar-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{
													color: colors.secondary[1],
												}}
											>
												{formatBookingDate(
													booking.startTime,
												)}
											</Text>
										</View>

										{/* Time */}
										<View className="mb-1 flex-row items-center">
											<Ionicons
												name="time-outline"
												size={14}
												color={colors.secondary[1]}
											/>
											<Text
												className="ml-1 text-sm"
												style={{
													color: colors.secondary[1],
												}}
											>
												{formatBookingTime(
													booking.startTime,
												)}{" "}
												({booking.duration} min)
											</Text>
										</View>

										{/* Location */}
										{booking.location && (
											<Text
												className="mb-1 text-sm"
												style={{
													color: colors.secondary[1],
												}}
											>
												{booking.location}
											</Text>
										)}

										{/* Status */}
										<Text
											className="text-sm"
											style={{
												color: colors.secondary[1],
											}}
										>
											{getStatusLabel(booking.status)}
										</Text>
									</View>
								</View>

								{/* View Details Button */}
								<TouchableOpacity
									onPress={() => {
										router.push({
											pathname:
												"/dashboard/bookings/[id]" as never,
											params: {
												id: booking.id.toString(),
											},
										});
									}}
									className="items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-3"
								>
									<Text className="font-medium text-base text-primary-1">
										View details
									</Text>
								</TouchableOpacity>
							</View>
						))
					)}
				</View>
			</ScrollView>
		</TabContainer>
	);
}
