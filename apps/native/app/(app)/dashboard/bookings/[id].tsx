import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { client, orpc } from "@/utils/orpc";

function formatDate(dateString: string | Date): string {
	const date = new Date(dateString);
	return date.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function formatTime(dateString: string | Date): string {
	const date = new Date(dateString);
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

function getStatusColors(status: string): {
	bg: string;
	text: string;
} {
	switch (status) {
		case "confirmed":
			return { bg: "#DCFCE7", text: "#16A34A" };
		case "completed":
			return { bg: "#E0E7FF", text: "#4F46E5" };
		case "cancelled":
			return { bg: "#FEE2E2", text: "#EF4444" };
		case "no_show":
			return { bg: "#FEF3C7", text: "#D97706" };
		default:
			return { bg: "#F3F4F6", text: "#6B7280" };
	}
}

function formatStatusLabel(status: string): string {
	switch (status) {
		case "confirmed":
			return "Confirmed";
		case "completed":
			return "Completed";
		case "cancelled":
			return "Cancelled";
		case "no_show":
			return "No Show";
		default:
			return status.charAt(0).toUpperCase() + status.slice(1);
	}
}

export default function BookingDetailScreen() {
	const navigation = useNavigation();
	const hideTabBarRef = useRef(false);
	const params = useLocalSearchParams<{ id: string }>();
	const appointmentId = params.id ?? "";
	const { organizationId } = useOrganization();
	const queryClient = useQueryClient();

	const {
		data: appointment,
		isLoading,
		isError,
	} = useQuery(
		orpc.appointments.getById.queryOptions({
			input: { organizationId, id: appointmentId },
		}),
	);

	const cancelMutation = useMutation({
		mutationFn: () =>
			client.appointments.update({
				organizationId,
				id: appointmentId,
				status: "cancelled",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				predicate: (q) =>
					JSON.stringify(q.queryKey).includes("appointments"),
			});
			router.back();
		},
	});

	const handleCancel = () => {
		Alert.alert(
			"Cancel Booking",
			"Are you sure you want to cancel this booking?",
			[
				{ text: "No", style: "cancel" },
				{
					text: "Yes, Cancel",
					style: "destructive",
					onPress: () => cancelMutation.mutate(),
				},
			],
		);
	};

	// Helper function to find Tabs navigator
	const findTabsNavigator = useCallback((nav: unknown, depth = 0): unknown => {
		if (depth > 5) return null;
		const parent = (nav as { getParent?: () => unknown })?.getParent?.();
		if (!parent) return null;
		try {
			const state = (
				parent as {
					getState?: () => {
						type?: string;
						routes?: Array<{ name?: string }>;
					};
				}
			)?.getState?.();
			if (
				state?.type === "tab" ||
				state?.routes?.some(
					(r) =>
						r.name === "index" ||
						r.name === "explore" ||
						r.name === "bookings" ||
						r.name === "profile",
				)
			) {
				return parent;
			}
		} catch {
			// Continue searching
		}
		return findTabsNavigator(parent, depth + 1);
	}, []);

	const hideTabBar = useCallback(() => {
		const tabsNavigator = findTabsNavigator(navigation);
		if (tabsNavigator) {
			hideTabBarRef.current = true;
			(
				tabsNavigator as {
					setOptions?: (options: { tabBarStyle: { display: string } }) => void;
				}
			)?.setOptions?.({
				tabBarStyle: { display: "none" },
			});
		}
	}, [navigation, findTabsNavigator]);

	const showTabBar = useCallback(() => {
		const tabsNavigator = findTabsNavigator(navigation);
		if (tabsNavigator && hideTabBarRef.current) {
			hideTabBarRef.current = false;
			(
				tabsNavigator as {
					setOptions?: (options: {
						tabBarStyle: {
							backgroundColor: string;
							borderTopColor: string;
							borderTopWidth: number;
							height: number;
							paddingBottom: number;
							paddingTop: number;
						};
					}) => void;
				}
			)?.setOptions?.({
				tabBarStyle: {
					backgroundColor: colors.primary[2],
					borderTopColor: colors.secondary[3],
					borderTopWidth: 1,
					height: 80,
					paddingBottom: 8,
					paddingTop: 8,
				},
			});
		}
	}, [navigation, findTabsNavigator]);

	// Hide tab bar when screen is focused
	useFocusEffect(
		useCallback(() => {
			hideTabBar();
			const timer = setTimeout(() => {
				hideTabBar();
			}, 50);
			return () => {
				clearTimeout(timer);
				showTabBar();
			};
		}, [hideTabBar, showTabBar]),
	);

	// Also hide on mount
	useEffect(() => {
		hideTabBar();
		const timer = setTimeout(() => {
			hideTabBar();
		}, 100);
		return () => {
			clearTimeout(timer);
			showTabBar();
		};
	}, [hideTabBar, showTabBar]);

	// Loading state
	if (isLoading) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color={colors.primary[1]} />
				</View>
			</Container>
		);
	}

	// Error / not found state
	if (isError || !appointment) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center p-6">
					<Text
						className="mb-2 font-bold text-xl"
						style={{ color: colors.primary[1] }}
					>
						Booking not found
					</Text>
					<TouchableOpacity
						onPress={() => router.back()}
						className="mt-4 rounded-xl px-6 py-3"
						style={{ backgroundColor: "#2563EB" }}
					>
						<Text className="font-semibold text-white">Go Back</Text>
					</TouchableOpacity>
				</View>
			</Container>
		);
	}

	const statusColors = getStatusColors(appointment.status);
	const isUpcoming =
		appointment.status === "confirmed" &&
		new Date(appointment.startTime) > new Date();
	const title =
		appointment.bookingNumber || appointment.type || "Appointment";
	const durationText = appointment.duration
		? `${appointment.duration} minutes`
		: null;
	const price =
		appointment.sessionTotal != null
			? `$${Number(appointment.sessionTotal).toFixed(2)}`
			: appointment.pricePerClient != null
				? `$${Number(appointment.pricePerClient).toFixed(2)}`
				: null;

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header with Back Button */}
				<View className="px-4 pt-4 pb-2">
					<TouchableOpacity
						onPress={() => router.back()}
						className="mb-4 flex-row items-center"
					>
						<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
					</TouchableOpacity>
				</View>

				{/* Booking Image */}
				{appointment.imageUrl && (
					<View className="mb-4 px-4">
						<Image
							source={{ uri: appointment.imageUrl }}
							className="h-64 w-full rounded-2xl"
							resizeMode="cover"
						/>
					</View>
				)}

				<View className="px-4 pb-6">
					{/* Booking Title and Status */}
					<View className="mb-4 flex-row items-start justify-between">
						<View className="mr-4 flex-1">
							<Text
								className="mb-2 font-bold text-2xl"
								style={{ color: colors.primary[1] }}
							>
								{title}
							</Text>
							{appointment.bookingNumber && (
								<Text
									className="mb-1 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Booking ID: {appointment.bookingNumber}
								</Text>
							)}
						</View>
						<View
							className="rounded-full px-3 py-1"
							style={{ backgroundColor: statusColors.bg }}
						>
							<Text
								className="font-semibold text-xs"
								style={{ color: statusColors.text }}
							>
								{formatStatusLabel(appointment.status)}
							</Text>
						</View>
					</View>

					{/* Booking Info Cards */}
					<View className="mb-4 flex-row">
						<View className="mr-2 flex-1 rounded-xl bg-white p-3">
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="calendar-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Date
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{formatDate(appointment.startTime)}
							</Text>
						</View>
						<View className="ml-2 flex-1 rounded-xl bg-white p-3">
							<View className="mb-1 flex-row items-center">
								<Ionicons
									name="time-outline"
									size={16}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Time
								</Text>
							</View>
							<Text
								className="font-semibold text-sm"
								style={{ color: colors.primary[1] }}
							>
								{formatTime(appointment.startTime)}
								{appointment.endTime
									? ` - ${formatTime(appointment.endTime)}`
									: ""}
							</Text>
						</View>
					</View>

					<View className="mb-4 flex-row">
						{durationText && (
							<View className="mr-2 flex-1 rounded-xl bg-white p-3">
								<View className="mb-1 flex-row items-center">
									<Ionicons
										name="hourglass-outline"
										size={16}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Duration
									</Text>
								</View>
								<Text
									className="font-semibold text-sm"
									style={{ color: colors.primary[1] }}
								>
									{durationText}
								</Text>
							</View>
						)}
						{price && (
							<View
								className={`flex-1 rounded-xl bg-white p-3 ${durationText ? "ml-2" : "mr-2"}`}
							>
								<View className="mb-1 flex-row items-center">
									<Ionicons
										name="cash-outline"
										size={16}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Price
									</Text>
								</View>
								<Text
									className="font-semibold text-sm"
									style={{ color: colors.primary[1] }}
								>
									{price}
								</Text>
							</View>
						)}
					</View>

					{/* Credits Used */}
					{appointment.creditsUsed != null &&
						Number(appointment.creditsUsed) > 0 && (
							<View className="mb-4 flex-row">
								<View className="mr-2 flex-1 rounded-xl bg-white p-3">
									<View className="mb-1 flex-row items-center">
										<Ionicons
											name="star-outline"
											size={16}
											color={colors.secondary[1]}
										/>
										<Text
											className="ml-1 text-xs"
											style={{ color: colors.secondary[1] }}
										>
											Credits Used
										</Text>
									</View>
									<Text
										className="font-semibold text-sm"
										style={{ color: colors.primary[1] }}
									>
										{Number(appointment.creditsUsed)}
									</Text>
								</View>
								<View className="ml-2 flex-1" />
							</View>
						)}

					{/* Location Card */}
					{appointment.location && (
						<View className="mb-4 rounded-xl bg-white p-4">
							<View className="flex-row items-center">
								<Ionicons
									name="location-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 flex-1 text-sm"
									style={{ color: colors.primary[1] }}
								>
									{appointment.location}
								</Text>
							</View>
						</View>
					)}

					{/* Cancellation Info */}
					{appointment.status === "cancelled" &&
						appointment.cancellationReason && (
							<View
								className="mb-4 rounded-xl p-4"
								style={{ backgroundColor: "#FEE2E2" }}
							>
								<View className="flex-row items-start">
									<Ionicons
										name="close-circle-outline"
										size={20}
										color="#EF4444"
										style={{ marginTop: 2 }}
									/>
									<View className="ml-3 flex-1">
										<Text
											className="mb-1 font-semibold text-sm"
											style={{ color: "#EF4444" }}
										>
											Cancellation Reason
										</Text>
										<Text
											className="text-xs leading-5"
											style={{ color: "#EF4444" }}
										>
											{appointment.cancellationReason}
										</Text>
									</View>
								</View>
							</View>
						)}

					{/* Description */}
					{appointment.description && (
						<View className="mb-4">
							<Text
								className="mb-2 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.secondary[1] }}
							>
								ABOUT
							</Text>
							<Text
								className="text-base leading-6"
								style={{ color: colors.primary[1] }}
							>
								{appointment.description}
							</Text>
						</View>
					)}

					{/* Notes */}
					{appointment.notes && (
						<View className="mb-4">
							<Text
								className="mb-2 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.secondary[1] }}
							>
								NOTES
							</Text>
							<Text
								className="text-base leading-6"
								style={{ color: colors.primary[1] }}
							>
								{appointment.notes}
							</Text>
						</View>
					)}
				</View>
			</ScrollView>

			{/* Action Buttons - Only show for confirmed future bookings */}
			{isUpcoming && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-gray-200 border-t bg-white"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={handleCancel}
							disabled={cancelMutation.isPending}
							className="items-center justify-center rounded-xl bg-white py-4"
							style={{
								borderWidth: 1,
								borderColor: "#EF4444",
								opacity: cancelMutation.isPending ? 0.5 : 1,
							}}
						>
							{cancelMutation.isPending ? (
								<ActivityIndicator size="small" color="#EF4444" />
							) : (
								<Text
									className="font-semibold text-base"
									style={{ color: "#EF4444" }}
								>
									Cancel Booking
								</Text>
							)}
						</TouchableOpacity>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
