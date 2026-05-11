import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Plan", active: true },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

const PLAN_CONFIG = {
	full: { label: "Full Payment", installments: 1, description: "1 payment" },
	half: { label: "Half Payment", installments: 2, description: "2 payments" },
	quarterly: {
		label: "Quarterly Payment",
		installments: 4,
		description: "4 payments",
	},
} as const;

type PlanKey = keyof typeof PLAN_CONFIG;

export default function PlanScreen() {
	const { state, update } = usePurchaseFlow();

	const currentStep = 4;
	const totalSteps = 8;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const availablePlans = state.availablePaymentPlans as string[];

	// Determine which plan keys are available
	const planKeys = (["full", "half", "quarterly"] as PlanKey[]).filter((k) =>
		availablePlans.includes(k),
	);

	// Default selection: full if available, else first option
	const defaultPlan: PlanKey =
		planKeys.includes("full") ? "full" : (planKeys[0] ?? "full");

	const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
		(state.paymentPlanType as PlanKey) ?? defaultPlan,
	);

	// If no plans or only 'full', auto-skip this screen.
	// Ref guard prevents the effect from triggering twice if React StrictMode
	// double-mounts.
	const autoSkippedRef = useRef(false);
	useEffect(() => {
		if (autoSkippedRef.current) return;
		if (
			availablePlans.length === 0 ||
			(availablePlans.length === 1 && availablePlans[0] === "full")
		) {
			autoSkippedRef.current = true;
			update({ paymentPlanType: "full" });
			router.replace("./review");
		}
	}, [availablePlans, update]);

	const price = state.price ?? 0;
	const creditsTotal = state.creditsTotal ?? 0;

	const handleContinue = () => {
		update({ paymentPlanType: selectedPlan });
		router.push("./review");
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
							Payment Plan
						</Text>
					</View>
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

					{/* Plan Selection */}
					<View className="mb-4">
						<Text
							className="mb-2 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT PAYMENT PLAN
						</Text>
						<Text
							className="mb-4 text-sm"
							style={{ color: colors.secondary[1] }}
						>
							Choose how you'd like to split your payments. Credits unlock after
							each installment is confirmed.
						</Text>

						{planKeys.map((planKey) => {
							const config = PLAN_CONFIG[planKey];
							const amountPerInstallment = price / config.installments;
							const creditsPerInstallment = Math.floor(
								creditsTotal / config.installments,
							);
							const isSelected = selectedPlan === planKey;

							return (
								<TouchableOpacity
									key={planKey}
									onPress={() => setSelectedPlan(planKey)}
									className={`mb-3 rounded-2xl border bg-primary-2 p-4 shadow-sm ${
										isSelected
											? "border-2 border-primary-1"
											: "border border-secondary-3"
									}`}
								>
									<View className="mb-2 flex-row items-start justify-between">
										<View className="flex-1">
											<Text
												className="font-bold text-base"
												style={{ color: colors.primary[1] }}
											>
												{config.label}
											</Text>
											<Text
												className="mt-1 text-sm"
												style={{ color: colors.secondary[1] }}
											>
												{config.description}
											</Text>
										</View>
										{isSelected && (
											<View
												className="ml-2 h-6 w-6 items-center justify-center rounded-full"
												style={{ backgroundColor: colors.primary[1] }}
											>
												<Ionicons
													name="checkmark"
													size={14}
													color={colors.primary[2]}
												/>
											</View>
										)}
									</View>

									<View
										className="mt-2 border-t pt-3"
										style={{ borderColor: colors.secondary[3] }}
									>
										<View className="flex-row items-center justify-between">
											<Text
												className="text-sm"
												style={{ color: colors.secondary[1] }}
											>
												Per installment
											</Text>
											<Text
												className="font-semibold text-sm"
												style={{ color: colors.primary[1] }}
											>
												{formatMoney(amountPerInstallment)}
											</Text>
										</View>
										<View className="mt-1 flex-row items-center justify-between">
											<Text
												className="text-sm"
												style={{ color: colors.secondary[1] }}
											>
												Credits unlocked
											</Text>
											<Text
												className="font-semibold text-sm"
												style={{ color: colors.primary[1] }}
											>
												{creditsPerInstallment} credits
											</Text>
										</View>
									</View>
								</TouchableOpacity>
							);
						})}
					</View>
				</View>
			</ScrollView>

			{/* Continue Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="px-4 py-4">
					<TouchableOpacity
						onPress={handleContinue}
						className="items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Continue
						</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
