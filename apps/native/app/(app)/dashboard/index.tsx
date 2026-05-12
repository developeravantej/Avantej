import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	Text,
	View,
} from "react-native";
import { TabContainer, useTabBarHeight } from "@/components/container";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { orpc } from "@/utils/orpc";

// ─── Helpers ──────────────────────────────────────────────────────

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

function getRelativePast(dateStr: string | Date): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "Completed today";
	if (diffDays === 1) return "Completed yesterday";
	return `${diffDays} days ago`;
}

function getActivityIcon(status?: string): string {
	switch (status) {
		case "completed":
			return "checkmark-circle";
		case "cancelled":
			return "close-circle";
		case "no-show":
			return "alert-circle";
		default:
			return "ellipse";
	}
}

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400";

// ─── Skeleton Components ──────────────────────────────────────────

function SkeletonBox({ className }: { className: string }) {
	return <View className={`animate-pulse rounded-lg bg-secondary-3 ${className}`} />;
}

function PlanCardSkeleton() {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
			<SkeletonBox className="mb-3 h-6 w-16" />
			<SkeletonBox className="mb-2 h-7 w-40" />
			<SkeletonBox className="mb-4 h-12 w-56" />
			<SkeletonBox className="mb-3 h-4 w-48" />
			<SkeletonBox className="mb-3 h-2 w-full" />
			<SkeletonBox className="h-4 w-52" />
		</View>
	);
}

function UpcomingSkeleton() {
	return (
		<View className="mb-6">
			<Text className="mb-3 text-secondary-1 text-xs uppercase tracking-wide">
				UP NEXT
			</Text>
			<View className="overflow-hidden rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
				<View className="flex-row items-center">
					<SkeletonBox className="mr-3 size-16 rounded-lg" />
					<View className="flex-1">
						<SkeletonBox className="mb-2 h-5 w-36" />
						<SkeletonBox className="h-4 w-28" />
					</View>
				</View>
			</View>
		</View>
	);
}

// ─── Main Component ───────────────────────────────────────────────

