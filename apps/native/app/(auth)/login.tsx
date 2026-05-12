import { useAuth } from "@/hooks/useAuth";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Image,
	KeyboardAvoidingView,
	Platform,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { login } = useAuth();

	const handleLogin = async () => {
		if (!email.trim() || !password.trim()) {
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			await login(email, password);
			router.replace("/(app)/dashboard");
		} catch (err: any) {
			setError(err.message || "Failed to sign in");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<SafeAreaView className="flex-1" style={{ backgroundColor: "#F5F5F5" }}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				className="flex-1"
			>
				<View className="flex-1 items-center justify-center px-6">
					{/* Logo Section */}
					<View className="mb-12 items-center">
						<View className="mb-4">
							<Image
								source={require("../../assets/images/Logo-B.png")}
								style={{ width: 64, height: 64 }}
								resizeMode="contain"
							/>
						</View>
						<Text
							className="font-bold text-3xl text-black"
							style={{ fontFamily: "System" }}
						>
							avantej
						</Text>
					</View>

					{/* Welcome Section */}
					<View className="mb-8 w-full items-center">
						<Text className="mb-2 font-bold text-2xl text-black">
							Welcome Back
						</Text>
						<Text className="text-center text-base text-black">
							Please sign in to continue
						</Text>
					</View>

					{/* Login Form Card */}
					<View className="mb-8 w-full">
						<View className="rounded-3xl bg-white p-6 shadow-sm">
							{error && (
								<View className="mb-4 rounded-xl bg-red-50 p-3">
									<Text className="text-center text-sm text-red-600">
										{error}
									</Text>
								</View>
							)}

							{/* Email Input */}
							<Text className="mb-2 font-medium text-base text-black">
								Email
							</Text>
							<TextInput
								className="mb-4 h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-black"
								placeholder="Enter your email"
								placeholderTextColor="#9CA3AF"
								value={email}
								onChangeText={setEmail}
								keyboardType="email-address"
								autoCapitalize="none"
								autoCorrect={false}
							/>

							{/* Password Input */}
							<Text className="mb-2 font-medium text-base text-black">
								Password
							</Text>
							<TextInput
								className="mb-2 h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-black"
								placeholder="Enter your password"
								placeholderTextColor="#9CA3AF"
								value={password}
								onChangeText={setPassword}
								secureTextEntry
							/>

							{/* Forgot Password */}
							<TouchableOpacity
								onPress={() => router.push("/(auth)/forgot-password")}
								className="mb-6 self-end"
							>
								<Text className="text-sm text-gray-500">Forgot Password?</Text>
							</TouchableOpacity>

							{/* Login Button */}
							<TouchableOpacity
								onPress={handleLogin}
								disabled={isLoading || !email.trim() || !password.trim()}
								className="h-14 w-full flex-row items-center justify-center rounded-xl bg-gray-950"
								style={{
									opacity:
										isLoading || !email.trim() || !password.trim() ? 0.6 : 1,
								}}
							>
								{isLoading ? (
									<ActivityIndicator size="small" color="#FFFFFF" />
								) : (
									<Text className="font-medium text-base text-white">
										Sign In
									</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>

					{/* Sign Up Link */}
					<View className="mt-4 flex-row items-center">
						<Text className="text-base text-gray-500">
							Don't have an account?{" "}
						</Text>
						<TouchableOpacity onPress={() => router.push("/(auth)/sign-up")}>
							<Text className="font-medium text-base text-black">Sign Up</Text>
						</TouchableOpacity>
					</View>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
