import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

const SERVICE_CATEGORY = {
	PRIVATE: 1,
	SEMI_PRIVATE: 2,
} as const;

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Review", active: false },
	{ number: 4, label: "Info", active: false },
	{ number: 5, label: "Sign", active: false },
	{ number: 6, label: "Pay", active: true },
	{ number: 7, label: "Done", active: false },
];

// Dummy service data
const services = [
	{ id: 1, title: "2×12-Week Personal Training", credits: 24, price: 1200 },
	{ id: 2, title: "2×24-Week Personal Training", credits: 48, price: 2200 },
	{ id: 3, title: "Class A", schedule: "Mon/Wed/Fri 7:00 PM", price: 800 },
	{ id: 4, title: "Class B", schedule: "Tue 8:00 AM", price: 600 },
];

export default function PayScreen() {
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
		signature?: string;
	}>();

	const serviceId = params.serviceId
		? Number.parseInt(params.serviceId, 10)
		: null;
	const categoryId = params.categoryId
		? Number.parseInt(params.categoryId, 10)
		: null;
	const _coachId =
		params.coachId === "auto"
			? "auto"
			: params.coachId
				? Number.parseInt(params.coachId, 10)
				: null;
	const selectedDate = params.date ? new Date(params.date) : null;
	const selectedTime = params.time || null;

	const currentStep = 6;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const [paymentMethod, setPaymentMethod] = useState<
		"card" | "apple" | "google" | null
	>(null);
	const [isProcessing, setIsProcessing] = useState(false);

	const selectedService = services.find((s) => s.id === serviceId);

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

	const handlePayment = async () => {
		if (!paymentMethod) return;

		setIsProcessing(true);

		// Simulate payment processing
		setTimeout(() => {
			setIsProcessing(false);
			router.push({
				pathname: "./done" as never,
				params: {
					...params,
				},
			});
		}, 2000);
	};

	const formatDate = (date: Date | null) => {
		if (!date) return "Not selected";
		return date.toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		});
	};

	const subtotal = selectedService?.price || 0;
	const tax = subtotal * 0.1; // 10% tax
	const total = subtotal + tax;

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

					{/* Order Summary */}
					<View className="mb-6">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							ORDER SUMMARY
						</Text>

						<View className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
							<View className="mb-3 flex-row items-start justify-between">
								<View className="flex-1">
									<Text
										className="mb-1 font-semibold text-base"
										style={{ color: colors.primary[1] }}
									>
										{selectedService?.title || "Not selected"}
									</Text>
									{selectedService && "credits" in selectedService && (
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{selectedService.credits} credits
										</Text>
									)}
									{selectedService && "schedule" in selectedService && (
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											{selectedService.schedule}
										</Text>
									)}
								</View>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									${selectedService?.price?.toFixed(2) || "0.00"}
								</Text>
							</View>

							{categoryId === SERVICE_CATEGORY.PRIVATE &&
								selectedDate &&
								selectedTime && (
									<View className="border-gray-200 border-t pt-3">
										<Text
											className="mb-1 text-xs"
											style={{ color: colors.secondary[1] }}
										>
											First Session
										</Text>
										<Text
											className="text-sm"
											style={{ color: colors.primary[1] }}
										>
											{formatDate(selectedDate)} at {selectedTime}
										</Text>
									</View>
								)}
						</View>

						{/* Price Breakdown */}
						<View className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
							<View className="mb-2 flex-row justify-between">
								<Text
									className="text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Subtotal
								</Text>
								<Text className="text-sm" style={{ color: colors.primary[1] }}>
									${subtotal.toFixed(2)}
								</Text>
							</View>
							<View className="mb-3 flex-row justify-between">
								<Text
									className="text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Tax
								</Text>
								<Text className="text-sm" style={{ color: colors.primary[1] }}>
									${tax.toFixed(2)}
								</Text>
							</View>
							<View className="flex-row justify-between border-gray-200 border-t pt-3">
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

					{/* Payment Methods */}
					<View className="mb-4">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							SELECT PAYMENT METHOD
						</Text>

						{/* Credit/Debit Card */}
						<TouchableOpacity
							onPress={() => setPaymentMethod("card")}
							className={`mb-3 rounded-2xl border bg-white p-4 ${
								paymentMethod === "card" ? "border-blue-500" : "border-gray-200"
							} shadow-sm`}
						>
							<View className="flex-row items-center justify-between">
								<View className="flex-1 flex-row items-center">
									<Ionicons
										name="card-outline"
										size={24}
										color={colors.primary[1]}
									/>
									<Text
										className="ml-3 text-base"
										style={{ color: colors.primary[1] }}
									>
										Credit/Debit Card
									</Text>
								</View>
								{paymentMethod === "card" && (
									<View
										className="h-6 w-6 items-center justify-center rounded-full"
										style={{ backgroundColor: "#2563EB" }}
									>
										<Ionicons
											name="checkmark"
											size={16}
											color={colors.primary[2]}
										/>
									</View>
								)}
							</View>
						</TouchableOpacity>

						{/* Apple Pay */}
						<TouchableOpacity
							onPress={() => setPaymentMethod("apple")}
							className={`mb-3 rounded-2xl border bg-white p-4 ${
								paymentMethod === "apple"
									? "border-blue-500"
									: "border-gray-200"
							} shadow-sm`}
						>
							<View className="flex-row items-center justify-between">
								<View className="flex-1 flex-row items-center">
									<Ionicons
										name="logo-apple"
										size={24}
										color={colors.primary[1]}
									/>
									<Text
										className="ml-3 text-base"
										style={{ color: colors.primary[1] }}
									>
										Apple Pay
									</Text>
								</View>
								{paymentMethod === "apple" && (
									<View
										className="h-6 w-6 items-center justify-center rounded-full"
										style={{ backgroundColor: "#2563EB" }}
									>
										<Ionicons
											name="checkmark"
											size={16}
											color={colors.primary[2]}
										/>
									</View>
								)}
							</View>
						</TouchableOpacity>

						{/* Google Pay */}
						<TouchableOpacity
							onPress={() => setPaymentMethod("google")}
							className={`mb-3 rounded-2xl border bg-white p-4 ${
								paymentMethod === "google"
									? "border-blue-500"
									: "border-gray-200"
							} shadow-sm`}
						>
							<View className="flex-row items-center justify-between">
								<View className="flex-1 flex-row items-center">
									<Ionicons
										name="logo-google"
										size={24}
										color={colors.primary[1]}
									/>
									<Text
										className="ml-3 text-base"
										style={{ color: colors.primary[1] }}
									>
										Google Pay
									</Text>
								</View>
								{paymentMethod === "google" && (
									<View
										className="h-6 w-6 items-center justify-center rounded-full"
										style={{ backgroundColor: "#2563EB" }}
									>
										<Ionicons
											name="checkmark"
											size={16}
											color={colors.primary[2]}
										/>
									</View>
								)}
							</View>
						</TouchableOpacity>
					</View>
				</View>
			</ScrollView>

			{/* Pay Button */}
			{paymentMethod && (
				<SafeAreaView
					edges={["bottom"]}
					className="border-gray-200 border-t bg-white"
				>
					<View className="px-4 py-4">
						<TouchableOpacity
							onPress={handlePayment}
							disabled={isProcessing}
							className={`items-center justify-center rounded-xl py-4 ${
								isProcessing ? "opacity-50" : ""
							}`}
							style={{ backgroundColor: "#2563EB" }}
						>
							{isProcessing ? (
								<Text className="font-semibold text-base text-white">
									Processing...
								</Text>
							) : (
								<Text className="font-semibold text-base text-white">
									Pay ${total.toFixed(2)}
								</Text>
							)}
						</TouchableOpacity>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
