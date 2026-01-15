import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useState } from "react";
import {
	Image,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Info", active: false },
	{ number: 5, label: "Sign", active: true },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

export default function SignScreen() {
	const navigation = useNavigation();
	const params = useLocalSearchParams<{
		serviceId?: string;
		categoryId?: string;
		coachId?: string;
		date?: string;
		time?: string;
		preferredTimes?: string;
		additionalInfo?: string;
		medicalNotes?: string;
		goals?: string;
	}>();

	const currentStep = 5;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	// E-Signature state
	const [signature, setSignature] = useState("");
	const [agreedToTerms, setAgreedToTerms] = useState(false);

	useFocusEffect(
		useCallback(() => {
			const findTabsNavigator = (nav: unknown, depth = 0): unknown => {
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
								r.name === "calendar" ||
								r.name === "notifications" ||
								r.name === "profile",
						)
					) {
						return parent;
					}
				} catch {
					// Continue searching
				}
				return findTabsNavigator(parent, depth + 1);
			};

			const tabsNavigator = findTabsNavigator(navigation);
			if (tabsNavigator) {
				(
					tabsNavigator as {
						setOptions?: (options: {
							tabBarStyle: { display: string };
						}) => void;
					}
				)?.setOptions?.({ tabBarStyle: { display: "none" } });
			}
		}, [navigation]),
	);

	const handleContinue = () => {
		if (signature && agreedToTerms) {
			router.push({
				pathname: "./pay" as never,
				params: {
					...params,
					signature,
				},
			});
		}
	};

	return (
		<Container>
			<ScrollView className="flex-1 bg-white">
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
							E-Signature
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
									backgroundColor: "#2563EB",
								}}
							/>
						</View>

						{/* Step Navigation */}
						<View className="relative" style={{ height: 50 }}>
							<View
								className="absolute h-px"
								style={{
									left: "10%",
									right: "10%",
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
														className="h-5 w-5 items-center justify-center rounded-full"
														style={{
															backgroundColor: "#2563EB",
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
														className="h-5 w-5 items-center justify-center rounded-full"
														style={{
															backgroundColor: "#2563EB",
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
														style={{
															backgroundColor: colors.primary[2],
															borderRadius: 10,
															width: 18,
															height: 18,
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
															? "#2563EB"
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

					{/* E-Signature Section */}
					<View className="mb-4">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							E-SIGNATURE
						</Text>

						{/* Terms and Conditions */}
						<View className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
							<Text
								className="mb-3 text-sm"
								style={{ color: colors.primary[1] }}
							>
								By signing below, you agree to:
							</Text>
							<View className="mb-2">
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									• Terms and Conditions of service
								</Text>
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									• Cancellation and refund policy
								</Text>
								<Text
									className="mb-1 text-xs"
									style={{ color: colors.secondary[1] }}
								>
									• Health and safety waiver
								</Text>
								<Text
									className="text-xs"
									style={{ color: colors.secondary[1] }}
								>
									• Privacy policy
								</Text>
							</View>
						</View>

						{/* Signature Input */}
						<View className="mb-4">
							<Text
								className="mb-2 text-sm"
								style={{ color: colors.primary[1] }}
							>
								Full Name (Signature)
							</Text>
							<TextInput
								value={signature}
								onChangeText={setSignature}
								placeholder="Enter your full name"
								className="rounded-xl border border-gray-200 bg-white p-3 text-base"
								style={{ color: colors.primary[1] }}
								placeholderTextColor={colors.secondary[1]}
							/>
							<Text
								className="mt-1 text-xs"
								style={{ color: colors.secondary[1] }}
							>
								By typing your name, you are providing your electronic signature
							</Text>
						</View>

						{/* Agreement Checkbox */}
						<TouchableOpacity
							onPress={() => setAgreedToTerms(!agreedToTerms)}
							className="mb-4 flex-row items-center"
						>
							<View
								className={`mr-3 h-5 w-5 items-center justify-center rounded border-2 ${
									agreedToTerms
										? "border-blue-600 bg-blue-600"
										: "border-gray-300"
								}`}
							>
								{agreedToTerms && (
									<Ionicons
										name="checkmark"
										size={14}
										color={colors.primary[2]}
									/>
								)}
							</View>
							<Text
								className="flex-1 text-sm"
								style={{ color: colors.primary[1] }}
							>
								I agree to the terms and conditions and confirm that the
								information provided is accurate
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</ScrollView>

			{/* Continue Button */}
			{signature && agreedToTerms && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-gray-200 border-t bg-white"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={handleContinue}
							className="items-center justify-center rounded-xl bg-blue-600 py-4"
							style={{ backgroundColor: "#2563EB" }}
						>
							<Text className="font-semibold text-base text-white">
								Proceed to Payment
							</Text>
						</TouchableOpacity>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
