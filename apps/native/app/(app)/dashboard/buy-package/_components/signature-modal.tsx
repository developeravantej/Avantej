import { Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SignatureCanvas from "react-native-signature-canvas";
import { colors } from "@/lib/colors";

type Props = {
	visible: boolean;
	canvasRef: RefObject<any>;
	onSignatureOK: (signatureData: string) => void;
	onClose: () => void;
	onClear: () => void;
	onConfirm: () => void;
};

export function SignatureModal({
	visible,
	canvasRef,
	onSignatureOK,
	onClose,
	onClear,
	onConfirm,
}: Props) {
	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="fullScreen"
			onRequestClose={onClose}
		>
			<View style={{ flex: 1, backgroundColor: "#ffffff" }}>
				<SafeAreaView style={{ flex: 1 }}>
					{/* Modal Header */}
					<View className="border-secondary-3 border-b bg-primary-2 px-6 py-4">
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
							<Pressable onPress={onClose} className="absolute right-6">
								<Ionicons name="close" size={28} color={colors.primary[1]} />
							</Pressable>
						</View>
						<View className="mt-2 flex-row items-center justify-center">
							<View
								className="mr-2 size-2 rounded-full"
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

					{/* Signature Canvas */}
					<View style={{ flex: 1, backgroundColor: "#ffffff" }}>
						<SignatureCanvas
							ref={canvasRef}
							onOK={onSignatureOK}
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
							style={{ flex: 1 }}
						/>
					</View>

					{/* Modal Footer Buttons */}
					<View className="border-secondary-3 border-t bg-primary-2 px-6 py-4">
						<View className="flex-row justify-end gap-4">
							<Pressable
								onPress={onClear}
								className="rounded-lg border-2 border-secondary-3 bg-primary-2 px-8 py-3"
							>
								<Text
									className="font-semibold text-base"
									style={{ color: colors.primary[1] }}
								>
									Clear
								</Text>
							</Pressable>
							<Pressable
								onPress={onConfirm}
								className="rounded-lg bg-primary-1 px-8 py-3"
							>
								<Text className="font-semibold text-base text-primary-2">
									Confirm Signature
								</Text>
							</Pressable>
						</View>
					</View>
				</SafeAreaView>
			</View>
		</Modal>
	);
}
