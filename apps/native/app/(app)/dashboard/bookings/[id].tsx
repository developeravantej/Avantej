import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { Container } from "@/components/container";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { client, orpc } from "@/utils/orpc";

// ─── Helpers ──────────────────────────────────────────────────────

const DEFAULT_IMAGE =
	"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=600&fit=crop&q=85";

function formatDate(dateString: string | Date): string {
	const date = new Date(dateString);
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function formatShortDate(dateString: string | Date): string {
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

function getStatusColors(status: string): { bg: string; text: string } {
	switch (status) {
		case "confirmed":
			return { bg: "#DCFCE7", text: "#16A34A" };
		case "completed":
			return { bg: colors.secondary[3], text: colors.secondary[1] };
		case "cancelled":
			return { bg: "#FEE2E2", text: "#B91C1C" };
		case "no_show":
		case "no-show":
			return { bg: "#FEF3C7", text: "#D97706" };
		case "pending":
			return { bg: "#FEF3C7", text: "#D97706" };
		default:
			return { bg: colors.secondary[3], text: colors.secondary[1] };
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
		case "no-show":
			return "No Show";
		case "pending":
			return "Pending";
		default:
			return status.charAt(0).toUpperCase() + status.slice(1);
	}
}

// ─── Sub-Components ──────────────────────────────────────────────

function DetailRow({
	icon,
	label,
	value,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	value: string;
}) {
	return (
		<View
			className="mb-1.5 flex-row items-center rounded-xl border bg-primary-2 px-3.5 py-2.5"
			style={{
				borderColor: colors.secondary[3],
				gap: 12,
			}}
		>
			<View
				className="h-[30px] w-[30px] items-center justify-center rounded-lg"
				style={{ backgroundColor: colors.primary[3] }}
			>
				<Ionicons name={icon} size={14} color={colors.primary[1]} />
			</View>
			<View className="flex-1">
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 10,
						color: colors.secondary[1],
						marginBottom: 1,
					}}
				>
					{label}
				</Text>
				<Text
					style={{
						fontFamily: fonts.heading,
						fontSize: 13,
						color: colors.primary[1],
					}}
				>
					{value}
				</Text>
			</View>
		</View>
	);
}

function SkeletonBox({ className }: { className: string }) {
	return (
		<View className={`animate-pulse rounded-lg bg-secondary-3 ${className}`} />
	);
}

