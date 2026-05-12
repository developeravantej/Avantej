import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Container } from "@/components/container";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Review", active: false },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: true },
];

export default function DoneScreen() {
	const { state, reset } = usePurchaseFlow();

	const subtotal = state.price ?? 0;
	// Use same calculation approach as pay screen
	const total = subtotal * 1.1; // Approximate with tax

	const handleGoHome = () => {
		reset();
		router.replace("/dashboard" as never);
	};

	const handleViewPackages = () => {
		reset();
		router.replace("/dashboard/packages" as never);
	};

	const handleStartBooking = () => {
		reset();
		router.replace("/dashboard/book-workout/book-workout" as never);
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<TouchableOpacity
							onPress={handleGoHome}
							className="mr-3 size-10 items-center justify-center"
						>
							<Ionicons
								name="arrow-back"
								size={24}
								color={colors.primary[1]}
							/>
						</TouchableOpacity>
						<Text className="flex-1 font-bold text-2xl text-black">
							Purchase Complete
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
						resizeMode="cover"
					/>
				</View>

				<View className="px-4 pb-6">
					{/* Progress Indicator - all steps completed */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="font-semibold text-primary-1 text-sm">
								Step 7 of 7
							</Text>
							<Text className="font-semibold text-primary-1 text-sm">
								100%
							</Text>
						</View>

						<View
							className="mb-4 h-2 overflow-hidden rounded-full"
							style={{ backgroundColor: colors.secondary[2] }}
						>
							<View
								className="h-full rounded-full"
								style={{
									width: "100%",
									backgroundColor: colors.primary[1],
								}}
							/>
						</View>

						{/* Step Navigation - all completed */}
						<View className="relative" style={{ height: 50 }}>
							<View
								className="absolute rounded-full"
								style={{
									left: "10%",
									right: "10%",
									top: "24%",
									height: 2,
									backgroundColor: colors.secondary[2],
									zIndex: 0,
								}}
							/>
							<View className="absolute inset-0 flex-row items-center justify-between">
								{steps.map((step) => (
									<View
										key={step.number}
										className="items-center justify-center"
										style={{ flex: 1, zIndex: 1 }}
									>
										<View className="mb-1 items-center justify-center">
											<View
												className="size-6 items-center justify-center rounded-full border-2 border-primary-1"
												style={{
													backgroundColor: colors.primary[1],
													zIndex: 2,
												}}
											>
												<Ionicons
													name="checkmark"
													size={12}
													color={colors.primary[2]}
												/>
											</View>
										</View>
										<Text className="mt-1 text-center font-bold text-primary-1 text-xs">
											{step.label}
										</Text>
									</View>
								))}
							</View>
						</View>
					</View>

					{/* Success Section */}
					<View className="mb-4 items-center">
						<View
							className="mb-4 size-20 items-center justify-center rounded-full"
							style={{ backgroundColor: "#10B981" }}
						>
							<Ionicons
								name="checkmark"
								size={40}
								color={colors.primary[2]}
							/>
						</View>

						<Text
							className="mb-2 text-center font-bold text-2xl"
							style={{ color: colors.primary[1] }}
						>
							{state.packageInstanceStatus === "pending"
								? "Package Submitted!"
								: "Package Purchased!"}
						</Text>

						<Text
							className="mb-6 text-center text-base"
							style={{ color: colors.secondary[1] }}
						>
							{state.packageInstanceStatus === "pending"
								? "Your package is being reviewed. You'll be notified once a trainer is assigned and you can start booking sessions."
								: "Your package has been successfully purchased. You'll receive a confirmation email shortly."}
						</Text>

						{/* Package Summary Card */}
						<View className="w-full rounded-2xl border border-secondary-3 bg-primary-2 p-5 shadow-sm">
							<Text
								className="mb-4 font-bold text-sm uppercase tracking-wide"
								style={{ color: colors.primary[1] }}
							>
								Package Details
							</Text>

							<View className="mb-3">
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Package
								</Text>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									{state.packageName ?? "Package"}
								</Text>
								{state.creditsTotal && (
									<Text
										className="mt-1 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{state.creditsTotal} credits included
									</Text>
								)}
							</View>

							{state.serviceName && (
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
										{state.serviceName}
									</Text>
								</View>
							)}

							{state.serviceType === "private" &&
								state.preferredTimes.length > 0 && (
									<View className="mb-3">
										<Text
											className="mb-1 text-xs"
											style={{ color: colors.secondary[1] }}
										>
											Preferred Times
										</Text>
										{state.preferredTimes.map((pt) => (
											<Text
												key={`${pt.day}-${pt.time}`}
												className="mb-1 font-semibold text-base"
												style={{ color: colors.primary[1] }}
											>
												{pt.day} at {pt.time}
											</Text>
										))}
									</View>
								)}

							{state.validityDays && (
								<View className="mb-3">
									<Text
										className="mb-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Validity
									</Text>
									<Text
										className="font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										{state.validityDays} days from purchase
									</Text>
								</View>
							)}

							{state.remark && (
								<View className="mb-3">
									<Text
										className="mb-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Remark
									</Text>
									<Text
										className="text-base"
										style={{ color: colors.primary[1] }}
									>
										{state.remark}
									</Text>
								</View>
							)}

							<View className="border-secondary-3 border-t pt-3">
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									Total Paid
								</Text>
								<Text
									className="font-bold text-lg"
									style={{ color: colors.primary[1] }}
								>
									{formatMoney(total)}
								</Text>
							</View>
						</View>
					</View>

					{/* Action Buttons (inline; scroll with content) */}
					<View className="mt-6 w-full">
						<TouchableOpacity
							onPress={handleViewPackages}
							className="mb-3 items-center justify-center rounded-xl bg-primary-1 py-4"
						>
							<Text className="font-semibold text-base text-primary-2">
								View My Packages
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={handleStartBooking}
							className="mb-3 items-center justify-center rounded-xl border border-primary-1 bg-primary-2 py-4"
						>
							<Text className="font-semibold text-base text-primary-1">
								Start Booking
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={handleGoHome}
							className="items-center justify-center rounded-xl border border-secondary-3 bg-primary-2 py-4"
						>
							<Text className="font-semibold text-base text-primary-1">
								Back to Home
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</ScrollView>
		</Container>
	);
}
