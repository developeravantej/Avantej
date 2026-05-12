import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
	const { isAuthenticated, isPending } = useAuth();

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

	if (isAuthenticated) {
		return <Redirect href="/(app)/dashboard" />;
	}

	return <Redirect href="/(auth)/login" />;
}
