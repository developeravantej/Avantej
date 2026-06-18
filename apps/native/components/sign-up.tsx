import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
export function SignUp() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSignUp = async () => {
		setIsLoading(true);
		setError(null);

		try {
			await authClient.signUp.email(
				{
					name,
					email,
					password,
				},
				{
					onError: (error) => {
						setError(error.error?.message || "Failed to sign up");
					},
					onSuccess: () => {
						setName("");
						setEmail("");
						setPassword("");
						queryClient.refetchQueries();
						// Show success alert with email verification instructions
						Alert.alert(
							"Account Created",
							"Please check your email to verify your account before signing in.",
							[{ text: "OK" }],
						);
					},
					onFinished: () => {
						// This will be called after onSuccess or onError
					},
				},
			);
		} catch (error) {
			// Handle any unexpected errors that might occur
			setError("An unexpected error occurred");
			console.error("Sign up error:", error);
		} finally {
			// Always reset loading state, even if callbacks throw errors
			setIsLoading(false);
		}
	};

	return (
		<View className="mt-6 p-4 bg-card rounded-lg border border-border">
			<Text className="text-lg font-semibold text-foreground mb-4">
				Create Account
			</Text>

			{error && (
				<View className="mb-4 p-3 bg-destructive/10 rounded-md">
					<Text className="text-destructive text-sm">{error}</Text>
				</View>
			)}

			<TextInput
				className="mb-3 p-4 rounded-md bg-input text-foreground border border-input"
				placeholder="Name"
				value={name}
				onChangeText={setName}
				placeholderTextColor="#9CA3AF"
			/>

			<TextInput
				className="mb-3 p-4 rounded-md bg-input text-foreground border border-input"
				placeholder="Email"
				value={email}
				onChangeText={setEmail}
				placeholderTextColor="#9CA3AF"
				keyboardType="email-address"
				autoCapitalize="none"
			/>

			<TextInput
				className="mb-4 p-4 rounded-md bg-input text-foreground border border-input"
				placeholder="Password"
				value={password}
				onChangeText={setPassword}
				placeholderTextColor="#9CA3AF"
				secureTextEntry
			/>

			<Pressable
				onPress={handleSignUp}
				disabled={isLoading}
				className="bg-primary p-4 rounded-md flex-row justify-center items-center"
			>
				{isLoading ? (
					<ActivityIndicator size="small" color="#fff" />
				) : (
					<Text className="text-primary-foreground font-medium">Sign Up</Text>
				)}
			</Pressable>
		</View>
	);
}
