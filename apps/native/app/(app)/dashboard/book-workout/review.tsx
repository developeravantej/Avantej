import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { useBookingFlow } from "@/contexts/booking-flow-context";
import { useOrganization } from "@/hooks/useOrganization";
import { authClient } from "@/lib/auth-client";
import { colors } from "@/lib/colors";
import { client } from "@/utils/orpc";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: true },
	{ number: 4, label: "Done", active: false },
];

type ProgressIndicatorProps = {
	currentStep: number;
	totalSteps: number;
	progressPercentage: number;
};

function ProgressIndicator({
	currentStep,
	totalSteps,
	progressPercentage,
}: ProgressIndicatorProps) {
	return (
		<View className="mb-6">
			<View className="mb-2 flex-row items-center justify-between">
				<Text className="text-sm" style={{ color: colors.secondary[1] }}>
					Step {currentStep} of {totalSteps}
				</Text>
				<Text className="text-sm" style={{ color: colors.secondary[1] }}>
					{progressPercentage}%
				</Text>
			</View>

			<View
				className="mb-4 h-1 rounded-full"
				style={{ backgroundColor: colors.secondary[3] }}
			>
				<View
					className="h-full rounded-full"
					style={{
						width: `${progressPercentage}%`,
						backgroundColor: colors.primary[1],
					}}
				/>
			</View>

			<View className="relative" style={{ height: 50 }}>
				<View
					className="absolute h-px"
					style={{
						left: "15%",
						right: "14%",
						top: "27%",
						backgroundColor: colors.secondary[3],
						zIndex: 0,
					}}
				/>
				<View className="absolute inset-0 flex-row items-center justify-between">
					{steps.map((step) => {
						const isCompleted = step.number < currentStep;
						const isActive = step.active;

						return (
							<View
								key={step.number}
								className="items-center justify-center"
								style={{ flex: 1, zIndex: 1 }}
							>
								{isCompleted ? (
									<View className="mb-1 items-center justify-center">
										<View
											className="size-6 items-center justify-center rounded-full"
											style={{
												backgroundColor: colors.primary[1],
												zIndex: 2,
											}}
										>
											<Ionicons
												name="checkmark"
												size={14}
												color={colors.primary[2]}
											/>
										</View>
									</View>
								) : isActive ? (
									<View className="mb-1 items-center justify-center">
										<View
											className="size-6 items-center justify-center rounded-full"
											style={{
												backgroundColor: colors.primary[1],
												zIndex: 2,
											}}
										>
											<View
												className="size-2 rounded-full"
												style={{ backgroundColor: colors.primary[2] }}
											/>
										</View>
									</View>
								) : (
									<View className="mb-1 items-center justify-center">
										<View
											style={{
												backgroundColor: colors.primary[2],
												borderRadius: 10,
												width: 20,
												height: 20,
												alignItems: "center",
												justifyContent: "center",
												zIndex: 2,
											}}
										>
											<Text
												className="text-xs"
												style={{ color: colors.secondary[1] }}
											>
												{step.number}
											</Text>
										</View>
									</View>
								)}
								<Text
									className={`mt-1 text-center text-xs ${
										isActive ? "font-bold" : ""
									}`}
									style={{
										color:
											isActive || isCompleted
												? colors.primary[1]
												: colors.secondary[1],
									}}
								>
									{step.label}
								</Text>
							</View>
						);
					})}
				</View>
			</View>
		</View>
	);
}

