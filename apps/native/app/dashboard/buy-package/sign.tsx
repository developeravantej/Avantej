import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Alert,
	Image,
	Modal,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SignatureCanvas from "react-native-signature-canvas";
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

/** PDFs from assets/documents – id is passed to terms screen to open the correct file. */
const TERMS_DOCUMENTS = [
	{ id: "agreement" as const, name: "Company–Client Agreement" },
	{ id: "satisfaction" as const, name: "100% Satisfaction Guarantee" },
	{ id: "parq" as const, name: "Par-Q & You" },
] as const;

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
	const [showSignatureModal, setShowSignatureModal] = useState(false);
	const [viewedDocs, setViewedDocs] = useState<Record<string, boolean>>({
		agreement: false,
		satisfaction: false,
		parq: false,
	});

	const allTermsViewed =
		viewedDocs.agreement && viewedDocs.satisfaction && viewedDocs.parq;

	const signatureRef = useRef<any>(null);
	const modalSignatureRef = useRef<any>(null);

	const handleSignature = async (signatureData: string) => {
		setSignature(signatureData);
		setShowSignatureModal(false);
		// Unlock orientation when signature is confirmed
		await ScreenOrientation.unlockAsync();
	};

	const handleClear = () => {
		modalSignatureRef.current?.clearSignature();
	};

	const handleConfirm = () => {
		// Read and save the signature from modal
		modalSignatureRef.current?.readSignature();
	};

	const handleOpenSignatureModal = async () => {
		// Lock to landscape orientation
		await ScreenOrientation.lockAsync(
			ScreenOrientation.OrientationLock.LANDSCAPE,
		);
		setShowSignatureModal(true);
	};

	const handleCloseSignatureModal = async () => {
		setShowSignatureModal(false);
		// Unlock orientation back to default
		await ScreenOrientation.unlockAsync();
	};

	// Cleanup orientation when component unmounts
	useEffect(() => {
		return () => {
			ScreenOrientation.unlockAsync();
		};
	}, []);

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

	const handleOpenTermsSection = (documentId: string) => {
		setViewedDocs((prev) => ({ ...prev, [documentId]: true }));
		router.push({
			pathname: "./terms" as never,
			params: { document: documentId },
		});
	};

	const handleAgreementPress = () => {
		if (!allTermsViewed) {
			Alert.alert(
				"Please review all terms",
				"Open each of the three document links above before agreeing.",
			);
			return;
		}
		setAgreedToTerms((prev) => !prev);
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

						{/* Terms and Conditions – links to the three PDFs */}
						<View className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
							<Text
								className="mb-3 text-sm"
								style={{ color: colors.primary[1] }}
							>
								By signing below, you agree to:
							</Text>
							<View className="mb-2">
								{TERMS_DOCUMENTS.map((doc) => {
									const viewed = viewedDocs[doc.id];
									return (
										<TouchableOpacity
											key={doc.id}
											onPress={() => handleOpenTermsSection(doc.id)}
											className="mb-1 flex-row items-center"
										>
											<Text
												className="text-xs"
												style={{
													color: viewed ? colors.secondary[1] : "#2563EB",
													textDecorationLine: viewed ? "none" : "underline",
												}}
											>
												• {doc.name}
											</Text>
											{viewed ? (
												<Ionicons
													name="checkmark-circle"
													size={12}
													color="#10B981"
													style={{ marginLeft: 4 }}
												/>
											) : (
												<Ionicons
													name="chevron-forward"
													size={12}
													color="#2563EB"
													style={{ marginLeft: 4 }}
												/>
											)}
										</TouchableOpacity>
									);
								})}
							</View>
						</View>

						{/* Agreement Checkbox */}
						<TouchableOpacity
							onPress={handleAgreementPress}
							className="mb-4 flex-row items-start"
						>
							<View
								className={`mt-0.5 mr-3 h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
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
							<View className="flex-1 flex-row flex-wrap">
								<Text className="text-sm" style={{ color: colors.primary[1] }}>
									I agree to the terms and conditions and confirm that the
									information provided is accurate
								</Text>
							</View>
						</TouchableOpacity>

						{/* Signature Canvas */}
						<View className="mb-4">
							<Text
								className="mb-2 text-sm"
								style={{ color: colors.primary[1] }}
							>
								Sign Below
							</Text>
							<TouchableOpacity
								onPress={handleOpenSignatureModal}
								activeOpacity={0.7}
								className="mb-2 overflow-hidden rounded-xl border-2 border-gray-300 border-dashed bg-gray-50"
								style={{
									height: 200,
									borderColor: signature
										? colors.primary[1]
										: colors.secondary[3],
								}}
							>
								{signature ? (
									<View className="h-full w-full items-center justify-center">
										<Image
											source={{ uri: signature }}
											style={{
												width: "100%",
												height: "100%",
												resizeMode: "contain",
											}}
										/>
									</View>
								) : (
									<View className="h-full w-full items-center justify-center">
										<Ionicons
											name="create-outline"
											size={48}
											color={colors.secondary[1]}
										/>
										<Text
											className="mt-2 text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Tap to sign
										</Text>
									</View>
								)}
							</TouchableOpacity>
							{signature && (
								<TouchableOpacity
									onPress={() => {
										setSignature("");
										setShowSignatureModal(true);
									}}
									className="mb-2 self-end"
								>
									<Text
										className="font-medium text-sm"
										style={{ color: "#2563EB" }}
									>
										Re-sign
									</Text>
								</TouchableOpacity>
							)}
							<Text
								className="mt-2 text-xs"
								style={{ color: colors.secondary[1] }}
							>
								By signing above, you are providing your electronic signature
							</Text>
						</View>

						{/* Full Screen Signature Modal */}
						<Modal
							visible={showSignatureModal}
							animationType="slide"
							presentationStyle="fullScreen"
							onRequestClose={handleCloseSignatureModal}
						>
							<View
								style={{
									flex: 1,
									backgroundColor: "#ffffff",
								}}
							>
								<SafeAreaView style={{ flex: 1 }}>
									{/* Modal Header */}
									<View className="border-gray-200 border-b bg-white px-6 py-4">
										<View className="flex-row items-center justify-between">
											<View className="flex-1 flex-row items-center justify-center">
												<Ionicons
													name="phone-portrait-outline"
													size={20}
													color={colors.primary[1]}
													style={{
														marginRight: 8,
														transform: [{ rotate: "90deg" }],
													}}
												/>
												<Text
													className="font-bold text-xl"
													style={{ color: colors.primary[1] }}
												>
													Sign Here (Landscape Mode)
												</Text>
											</View>
											<TouchableOpacity
												onPress={handleCloseSignatureModal}
												className="absolute right-6"
											>
												<Ionicons
													name="close"
													size={28}
													color={colors.primary[1]}
												/>
											</TouchableOpacity>
										</View>
										<View className="mt-2 flex-row items-center justify-center">
											<View
												className="mr-2 h-2 w-2 rounded-full"
												style={{ backgroundColor: "#10B981" }}
											/>
											<Text
												className="font-medium text-xs"
												style={{ color: "#10B981" }}
											>
												Landscape Mode Active
											</Text>
										</View>
									</View>

									{/* Signature Canvas - Full Screen */}
									<View
										style={{
											flex: 1,
											backgroundColor: "#ffffff",
										}}
									>
										<SignatureCanvas
											ref={modalSignatureRef}
											onOK={handleSignature}
											descriptionText=""
											clearText=""
											confirmText=""
											webStyle={`
												.m-signature-pad {
													box-shadow: none;
													border: none;
													width: 100%;
													height: 100%;
												}
												.m-signature-pad--body {
													border: none;
													height: 100%;
													width: 100%;
												}
												.m-signature-pad--body canvas {
													border-radius: 0;
													width: 100%;
													height: 100%;
													touch-action: none;
												}
												.m-signature-pad--footer {
													display: none;
												}
											`}
											style={{
												flex: 1,
											}}
										/>
									</View>

									{/* Modal Footer Buttons */}
									<View className="border-gray-200 border-t bg-white px-6 py-4">
										<View className="flex-row justify-end gap-4">
											<TouchableOpacity
												onPress={handleClear}
												className="rounded-lg border-2 border-gray-300 bg-white px-8 py-3"
											>
												<Text
													className="font-semibold text-base"
													style={{ color: colors.primary[1] }}
												>
													Clear
												</Text>
											</TouchableOpacity>
											<TouchableOpacity
												onPress={handleConfirm}
												className="rounded-lg bg-blue-600 px-8 py-3"
												style={{ backgroundColor: "#2563EB" }}
											>
												<Text className="font-semibold text-base text-white">
													Confirm Signature
												</Text>
											</TouchableOpacity>
										</View>
									</View>
								</SafeAreaView>
							</View>
						</Modal>
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
