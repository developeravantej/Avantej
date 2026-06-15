import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { useOrganization } from "@/hooks/useOrganization";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";
import { client } from "@/utils/orpc";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Plan", active: true },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

type InstallmentPlan = {
	id: string;
	code: string;
	name: string;
	numInstallments: number;
	defaultIntervalDays: number;
	pricePremiumBps: number;
	isActive: boolean;
	isDefault: boolean;
	sortOrder: number;
};

export default function PlanScreen() {
	const { organizationId } = useOrganization();
	const { state, update } = usePurchaseFlow();

	const currentStep = 4;
	const totalSteps = 8;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const {
		data: rawPlans,
		isLoading,
		isError,
	} = useQuery<InstallmentPlan[]>({
		queryKey: ["installmentPlans", "active", organizationId],
		queryFn: () =>
			client.installmentPlans.list({
				organizationId,
				activeOnly: true,
			}) as Promise<InstallmentPlan[]>,
		staleTime: 60_000,
	});

	// Sort: numInstallments ASC (full pay first), then isDefault DESC, then name
	const plans: InstallmentPlan[] = rawPlans
		? [...rawPlans].sort((a, b) => {
				if (a.numInstallments !== b.numInstallments) {
					return a.numInstallments - b.numInstallments;
				}
				if (a.isDefault !== b.isDefault) {
					return a.isDefault ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			})
		: [];

	// Determine default selection: plan matching existing state, then default plan, then first
	const defaultPlanId =
		state.selectedInstallmentPlanId ??
		plans.find((p) => p.isDefault)?.id ??
		plans[0]?.id ??
		null;

	const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
		defaultPlanId,
	);

	// Sync selected plan ID once plans are loaded if nothing was pre-selected
	useEffect(() => {
		if (!selectedPlanId && plans.length > 0) {
			const fallback =
				plans.find((p) => p.isDefault)?.id ?? plans[0]?.id ?? null;
			setSelectedPlanId(fallback);
		}
	}, [plans, selectedPlanId]);

	// If only one plan and it has 1 installment (full payment), auto-skip this screen
	useEffect(() => {
		if (!isLoading && plans.length === 1 && plans[0]?.numInstallments === 1) {
			const plan = plans[0];
			update({
				paymentPlanType: plan.code,
				selectedInstallmentPlanId: plan.id,
				selectedInstallmentPlanNumInstallments: plan.numInstallments,
				selectedInstallmentPlanPricePremiumBps: plan.pricePremiumBps,
				selectedInstallmentPlanLabel: plan.name,
				installmentIntervalDays: plan.defaultIntervalDays,
			});
			router.replace("./review");
		}
	}, [isLoading, plans]); // eslint-disable-line react-hooks/exhaustive-deps

	const price = state.price ?? 0;
	const creditsTotal = state.creditsTotal ?? 0;

	const handleContinue = () => {
		const plan = plans.find((p) => p.id === selectedPlanId);
		if (!plan) return;

		// priceWithSurcharge for display only — actual surcharge math happens in pay.tsx
		update({
			paymentPlanType: plan.code,
			selectedInstallmentPlanId: plan.id,
			selectedInstallmentPlanNumInstallments: plan.numInstallments,
			selectedInstallmentPlanPricePremiumBps: plan.pricePremiumBps,
			selectedInstallmentPlanLabel: plan.name,
			installmentIntervalDays: plan.defaultIntervalDays,
		});
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
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
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

						{/* Loading state */}
						{isLoading && (
							<View className="items-center justify-center py-12">
								<ActivityIndicator size="large" color={colors.primary[1]} />
								<Text
									className="mt-3 text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Loading payment plans...
								</Text>
							</View>
						)}

						{/* Error / empty state */}
						{!isLoading && (isError || plans.length === 0) && (
							<View className="items-center rounded-2xl border border-secondary-3 bg-primary-2 p-6">
								<Ionicons
									name="information-circle-outline"
									size={40}
									color={colors.secondary[1]}
								/>
								<Text
									className="mt-3 text-center font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									No payment plans configured
								</Text>
								<Text
									className="mt-1 text-center text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Contact your branch to set up payment plans before purchasing.
								</Text>
								<TouchableOpacity
									onPress={() => router.back()}
									className="mt-4 rounded-xl border border-secondary-3 px-6 py-3"
								>
									<Text
										className="font-semibold text-sm"
										style={{ color: colors.primary[1] }}
									>
										Go Back
									</Text>
								</TouchableOpacity>
							</View>
						)}

						{/* Dynamic plan cards */}
						{!isLoading &&
							plans.map((plan) => {
								const surchargeMultiplier =
									(10000 + plan.pricePremiumBps) / 10000;
								const priceWithSurcharge = Math.round(
									price * surchargeMultiplier,
								);
								const amountPerInstallment = Math.ceil(
									priceWithSurcharge / plan.numInstallments,
								);
								const creditsPerInstallment = Math.floor(
									creditsTotal / plan.numInstallments,
								);
								const isSelected = selectedPlanId === plan.id;
								const surchargePercent = plan.pricePremiumBps / 100;

								return (
									<TouchableOpacity
										key={plan.id}
										onPress={() => setSelectedPlanId(plan.id)}
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
													{plan.name}
												</Text>
												<Text
													className="mt-1 text-sm"
													style={{ color: colors.secondary[1] }}
												>
													{plan.numInstallments === 1
														? "1 payment"
														: `${plan.numInstallments} payments`}
												</Text>
												{plan.pricePremiumBps > 0 && (
													<Text
														className="mt-1 text-xs"
														style={{ color: colors.secondary[1] }}
													>
														+
														{surchargePercent.toFixed(
															surchargePercent % 1 === 0 ? 0 : 1,
														)}
														% surcharge
													</Text>
												)}
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
						disabled={!selectedPlanId || isLoading}
						className={`items-center justify-center rounded-xl bg-primary-1 py-4 ${
							!selectedPlanId || isLoading ? "opacity-50" : ""
						}`}
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
