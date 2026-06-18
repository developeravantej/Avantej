import RegistrationForm from "@/components/registration-form";
import { OrganizationProvider } from "@/contexts/organization-context";
import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/lib/colors";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function AppLayout() {
	const { isAuthenticated, isPending, user } = useAuth();
	// Invite token forwarded from the QR onboarding deep link (token param in URL).
	const { token: inviteToken } = useLocalSearchParams<{ token?: string }>();
	const userRole =
		user && typeof user === "object" && "role" in user
			? (user as Record<string, unknown>).role
			: undefined;

	if (isPending) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: "center",
					alignItems: "center",
					backgroundColor: "#F5F5F5",
				}}
			>
				<ActivityIndicator size="large" color="#000000" />
			</View>
		);
	}

	if (!isAuthenticated) {
		return <Redirect href="/(auth)/login" />;
	}

	if (!userRole) {
		return (
			<View style={{ flex: 1, backgroundColor: colors.secondary[3] }}>
				<RegistrationForm inviteToken={inviteToken ?? ""} />
			</View>
		);
	}

	return (
		<OrganizationProvider isAuthenticated={isAuthenticated}>
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Screen name="dashboard" />
				<Stack.Screen
					name="modal"
					options={{ title: "Modal", presentation: "modal" }}
				/>
			</Stack>
		</OrganizationProvider>
	);
}
