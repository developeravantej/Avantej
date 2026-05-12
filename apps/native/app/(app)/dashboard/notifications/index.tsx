import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
	RefreshControl,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { client, orpc } from "@/utils/orpc";

function getNotificationIcon(type: string): string {
	switch (type) {
		case "booking":
			return "calendar";
		case "reminder":
			return "time";
		case "promotion":
			return "gift";
		case "system":
			return "information-circle";
		case "package_assigned":
			return "checkmark-circle";
		case "package_rejected":
			return "close-circle";
		case "package_pending_review":
			return "hourglass";
		default:
			return "notifications";
	}
}

function getNotificationColor(type: string): string {
	switch (type) {
		case "booking":
			return "#4F46E5";
		case "reminder":
			return "#F59E0B";
		case "promotion":
			return "#10B981";
		case "system":
			return "#6B7280";
		case "package_assigned":
			return "#16A34A";
		case "package_rejected":
			return "#DC2626";
		case "package_pending_review":
			return "#D97706";
		default:
			return "#6B7280";
	}
}

function formatTimeAgo(dateStr: string): string {
	const now = new Date();
	const date = new Date(dateStr);
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins} min ago`;
	if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
	if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SkeletonNotification() {
	return (
		<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View className="flex-row">
				<View
					className="mr-3 h-12 w-12 rounded-full"
					style={{ backgroundColor: colors.secondary[3] }}
				/>
				<View className="flex-1">
					<View
						className="mb-2 h-4 w-3/4 rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
					<View
						className="mb-2 h-3 w-full rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
					<View
						className="h-3 w-1/4 rounded"
						style={{ backgroundColor: colors.secondary[3] }}
					/>
				</View>
			</View>
		</View>
	);
}

export default function NotificationsScreen() {
	const { organizationId } = useOrganization();
	const queryClient = useQueryClient();
	const [refreshing, setRefreshing] = useState(false);

	// Fetch notifications
	const {
		data: notifications,
		isLoading,
		refetch,
	} = useQuery(
		orpc.notifications.list.queryOptions({
			input: { organizationId, limit: 50 },
		}),
	);

	const notificationList = (notifications ?? []).map((notif: any) => ({
		id: notif.id,
		type: notif.type ?? "system",
		title: notif.title,
		message: notif.message ?? notif.body ?? "",
		time: notif.createdAt ? formatTimeAgo(notif.createdAt) : "",
		read: notif.isRead ?? false,
		icon: getNotificationIcon(notif.type ?? "system"),
		color: getNotificationColor(notif.type ?? "system"),
		referenceId: notif.relatedId ?? notif.referenceId,
	}));

	const unreadCount = notificationList.filter((n: any) => !n.read).length;

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	}, [refetch]);

	const handleMarkRead = async (notifId: string) => {
		try {
			await client.notifications.markRead({ organizationId, id: notifId });
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		} catch {
			// Silently fail
		}
	};

	const handleMarkAllRead = async () => {
		try {
			await client.notifications.markAllRead({ organizationId });
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
			// Also refresh package data in case assignments/rejections changed status
			queryClient.invalidateQueries({ queryKey: ["packageInstances"] });
		} catch {
			// Silently fail
		}
	};

	const handleNotificationPress = (notification: (typeof notificationList)[0]) => {
		if (!notification.read) {
			handleMarkRead(notification.id);
		}
		// Refresh package data when tapping package-related notifications
		if (notification.type.startsWith("package_")) {
			queryClient.invalidateQueries({ queryKey: ["packageInstances"] });
		}
		switch (notification.type) {
			case "booking":
				if (notification.referenceId) {
					router.push({
						pathname: "/dashboard/bookings/[id]" as never,
						params: { id: notification.referenceId },
					});
				}
				break;
			case "reminder":
				router.push("/dashboard/bookings" as never);
				break;
			case "promotion":
				router.push("/dashboard/explore" as never);
				break;
			case "package_assigned":
			case "package_rejected":
				if (notification.referenceId) {
					router.push({
						pathname: "/dashboard/packages/[id]" as never,
						params: { id: notification.referenceId },
					});
				} else {
					router.push("/dashboard/packages" as never);
				}
				break;
			case "package_pending_review":
				router.push("/dashboard/packages" as never);
				break;
		}
	};

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				<View className="px-4 pt-4">
					{/* Header */}
					<View className="mb-6 flex-row items-center justify-between">
						<View className="flex-row items-center">
							<TouchableOpacity
								onPress={() => router.back()}
								className="mr-4"
							>
								<Ionicons
									name="arrow-back"
									size={24}
									color={colors.primary[1]}
								/>
							</TouchableOpacity>
							<Text className="font-bold text-2xl text-primary-1">
								Notifications
							</Text>
							{unreadCount > 0 && (
								<View className="ml-2 rounded-full bg-primary-1 px-2 py-1">
									<Text className="font-semibold text-primary-2 text-xs">
										{unreadCount}
									</Text>
								</View>
							)}
						</View>
						{unreadCount > 0 && (
							<TouchableOpacity onPress={handleMarkAllRead}>
								<Text className="font-medium text-primary-1 text-sm">
									Mark all read
								</Text>
							</TouchableOpacity>
						)}
					</View>

					{/* Loading State */}
					{isLoading && (
						<>
							<SkeletonNotification />
							<SkeletonNotification />
							<SkeletonNotification />
						</>
					)}

					{/* Notifications List */}
					{!isLoading && notificationList.length === 0 ? (
						<View className="items-center justify-center py-20">
							<Ionicons
								name="notifications-off-outline"
								size={64}
								color={colors.secondary[1]}
							/>
							<Text className="mt-4 font-semibold text-lg text-secondary-1">
								No notifications
							</Text>
						</View>
					) : (
						!isLoading &&
						notificationList.map((notification: any) => (
							<TouchableOpacity
								key={notification.id}
								onPress={() => handleNotificationPress(notification)}
								className={`mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm ${
									!notification.read ? "border-l-4" : ""
								}`}
								style={{
									borderLeftColor: !notification.read
										? colors.primary[1]
										: "transparent",
									borderLeftWidth: !notification.read ? 4 : 0,
									opacity: notification.read ? 0.7 : 1,
								}}
							>
								<View className="flex-row">
									{/* Icon */}
									<View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-secondary-3">
										<Ionicons
											name={notification.icon as never}
											size={24}
											color={notification.color}
										/>
									</View>

									{/* Content */}
									<View className="flex-1">
										<View className="mb-1 flex-row items-start justify-between">
											<Text className="flex-1 font-bold text-base text-primary-1">
												{notification.title}
											</Text>
											{!notification.read && (
												<View className="ml-2 h-2 w-2 rounded-full bg-primary-1" />
											)}
										</View>
										<Text className="mb-2 text-secondary-1 text-sm">
											{notification.message}
										</Text>
										<Text className="text-secondary-1 text-xs">
											{notification.time}
										</Text>
									</View>
								</View>
							</TouchableOpacity>
						))
					)}
				</View>
			</ScrollView>
		</Container>
	);
}
