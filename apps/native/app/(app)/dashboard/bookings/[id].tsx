import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useHideTabBar } from "@/hooks/useHideTabBar";
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
	useHideTabBar();
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

	const serviceId = (appointment as any)?.serviceId ?? null;
	const packageInstanceId = (appointment as any)?.packageInstanceId ?? null;

	const { data: service } = useQuery({
		...orpc.services.getById.queryOptions({
			input: { organizationId, id: serviceId! },
		}),
		enabled: !!serviceId && !!organizationId,
	});

	const { data: pkg } = useQuery({
		...orpc.packageInstances.getById.queryOptions({
			input: { organizationId, id: packageInstanceId! },
		}),
		enabled: !!packageInstanceId && !!organizationId,
	});

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
	const svc = service as any;
	const pkgInstance = pkg as any;
	const title =
		svc?.name ||
		(appointment.type === "semi-private"
			? "Semi-Private Session"
			: appointment.type === "private"
				? "Private Session"
				: "Appointment");
	const durationText = appointment.duration
		? `${appointment.duration} minutes`
		: null;
	const typeLabel =
		appointment.type === "semi-private" ? "Semi-Private" : "Private";

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

					{/* WHEN */}
					<Text
						className="mb-2 font-bold text-xs uppercase tracking-wider"
						style={{ color: colors.secondary[1] }}
					>
						When
					</Text>
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

					{durationText && (
						<View className="mb-4 rounded-xl bg-white p-3">
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

					{/* SERVICE */}
					{(svc?.name || appointment.type) && (
						<>
							<Text
								className="mb-2 mt-2 font-bold text-xs uppercase tracking-wider"
								style={{ color: colors.secondary[1] }}
							>
								Service
							</Text>
							<View className="mb-4 rounded-xl bg-white p-4">
								<Text
									className="mb-1 font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									{svc?.name ?? title}
								</Text>
								<View className="flex-row flex-wrap items-center gap-2">
									<View
										className="rounded-full px-2 py-1"
										style={{ backgroundColor: colors.secondary[3] }}
									>
										<Text
											className="font-medium text-xs"
											style={{ color: colors.primary[1] }}
										>
											{typeLabel}
										</Text>
									</View>
									{svc?.schedulingType === "class_slot" && (
										<View
											className="rounded-full px-2 py-1"
											style={{ backgroundColor: colors.secondary[3] }}
										>
											<Text
												className="font-medium text-xs"
												style={{ color: colors.primary[1] }}
											>
												Class slot
											</Text>
										</View>
									)}
								</View>
								{svc?.description && (
									<Text
										className="mt-2 text-sm leading-5"
										style={{ color: colors.secondary[1] }}
									>
										{svc.description}
									</Text>
								)}
							</View>
						</>
					)}

					{/* PACKAGE */}
					{pkgInstance && (
						<>
							<Text
								className="mb-2 mt-2 font-bold text-xs uppercase tracking-wider"
								style={{ color: colors.secondary[1] }}
							>
								Package
							</Text>
							<View className="mb-4 rounded-xl bg-white p-4">
								<View className="mb-2 flex-row items-center">
									<Ionicons
										name="cube-outline"
										size={16}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-1 flex-1 font-semibold text-sm"
										style={{ color: colors.primary[1] }}
									>
										{svc?.name ?? "Package"}
									</Text>
								</View>
								<View className="flex-row items-center justify-between">
									<View className="flex-row items-center">
										<Ionicons
											name="star-outline"
											size={14}
											color={colors.secondary[1]}
										/>
										<Text
											className="ml-1 text-xs"
											style={{ color: colors.secondary[1] }}
										>
											{pkgInstance.creditsRemaining ?? 0} of{" "}
											{pkgInstance.creditsTotal ?? 0} credits remaining
										</Text>
									</View>
									{appointment.creditsUsed != null &&
										Number(appointment.creditsUsed) > 0 && (
											<Text
												className="text-xs"
												style={{ color: colors.primary[1] }}
											>
												{Number(appointment.creditsUsed)} used
											</Text>
										)}
								</View>
								{pkgInstance.expiresAt && (
									<Text
										className="mt-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Expires{" "}
										{new Date(pkgInstance.expiresAt).toLocaleDateString(
											"en-US",
											{
												month: "short",
												day: "numeric",
												year: "numeric",
											},
										)}
									</Text>
								)}
							</View>
						</>
					)}

					{/* LOCATION */}
					{appointment.location && (
						<>
							<Text
								className="mb-2 mt-2 font-bold text-xs uppercase tracking-wider"
								style={{ color: colors.secondary[1] }}
							>
								Location
							</Text>
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
						</>
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