// Format ISO datetime string nicely
const formatDateTime = (isoString: string | null): string => {
	if (!isoString) return "Not selected";
	const date = new Date(isoString);
	const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
	const month = date.toLocaleDateString("en-US", { month: "short" });
	const day = date.getDate();
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const period = hours >= 12 ? "PM" : "AM";
	const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
	return `${dayName}, ${month} ${day} at ${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
};

export default function ReviewScreen() {
	const { organizationId } = useOrganization();
	const { state } = useBookingFlow();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;

	const currentStep = 3;
	const totalSteps = 4;
	const progressPercentage = 75;

	const confirmMutation = useMutation({
		mutationFn: () => {
			// Pre-flight: surface obvious missing fields with a clear message
			// instead of letting them hit the server's "Input validation failed".
			const missing: string[] = [];
			if (!state.startTime) missing.push("startTime");
			if (!state.branchId) missing.push("branchId");
			if (!state.duration) missing.push("duration");
			if (!state.packageInstanceId) missing.push("packageInstanceId");
			if (missing.length > 0) {
				throw new Error(
					`Missing booking field(s): ${missing.join(", ")}. Please go back and re-select the package and time.`,
				);
			}

			const payload = {
				organizationId,
				userId,
				type: (state.serviceType === "semi-private" ||
				state.serviceType === "semi_private"
					? "semi-private"
					: "private") as "private" | "semi-private",
				startTime: state.startTime!,
				duration: state.duration ?? 60,
				branchId: state.branchId!,
				serviceId: state.serviceId ?? undefined,
				trainerId: state.trainerId ?? undefined,
				classSlotId: state.classSlotId ?? undefined,
				packageInstanceId: state.packageInstanceId ?? undefined,
				creditsUsed: 1,
				status: "confirmed" as const,
				sessionTotal: 1,
				pricePerClient: 0,
			};
			console.log("appointments.create payload:", JSON.stringify(payload, null, 2));
			return client.appointments.create(payload);
		},
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({
				predicate: (q) =>
					JSON.stringify(q.queryKey).includes("appointments"),
			});
			queryClient.invalidateQueries({
				predicate: (q) =>
					JSON.stringify(q.queryKey).includes("packageInstances"),
			});
			router.push({
				pathname: "./done",
				params: {
					bookingId: data.id,
					bookingNumber: data.bookingNumber ?? "",
				},
			});
		},
		onError: (error: any) => {
			// Deep-print the error so RN console shows code + data + issues, not just message
			console.error(
				"appointments.create failed (serialized):",
				JSON.stringify(
					{
						message: error?.message,
						code: error?.code,
						status: error?.status,
						data: error?.data,
					},
					null,
					2,
				),
			);
			const issues =
				(error?.data?.issues as Array<{ path?: any[]; message?: string }>) ??
				[];
			const detail =
				issues.length > 0
					? issues
							.map((i) => `${i.path?.join(".") ?? "?"}: ${i.message}`)
							.join("\n")
					: error?.message ||
						"Could not create booking. Please try again.";
			Alert.alert("Booking Failed", detail);
		},
	});

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header with Title */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<Pressable
							onPress={() => router.back()}
							className="mr-3 size-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</Pressable>
						<Text className="flex-1 font-bold text-2xl text-primary-1">
							Book Workout
						</Text>
					</View>
				</View>

				{/* Header Image */}
				<View className="relative mx-4 mb-4 h-64 w-full overflow-hidden rounded-2xl">
					<Image
						source={{
							uri: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800",
						}}
						className="h-full w-full"
						contentFit="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Progress Indicator */}
					<ProgressIndicator
						currentStep={currentStep}
						totalSteps={totalSteps}
						progressPercentage={progressPercentage}
					/>

					{/* Review Section */}
					<View className="mb-4">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							REVIEW YOUR BOOKING
						</Text>

						{/* Booking Summary Cards */}
						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<Ionicons
									name="fitness-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Service
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{state.serviceName ?? "Not selected"}
							</Text>
						</View>

						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<Ionicons
									name="person-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Trainer
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{state.trainerName ?? "Auto-assign"}
							</Text>
						</View>

						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<Ionicons
									name="calendar-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Date & Time
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								{formatDateTime(state.startTime)}
							</Text>
						</View>

						{/* Credits Card */}
						<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-center">
								<Ionicons
									name="ticket-outline"
									size={20}
									color={colors.secondary[1]}
								/>
								<Text
									className="ml-2 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Credits
								</Text>
							</View>
							<Text
								className="font-semibold text-base"
								style={{ color: colors.primary[1] }}
							>
								1 credit will be deducted
							</Text>
							{state.packageName && (
								<Text
									className="mt-1 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Package: {state.packageName}
								</Text>
							)}
						</View>
					</View>
				</View>
			</ScrollView>

			{/* Confirm Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="p-4">
					<Pressable
						onPress={() => confirmMutation.mutate()}
						disabled={confirmMutation.isPending || !userId}
						className="items-center justify-center rounded-xl bg-primary-1 py-4"
						style={{
							opacity: confirmMutation.isPending || !userId ? 0.6 : 1,
						}}
					>
						{confirmMutation.isPending ? (
							<ActivityIndicator size="small" color={colors.primary[2]} />
						) : (
							<Text className="font-semibold text-base text-primary-2">
								Confirm Booking
							</Text>
						)}
					</Pressable>
				</View>
			</SafeAreaView>
		</Container>
	);
}
