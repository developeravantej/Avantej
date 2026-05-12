import { useAuth } from "@/hooks/useAuth";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SignUpScreen() {
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { signUp } = useAuth();

	const handleSignUp = async () => {
		if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
			return;
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			await signUp(`${firstName.trim()} ${lastName.trim()}`, email, password, firstName.trim(), lastName.trim());
			router.replace({
				pathname: "/(auth)/verify-email",
				params: { email },
			});
		} catch (err: any) {
			if (err.message?.includes("already exists")) {
				Alert.alert(
					"Account Exists",
					"An account with this email already exists. Would you like to sign in instead?",
					[
						{ text: "Cancel", style: "cancel" },
						{
							text: "Sign In",
							onPress: () => router.replace("/(auth)/login"),
						},
					],
				);
			} else {
				setError(err.message || "Failed to create account");
			}
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
				<ScrollView
					contentContainerStyle={{
						flexGrow: 1,
						justifyContent: "center",
						paddingHorizontal: 24,
					}}
					keyboardShouldPersistTaps="handled"
				>
					{/* Logo Section */}
					<View className="mb-10 items-center">
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

					{/* Header */}
					<View className="mb-6 w-full items-center">
						<Text className="mb-2 font-bold text-2xl text-black">
							Create Account
						</Text>
						<Text className="text-center text-base text-black">
							Enter your details to get started
						</Text>
					</View>

					{/* Form Card */}
					<View className="mb-8 w-full">
						<View className="rounded-3xl bg-white p-6 shadow-sm">
							{error && (
								<View className="mb-4 rounded-xl bg-red-50 p-3">
									<Text className="text-center text-sm text-red-600">
										{error}
									</Text>
								</View>
							)}

							<Text className="mb-2 font-medium text-base text-black">
								First Name
							</Text>
							<TextInput
								className="mb-4 h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-black"
								placeholder="Enter your first name"
								placeholderTextColor="#9CA3AF"
								value={firstName}
								onChangeText={setFirstName}
								autoCapitalize="words"
							/>

							<Text className="mb-2 font-medium text-base text-black">
								Last Name
							</Text>
							<TextInput
								className="mb-4 h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-black"
								placeholder="Enter your last name"
								placeholderTextColor="#9CA3AF"
								value={lastName}
								onChangeText={setLastName}
								autoCapitalize="words"
							/>

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

							<Text className="mb-2 font-medium text-base text-black">
								Password
							</Text>
							<TextInput
								className="mb-4 h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-black"
								placeholder="At least 8 characters"
								placeholderTextColor="#9CA3AF"
								value={password}
								onChangeText={setPassword}
								secureTextEntry
							/>

							<Text className="mb-2 font-medium text-base text-black">
								Confirm Password
							</Text>
							<TextInput
								className="mb-6 h-14 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-black"
								placeholder="Confirm your password"
								placeholderTextColor="#9CA3AF"
								value={confirmPassword}
								onChangeText={setConfirmPassword}
								secureTextEntry
							/>

							<Pressable
								onPress={handleSignUp}
								disabled={
									isLoading ||
									!firstName.trim() ||
									!lastName.trim() ||
									!email.trim() ||
									!password.trim() ||
									!confirmPassword.trim()
								}
								className="h-14 w-full flex-row items-center justify-center rounded-xl bg-gray-950"
								style={{
									opacity:
										isLoading ||
										!firstName.trim() ||
										!lastName.trim() ||
										!email.trim() ||
										!password.trim() ||
										!confirmPassword.trim()
											? 0.6
											: 1,
								}}
							>
								{isLoading ? (
									<ActivityIndicator size="small" color="#FFFFFF" />
								) : (
									<Text className="font-medium text-base text-white">
										Create Account
									</Text>
								)}
							</Pressable>
						</View>
					</View>

					{/* Sign In Link */}
					<View className="mb-8 flex-row items-center justify-center">
						<Text className="text-base text-gray-500">
							Already have an account?{" "}
						</Text>
						<Pressable onPress={() => router.replace("/(auth)/login")}>
							<Text className="font-medium text-base text-black">Sign In</Text>
						</Pressable>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
