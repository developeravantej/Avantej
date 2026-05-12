import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { orpc } from "@/utils/orpc";

function formatDate(dateStr: string | Date): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(dateStr: string | Date): string {
	const date = new Date(dateStr);
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

function getRelativeDay(dateStr: string | Date): string {
	const date = new Date(dateStr);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const diffDays = Math.round(
		(target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays === 0) return "TODAY";
	if (diffDays === 1) return "TOMORROW";
	return date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
}

function getRelativeDate(dateStr: string | Date): string {
	const date = new Date(dateStr);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const diffDays = Math.round(
		(today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays === -1) return "Tomorrow";
	if (diffDays < 0) return formatDate(dateStr);
	if (diffDays < 7) return `${diffDays} days ago`;
	return formatDate(dateStr);
}

function getStatusLabel(status?: string): string {
	switch (status) {
		case "completed":
			return "Completed";
		case "cancelled":
			return "Cancelled";
		case "no-show":
			return "No-show";
		case "confirmed":
			return "Confirmed";
		case "pending":
			return "Pending";
		default:
			return "";
	}
}

function getActivityIcon(status?: string): string {
	switch (status) {
		case "completed":
			return "checkmark-circle";
		case "cancelled":
			return "close-circle";
		case "no-show":
			return "alert-circle";
		case "confirmed":
			return "calendar";
		case "pending":
			return "time";
		default:
			return "ellipse";
	}
}

function getActivityColor(status?: string): string {
	switch (status) {
		case "completed":
			return "#16A34A";
		case "confirmed":
			return "#16A34A";
		case "no-show":
		case "pending":
			return "#D97706";
		case "cancelled":
			return "#B91C1C";
		default:
			return colors.secondary[1];
	}
}

function getActivityBg(status?: string): string {
	switch (status) {
		case "completed":
		case "confirmed":
			return "#DCFCE7";
		case "no-show":
		case "pending":
			return "#FEF3C7";
		case "cancelled":
			return "#FEE2E2";
		default:
			return colors.secondary[3];
	}
}

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400";

function SkeletonBox({ className }: { className: string }) {
	return (
		<View className={`animate-pulse rounded-lg bg-secondary-3 ${className}`} />
	);
}

function PlanCardSkeleton() {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-6">
			<SkeletonBox className="mb-5 h-6 w-24" />
			<SkeletonBox className="mb-2 h-14 w-40" />
			<SkeletonBox className="mb-5 h-5 w-48" />
			<SkeletonBox className="mb-2 h-1 w-full" />
			<SkeletonBox className="h-4 w-36" />
		</View>
	);
}

function UpcomingSkeleton() {
	return (
		<View className="mb-7">
			<Text
				className="mb-3 text-secondary-1"
				style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.body }}
			>
				UP NEXT
			</Text>
			<View className="overflow-hidden rounded-2xl border border-secondary-3 bg-primary-2">
				<SkeletonBox className="h-24 w-full rounded-none" />
				<View className="p-4">
					<SkeletonBox className="mb-2 h-5 w-40" />
					<SkeletonBox className="h-4 w-56" />
				</View>
			</View>
		</View>
	);
}

