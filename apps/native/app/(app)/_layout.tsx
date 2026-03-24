import RegistrationForm from "@/components/registration-form";
import { useAuth } from "@/hooks/useAuth";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AppLayout() {
	const { isAuthenticated, isPending, user } = useAuth();
	const userRole =
		user && "role" in user ? (user as { role?: string | null }).role : undefined;

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
			<SafeAreaView style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
				<RegistrationForm />
			</SafeAreaView>
		);
	}

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="dashboard" />
			<Stack.Screen
				name="modal"
				options={{ title: "Modal", presentation: "modal" }}
			/>
		</Stack>
	);
}
