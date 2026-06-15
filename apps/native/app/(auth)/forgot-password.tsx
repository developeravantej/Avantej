import { useAuth } from "@/hooks/useAuth";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ForgotPasswordScreen() {
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [sent, setSent] = useState(false);
	const { forgotPassword } = useAuth();

	const handleSubmit = async () => {
		if (!email.trim()) return;

		setIsLoading(true);
		try {
			await forgotPassword(email);
		} catch {
			// Always show success to prevent email enumeration
		} finally {
			setIsLoading(false);
			setSent(true);
		}
	};

	if (sent) {
		return (
			<SafeAreaView className="flex-1" style={{ backgroundColor: "#F5F5F5" }}>
				<View className="flex-1 items-center justify-center px-6">
					<View className="mb-6">
						<Ionicons name="checkmark-circle-outline" size={80} color="#000" />
					</View>
					<Text className="mb-3 font-bold text-2xl text-black">
						Check Your Email
					</Text>
					<Text className="mb-8 text-center text-base text-zinc-600">
						If an account exists with that email, we've sent password reset
						instructions.
					</Text>
					<Pressable
						onPress={() => router.replace("/(auth)/login")}
						className="h-14 w-full flex-row items-center justify-center rounded-xl bg-zinc-950"
					>
						<Text className="font-medium text-base text-white">
							Back to Sign In
						</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView className="flex-1" style={{ backgroundColor: "#F5F5F5" }}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				className="flex-1"
			>
				<View className="flex-1 items-center justify-center px-6">
					{/* Back Button */}
					<View className="absolute left-6 top-4">
						<Pressable onPress={() => router.back()}>
							<Ionicons name="arrow-back" size={24} color="#000" />
						</Pressable>
					</View>

					<View className="mb-6">
						<Ionicons name="lock-closed-outline" size={64} color="#000000" />
					</View>

					<Text className="mb-3 font-bold text-2xl text-black">
						Forgot Password?
					</Text>
					<Text className="mb-8 text-center text-base text-zinc-600">
						Enter your email and we'll send you instructions to reset your
						password.
					</Text>

					<View className="w-full">
						<View className="rounded-3xl bg-white p-6 shadow-sm">
							<Text className="mb-2 font-medium text-base text-black">
								Email
							</Text>
							<TextInput
								className="mb-6 h-14 w-full rounded-xl border border-zinc-200 bg-white px-4 text-base text-black"
								placeholder="Enter your email"
								placeholderTextColor="#9CA3AF"
								value={email}
								onChangeText={setEmail}
								keyboardType="email-address"
								autoCapitalize="none"
								autoCorrect={false}
							/>

							<Pressable
								onPress={handleSubmit}
								disabled={isLoading || !email.trim()}
								className="h-14 w-full flex-row items-center justify-center rounded-xl bg-zinc-950"
								style={{
									opacity: isLoading || !email.trim() ? 0.6 : 1,
								}}
							>
								{isLoading ? (
									<ActivityIndicator size="small" color="#FFFFFF" />
								) : (
									<Text className="font-medium text-base text-white">
										Send Reset Link
									</Text>
								)}
							</Pressable>
						</View>
					</View>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
