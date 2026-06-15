import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { useBookingFlow } from "@/contexts/booking-flow-context";
import { colors } from "@/lib/colors";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Done", active: true },
];

// Format ISO datetime string nicely
const formatDateTime = (isoString: string | null): string => {
	if (!isoString) return "Not available";
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

export default function DoneScreen() {
	const params = useLocalSearchParams<{
		bookingId?: string;
		bookingNumber?: string;
	}>();
	const { state, reset } = useBookingFlow();

	const currentStep = 4;
	const totalSteps = 4;
	const progressPercentage = 100;

	const handleBackToHome = () => {
		reset();
		router.replace("/dashboard");
	};

	const handleViewBookings = () => {
		reset();
		router.replace("/dashboard/bookings");
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header with Title */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<Pressable
							onPress={handleBackToHome}
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
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="text-sm" style={{ color: colors.secondary[1] }}>
								Step {currentStep} of {totalSteps}
							</Text>
							<Text className="text-sm" style={{ color: colors.secondary[1] }}>
								{progressPercentage}%
							</Text>
						</View>

						{/* Progress Bar */}
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

						{/* Step Navigation */}
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
														<Ionicons
															name="checkmark"
															size={14}
															color={colors.primary[2]}
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

					{/* Success Section */}
					<View className="mb-4 items-center">
						<View className="mb-4 size-20 items-center justify-center rounded-full bg-primary-1">
							<Ionicons name="checkmark" size={40} color={colors.primary[2]} />
						</View>

						<Text
							className="mb-2 text-center font-bold text-2xl"
							style={{ color: colors.primary[1] }}
						>
							Booking Confirmed!
						</Text>

						<Text
							className="mb-6 text-center text-base"
							style={{ color: colors.secondary[1] }}
						>
							Your workout session has been successfully booked. You'll receive
							a confirmation email shortly.
						</Text>

						{/* Booking Summary Card */}
						<View className="w-full rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Text
								className="mb-4 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								Booking Details
							</Text>

							<View className="mb-3">
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Service
								</Text>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									{state.serviceName ?? "N/A"}
								</Text>
							</View>

							<View className="mb-3">
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Date & Time
								</Text>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									{formatDateTime(state.startTime)}
								</Text>
							</View>

							<View className="mb-3">
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Trainer
								</Text>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									{state.trainerName ?? "Auto-assign"}
								</Text>
							</View>

							{params.bookingNumber ? (
								<View className="mb-3">
									<Text
										className="mb-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Booking Reference
									</Text>
									<Text
										className="font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										{params.bookingNumber}
									</Text>
								</View>
							) : null}
						</View>
					</View>
				</View>
			</ScrollView>

			{/* Action Buttons */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="p-4">
					<Pressable
						onPress={handleBackToHome}
						className="mb-3 items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Back to Home
						</Text>
					</Pressable>

					<Pressable
						onPress={handleViewBookings}
						className="items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-4"
					>
						<Text className="font-semibold text-base text-primary-1">
							View My Bookings
						</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		</Container>
	);
}
