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
	{ number: 3, label: "Info", active: true },
	{ number: 4, label: "Review", active: false },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

export default function InfoScreen() {
	const navigation = useNavigation();
	const params = useLocalSearchParams<{
		serviceId?: string;
		categoryId?: string;
		coachId?: string;
		date?: string;
		time?: string;
		preferredTimes?: string;
	}>();

	const currentStep = 3;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	// Remark state
	const [remark, setRemark] = useState("");

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
		router.push({
			pathname: "./review" as never,
			params: {
				...params,
				remark,
			},
		});
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
							Additional Information
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

					{/* Remark Section */}
					<View className="mb-4">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							REMARK
						</Text>
						<Text
							className="mb-4 text-sm"
							style={{ color: colors.secondary[1] }}
						>
							Please provide any additional information or remarks (optional)
						</Text>

						<TextInput
							value={remark}
							onChangeText={setRemark}
							placeholder="Enter your remarks here..."
							multiline
							numberOfLines={6}
							className="rounded-xl border border-gray-200 bg-white p-3 text-base"
							style={{
								color: colors.primary[1],
								minHeight: 150,
								textAlignVertical: "top",
							}}
							placeholderTextColor={colors.secondary[1]}
						/>
					</View>
				</View>
			</ScrollView>

			{/* Continue Button */}
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
						<Text className="font-semibold text-base text-white">Continue</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		</Container>
	);
}