// ─── Main Component ──────────────────────────────────────────────

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
				<View className="flex-1 bg-primary-3">
					{/* Skeleton hero */}
					<SkeletonBox className="h-72 w-full rounded-none" />
					<View className="px-4 pt-4">
						<SkeletonBox className="mb-2 h-3 w-20" />
						<SkeletonBox className="mb-1.5 h-12 w-full rounded-xl" />
						<SkeletonBox className="mb-1.5 h-12 w-full rounded-xl" />
						<SkeletonBox className="mb-1.5 h-12 w-full rounded-xl" />
						<SkeletonBox className="mb-1.5 h-12 w-full rounded-xl" />
					</View>
				</View>
			</Container>
		);
	}

	// Error / not found state
	if (isError || !appointment) {
		return (
			<Container>
				<View className="flex-1 items-center justify-center bg-primary-3 p-6">
					<Text
						style={{
							fontFamily: fonts.heading,
							fontSize: 20,
							color: colors.primary[1],
							marginBottom: 8,
						}}
					>
						Booking not found
					</Text>
					<TouchableOpacity
						onPress={() => router.back()}
						activeOpacity={0.7}
						className="mt-4 rounded-xl px-6 py-3"
						style={{ backgroundColor: colors.primary[1] }}
					>
						<Text
							style={{
								fontFamily: fonts.subheading,
								fontSize: 15,
								color: colors.primary[2],
							}}
						>
							Go Back
						</Text>
					</TouchableOpacity>
				</View>
			</Container>
		);
	}

	const statusColors = getStatusColors(appointment.status);
	const isUpcoming =
		(appointment.status === "confirmed" || appointment.status === "pending") &&
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
	const heroImage = appointment.imageUrl || DEFAULT_IMAGE;

	return (
		<Container>
			<View className="flex-1 bg-primary-3">
				<ScrollView
					className="flex-1"
					showsVerticalScrollIndicator={false}
					bounces={true}
				>
					{/* ── Hero Image Header ── */}
					<View style={{ height: 290, position: "relative" }}>
						<Image
							source={{ uri: heroImage }}
							style={{
								width: "100%",
								height: "100%",
							}}
							resizeMode="cover"
						/>
						{/* Gradient scrim */}
						<LinearGradient
							colors={["transparent", "rgba(0,0,0,0.75)"]}
							locations={[0.3, 1]}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								right: 0,
								bottom: 0,
							}}
						/>

						{/* Back button */}
						<TouchableOpacity
							onPress={() => router.back()}
							activeOpacity={0.7}
							style={{
								position: "absolute",
								top: 54,
								left: 16,
								width: 40,
								height: 40,
								borderRadius: 20,
								backgroundColor: "rgba(0,0,0,0.55)",
								borderWidth: 1,
								borderColor: "rgba(255,255,255,0.25)",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Ionicons name="chevron-back" size={20} color="#fff" />
						</TouchableOpacity>


						{/* Bottom overlay content */}
						<View
							style={{
								position: "absolute",
								bottom: 0,
								left: 0,
								right: 0,
								padding: 16,
							}}
						>
							{/* Status badge */}
							<View style={{ marginBottom: 8 }}>
								<View
									style={{
										backgroundColor: statusColors.bg,
										borderRadius: 999,
										paddingHorizontal: 10,
										paddingVertical: 3,
										alignSelf: "flex-start",
									}}
								>
									<Text
										style={{
											fontFamily: fonts.body,
											fontSize: 10,
											fontWeight: "600",
											color: statusColors.text,
										}}
									>
										{formatStatusLabel(appointment.status)}
									</Text>
								</View>
							</View>

							{/* Title */}
							<Text
								style={{
									fontFamily: fonts.heading,
									fontSize: 26,
									color: "#fff",
									letterSpacing: -0.3,
									lineHeight: 29,
									marginBottom: 6,
								}}
							>
								{title}
							</Text>

							{/* Tags */}
							<View
								className="flex-row flex-wrap"
								style={{ gap: 6 }}
							>
								<View
									style={{
										backgroundColor: "rgba(255,255,255,0.18)",
										borderRadius: 999,
										paddingHorizontal: 10,
										paddingVertical: 4,
									}}
								>
									<Text
										style={{
											fontFamily: fonts.body,
											fontSize: 11,
											color: "rgba(255,255,255,0.9)",
										}}
									>
										{formatShortDate(appointment.startTime)}
									</Text>
								</View>
								<View
									style={{
										backgroundColor: "rgba(255,255,255,0.18)",
										borderRadius: 999,
										paddingHorizontal: 10,
										paddingVertical: 4,
									}}
								>
									<Text
										style={{
											fontFamily: fonts.body,
											fontSize: 11,
											color: "rgba(255,255,255,0.9)",
										}}
									>
										{formatTime(appointment.startTime)}
									</Text>
								</View>
								{appointment.duration && (
									<View
										style={{
											backgroundColor: "rgba(255,255,255,0.18)",
											borderRadius: 999,
											paddingHorizontal: 10,
											paddingVertical: 4,
										}}
									>
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 11,
												color: "rgba(255,255,255,0.9)",
											}}
										>
											{appointment.duration} min
										</Text>
									</View>
								)}
							</View>
						</View>
					</View>

					{/* ── Detail Body ── */}
					<View className="px-4 pb-6">
						{/* Section: Session Details */}
						<Text
							style={{
								fontFamily: fonts.body,
								fontSize: 10,
								fontWeight: "700",
								letterSpacing: 1.4,
								textTransform: "uppercase",
								color: colors.secondary[1],
								marginTop: 16,
								marginBottom: 8,
							}}
						>
							Session details
						</Text>

						<DetailRow
							icon="calendar-outline"
							label="Date"
							value={formatDate(appointment.startTime)}
						/>
						<DetailRow
							icon="time-outline"
							label="Time"
							value={`${formatTime(appointment.startTime)}${appointment.endTime ? ` – ${formatTime(appointment.endTime)}` : ""}`}
						/>
						{(appointment as any).trainerName && (
							<DetailRow
								icon="person-circle-outline"
								label="Trainer"
								value={(appointment as any).trainerName}
							/>
						)}
						{(appointment as any).branchName && (
							<DetailRow
								icon="business-outline"
								label="Branch"
								value={(appointment as any).branchName}
							/>
						)}
						{appointment.location && (
							<DetailRow
								icon="location-outline"
								label="Location"
								value={appointment.location}
							/>
						)}

						{/* Section: Package */}
						{pkgInstance && (
							<>
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 10,
										fontWeight: "700",
										letterSpacing: 1.4,
										textTransform: "uppercase",
										color: colors.secondary[1],
										marginTop: 16,
										marginBottom: 8,
									}}
								>
									Package
								</Text>

								<View
									className="mb-1.5 flex-row items-center rounded-xl border bg-primary-2 px-3.5 py-3"
									style={{
										borderColor: colors.secondary[3],
										gap: 12,
									}}
								>
									<View
										className="h-[30px] w-[30px] items-center justify-center rounded-lg"
										style={{ backgroundColor: colors.primary[3] }}
									>
										<Ionicons
											name="cube-outline"
											size={14}
											color={colors.primary[1]}
										/>
									</View>
									<View className="min-w-0 flex-1">
										<Text
											style={{
												fontFamily: fonts.body,
												fontSize: 10,
												color: colors.secondary[1],
												marginBottom: 1,
											}}
										>
											{svc?.name ?? "Package"}
										</Text>
										<Text
											style={{
												fontFamily: fonts.heading,
												fontSize: 13,
												color: colors.primary[1],
											}}
										>
											{pkgInstance.creditsRemaining ?? 0} of{" "}
											{pkgInstance.creditsTotal ?? 0} credits remaining
										</Text>
									</View>
									{appointment.creditsUsed != null &&
										Number(appointment.creditsUsed) > 0 && (
											<View
												style={{
													backgroundColor: colors.primary[3],
													borderRadius: 999,
													paddingHorizontal: 10,
													paddingVertical: 3,
												}}
											>
												<Text
													style={{
														fontFamily: fonts.body,
														fontSize: 11,
														fontWeight: "600",
														color: colors.primary[1],
													}}
												>
													-{Number(appointment.creditsUsed)} credit
												</Text>
											</View>
										)}
								</View>
							</>
						)}

						{/* Booking Reference */}
						{appointment.bookingNumber && (
							<View
								className="mt-4 items-center rounded-xl border bg-primary-2 py-2.5 px-3.5"
								style={{ borderColor: colors.secondary[3] }}
							>
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 10,
										color: colors.secondary[1],
										letterSpacing: 1,
										textTransform: "uppercase",
										marginBottom: 4,
									}}
								>
									Booking Reference
								</Text>
								<Text
									style={{
										fontFamily: fonts.heading,
										fontSize: 15,
										color: colors.primary[1],
										letterSpacing: 0.5,
									}}
								>
									#{appointment.bookingNumber}
								</Text>
							</View>
						)}

						{/* Cancellation Info */}
						{appointment.status === "cancelled" &&
							appointment.cancellationReason && (
								<View
									className="mt-4 rounded-xl p-4"
									style={{ backgroundColor: "#FEE2E2" }}
								>
									<View className="flex-row items-start">
										<Ionicons
											name="close-circle-outline"
											size={20}
											color="#B91C1C"
											style={{ marginTop: 2 }}
										/>
										<View className="ml-3 flex-1">
											<Text
												style={{
													fontFamily: fonts.subheading,
													fontSize: 14,
													color: "#B91C1C",
													marginBottom: 4,
												}}
											>
												Cancellation Reason
											</Text>
											<Text
												style={{
													fontFamily: fonts.body,
													fontSize: 12,
													color: "#B91C1C",
													lineHeight: 18,
												}}
											>
												{appointment.cancellationReason}
											</Text>
										</View>
									</View>
								</View>
							)}

						{/* Description */}
						{appointment.description && (
							<View className="mt-4">
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 10,
										fontWeight: "700",
										letterSpacing: 1.4,
										textTransform: "uppercase",
										color: colors.secondary[1],
										marginBottom: 8,
									}}
								>
									About
								</Text>
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 14,
										color: colors.primary[1],
										lineHeight: 21,
									}}
								>
									{appointment.description}
								</Text>
							</View>
						)}

						{/* Notes */}
						{appointment.notes && (
							<View className="mt-4">
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 10,
										fontWeight: "700",
										letterSpacing: 1.4,
										textTransform: "uppercase",
										color: colors.secondary[1],
										marginBottom: 8,
									}}
								>
									Notes
								</Text>
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 14,
										color: colors.primary[1],
										lineHeight: 21,
									}}
								>
									{appointment.notes}
								</Text>
							</View>
						)}
					</View>
				</ScrollView>

				{/* Bottom CTA */}
				{isUpcoming && (
					<View
						style={{
							paddingHorizontal: 16,
							paddingVertical: 12,
							borderTopWidth: 1,
							borderTopColor: colors.secondary[3],
							backgroundColor: colors.primary[3],
						}}
					>
						<View className="flex-row" style={{ gap: 10 }}>
							<TouchableOpacity
								onPress={handleCancel}
								disabled={cancelMutation.isPending}
								activeOpacity={0.7}
								style={{
									flex: 1,
									height: 48,
									borderRadius: 12,
									borderWidth: 1.5,
									borderColor: "#B91C1C",
									alignItems: "center",
									justifyContent: "center",
									opacity: cancelMutation.isPending ? 0.5 : 1,
								}}
							>
								<Text
									style={{
										fontFamily: fonts.heading,
										fontSize: 15,
										color: "#B91C1C",
									}}
								>
									Cancel
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								activeOpacity={0.7}
								style={{
									flex: 1,
									height: 48,
									backgroundColor: colors.primary[1],
									borderRadius: 12,
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<Text
									style={{
										fontFamily: fonts.heading,
										fontSize: 15,
										color: colors.primary[2],
									}}
								>
									Reschedule
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				)}
			</View>
		</Container>
	);
}