// react-doctor-disable-next-line react-doctor/no-giant-component -- dashboard home with fitness plan card, action buttons grid, upcoming session, recent activity sections; many interrelated query branches; needs further refactor PR
export default function Home() {
	const { user } = useAuth();
	const { organizationId, isLoading: orgLoading } = useOrganization();
	const queryClient = useQueryClient();
	const userName =
		(user as { firstName?: string } | null)?.firstName || user?.name || "there";
	const tabBarHeight = useTabBarHeight();
	const currentDate = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	// ─── API Queries ──────────────────────────────────────────────

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
			},
		}),
		enabled: !!organizationId,
	});

	// ─── Derived Data ─────────────────────────────────────────────

	const unreadCount = (unreadData as number | undefined) ?? 0;

	const planStats = useMemo(() => {
		if (!activePackage) return null;
		const creditsRemaining = activePackage.creditsRemaining ?? 0;
		const creditsTotal = activePackage.creditsTotal ?? 0;
		const progress =
			creditsTotal > 0
				? Math.round(((creditsTotal - creditsRemaining) / creditsTotal) * 100)
				: 0;
		const expiresAt = activePackage.expiresAt
			? new Date(activePackage.expiresAt)
			: null;
		const weeksToFinish = expiresAt
			? Math.max(
					1,
					Math.ceil(
						(expiresAt.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000),
					),
				)
			: null;
		const renewalDate = expiresAt ? formatDate(expiresAt) : null;

		return { creditsRemaining, creditsTotal, progress, weeksToFinish, renewalDate };
	}, [activePackage]);

	const nextAppointment = upcomingAppointments?.[0] ?? null;

	const upcomingActivity = useMemo(() => {
		if (!nextAppointment) return null;
		return {
			id: nextAppointment.id,
			title: (nextAppointment as any).service?.name ?? "Appointment",
			time: formatTime(nextAppointment.startTime),
			duration: `${nextAppointment.duration} min`,
			date: getRelativeDay(nextAppointment.startTime),
			image: (nextAppointment as any).service?.imageUrl ?? DEFAULT_IMAGE,
		};
	}, [nextAppointment]);

	const recentActivities = useMemo(() => {
		return (recentAppointments ?? []).map((apt: any) => ({
			id: apt.id,
			name: apt.service?.name ?? "Session",
			date: getRelativePast(apt.startTime),
			credits: apt.creditsUsed ? -apt.creditsUsed : 0,
			icon: getActivityIcon(apt.status),
		}));
	}, [recentAppointments]);

	// ─── Pull to Refresh ──────────────────────────────────────────

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

	// ─── Greeting ─────────────────────────────────────────────────

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
				contentInset={{ bottom: tabBarHeight + 8 }}
				refreshControl={
					<RefreshControl
						refreshing={false}
						onRefresh={onRefresh}
						tintColor={colors.primary[1]}
					/>
				}
			>
				<View className="px-4 pt-4 pb-6">
					{/* Header Section */}
					<View className="mb-6 flex-row items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
						<View
							className="mr-3 size-12 items-center justify-center overflow-hidden rounded-full"
							style={{ backgroundColor: colors.secondary[2] }}
						>
							<Image
								source={{ uri: "https://via.placeholder.com/48" }}
								className="h-full w-full"
								contentFit="cover"
							/>
						</View>
						<View className="flex-1">
							<Text
								className="text-2xl text-primary-1"
								style={{ fontFamily: fonts.heading }}
							>
								{getGreeting()}, {userName}
							</Text>
							<Text className="mt-1 text-secondary-1 text-sm">
								{currentDate}
							</Text>
						</View>
						<Pressable
							onPress={() =>
								router.push("/dashboard/notifications/" as never)
							}
							className="relative size-10 items-center justify-center"
						>
							<Ionicons
								name="notifications-outline"
								size={24}
								color={colors.primary[1]}
							/>
							{unreadCount > 0 && (
								<View className="-right-1 -top-1 absolute size-5 items-center justify-center rounded-full bg-primary-1">
									<Text
										className="text-primary-2 text-xs"
										style={{ fontFamily: fonts.heading }}
									>
										{unreadCount > 9 ? "9+" : unreadCount}
									</Text>
								</View>
							)}
						</Pressable>
					</View>

					{/* Fitness Plan Card */}
					{packageLoading ? (
						<PlanCardSkeleton />
					) : packageError ? (
						<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Text className="text-secondary-1 text-sm">
								Unable to load plan details. Pull down to retry.
							</Text>
						</View>
					) : planStats ? (
						<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<View className="rounded-full bg-secondary-3 px-3 py-1">
									<Text className="font-semibold text-primary-1 text-xs">
										ACTIVE
									</Text>
								</View>
							</View>

							<Text
								className="mb-2 text-primary-1 text-xl"
								style={{ fontFamily: fonts.heading }}
							>
								Fitness Plan
							</Text>

							<View className="mb-4">
								<Text
									className="text-5xl text-primary-1"
									style={{ fontFamily: fonts.heading }}
								>
									{planStats.creditsRemaining} workouts
								</Text>
								<Text
									className="text-5xl text-secondary-1"
									style={{ fontFamily: fonts.heading }}
								>
									remaining
								</Text>
							</View>

							<Text className="mb-3 text-lg text-secondary-1">
								You're {planStats.progress}% through your plan
							</Text>

							<View className="mb-3">
								<View className="h-2 overflow-hidden rounded-full bg-secondary-3">
									<View
										className="h-full rounded-full bg-primary-1"
										style={{ width: `${planStats.progress}%` }}
									/>
								</View>
								<View className="mt-1 flex-row justify-between">
									<Text className="text-secondary-1 text-xs">Start</Text>
									<Text className="text-secondary-1 text-xs">End</Text>
								</View>
							</View>

							{planStats.weeksToFinish && (
								<View className="mb-4 flex-row items-center">
									<Ionicons
										name="time-outline"
										size={16}
										color={colors.secondary[1]}
									/>
									<Text className="ml-2 text-secondary-1 text-sm">
										At this pace, you'll finish in{" "}
										{planStats.weeksToFinish} weeks
									</Text>
								</View>
							)}

							{planStats.renewalDate && (
								<View className="flex-row items-center justify-between border-secondary-3 border-t pt-3">
									<Text className="text-secondary-1 text-sm">
										Renews on {planStats.renewalDate}
									</Text>
									<Pressable
										onPress={() =>
											router.push("/dashboard/packages" as never)
										}
									>
										<Text className="font-medium text-primary-1 text-sm">
											Manage membership{" "}
											<Ionicons
												name="chevron-forward"
												size={14}
												color={colors.primary[1]}
											/>
										</Text>
									</Pressable>
								</View>
							)}
						</View>
					) : (
						<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Text
								className="mb-2 text-primary-1 text-xl"
								style={{ fontFamily: fonts.heading }}
							>
								No Active Plan
							</Text>
							<Text className="mb-4 text-secondary-1 text-sm">
								Get started with a fitness package to track your progress.
							</Text>
							<Pressable
								onPress={() =>
									router.push("/dashboard/buy-package/setup" as never)
								}
								className="items-center rounded-xl bg-primary-1 py-3"
							>
								<Text
									className="font-medium text-primary-2 text-sm"
									style={{ fontFamily: fonts.heading }}
								>
									Browse Packages
								</Text>
							</Pressable>
						</View>
					)}

					{/* Quick Insight Card */}
					{planStats && (
						<View className="mb-6 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="flex-row items-start">
								<Ionicons
									name="bulb-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text className="ml-3 flex-1 text-secondary-1 text-sm">
									Quick insight: Most members book 2 workouts per week to
									finish on time
								</Text>
							</View>
						</View>
					)}

					{/* Action Buttons Grid */}
					<View className="mb-8 flex-row justify-between">
						<Pressable
							onPress={() =>
								router.push("/dashboard/book-workout/book-workout")
							}
							className="aspect-square w-[22%] items-center justify-center rounded-xl bg-primary-1 shadow-sm"
						>
							<Ionicons
								name="calendar-outline"
								size={24}
								color={colors.primary[2]}
							/>
							<Text className="mt-2 text-center font-medium text-primary-2 text-xs">
								Book{"\n"}Session
							</Text>
						</Pressable>

						<Pressable
							onPress={() =>
								router.push("/dashboard/calendar" as never)
							}
							className="aspect-square w-[22%] items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 shadow-sm"
						>
							<Ionicons
								name="calendar"
								size={24}
								color={colors.secondary[1]}
							/>
							<Text className="mt-2 font-medium text-primary-1 text-xs">
								Calendar
							</Text>
						</Pressable>

						<Pressable
							onPress={() =>
								router.push("/dashboard/buy-package/setup" as never)
							}
							className="aspect-square w-[22%] items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 shadow-sm"
						>
							<Ionicons
								name="cube-outline"
								size={24}
								color={colors.secondary[1]}
							/>
							<Text className="mt-2 text-center font-medium text-primary-1 text-xs">
								Buy{"\n"}Package
							</Text>
						</Pressable>

						<Pressable
							onPress={() =>
								router.push("/dashboard/packages" as never)
							}
							className="aspect-square w-[22%] items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 shadow-sm"
						>
							<Ionicons
								name="star-outline"
								size={24}
								color={colors.secondary[1]}
							/>
							<Text className="mt-2 text-center font-medium text-primary-1 text-xs">
								My{"\n"}Credits
							</Text>
						</Pressable>
					</View>

					{/* UP NEXT Section */}
					{upcomingLoading ? (
						<UpcomingSkeleton />
					) : upcomingError ? (
						<View className="mb-6">
							<Text className="mb-3 text-secondary-1 text-xs uppercase tracking-wide">
								UP NEXT
							</Text>
							<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<Text className="text-secondary-1 text-sm">
									Unable to load upcoming sessions.
								</Text>
							</View>
						</View>
					) : upcomingActivity ? (
						<View className="mb-6">
							<Text className="mb-3 text-secondary-1 text-xs uppercase tracking-wide">
								UP NEXT
							</Text>
							<Pressable
								onPress={() =>
									router.push(
										`/dashboard/bookings/${upcomingActivity.id}` as never,
									)
								}
								className="overflow-hidden rounded-2xl border border-secondary-3 bg-primary-2 shadow-sm"
							>
								<View className="flex-row">
									<View
										className="relative w-24 self-stretch"
										style={{
											backgroundColor: colors.secondary[3],
										}}
									>
										<Image
											source={{ uri: upcomingActivity.image }}
											className="h-full w-full"
											contentFit="cover"
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												right: 0,
												bottom: 0,
											}}
										/>
										<View className="absolute top-2 right-2 z-10 rounded-full bg-primary-1 px-2 py-1">
											<Text className="font-semibold text-primary-2 text-xs">
												{upcomingActivity.date}
											</Text>
										</View>
									</View>
									<View className="flex-1 justify-between p-4">
										<View>
											<Text
												className="mb-2 text-lg text-primary-1"
												style={{
													fontFamily: fonts.heading,
												}}
											>
												{upcomingActivity.title}
											</Text>
											<View className="mb-1 flex-row items-center">
												<Ionicons
													name="time-outline"
													size={14}
													color={colors.secondary[1]}
												/>
												<Text className="ml-1 text-secondary-1 text-sm">
													{upcomingActivity.time} •{" "}
													{upcomingActivity.duration}
												</Text>
											</View>
											<Text className="text-secondary-1 text-xs">
												Tap to view details
											</Text>
										</View>
										<Ionicons
											name="chevron-forward"
											size={20}
											color={colors.secondary[1]}
										/>
									</View>
								</View>
							</Pressable>
						</View>
					) : (
						<View className="mb-6">
							<Text className="mb-3 text-secondary-1 text-xs uppercase tracking-wide">
								UP NEXT
							</Text>
							<View className="items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
								<Ionicons
									name="calendar-outline"
									size={32}
									color={colors.secondary[1]}
								/>
								<Text
									className="mt-2 text-primary-1 text-base"
									style={{ fontFamily: fonts.heading }}
								>
									No upcoming sessions
								</Text>
								<Text className="mt-1 mb-3 text-center text-secondary-1 text-sm">
									Book a workout to get started
								</Text>
								<Pressable
									onPress={() =>
										router.push(
											"/dashboard/book-workout/book-workout",
										)
									}
									className="rounded-lg bg-primary-1 px-5 py-2"
								>
									<Text className="font-medium text-primary-2 text-sm">
										Book Now
									</Text>
								</Pressable>
							</View>
						</View>
					)}

					{/* RECENT ACTIVITY Section */}
					<View>
						<Text className="mb-3 text-secondary-1 text-xs uppercase tracking-wide">
							RECENT ACTIVITY
						</Text>
						{recentLoading ? (
							<>
								{[1, 2].map((n) => (
									<View
										key={`skel-${n}`}
										className="mb-3 flex-row items-center rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
									>
										<SkeletonBox className="mr-3 size-10 rounded-lg" />
										<View className="flex-1">
											<SkeletonBox className="mb-2 h-4 w-32" />
											<SkeletonBox className="h-3 w-24" />
										</View>
									</View>
								))}
							</>
						) : recentError ? (
							<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<Text className="text-secondary-1 text-sm">
									Unable to load recent activity.
								</Text>
							</View>
						) : recentActivities.length > 0 ? (
							recentActivities.map((activity: any) => (
								<Pressable
									key={activity.id}
									className="mb-3 flex-row items-center rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm"
								>
									<View className="mr-3 size-10 items-center justify-center rounded-lg bg-secondary-3">
										<Ionicons
											name={activity.icon as never}
											size={20}
											color={colors.secondary[1]}
										/>
									</View>
									<View className="flex-1">
										<Text className="font-medium text-base text-primary-1">
											{activity.name}
										</Text>
										<Text className="mt-1 text-secondary-1 text-sm">
											{activity.date}
										</Text>
									</View>
									{activity.credits !== 0 && (
										<Text className="text-secondary-1 text-sm">
											{activity.credits > 0 ? "+" : ""}
											{activity.credits} credit
										</Text>
									)}
								</Pressable>
							))
						) : (
							<View className="items-center rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
								<Text className="text-secondary-1 text-sm">
									No recent activity yet
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>
		</TabContainer>
	);
}
