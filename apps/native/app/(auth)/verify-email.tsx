import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";

export default function VerifyEmailScreen() {
	const { email } = useLocalSearchParams<{ email: string }>();
	const [isResending, setIsResending] = useState(false);
	const [resent, setResent] = useState(false);

	const handleResend = async () => {
		if (!email) return;
		setIsResending(true);
		try {
			await authClient.sendVerificationEmail({ email });
			setResent(true);
			setTimeout(() => setResent(false), 30000);
		} catch {
			// Silently fail — don't reveal if email exists
		} finally {
			setIsResending(false);
		}
	};

	return (
		<SafeAreaView className="flex-1" style={{ backgroundColor: "#F5F5F5" }}>
			<View className="flex-1 items-center justify-center px-6">
				<View className="mb-6">
					<Ionicons name="mail-outline" size={80} color="#000000" />
				</View>

				<Text className="mb-3 font-bold text-2xl text-black">
					Check Your Email
				</Text>

				<Text className="mb-2 text-center text-base text-zinc-600">
					We've sent a verification link to
				</Text>
				{email && (
					<Text className="mb-8 text-center font-semibold text-base text-black">
						{email}
					</Text>
				)}

				<Text className="mb-8 text-center text-sm text-zinc-500">
					Click the link in your email to verify your account, then come back
					here to sign in.
				</Text>

				<View className="w-full">
					<Pressable
						onPress={() => router.replace("/(auth)/login")}
						className="mb-4 h-14 w-full flex-row items-center justify-center rounded-xl bg-zinc-950"
					>
						<Text className="font-medium text-base text-white">
							Go to Sign In
						</Text>
					</Pressable>

					<Pressable
						onPress={handleResend}
						disabled={isResending || resent}
						className="h-14 w-full flex-row items-center justify-center rounded-xl border border-zinc-300"
						style={{ opacity: isResending || resent ? 0.6 : 1 }}
					>
						{isResending ? (
							<ActivityIndicator size="small" color="#000000" />
						) : (
							<Text className="font-medium text-base text-black">
								{resent ? "Email Sent" : "Resend Verification Email"}
							</Text>
						)}
					</Pressable>
				</View>
			</View>
		</SafeAreaView>
	);
}
