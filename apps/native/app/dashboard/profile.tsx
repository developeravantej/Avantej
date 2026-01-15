import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	ScrollView,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

export default function ProfileScreen() {
	// User data
	const [userData, setUserData] = useState({
		fullName: "Alex Johnson",
		email: "alex.johnson@example.com",
		phoneNumber: "+1 (555) 123-4567",
		memberSince: "January 2024",
	});

	// Notification preferences
	const [notifications, setNotifications] = useState({
		email: true,
		sms: true,
		push: false,
	});

	const handleSaveChanges = () => {
		// TODO: Implement save functionality
		console.log("Saving changes...", userData);
	};

	const toggleNotification = (type: keyof typeof notifications) => {
		setNotifications((prev) => ({
			...prev,
			[type]: !prev[type],
		}));
	};

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 8 }}
				showsVerticalScrollIndicator={false}
			>
				<View className="px-4 pt-4">
					{/* User Summary Section */}
					<View className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
						<View className="flex-row items-center">
							{/* Avatar */}
							<View
								className="mr-4 h-16 w-16 items-center justify-center rounded-full"
								style={{ backgroundColor: colors.secondary[2] }}
							>
								<Ionicons name="person" size={32} color={colors.secondary[1]} />
							</View>
							{/* User Info */}
							<View className="flex-1">
								<Text
									className="mb-1 font-bold text-xl"
									style={{ color: colors.primary[1] }}
								>
									{userData.fullName}
								</Text>
								<Text
									className="text-sm"
									style={{ color: colors.secondary[1] }}
								>
									Member since {userData.memberSince}
								</Text>
							</View>
						</View>
					</View>

					{/* Personal Information Section */}
					<View className="mb-4">
						<Text
							className="mb-3 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.secondary[1] }}
						>
							PERSONAL INFORMATION
						</Text>
						<View className="rounded-2xl bg-white p-4 shadow-sm">
							{/* Full Name */}
							<View className="mb-4">
								<Text
									className="mb-2 font-medium text-base"
									style={{ color: colors.primary[1] }}
								>
									Full Name
								</Text>
								<TextInput
									value={userData.fullName}
									onChangeText={(text) =>
										setUserData({ ...userData, fullName: text })
									}
									className="rounded-xl bg-gray-100 p-3"
									style={{
										color: colors.primary[1],
										fontSize: 16,
									}}
								/>
							</View>

							{/* Email */}
							<View className="mb-4">
								<Text
									className="mb-2 font-medium text-base"
									style={{ color: colors.primary[1] }}
								>
									Email
								</Text>
								<TextInput
									value={userData.email}
									onChangeText={(text) =>
										setUserData({ ...userData, email: text })
									}
									keyboardType="email-address"
									autoCapitalize="none"
									className="rounded-xl bg-gray-100 p-3"
									style={{
										color: colors.primary[1],
										fontSize: 16,
									}}
								/>
							</View>

							{/* Phone Number */}
							<View className="mb-4">
								<Text
									className="mb-2 font-medium text-base"
									style={{ color: colors.primary[1] }}
								>
									Phone Number
								</Text>
								<TextInput
									value={userData.phoneNumber}
									onChangeText={(text) =>
										setUserData({ ...userData, phoneNumber: text })
									}
									keyboardType="phone-pad"
									className="rounded-xl bg-gray-100 p-3"
									style={{
										color: colors.primary[1],
										fontSize: 16,
									}}
								/>
							</View>

							{/* Save Changes Button */}
							<TouchableOpacity
								onPress={handleSaveChanges}
								className="mt-2 items-center justify-center rounded-xl bg-blue-600 py-4"
								style={{ backgroundColor: "#2563EB" }}
							>
								<Text className="font-semibold text-base text-white">
									Save Changes
								</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Notification Preferences Section */}
					<View className="mb-4">
						<Text
							className="mb-3 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.secondary[1] }}
						>
							NOTIFICATION PREFERENCES
						</Text>
						<View className="rounded-2xl bg-white shadow-sm">
							{/* Email Notifications */}
							<View className="border-gray-200 border-b p-4">
								<View className="flex-row items-center justify-between">
									<View className="mr-4 flex-1">
										<Text
											className="mb-1 font-semibold text-base"
											style={{ color: colors.primary[1] }}
										>
											Email Notifications
										</Text>
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Receive updates about your workouts and bookings
										</Text>
									</View>
									<Switch
										value={notifications.email}
										onValueChange={() => toggleNotification("email")}
										trackColor={{
											false: colors.secondary[3],
											true: "#2563EB",
										}}
										thumbColor={colors.primary[2]}
									/>
								</View>
							</View>

							{/* SMS Notifications */}
							{/* <View className="p-4 border-b border-gray-200">
								<View className="flex-row items-center justify-between">
									<View className="flex-1 mr-4">
										<Text
											className="text-base font-semibold mb-1"
											style={{ color: colors.primary[1] }}
										>
											SMS Notifications
										</Text>
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Receive text message reminders
										</Text>
									</View>
									<Switch
										value={notifications.sms}
										onValueChange={() => toggleNotification("sms")}
										trackColor={{
											false: colors.secondary[3],
											true: "#2563EB",
										}}
										thumbColor={colors.primary[2]}
									/>
								</View>
							</View> */}

							{/* Push Notifications */}
							<View className="p-4">
								<View className="flex-row items-center justify-between">
									<View className="mr-4 flex-1">
										<Text
											className="mb-1 font-semibold text-base"
											style={{ color: colors.primary[1] }}
										>
											Push Notifications
										</Text>
										<Text
											className="text-sm"
											style={{ color: colors.secondary[1] }}
										>
											Get instant alerts on your device
										</Text>
									</View>
									<Switch
										value={notifications.push}
										onValueChange={() => toggleNotification("push")}
										trackColor={{
											false: colors.secondary[3],
											true: "#2563EB",
										}}
										thumbColor={colors.primary[2]}
									/>
								</View>
							</View>
						</View>
					</View>

					{/* Account Section */}
					<View>
						<Text
							className="mb-3 font-bold text-sm uppercase tracking-wide"
							style={{ color: colors.secondary[1] }}
						>
							ACCOUNT
						</Text>
						<View className="rounded-2xl bg-white shadow-sm">
							{/* Change Password */}
							<TouchableOpacity className="flex-row items-center border-gray-200 border-b p-4">
								<Ionicons
									name="lock-closed-outline"
									size={20}
									color={colors.primary[1]}
								/>
								<Text
									className="ml-3 flex-1 text-base"
									style={{ color: colors.primary[1] }}
								>
									Change Password
								</Text>
								<Ionicons
									name="chevron-forward"
									size={20}
									color={colors.secondary[1]}
								/>
							</TouchableOpacity>

							{/* Help & Support */}
							<TouchableOpacity className="flex-row items-center border-gray-200 border-b p-4">
								<Ionicons
									name="help-circle-outline"
									size={20}
									color={colors.primary[1]}
								/>
								<Text
									className="ml-3 flex-1 text-base"
									style={{ color: colors.primary[1] }}
								>
									Help & Support
								</Text>
								<Ionicons
									name="chevron-forward"
									size={20}
									color={colors.secondary[1]}
								/>
							</TouchableOpacity>

							{/* Terms & Privacy */}
							<TouchableOpacity className="flex-row items-center p-4">
								<Ionicons
									name="document-text-outline"
									size={20}
									color={colors.primary[1]}
								/>
								<Text
									className="ml-3 flex-1 text-base"
									style={{ color: colors.primary[1] }}
								>
									Terms & Privacy
								</Text>
								<Ionicons
									name="chevron-forward"
									size={20}
									color={colors.secondary[1]}
								/>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</ScrollView>
		</Container>
	);
}
