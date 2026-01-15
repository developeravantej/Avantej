import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SignUpScreen() {
	const [phoneNumber, setPhoneNumber] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSignUp = async () => {
		if (!phoneNumber.trim()) {
			return;
		}

		setIsLoading(true);
		// TODO: Implement sign-up flow
		setTimeout(() => {
			setIsLoading(false);
		}, 1000);
	};

	const handleSignIn = () => {
		router.back();
	};

	return (
		<SafeAreaView className="flex-1 bg-white">
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				className="flex-1"
			>
				<View className="flex-1 items-center justify-center px-6">
					{/* Logo Section */}
					<View className="mb-12 items-center">
						<View className="mb-4">
							<Ionicons name="finger-print" size={64} color="#000000" />
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
							Create Account
						</Text>
						<Text className="text-center text-base text-black">
							Please enter your phone number to get started
						</Text>
					</View>

					{/* Phone Number Input */}
					<View className="mb-6 w-full">
						<TextInput
							className="h-14 w-full rounded-lg bg-gray-100 px-4 text-base text-black"
							placeholder="Phone Number"
							placeholderTextColor="#A0A0A0"
							value={phoneNumber}
							onChangeText={setPhoneNumber}
							keyboardType="phone-pad"
							autoCapitalize="none"
							autoCorrect={false}
						/>
					</View>

					{/* Sign Up Button */}
					<TouchableOpacity
						onPress={handleSignUp}
						disabled={isLoading || !phoneNumber.trim()}
						className="h-14 w-full flex-row items-center justify-center rounded-lg bg-black"
						style={{
							opacity: isLoading || !phoneNumber.trim() ? 0.6 : 1,
						}}
					>
						{isLoading ? (
							<ActivityIndicator size="small" color="#FFFFFF" />
						) : (
							<Text className="font-medium text-base text-white">Sign Up</Text>
						)}
					</TouchableOpacity>

					{/* Sign In Link */}
					<View className="mt-8 flex-row items-center">
						<Text className="text-base text-gray-500">
							Already have an account?{" "}
						</Text>
						<TouchableOpacity onPress={handleSignIn}>
							<Text className="text-base text-gray-500">Sign In</Text>
						</TouchableOpacity>
					</View>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
