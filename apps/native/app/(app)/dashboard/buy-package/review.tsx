import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { colors } from "@/lib/colors";
import { formatMoney } from "@/lib/money";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Review", active: true },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
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
								) : isActive ? (
									<View className="mb-1 items-center justify-center">
										<View
											className="size-6 items-center justify-center rounded-full border-2 border-primary-1"
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
											className="size-6 items-center justify-center rounded-full border-2 border-secondary-2 bg-primary-2"
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
	);
}

export default function ReviewScreen() {
	const { state } = usePurchaseFlow();

	const currentStep = 4;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const handleContinue = () => {
		router.push("./sign");
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<Pressable
							onPress={() => router.back()}
							className="mr-3 size-10 items-center justify-center"
						>
							<Ionicons
								name="arrow-back"
								size={24}
								color={colors.primary[1]}
							/>
						</Pressable>
						<Text className="flex-1 font-bold text-2xl text-black">
							Review Details
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
							REVIEW YOUR PACKAGE
						</Text>

						{/* Category */}
						{state.categoryName && (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<View className="mb-2 flex-row items-center">
									<Ionicons
										name="grid-outline"
										size={20}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-2 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Category
									</Text>
								</View>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									{state.categoryName}
								</Text>
							</View>
						)}

						{/* Service (carries credits, price, validity) */}
						{state.serviceName && (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<View className="mb-2 flex-row items-center">
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
									{state.serviceName}
								</Text>
								{state.creditsTotal && (
									<Text
										className="mt-1 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										{state.creditsTotal} credits
									</Text>
								)}
								{state.price != null && (
									<Text
										className="mt-1 font-semibold text-sm"
										style={{ color: colors.primary[1] }}
									>
										{formatMoney(state.price)}
									</Text>
								)}
								{state.validityDays && (
									<Text
										className="mt-1 text-xs"
										style={{ color: colors.secondary[1] }}
									>
										Valid for {state.validityDays} days
									</Text>
								)}
							</View>
						)}

						{/* Preferred Trainer (optional) */}
						{state.preferredTrainerName && (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<View className="mb-2 flex-row items-center">
									<Ionicons
										name="person-outline"
										size={20}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-2 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Preferred Trainer
									</Text>
								</View>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									{state.preferredTrainerName}
								</Text>
							</View>
						)}

						{/* Preferred Times (Personal Training only) */}
						{state.serviceType === "private" &&
							state.preferredTimes.length > 0 && (
								<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
									<View className="mb-2 flex-row items-center">
										<Ionicons
											name="time-outline"
											size={20}
											color={colors.secondary[1]}
										/>
										<Text
											className="ml-2 text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Preferred Times
										</Text>
									</View>
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

						{/* Remark */}
						{state.remark && (
							<View className="mb-3 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
								<View className="mb-2 flex-row items-center">
									<Ionicons
										name="document-text-outline"
										size={20}
										color={colors.secondary[1]}
									/>
									<Text
										className="ml-2 text-sm"
										style={{ color: colors.secondary[1] }}
									>
										Remark
									</Text>
								</View>
								<Text
									className="text-base"
									style={{ color: colors.primary[1] }}
								>
									{state.remark}
								</Text>
							</View>
						)}
					</View>
				</View>
			</ScrollView>

			{/* Continue Button */}
			<SafeAreaView
				edges={["bottom"]}
				className="border-secondary-3 border-t bg-primary-2"
			>
				<View className="p-4">
					<Pressable
						onPress={handleContinue}
						className="items-center justify-center rounded-xl bg-primary-1 py-4"
					>
						<Text className="font-semibold text-base text-primary-2">
							Continue
						</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		</Container>
	);
}
