import { client as _client, queryClient } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

// Cast to any until the backend onboarding router is merged and type-gen regenerated.
// Remove this cast once `packages/api/src/routers/onboarding.ts` is added and type-gen re-runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = _client as any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InviteContext {
	orgName: string;
	branchName: string;
	brandLogoUrl?: string;
}

// ---------------------------------------------------------------------------
// Error screen shown when the invite is invalid / expired
// ---------------------------------------------------------------------------

function InvalidInviteScreen() {
	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
			<View
				style={{
					flex: 1,
					justifyContent: "center",
					alignItems: "center",
					paddingHorizontal: 24,
				}}
			>
				<View
					style={{
						width: 64,
						height: 64,
						borderRadius: 32,
						backgroundColor: "#FEE2E2",
						justifyContent: "center",
						alignItems: "center",
						marginBottom: 24,
					}}
				>
					<Text style={{ fontSize: 28 }}>!</Text>
				</View>
				<Text
					style={{
						fontSize: 22,
						fontWeight: "700",
						color: "#111827",
						textAlign: "center",
						marginBottom: 12,
					}}
				>
					Invalid or Expired Code
				</Text>
				<Text
					style={{
						fontSize: 15,
						color: "#6B7280",
						textAlign: "center",
						lineHeight: 22,
						marginBottom: 32,
					}}
				>
					This QR code is no longer valid. Please ask reception to generate a
					new one.
				</Text>
				<Pressable
					onPress={() => router.replace("/(auth)/login")}
					style={{
						paddingVertical: 14,
						paddingHorizontal: 32,
						backgroundColor: "#111827",
						borderRadius: 12,
					}}
				>
					<Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>
						Back to Sign In
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
	const { token, org } = useLocalSearchParams<{ token: string; org: string }>();

	// Fetch invite context -------------------------------------------------------
	const {
		data: context,
		isPending: contextLoading,
		isError: contextError,
	} = useQuery<InviteContext>({
		queryKey: ["onboarding", "inviteContext", org, token],
		queryFn: () =>
			client.onboarding.getInviteContext({ orgId: org ?? "", token: token ?? "" }),
		enabled: !!org && !!token,
		retry: false,
	});

	// Form state -----------------------------------------------------------------
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [phone, setPhone] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [fieldError, setFieldError] = useState<string | null>(null);

	// Derived helpers ------------------------------------------------------------
	const canSubmit =
		!isSubmitting &&
		fullName.trim().length > 0 &&
		email.trim().length > 0 &&
		password.length >= 8;

	// Submit handler -------------------------------------------------------------
	const handleSubmit = async () => {
		if (!canSubmit) return;
		setFieldError(null);
		setIsSubmitting(true);

		try {
			const result = await client.onboarding.redeemInvite({
				orgId: org ?? "",
				token: token ?? "",
				email: email.trim(),
				password,
				fullName: fullName.trim(),
				...(phone.trim() ? { phone: phone.trim() } : {}),
			});

			// Pick up the session so subsequent oRPC calls include the auth cookie
			// The redeemInvite procedure issues a Better-Auth session token;
			// call signIn.email so the native auth client stores the cookie/token.
			await authClient.signIn.email({
				email: email.trim(),
				password,
			});

			// Bust any cached auth / user-context queries
			queryClient.refetchQueries();

			// Navigate into the buy-package flow (setup is the first step)
			router.replace("/(app)/dashboard/buy-package/setup");
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);

			if (
				message.toLowerCase().includes("already exists") ||
				message.toLowerCase().includes("duplicate")
			) {
				Alert.alert(
					"Account Already Exists",
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
				setFieldError(message || "Something went wrong. Please try again.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	// Loading state while fetching invite context --------------------------------
	if (contextLoading) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
				<View
					style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
				>
					<ActivityIndicator size="large" color="#111827" />
					<Text
						style={{ marginTop: 16, color: "#6B7280", fontSize: 14 }}
					>
						Loading invite...
					</Text>
				</View>
			</SafeAreaView>
		);
	}

	// Show error screen if invite is invalid / expired ---------------------------
	if (contextError || !context) {
		return <InvalidInviteScreen />;
	}

	// Main form ------------------------------------------------------------------
	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={{ flex: 1 }}
			>
				<ScrollView
					contentContainerStyle={{
						flexGrow: 1,
						justifyContent: "center",
						paddingHorizontal: 24,
					}}
					keyboardShouldPersistTaps="handled"
				>
					{/* Branch branding */}
					<View style={{ marginBottom: 32, alignItems: "center" }}>
						<View
							style={{
								width: 64,
								height: 64,
								borderRadius: 16,
								backgroundColor: "#111827",
								justifyContent: "center",
								alignItems: "center",
								marginBottom: 16,
							}}
						>
							<Text
								style={{
									color: "#FFFFFF",
									fontSize: 22,
									fontWeight: "700",
									letterSpacing: 1,
								}}
							>
								A
							</Text>
						</View>
						<Text
							style={{
								fontSize: 22,
								fontWeight: "700",
								color: "#111827",
								textAlign: "center",
								marginBottom: 4,
							}}
						>
							Welcome to {context.branchName}
						</Text>
						<Text
							style={{
								fontSize: 14,
								color: "#6B7280",
								textAlign: "center",
							}}
						>
							{context.orgName}
						</Text>
					</View>

					{/* Section label */}
					<View style={{ marginBottom: 20, alignItems: "center" }}>
						<Text
							style={{
								fontSize: 18,
								fontWeight: "600",
								color: "#111827",
								marginBottom: 4,
							}}
						>
							Create Your Account
						</Text>
						<Text
							style={{
								fontSize: 14,
								color: "#6B7280",
								textAlign: "center",
							}}
						>
							Fill in your details to get started
						</Text>
					</View>

					{/* Form card */}
					<View
						style={{
							borderRadius: 24,
							backgroundColor: "#FFFFFF",
							padding: 24,
							shadowColor: "#000",
							shadowOffset: { width: 0, height: 2 },
							shadowOpacity: 0.06,
							shadowRadius: 8,
							elevation: 3,
							marginBottom: 24,
						}}
					>
						{fieldError && (
							<View
								style={{
									backgroundColor: "#FEF2F2",
									borderRadius: 12,
									padding: 12,
									marginBottom: 16,
								}}
							>
								<Text
									style={{
										color: "#DC2626",
										fontSize: 14,
										textAlign: "center",
									}}
								>
									{fieldError}
								</Text>
							</View>
						)}

						{/* Full name */}
						<Text
							style={{
								fontSize: 15,
								fontWeight: "500",
								color: "#111827",
								marginBottom: 6,
							}}
						>
							Full Name
						</Text>
						<TextInput
							style={{
								height: 52,
								borderWidth: 1,
								borderColor: "#E5E7EB",
								borderRadius: 12,
								paddingHorizontal: 16,
								fontSize: 15,
								color: "#111827",
								backgroundColor: "#FFFFFF",
								marginBottom: 16,
							}}
							placeholder="Enter your full name"
							placeholderTextColor="#9CA3AF"
							value={fullName}
							onChangeText={setFullName}
							autoCapitalize="words"
							returnKeyType="next"
						/>

						{/* Email */}
						<Text
							style={{
								fontSize: 15,
								fontWeight: "500",
								color: "#111827",
								marginBottom: 6,
							}}
						>
							Email
						</Text>
						<TextInput
							style={{
								height: 52,
								borderWidth: 1,
								borderColor: "#E5E7EB",
								borderRadius: 12,
								paddingHorizontal: 16,
								fontSize: 15,
								color: "#111827",
								backgroundColor: "#FFFFFF",
								marginBottom: 16,
							}}
							placeholder="Enter your email"
							placeholderTextColor="#9CA3AF"
							value={email}
							onChangeText={setEmail}
							keyboardType="email-address"
							autoCapitalize="none"
							autoCorrect={false}
							returnKeyType="next"
						/>

						{/* Password */}
						<Text
							style={{
								fontSize: 15,
								fontWeight: "500",
								color: "#111827",
								marginBottom: 6,
							}}
						>
							Password
						</Text>
						<TextInput
							style={{
								height: 52,
								borderWidth: 1,
								borderColor: "#E5E7EB",
								borderRadius: 12,
								paddingHorizontal: 16,
								fontSize: 15,
								color: "#111827",
								backgroundColor: "#FFFFFF",
								marginBottom: 16,
							}}
							placeholder="At least 8 characters"
							placeholderTextColor="#9CA3AF"
							value={password}
							onChangeText={setPassword}
							secureTextEntry
							returnKeyType="next"
						/>

						{/* Phone (optional) */}
						<Text
							style={{
								fontSize: 15,
								fontWeight: "500",
								color: "#111827",
								marginBottom: 6,
							}}
						>
							Phone{" "}
							<Text style={{ color: "#9CA3AF", fontWeight: "400" }}>
								(optional)
							</Text>
						</Text>
						<TextInput
							style={{
								height: 52,
								borderWidth: 1,
								borderColor: "#E5E7EB",
								borderRadius: 12,
								paddingHorizontal: 16,
								fontSize: 15,
								color: "#111827",
								backgroundColor: "#FFFFFF",
								marginBottom: 24,
							}}
							placeholder="+60 12-345 6789"
							placeholderTextColor="#9CA3AF"
							value={phone}
							onChangeText={setPhone}
							keyboardType="phone-pad"
							returnKeyType="done"
						/>

						{/* Submit button */}
						<Pressable
							onPress={handleSubmit}
							disabled={!canSubmit}
							style={{
								height: 52,
								borderRadius: 12,
								backgroundColor: "#111827",
								justifyContent: "center",
								alignItems: "center",
								opacity: canSubmit ? 1 : 0.5,
							}}
						>
							{isSubmitting ? (
								<ActivityIndicator size="small" color="#FFFFFF" />
							) : (
								<Text
									style={{
										color: "#FFFFFF",
										fontSize: 15,
										fontWeight: "600",
									}}
								>
									Create Account & Continue
								</Text>
							)}
						</Pressable>
					</View>

					{/* Sign in link */}
					<View
						style={{
							flexDirection: "row",
							justifyContent: "center",
							alignItems: "center",
							marginBottom: 32,
						}}
					>
						<Text style={{ fontSize: 14, color: "#6B7280" }}>
							Already have an account?{" "}
						</Text>
						<Pressable onPress={() => router.replace("/(auth)/login")}>
							<Text
								style={{
									fontSize: 14,
									fontWeight: "600",
									color: "#111827",
								}}
							>
								Sign In
							</Text>
						</Pressable>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
