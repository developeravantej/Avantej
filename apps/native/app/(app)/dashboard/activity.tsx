import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 15;

function formatDate(dateStr: string | Date): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
		case "purchased":
			return "Purchased";
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
		case "purchased":
			return "bag-check";
		default:
			return "ellipse";
	}
}

function getActivityColor(status?: string): string {
	switch (status) {
		case "completed":
		case "confirmed":
			return "#16A34A";
		case "purchased":
			return "#2563EB";
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
		case "purchased":
			return "#DBEAFE";
		case "no-show":
		case "pending":
			return "#FEF3C7";
		case "cancelled":
			return "#FEE2E2";
		default:
			return colors.secondary[3];
	}
}

type Activity = {
	id: string;
	name: string;
	date: string;
	sortDate: number;
	credits: number;
	icon: string;
	status: string | undefined;
};

export default function ActivityScreen() {
	const { organizationId } = useOrganization();
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

	const {
		data: recentAppointments,
		isPending: appointmentsLoading,
	} = useQuery({
		...orpc.appointments.listForUser.queryOptions({
			input: {
				organizationId,
				limit: 100,
			},
		}),
		enabled: !!organizationId,
	});

	const { data: recentPackages, isPending: packagesLoading } = useQuery({
		...orpc.packageInstances.listForClient.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	const isLoading = appointmentsLoading || packagesLoading;

	const allActivities: Activity[] = useMemo(() => {
		const appointments = (recentAppointments ?? []).map((apt: any) => ({
			id: apt.id,
			name: apt.serviceName ?? "Session",
			date: getRelativeDate(apt.createdAt ?? apt.startTime),
			sortDate: new Date(apt.createdAt ?? apt.startTime).getTime(),
			credits: apt.creditsUsed ? -apt.creditsUsed : 0,
			icon: getActivityIcon(apt.status),
			status: apt.status as string | undefined,
		}));

		const purchases = (recentPackages ?? []).map((pkg: any) => ({
			id: `pkg-${pkg.id}`,
			name: pkg.package?.name ?? "Package",
			date: getRelativeDate(pkg.createdAt),
			sortDate: new Date(pkg.createdAt).getTime(),
			credits: pkg.creditsTotal ?? 0,
			icon: getActivityIcon("purchased"),
			status: "purchased" as string | undefined,
		}));

		return [...appointments, ...purchases].sort(
			(a, b) => b.sortDate - a.sortDate,
		);
	}, [recentAppointments, recentPackages]);

	const visibleActivities = allActivities.slice(0, visibleCount);
	const hasMore = visibleCount < allActivities.length;

	const handleLoadMore = () => {
		if (hasMore) {
			setVisibleCount((prev) => prev + PAGE_SIZE);
		}
	};

	const renderItem = ({ item, index }: { item: Activity; index: number }) => (
		<View
			className="flex-row items-center px-4 py-3.5"
			style={
				index < visibleActivities.length - 1
					? {
							borderBottomWidth: 1,
							borderBottomColor: colors.secondary[3],
						}
					: undefined
			}
		>
			<View
				className="mr-3 h-9 w-9 items-center justify-center rounded-full"
				style={{ backgroundColor: getActivityBg(item.status) }}
			>
				<Ionicons
					name={item.icon as never}
					size={16}
					color={getActivityColor(item.status)}
				/>
			</View>
			<View className="flex-1">
				<Text
					style={{
						fontFamily: fonts.subheading,
						fontSize: 14,
						color: colors.primary[1],
						marginBottom: 2,
					}}
				>
					{item.name}
				</Text>
				<View className="flex-row items-center">
					<Text
						style={{
							fontSize: 11,
							fontFamily: fonts.body,
							color: getActivityColor(item.status),
						}}
					>
						{getStatusLabel(item.status)}
					</Text>
					<Text
						style={{
							fontSize: 11,
							fontFamily: fonts.body,
							color: colors.secondary[1],
							marginHorizontal: 4,
						}}
					>
						·
					</Text>
					<Text
						style={{
							fontSize: 11,
							fontFamily: fonts.body,
							color: colors.secondary[1],
						}}
					>
						{item.date}
					</Text>
				</View>
			</View>
			{item.credits !== 0 && (
				<View className="items-end">
					<Text
						style={{
							fontFamily: fonts.subheading,
							fontSize: 13,
							color: colors.primary[1],
						}}
					>
						{item.credits > 0 ? "+" : ""}
						{item.credits} credit
						{Math.abs(item.credits) !== 1 ? "s" : ""}
					</Text>
				</View>
			)}
		</View>
	);

	const renderFooter = () => {
		if (!hasMore) return null;
		return (
			<View className="items-center py-4">
				<ActivityIndicator size="small" color={colors.primary[1]} />
			</View>
		);
	};

	const renderEmpty = () => {
		if (isLoading) return null;
		return (
			<View className="items-center px-5 py-12">
				<View
					className="mb-3 h-12 w-12 items-center justify-center rounded-full"
					style={{ backgroundColor: colors.primary[3] }}
				>
					<Ionicons
						name="time-outline"
						size={24}
						color={colors.secondary[1]}
					/>
				</View>
				<Text
					className="mb-1"
					style={{
						fontFamily: fonts.subheading,
						fontSize: 16,
						color: colors.primary[1],
					}}
				>
					No activity yet
				</Text>
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 13,
						color: colors.secondary[1],
					}}
				>
					Your sessions and purchases will appear here
				</Text>
			</View>
		);
	};

	return (
		<Container>
			{/* Header */}
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					paddingHorizontal: 16,
					paddingTop: 8,
					paddingBottom: 12,
					borderBottomWidth: 1,
					borderBottomColor: colors.secondary[3],
					backgroundColor: colors.primary[2],
				}}
			>
				<TouchableOpacity
					onPress={() => router.back()}
					style={{
						width: 40,
						height: 40,
						alignItems: "center",
						justifyContent: "center",
						marginRight: 8,
					}}
				>
					<Ionicons
						name="arrow-back"
						size={24}
						color={colors.primary[1]}
					/>
				</TouchableOpacity>
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 22,
						color: colors.primary[1],
					}}
				>
					Recent Activity
				</Text>
			</View>

			{isLoading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color={colors.primary[1]} />
				</View>
			) : (
				<FlatList
					data={visibleActivities}
					keyExtractor={(item) => item.id}
					renderItem={renderItem}
					ListEmptyComponent={renderEmpty}
					ListFooterComponent={renderFooter}
					onEndReached={handleLoadMore}
					onEndReachedThreshold={0.3}
					className="flex-1 bg-secondary-3"
					contentContainerStyle={
						visibleActivities.length > 0
							? {
									marginHorizontal: 16,
									marginTop: 12,
									backgroundColor: colors.primary[2],
									borderWidth: 1,
									borderColor: colors.secondary[3],
									borderRadius: 16,
									overflow: "hidden",
								}
							: undefined
					}
					showsVerticalScrollIndicator={false}
				/>
			)}
		</Container>
	);
}
