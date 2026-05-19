import { authClient } from "@/lib/auth-client";
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

export default function SignInLinkScreen() {
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async () => {
		const trimmed = email.trim();
		if (!trimmed) return;

		setIsLoading(true);
		setError(null);
		try {
			const result = await authClient.signIn.magicLink({
				email: trimmed,
				callbackURL: "/(app)/dashboard",
			});

			if (result.error) {
				setError(result.error.message || "Failed to send sign-in link");
				return;
			}

			setSentTo(trimmed);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send sign-in link");
		} finally {
			setIsLoading(false);
		}
	};

	if (sentTo) {
		return (
			<SafeAreaView className="flex-1" style={{ backgroundColor: "#F5F5F5" }}>
				<View className="flex-1 items-center justify-center px-6">
					<View className="mb-6">
						<Ionicons name="mail-outline" size={80} color="#000" />
					</View>
					<Text className="mb-3 font-bold text-2xl text-black">
						Check Your Inbox
					</Text>
					<Text className="mb-8 text-center text-base text-zinc-600">
						We sent a sign-in link to {sentTo}. The link is valid for 30
						minutes and can only be used once.
					</Text>
					<Pressable
						onPress={() => {
							setSentTo(null);
							setEmail("");
						}}
						className="mb-3 h-14 w-full flex-row items-center justify-center rounded-xl border border-zinc-200 bg-white"
					>
						<Text className="font-medium text-base text-black">
							Use a different email
						</Text>
					</Pressable>
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
					<View className="absolute left-6 top-4">
						<Pressable onPress={() => router.back()}>
							<Ionicons name="arrow-back" size={24} color="#000" />
						</Pressable>
					</View>

					<View className="mb-6">
						<Ionicons name="mail-outline" size={64} color="#000000" />
					</View>

					<Text className="mb-3 font-bold text-2xl text-black">
						Sign in by email
					</Text>
					<Text className="mb-8 text-center text-base text-zinc-600">
						Enter your email and we'll send you a one-click sign-in link.
					</Text>

					<View className="w-full">
						<View className="rounded-3xl bg-white p-6 shadow-sm">
							<Text className="mb-2 font-medium text-base text-black">
								Email
							</Text>
							<TextInput
								className="mb-2 h-14 w-full rounded-xl border border-zinc-200 bg-white px-4 text-base text-black"
								placeholder="Enter your email"
								placeholderTextColor="#9CA3AF"
								value={email}
								onChangeText={(v) => {
									setEmail(v);
									if (error) setError(null);
								}}
								keyboardType="email-address"
								autoCapitalize="none"
								autoCorrect={false}
							/>

							{error ? (
								<Text className="mb-4 text-sm text-red-500">{error}</Text>
							) : (
								<View className="mb-4" />
							)}

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
										Send sign-in link
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