export default function Home() {
	const { user } = useAuth();
	const { organizationId, isLoading: orgLoading } = useOrganization();
	const queryClient = useQueryClient();
	const userName =
		(user as { firstName?: string } | null)?.firstName ||
		user?.name ||
		"there";
	const tabBarHeight = useTabBarHeight();
	const currentDate = new Date()
		.toLocaleDateString("en-US", {
			weekday: "long",
			month: "long",
			day: "numeric",
		})
		.toUpperCase();

	const {
		data: activePackage,
		isPending: packageLoading,
		isError: packageError,
	} = useQuery({
		...orpc.packageInstances.getActiveForClient.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	const { data: unreadData } = useQuery({
		...orpc.notifications.getUnreadCount.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
		refetchInterval: 30000,
	});

	const {
		data: upcomingAppointments,
		isPending: upcomingLoading,
		isError: upcomingError,
	} = useQuery({
		...orpc.appointments.listForUser.queryOptions({
			input: {
				organizationId,
				status: "confirmed",
				startFrom: new Date().toISOString(),
				limit: 1,
			},
		}),
		enabled: !!organizationId,
	});

	const {
		data: recentAppointments,
		isPending: recentLoading,
		isError: recentError,
	} = useQuery({
		...orpc.appointments.listForUser.queryOptions({
			input: {
				organizationId,
				limit: 5,
				orderDesc: true,
			},
		}),
		enabled: !!organizationId,
	});

	const unreadCount = (unreadData as number | undefined) ?? 0;

	const planStats = useMemo(() => {
		if (!activePackage) return null;
		const creditsRemaining = activePackage.creditsRemaining ?? 0;
		const creditsTotal = activePackage.creditsTotal ?? 0;
		const progress =
			creditsTotal > 0
				? Math.round(
						((creditsTotal - creditsRemaining) / creditsTotal) * 100,
					)
				: 0;
		const expiresAt = activePackage.expiresAt
			? new Date(activePackage.expiresAt)
			: null;
		const weeksToFinish = expiresAt
			? Math.max(
					1,
					Math.ceil(
						(expiresAt.getTime() - Date.now()) /
							(7 * 24 * 60 * 60 * 1000),
					),
				)
			: null;
		const renewalDate = expiresAt ? formatDate(expiresAt) : null;

		return {
			creditsRemaining,
			creditsTotal,
			progress,
			weeksToFinish,
			renewalDate,
		};
	}, [activePackage]);

	const nextAppointment = upcomingAppointments?.[0] ?? null;

	const upcomingActivity = useMemo(() => {
		if (!nextAppointment) return null;
		return {
			id: nextAppointment.id,
			title: (nextAppointment as any).serviceName ?? "Appointment",
			time: formatTime(nextAppointment.startTime),
			duration: `${nextAppointment.duration} min`,
			date: getRelativeDay(nextAppointment.startTime),
			image: DEFAULT_IMAGE,
			trainerName: null as string | null,
		};
	}, [nextAppointment]);

	const recentActivities = useMemo(() => {
		return (recentAppointments ?? []).map((apt: any) => ({
			id: apt.id,
			name: apt.serviceName ?? "Session",
			date: getRelativeDate(apt.startTime),
			credits: apt.creditsUsed ? -apt.creditsUsed : 0,
			icon: getActivityIcon(apt.status),
			status: apt.status as string | undefined,
		}));
	}, [recentAppointments]);

	const onRefresh = useCallback(() => {
		queryClient.invalidateQueries({
			predicate: (query) => {
				const key = query.queryKey[0];
				return (
					key === "packageInstances" ||
					key === "appointments" ||
					key === "notifications"
				);
			},
		});
	}, [queryClient]);

	const getGreeting = () => {
		const hour = new Date().getHours();
		if (hour < 12) return "Good Morning";
		if (hour < 17) return "Good Afternoon";
		return "Good Evening";
	};

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
				refreshControl={
					<RefreshControl
						refreshing={false}
						onRefresh={onRefresh}
						tintColor={colors.primary[1]}
					/>
				}
			>
				<View className="px-5 pt-4 pb-6">
					{/* ─── Header ─── */}
					<View className="mb-7 flex-row items-center justify-between">
						<View>
							<Text
								className="mb-1.5 text-secondary-1"
								style={{
									fontSize: 11,
									letterSpacing: 1.5,
									fontFamily: fonts.body,
								}}
							>
								{currentDate}
							</Text>
							<Text
								className="text-primary-1"
								style={{
									fontFamily: fonts.heading,
									fontSize: 24,
									lineHeight: 28,
								}}
							>
								{getGreeting()}, {userName}
							</Text>
						</View>
						<TouchableOpacity
							onPress={() =>
								router.push("/dashboard/notifications/" as never)
							}
							className="relative h-10 w-10 items-center justify-center rounded-full"
							style={{ backgroundColor: colors.secondary[2] }}
						>
							<Ionicons
								name="notifications-outline"
								size={20}
								color={colors.primary[1]}
							/>
							{unreadCount > 0 && (
								<View
									className="absolute -top-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full bg-primary-1"
									style={{
										borderWidth: 2,
										borderColor: colors.secondary[3],
									}}
								>
									<Text
										className="text-primary-2"
										style={{
											fontFamily: fonts.heading,
											fontSize: 9,
										}}
									>
										{unreadCount > 9 ? "9+" : unreadCount}
									</Text>
								</View>
							)}
						</TouchableOpacity>
					</View>

					{/* ─── Plan Card ─── */}
					{packageLoading ? (
						<PlanCardSkeleton />
					) : packageError ? (
						<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-6">
							<Text className="text-secondary-1 text-sm" style={{ fontFamily: fonts.body }}>
								Unable to load plan details. Pull down to retry.
							</Text>
						</View>
					) : planStats ? (
						<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-6">
							<View className="mb-5 flex-row items-center justify-between">
								<View className="rounded-full bg-secondary-3 px-3 py-1">
									<Text
										style={{
											fontSize: 11,
											letterSpacing: 1,
											color: colors.primary[1],
											fontFamily: fonts.body,
										}}
									>
										ACTIVE PLAN
									</Text>
								</View>
							</View>

							<View className="mb-1 flex-row items-baseline">
								<Text
									className="text-primary-1"
									style={{
										fontFamily: fonts.heading,
										fontSize: 56,
										lineHeight: 56,
										letterSpacing: -2,
									}}
								>
									{planStats.creditsRemaining}
								</Text>
								<Text
									className="ml-2 text-secondary-1"
									style={{
										fontFamily: fonts.heading,
										fontSize: 24,
										lineHeight: 28,
									}}
								>
									workouts
								</Text>
							</View>
							<Text
								className="mb-5"
								style={{
									fontFamily: fonts.subheading,
									fontSize: 16,
									color: colors.secondary[1],
								}}
							>
								remaining of {planStats.creditsTotal} total
							</Text>

							<View
								className="mb-2 overflow-hidden rounded-full"
								style={{ height: 3, backgroundColor: colors.secondary[3] }}
							>
								<View
									className="rounded-full bg-primary-1"
									style={{
										height: 3,
										width: `${planStats.progress}%`,
									}}
								/>
							</View>
							<View className="flex-row justify-between">
								<Text
									className="text-secondary-1"
									style={{ fontSize: 12, fontFamily: fonts.body }}
								>
									{planStats.progress}% complete
								</Text>
								{planStats.renewalDate && (
									<Text
										className="text-secondary-1"
										style={{ fontSize: 12, fontFamily: fonts.body }}
									>
										Renews {planStats.renewalDate}
									</Text>
								)}
							</View>
						</View>
					) : (
						<View className="mb-4 overflow-hidden rounded-2xl border border-secondary-3 bg-primary-2">
							<View
								className="relative"
								style={{ height: 160 }}
							>
								<Image
									source={{ uri: DEFAULT_IMAGE }}
									className="h-full w-full"
									resizeMode="cover"
									style={{ opacity: 0.85 }}
								/>
								<LinearGradient
									colors={[
										"transparent",
										"rgba(0,0,0,0.65)",
									]}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										right: 0,
										bottom: 0,
									}}
								/>
								<View className="absolute bottom-4 left-5 right-5">
									<Text
										className="text-primary-2"
										style={{
											fontFamily: fonts.heading,
											fontSize: 24,
											lineHeight: 28,
											marginBottom: 4,
										}}
									>
										Start Your{"\n"}Fitness Journey
									</Text>
									<Text
										className="text-sm"
										style={{
											color: "rgba(255,255,255,0.7)",
											fontFamily: fonts.body,
										}}
									>
										Choose a package to begin training
									</Text>
								</View>
							</View>
							<View className="p-4">
								<TouchableOpacity
									onPress={() =>
										router.push(
											"/dashboard/buy-package/setup" as never,
										)
									}
									className="items-center rounded-xl bg-primary-1 py-4"
								>
									<View className="flex-row items-center">
										<Ionicons
											name="cube-outline"
											size={18}
											color={colors.primary[2]}
										/>
										<Text
											className="ml-2 text-primary-2"
											style={{
												fontFamily: fonts.heading,
												fontSize: 15,
											}}
										>
											Browse Packages
										</Text>
									</View>
								</TouchableOpacity>
							</View>
						</View>
					)}

					{/* ─── Insight ─── */}
					{planStats && (
						<View className="mb-7 flex-row items-start rounded-2xl border border-secondary-3 bg-primary-2 px-4 py-3.5">
							<Ionicons
								name="bulb-outline"
								size={16}
								color={colors.secondary[1]}
								style={{ marginTop: 2 }}
							/>
							<Text className="ml-3 flex-1 text-secondary-1 text-sm" style={{ fontFamily: fonts.body }}>
								Book 2 sessions/week to finish on time
							</Text>
						</View>
					)}

					{/* ─── Action Grid ─── */}
					<View className="mb-8 flex-row justify-between">
						<TouchableOpacity
							onPress={() =>
								router.push("/dashboard/book-workout/book-workout")
							}
							className="aspect-square w-[22%] items-center justify-center rounded-2xl bg-primary-1"
						>
							<Ionicons
								name="calendar-outline"
								size={22}
								color={colors.primary[2]}
							/>
							<Text
								className="mt-1.5 text-center text-primary-2"
								style={{
									fontFamily: fonts.subheading,
									fontSize: 10,
									lineHeight: 13,
								}}
							>
								Book{"\n"}Session
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={() =>
								router.push("/dashboard/calendar" as never)
							}
							className="aspect-square w-[22%] items-center justify-center rounded-2xl border border-secondary-3 bg-primary-2"
						>
							<Ionicons
								name="calendar"
								size={22}
								color={colors.secondary[1]}
							/>
							<Text
								className="mt-1.5 text-primary-1"
								style={{
									fontFamily: fonts.subheading,
									fontSize: 10,
								}}
							>
								Calendar
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={() =>
								router.push("/dashboard/buy-package/setup" as never)
							}
							className="aspect-square w-[22%] items-center justify-center rounded-2xl border border-secondary-3 bg-primary-2"
						>
							<Ionicons
								name="cube-outline"
								size={22}
								color={colors.secondary[1]}
							/>
							<Text
								className="mt-1.5 text-center text-primary-1"
								style={{
									fontFamily: fonts.subheading,
									fontSize: 10,
									lineHeight: 13,
								}}
							>
								Buy{"\n"}Package
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={() =>
								router.push("/dashboard/packages" as never)
							}
							className="aspect-square w-[22%] items-center justify-center rounded-2xl border border-secondary-3 bg-primary-2"
						>
							<Ionicons
								name="star-outline"
								size={22}
								color={colors.secondary[1]}
							/>
							<Text
								className="mt-1.5 text-center text-primary-1"
								style={{
									fontFamily: fonts.subheading,
									fontSize: 10,
									lineHeight: 13,
								}}
							>
								My{"\n"}Credits
							</Text>
						</TouchableOpacity>
					</View>

					{/* ─── Up Next ─── */}
					{upcomingLoading ? (
						<UpcomingSkeleton />
					) : upcomingError ? (
						<View className="mb-7">
							<Text
								className="mb-3 text-secondary-1"
								style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.body }}
							>
								UP NEXT
							</Text>
							<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4">
								<Text className="text-secondary-1 text-sm" style={{ fontFamily: fonts.body }}>
									Unable to load upcoming sessions.
								</Text>
							</View>
						</View>
					) : upcomingActivity ? (
						<View className="mb-7">
							<Text
								className="mb-3 text-secondary-1"
								style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.body }}
							>
								UP NEXT
							</Text>
							<TouchableOpacity
								onPress={() =>
									router.push(
										`/dashboard/bookings/${upcomingActivity.id}` as never,
									)
								}
								className="overflow-hidden rounded-2xl border border-secondary-3"
							>
								<View
									className="relative"
									style={{ height: 100 }}
								>
									<Image
										source={{ uri: upcomingActivity.image }}
										className="h-full w-full"
										resizeMode="cover"
										style={{ opacity: 0.85 }}
									/>
									<LinearGradient
										colors={[
											"transparent",
											"rgba(0,0,0,0.6)",
										]}
										start={{ x: 0, y: 0.2 }}
										end={{ x: 0, y: 1 }}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											right: 0,
											bottom: 0,
										}}
									/>
									<View className="absolute bottom-2.5 left-3.5">
										<Text
											className="text-primary-2"
											style={{
												fontFamily: fonts.subheading,
												fontSize: 15,
											}}
										>
											{upcomingActivity.date} ·{" "}
											{upcomingActivity.time}
										</Text>
									</View>
									<View className="absolute top-2 right-2.5 rounded-full bg-primary-2 px-2.5 py-1">
										<Text
											style={{
												fontSize: 10,
												letterSpacing: 0.5,
												color: colors.primary[1],
												fontWeight: "700",
											}}
										>
											{upcomingActivity.date}
										</Text>
									</View>
								</View>
								<View className="bg-primary-2 p-3.5">
									<Text
										className="text-primary-1"
										style={{
											fontFamily: fonts.heading,
											fontSize: 20,
											lineHeight: 24,
											marginBottom: 4,
										}}
									>
										{upcomingActivity.title}
									</Text>
									<Text className="text-secondary-1 text-sm" style={{ fontFamily: fonts.body }}>
										{upcomingActivity.duration}
										{upcomingActivity.trainerName
											? ` · ${upcomingActivity.trainerName}`
											: ""}
										{" · -1 credit"}
									</Text>
								</View>
							</TouchableOpacity>
						</View>
					) : (
						<View className="mb-7">
							<Text
								className="mb-3 text-secondary-1"
								style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.body }}
							>
								UP NEXT
							</Text>
							<View className="items-center rounded-2xl border border-secondary-3 bg-primary-2 px-5 py-7">
								<View
									className="mb-3.5 h-12 w-12 items-center justify-center rounded-full"
									style={{
										backgroundColor: colors.primary[3],
									}}
								>
									<Ionicons
										name="calendar-outline"
										size={24}
										color={colors.secondary[1]}
									/>
								</View>
								<Text
									className="mb-1.5 text-primary-1"
									style={{
										fontFamily: fonts.heading,
										fontSize: 17,
									}}
								>
									No upcoming sessions
								</Text>
								<Text className="mb-4 text-center text-secondary-1 text-sm" style={{ fontFamily: fonts.body }}>
									Purchase a package to start{"\n"}booking your
									workouts
								</Text>
								<TouchableOpacity
									onPress={() =>
										router.push(
											"/dashboard/book-workout/book-workout",
										)
									}
									className="rounded-xl border border-primary-1 px-5 py-2.5"
								>
									<Text
										className="text-primary-1"
										style={{
											fontFamily: fonts.subheading,
											fontSize: 13,
										}}
									>
										Get Started
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}

					{/* ─── Recent Activity ─── */}
					<View>
						<Text
							className="mb-3 text-secondary-1"
							style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.body }}
						>
							RECENT ACTIVITY
						</Text>
						{recentLoading ? (
							<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4">
								{[1, 2].map((i) => (
									<View
										key={i}
										className="flex-row items-center py-3.5"
										style={
											i < 2
												? {
														borderBottomWidth: 1,
														borderBottomColor:
															colors.secondary[3],
													}
												: undefined
										}
									>
										<SkeletonBox className="mr-3 h-8 w-8 rounded-full" />
										<View className="flex-1">
											<SkeletonBox className="mb-2 h-4 w-32" />
											<SkeletonBox className="h-3 w-20" />
										</View>
									</View>
								))}
							</View>
						) : recentError ? (
							<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4">
								<Text className="text-secondary-1 text-sm" style={{ fontFamily: fonts.body }}>
									Unable to load recent activity.
								</Text>
							</View>
						) : recentActivities.length > 0 ? (
							<View className="overflow-hidden rounded-2xl border border-secondary-3 bg-primary-2">
								{recentActivities.map((activity, idx) => (
									<View
										key={activity.id}
										className="flex-row items-center px-4 py-3.5"
										style={
											idx < recentActivities.length - 1
												? {
														borderBottomWidth: 1,
														borderBottomColor:
															colors.secondary[3],
													}
												: undefined
										}
									>
										<View
											className="mr-3 h-9 w-9 items-center justify-center rounded-full"
											style={{
												backgroundColor: getActivityBg(
													activity.status,
												),
											}}
										>
											<Ionicons
												name={activity.icon as never}
												size={16}
												color={getActivityColor(
													activity.status,
												)}
											/>
										</View>
										<View className="flex-1">
											<Text
												className="text-primary-1"
												style={{
													fontFamily:
														fonts.subheading,
													fontSize: 14,
													marginBottom: 2,
												}}
											>
												{activity.name}
											</Text>
											<View className="flex-row items-center">
												<Text
													style={{
														fontSize: 11,
														fontFamily: fonts.body,
														color: getActivityColor(activity.status),
													}}
												>
													{getStatusLabel(activity.status)}
												</Text>
												<Text
													className="text-secondary-1"
													style={{ fontSize: 11, fontFamily: fonts.body, marginHorizontal: 4 }}
												>
													·
												</Text>
												<Text
													className="text-secondary-1"
													style={{ fontSize: 11, fontFamily: fonts.body }}
												>
													{activity.date}
												</Text>
											</View>
										</View>
										{activity.credits !== 0 && (
											<View className="items-end">
												<Text
													className="text-primary-1"
													style={{
														fontFamily: fonts.subheading,
														fontSize: 13,
													}}
												>
													{activity.credits > 0
														? "+"
														: ""}
													{activity.credits} credit{Math.abs(activity.credits) !== 1 ? "s" : ""}
												</Text>
											</View>
										)}
									</View>
								))}
							</View>
						) : (
							<View className="items-center rounded-2xl border border-secondary-3 bg-primary-2 px-5 py-6">
								<View
									className="mb-3 h-10 w-10 items-center justify-center rounded-full"
									style={{
										backgroundColor: colors.primary[3],
									}}
								>
									<Ionicons
										name="time-outline"
										size={20}
										color={colors.secondary[1]}
									/>
								</View>
								<Text
									className="mb-1 text-primary-1"
									style={{
										fontFamily: fonts.subheading,
										fontSize: 14,
									}}
								>
									No activity yet
								</Text>
								<Text
									className="text-secondary-1"
									style={{ fontSize: 12, fontFamily: fonts.body }}
								>
									Your sessions will appear here
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>
		</TabContainer>
	);
}
