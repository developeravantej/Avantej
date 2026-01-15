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
	const [phoneNumber, setPhoneNumber] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleLogin = async () => {
		if (!phoneNumber.trim()) {
			return;
		}

		setIsLoading(true);
		// TODO: Implement OTP login flow
		// For now, just navigate to home page
		setTimeout(() => {
			setIsLoading(false);
			router.replace("/dashboard");
		}, 500);
	};

	const handleSignUp = () => {
		router.push("/sign-up");
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
						{/* Logo Icon */}
						<View className="mb-4">
							<Image
								source={require("../assets/images/Logo-B.png")}
								style={{ width: 64, height: 64 }}
								resizeMode="contain"
							/>
						</View>
						{/* Brand Name */}
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
							Please enter your phone number to continue
						</Text>
					</View>

					{/* Login Form Card */}
					<View className="mb-8 w-full">
						<View className="rounded-3xl bg-white p-6 shadow-sm">
							{/* Phone Number Label */}
							<Text className="mb-3 font-medium text-base text-black">
								Phone Number
							</Text>
							{/* Phone Number Input */}
							<View className="mb-6 w-full">
								<TextInput
									className="h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-black"
									placeholder="Enter your phone number"
									placeholderTextColor="#9CA3AF"
									value={phoneNumber}
									onChangeText={setPhoneNumber}
									keyboardType="phone-pad"
									autoCapitalize="none"
									autoCorrect={false}
								/>
							</View>

							{/* Login Button */}
							<TouchableOpacity
								onPress={handleLogin}
								disabled={isLoading || !phoneNumber.trim()}
								className="h-14 w-full flex-row items-center justify-center rounded-xl bg-black"
								style={{
									opacity: isLoading || !phoneNumber.trim() ? 0.6 : 1,
								}}
							>
								{isLoading ? (
									<ActivityIndicator size="small" color="#FFFFFF" />
								) : (
									<Text className="font-medium text-base text-white">
										Login with OTP
									</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>

					{/* Sign Up Link */}
					<View className="mt-8 flex-row items-center">
						<Text className="text-base text-gray-500">
							Don't have an account?{" "}
						</Text>
						<TouchableOpacity onPress={handleSignUp}>
							<Text className="text-base text-gray-500">Sign Up</Text>
						</TouchableOpacity>
					</View>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
