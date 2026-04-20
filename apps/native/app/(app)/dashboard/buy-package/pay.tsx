import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { useOrganization } from "@/hooks/useOrganization";
import { authClient } from "@/lib/auth-client";
import { colors } from "@/lib/colors";
import { client, orpc } from "@/utils/orpc";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Plan", active: false },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: true },
	{ number: 7, label: "Done", active: false },
];

export default function PayScreen() {
	const { organizationId } = useOrganization();
	const { state, update } = usePurchaseFlow();
	const queryClient = useQueryClient();

	const currentStep = 7;
	const totalSteps = 8;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const [isProcessing, setIsProcessing] = useState(false);
	const { data: session } = authClient.useSession();

	// Fetch default tax rate
	const { data: taxRate } = useQuery({
		...orpc.taxRates.getDefault.queryOptions({
			input: { organizationId },
		}),
	});

	const subtotal = state.price ?? 0;
	// Tax rate is in basis points (e.g., 1000 = 10%)
	const taxRatePercent = taxRate ? (taxRate as any).rateInBasisPoints / 100 : 0;
	const taxAmount = subtotal * (taxRatePercent / 100);
	const total = subtotal + taxAmount;

	const handlePayment = async () => {
		if (!state.packageId) return;

		setIsProcessing(true);

		try {
			// Create package instance
			const now = new Date();
			const validityMs = (state.validityDays ?? 365) * 24 * 60 * 60 * 1000;
			const expiresAt = new Date(now.getTime() + validityMs).toISOString();

			const instance = await client.packageInstances.create({
				organizationId,
				serviceId: state.packageId!,
				clientId: session?.user?.id ?? "",
				source: "purchased",
				totalPrice: total,
				taxAmount,
				paymentStatus: "pending",
				paymentMethod: "pending",
				eSignature: state.signature,
				termsAgreedAt: state.termsAgreedAt,
				creditsTotal: state.creditsTotal ?? 0,
				creditsUsed: 0,
				startsAt: now.toISOString(),
				expiresAt,
				status: "active",
				remark: state.remark,
				paymentPlanType: state.paymentPlanType ?? "full",
				installmentIntervalDays: state.installmentIntervalDays ?? 30,
			});

			// Save preferred times if any
			if (state.preferredTimes.length > 0 && instance?.id) {
				try {
					type DayOfWeek =
						| "monday"
						| "tuesday"
						| "wednesday"
						| "thursday"
						| "friday"
						| "saturday"
						| "sunday";

					await client.preferredTimes.upsert({
						organizationId,
						packageInstanceId: instance.id,
						items: state.preferredTimes.map((pt, index) => ({
							dayOfWeek: pt.day.toLowerCase() as DayOfWeek,
							time: pt.time,
							priority: index + 1,
						})),
					});
				} catch {
					// Preferred times saving is non-critical
				}
			}

			// Invalidate queries to refresh data
			queryClient.invalidateQueries({
				queryKey: ["packageInstances"],
			});

			update({
				paymentMethod: "pending",
				packageInstanceId: instance?.id ?? null,
			});

			router.push("./done");
		} catch (error: any) {
			Alert.alert(
				"Purchase Failed",
				error?.message ?? "Something went wrong. Please try again.",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<TouchableOpacity
							onPress={() => router.back()}
							className="mr-3 h-10 w-10 items-center justify-center"
						>
							<Ionicons
								name="arrow-back"
								size={24}
								color={colors.primary[1]}
							/>
						</TouchableOpacity>
						<Text className="flex-1 font-bold text-2xl text-black">
							Payment
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
					{/* Progress Indicator */}
					<View className="mb-6">
						<View className="mb-2 flex-row items-center justify-between">
							<Text className="font-semibold text-primary-1 text-sm">
								Step {currentStep} of {totalSteps}
							</Text>
							<Text className="font-semibold text-primary-1 text-sm">
								{progressPercentage}%
							</Text>
						</View>

						<View
							className="mb-4 h-2 overflow-hidden rounded-full"
							style={{ backgroundColor: colors.secondary[2] }}
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
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-primary-1"
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
											) : isActive ? (
												<View className="mb-1 items-center justify-center">
													<View
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-primary-1"
														style={{
															backgroundColor: colors.primary[1],
															zIndex: 2,
														}}
													>
														<View
															className="h-2 w-2 rounded-full"
															style={{ backgroundColor: colors.primary[2] }}
														/>
													</View>
												</View>
											) : (
												<View className="mb-1 items-center justify-center">
													<View
														className="h-6 w-6 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
														style={{ zIndex: 2 }}
													>
														<Text className="font-semibold text-primary-1 text-xs">
															{step.number}
														</Text>
													</View>
												</View>
											)}
											<Text
												className={`mt-1 text-center text-xs ${
													isActive ? "font-bold" : "font-medium"
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

					{/* Order Summary */}
					<View className="mb-6">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							ORDER SUMMARY
						</Text>

						<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-3 flex-row items-start justify-between">
								<View className="flex-1">
									<Text
										className="mb-1 font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										{state.packageName ?? "Package"}
									</Text>
									{state.creditsTotal && (
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{state.creditsTotal} credits
										</Text>
									)}
									{state.serviceName && (
										<Text
											className="mt-1 text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Service: {state.serviceName}
										</Text>
									)}
								</View>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									${subtotal.toFixed(2)}
								</Text>
							</View>

							{state.validityDays && (
								<View className="border-secondary-3 border-t pt-3">
									<Text
										className="text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Valid for {state.validityDays} days from purchase
									</Text>
								</View>
							)}
						</View>

						{/* Payment Plan Summary */}
						{state.paymentPlanType && state.paymentPlanType !== "full" && (
							<View className="mt-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<Text
									className="mb-1 font-semibold text-sm"
									style={{ color: colors.primary[1] }}
								>
									Payment Plan
								</Text>
								<Text
									className="text-sm"
									style={{ color: colors.secondary[1] }}
								>
									{state.paymentPlanType === "half"
										? "Half Payment (2\u00d7)"
										: "Quarterly Payment (4\u00d7)"}
								</Text>
								<Text
									className="mt-1 font-semibold text-sm"
									style={{ color: colors.primary[1] }}
								>
									First installment: $
									{(
										subtotal /
										(state.paymentPlanType === "half" ? 2 : 4)
									).toFixed(2)}{" "}
									+ tax
								</Text>
							</View>
						)}

						{/* Price Breakdown */}
						<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
							<View className="mb-2 flex-row justify-between">
								<Text
									className="text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Subtotal
								</Text>
								<Text
									className="text-sm"
									style={{ color: colors.primary[1] }}
								>
									${subtotal.toFixed(2)}
								</Text>
							</View>
							<View className="mb-3 flex-row justify-between">
								<Text
									className="text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Tax{taxRatePercent > 0 ? ` (${taxRatePercent}%)` : ""}
								</Text>
								<Text
									className="text-sm"
									style={{ color: colors.primary[1] }}
								>
									${taxAmount.toFixed(2)}
								</Text>
							</View>
							<View className="flex-row justify-between border-secondary-3 border-t pt-3">
								<Text
									className="font-bold text-base"
									style={{ color: colors.primary[1] }}
								>
									Total
								</Text>
								<Text
									className="font-bold text-base"
									style={{ color: colors.primary[1] }}
								>
									${total.toFixed(2)}
								</Text>
							</View>
						</View>
					</View>

					{/* Payment Methods - disabled until Stripe integration */}
					<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm opacity-50">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.secondary[1] }}
						>
							PAYMENT METHOD
						</Text>
						<Text
							className="text-sm"
							style={{ color: colors.secondary[1] }}
						>
							Payment processing will be available soon. Tap the button
							below to complete your purchase.
						</Text>
					</View>
				</View>
			</ScrollView>

			{/* Pay Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-white"
			>
				<View className="px-4 py-4">
					<TouchableOpacity
						onPress={handlePayment}
						disabled={isProcessing}
						className={`items-center justify-center rounded-xl py-4 ${
							isProcessing ? "opacity-50" : ""
						}`}
						style={{ backgroundColor: colors.primary[1] }}
					>
						{isProcessing ? (
							<Text className="font-semibold text-base text-primary-2">
								Processing...
							</Text>
						) : (
							<Text className="font-semibold text-base text-primary-2">
								Pay ${total.toFixed(2)}
							</Text>
						)}
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
