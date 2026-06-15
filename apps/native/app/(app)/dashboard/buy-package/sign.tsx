import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Container } from "@/components/container";
import { SignatureModal } from "./_components/signature-modal";
import { usePurchaseFlow } from "@/contexts/purchase-flow-context";
import { colors } from "@/lib/colors";

const steps = [
	{ number: 1, label: "Setup", active: false },
	{ number: 2, label: "Schedule", active: false },
	{ number: 3, label: "Info", active: false },
	{ number: 4, label: "Review", active: false },
	{ number: 5, label: "Sign", active: true },
	{ number: 6, label: "Pay", active: false },
	{ number: 7, label: "Done", active: false },
];

const TERMS_DOCUMENTS = [
	{ id: "agreement" as const, name: "Company\u2013Client Agreement" },
	{ id: "satisfaction" as const, name: "100% Satisfaction Guarantee" },
	{ id: "parq" as const, name: "Par-Q & You" },
] as const;

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

// react-doctor-disable-next-line react-doctor/no-giant-component -- extracted SignatureModal; remaining body is signature/agreement state machine with orientation locking effects, terms-document viewing tracking, and signature canvas integration; needs further refactor PR
export default function SignScreen() {
	const { state, update } = usePurchaseFlow();

	const currentStep = 5;
	const totalSteps = 7;
	const progressPercentage = Math.round((currentStep / totalSteps) * 100);

	const [signature, setSignature] = useState(state.signature ?? "");
	const [agreedToTerms, setAgreedToTerms] = useState(state.termsAgreed);
	const [showSignatureModal, setShowSignatureModal] = useState(false);
	const [viewedDocs, setViewedDocs] = useState<Record<string, boolean>>({
		agreement: false,
		satisfaction: false,
		parq: false,
	});

	const allTermsViewed =
		viewedDocs.agreement && viewedDocs.satisfaction && viewedDocs.parq;

	const modalSignatureRef = useRef<any>(null);

	const handleSignature = async (signatureData: string) => {
		setSignature(signatureData);
		setShowSignatureModal(false);
		await ScreenOrientation.unlockAsync();
	};

	const handleClear = () => {
		modalSignatureRef.current?.clearSignature();
	};

	const handleConfirm = () => {
		modalSignatureRef.current?.readSignature();
	};

	const handleOpenSignatureModal = async () => {
		try {
			await ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.LANDSCAPE,
			);
		} catch (err) {
			console.warn("[sign] failed to lock orientation", err);
		}
		setShowSignatureModal(true);
	};

	const handleCloseSignatureModal = async () => {
		setShowSignatureModal(false);
		try {
			await ScreenOrientation.unlockAsync();
		} catch (err) {
			console.warn("[sign] failed to unlock orientation", err);
		}
	};

	useEffect(() => {
		return () => {
			ScreenOrientation.unlockAsync().catch(() => {
				// Best-effort cleanup; ignore failures during unmount.
			});
		};
	}, []);

	const handleContinue = () => {
		if (signature && agreedToTerms) {
			update({
				signature,
				termsAgreed: true,
				termsAgreedAt: new Date().toISOString(),
			});
			router.push("./pay");
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
			<ScrollView className="flex-1 bg-secondary-3">
				{/* Header */}
				<View className="px-4 pt-4 pb-2">
					<View className="mb-4 flex-row items-center">
						<Pressable
							onPress={() => router.back()}
							className="mr-3 size-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</Pressable>
						<Text className="flex-1 font-bold text-2xl text-primary-1">
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

					{/* E-Signature Section */}
					<View className="mb-4">
						<Text
							className="mb-4 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.primary[1] }}
						>
							E-SIGNATURE
						</Text>

						{/* Terms and Conditions */}
						<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
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
										<Pressable
											key={doc.id}
											onPress={() => handleOpenTermsSection(doc.id)}
											className="mb-1 flex-row items-center"
										>
											<Text
												className="text-xs"
												style={{
													color: viewed
														? colors.secondary[1]
														: colors.primary[1],
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
													color={colors.primary[1]}
													style={{ marginLeft: 4 }}
												/>
											)}
										</Pressable>
									);
								})}
							</View>
						</View>

						{/* Agreement Checkbox */}
						<Pressable
							onPress={handleAgreementPress}
							className="mb-4 flex-row items-start rounded-xl border border-secondary-3 bg-primary-2 p-4"
						>
							<View
								className={`mr-3 size-6 shrink-0 items-center justify-center rounded-md border-2 ${
									agreedToTerms
										? "border-primary-1 bg-primary-1"
										: "border-secondary-2 bg-primary-2"
								}`}
							>
								{agreedToTerms && (
									<Ionicons
										name="checkmark"
										size={16}
										color={colors.primary[2]}
									/>
								)}
							</View>
							<View className="flex-1 flex-row flex-wrap">
								<Text className="font-medium text-primary-1 text-sm">
									I agree to the terms and conditions and confirm that the
									information provided is accurate
								</Text>
							</View>
						</Pressable>

						{/* Signature area */}
						<View className="mb-4">
							<Text className="mb-2 font-semibold text-primary-1 text-sm">
								Sign Below
							</Text>
							<Pressable
								onPress={handleOpenSignatureModal}
								className="mb-2 overflow-hidden rounded-xl border-2 border-secondary-2 bg-primary-2"
								style={{
									height: 200,
									borderColor: signature
										? colors.primary[1]
										: colors.secondary[2],
									borderStyle: signature ? "solid" : "dashed",
								}}
							>
								{signature ? (
									<View className="h-full w-full items-center justify-center bg-primary-3">
										<Image
											source={{ uri: signature }}
											contentFit="contain"
											style={{
												width: "100%",
												height: "100%",
											}}
										/>
									</View>
								) : (
									<View className="h-full w-full items-center justify-center bg-primary-3">
										<Ionicons
											name="create-outline"
											size={40}
											color={colors.primary[1]}
										/>
										<Text className="mt-3 font-medium text-primary-1 text-sm">
											Tap to sign
										</Text>
										<Text className="mt-1 text-secondary-1 text-xs">
											Opens in landscape for easier signing
										</Text>
									</View>
								)}
							</Pressable>
							{signature && (
								<Pressable
									onPress={() => {
										setSignature("");
										handleOpenSignatureModal();
									}}
									className="mb-2 self-end"
								>
									<Text className="font-medium text-primary-1 text-sm">
										Re-sign
									</Text>
								</Pressable>
							)}
							<Text
								className="mt-2 text-xs"
								style={{ color: colors.secondary[1] }}
							>
								By signing above, you are providing your electronic signature
							</Text>
						</View>

						{/* Full Screen Signature Modal */}
						<SignatureModal
							visible={showSignatureModal}
							canvasRef={modalSignatureRef}
							onSignatureOK={handleSignature}
							onClose={handleCloseSignatureModal}
							onClear={handleClear}
							onConfirm={handleConfirm}
						/>
					</View>
				</View>
			</ScrollView>

			{/* Continue Button */}
			{signature && agreedToTerms && (
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
								Proceed to Payment
							</Text>
						</Pressable>
					</View>
				</SafeAreaView>
			)}
		</Container>
	);
}
