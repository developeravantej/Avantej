import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	Alert,
	Linking,
	Modal,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { TabContainer, useTabBarHeight } from "@/components/container";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { authClient } from "@/lib/auth-client";
import { colors } from "@/lib/colors";
import { fonts } from "@/lib/font";
import { client, orpc } from "@/utils/orpc";

export default function ProfileScreen() {
	const { user, logout } = useAuth();
	const { organizationId } = useOrganization();
	const queryClient = useQueryClient();
	const tabBarHeight = useTabBarHeight();

	const [showPasswordModal, setShowPasswordModal] = useState(false);

	// Fetch customer profile
	const { data: profile } = useQuery({
		...orpc.customerProfiles.get.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	// Fetch notification preferences
	const { data: notifPrefs } = useQuery({
		...orpc.notificationPreferences.get.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	// Fetch active packages for stats
	const { data: activePackages } = useQuery({
		...orpc.packageInstances.getActiveForClient.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	// Fetch completed appointments for stats
	const { data: completedAppointments } = useQuery({
		...orpc.appointments.listForUser.queryOptions({
			input: { organizationId, status: "completed" },
		}),
		enabled: !!organizationId,
	});

	const userName = user?.name ?? "";
	const userInitials = userName
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const memberSince = user?.createdAt
		? new Date(user.createdAt).toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
			})
		: "";

	// Stats
	const sessionsCount = Array.isArray(completedAppointments)
		? completedAppointments.length
		: 0;
	const packagesCount = Array.isArray(activePackages)
		? activePackages.length
		: 0;
	// Sum remaining credits across active packages
	const creditsCount = Array.isArray(activePackages)
		? activePackages.reduce(
				(sum: number, pkg: any) => sum + (pkg.creditsRemaining ?? 0),
				0,
			)
		: 0;

	const handleToggleNotifPref = async (
		key: "emailEnabled" | "pushEnabled" | "smsEnabled",
		value: boolean,
	) => {
		try {
			await client.notificationPreferences.update({
				organizationId,
				[key]: value,
			});
			queryClient.invalidateQueries({
				predicate: (q) =>
					JSON.stringify(q.queryKey).includes("notificationPreferences"),
			});
		} catch {
			Alert.alert("Error", "Failed to update preference");
		}
	};

	const handleLogout = () => {
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign Out",
				style: "destructive",
				onPress: () => logout(),
			},
		]);
	};

	return (
		<TabContainer>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: tabBarHeight + 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Profile Hero */}
				<View className="items-center pt-8 pb-2 px-8">
					{/* Avatar */}
					<View
						className="mb-4 h-14 w-14 items-center justify-center rounded-full"
						style={{ backgroundColor: colors.primary[1] }}
					>
						<Text
							style={{
								fontFamily: fonts.heading,
								fontSize: 18,
								color: colors.primary[2],
								letterSpacing: 0.5,
							}}
						>
							{userInitials || "?"}
						</Text>
					</View>

					{/* Name */}
					<Text
						style={{
							fontFamily: fonts.heading,
							fontSize: 22,
							color: colors.primary[1],
							letterSpacing: -0.4,
							marginBottom: 4,
						}}
					>
						{userName || "User"}
					</Text>

					{/* Member since pill */}
					{memberSince ? (
						<View
							className="flex-row items-center mt-2"
							style={{
								backgroundColor: colors.primary[3],
								borderRadius: 999,
								paddingHorizontal: 12,
								paddingVertical: 4,
							}}
						>
							<View
								style={{
									width: 5,
									height: 5,
									borderRadius: 2.5,
									backgroundColor: colors.secondary[1],
									marginRight: 5,
								}}
							/>
							<Text
								style={{
									fontFamily: fonts.body,
									fontSize: 11,
									color: colors.secondary[1],
								}}
							>
								Since {memberSince}
							</Text>
						</View>
					) : null}
				</View>

				{/* Stats Section */}
				<View className="flex-row items-center justify-center px-6 pt-8 pb-7">
					<StatItem value={sessionsCount} label="Sessions" showDivider />
					<StatItem value={packagesCount} label="Packages" showDivider />
					<StatItem value={creditsCount} label="Credits" />
				</View>

				{/* Divider */}
				<View
					style={{
						height: 1,
						backgroundColor: colors.primary[3],
						marginHorizontal: 24,
					}}
				/>

				{/* Account Section */}
				<SectionHeader label="Account" />

				<BareRow
					icon="person-outline"
					label="Personal Information"
					onPress={() => setShowPasswordModal(true)}
				/>
				<BareRow
					icon="card-outline"
					label="Payment Methods"
					onPress={() => {}}
				/>
				<BareRow
					icon="notifications-outline"
					label="Notifications"
					onPress={() => {}}
				/>
				<BareRow
					icon="globe-outline"
					label="Language"
					onPress={() => {}}
				/>

				{/* Zone Divider */}
				<View
					style={{
						height: 1,
						backgroundColor: colors.primary[3],
						marginVertical: 4,
					}}
				/>

				{/* Support Section */}
				<SectionHeader label="Support" />

				<BareRow
					icon="help-circle-outline"
					label="Help & Support"
					onPress={() => Linking.openURL("mailto:support@avantej.com")}
				/>
				<BareRow
					icon="shield-outline"
					label="Privacy Policy"
					onPress={() => Linking.openURL("https://avantej.com/privacy")}
				/>
				<BareRow
					icon="document-text-outline"
					label="Terms of Service"
					onPress={() => Linking.openURL("https://avantej.com/terms")}
				/>

				{/* Divider before sign out */}
				<View
					style={{
						height: 1,
						backgroundColor: colors.primary[3],
						marginHorizontal: 24,
						marginTop: 8,
					}}
				/>

				{/* Sign Out */}
				<TouchableOpacity
					onPress={handleLogout}
					activeOpacity={0.7}
					className="flex-row items-center px-6 py-4 mt-1"
					style={{ gap: 14 }}
				>
					<Ionicons
						name="log-out-outline"
						size={20}
						color="#B91C1C"
					/>
					<Text
						style={{
							fontFamily: fonts.body,
							fontSize: 14,
							color: "#B91C1C",
						}}
					>
						Sign Out
					</Text>
				</TouchableOpacity>

				{/* Version Footer */}
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 11,
						color: "#D4D4D4",
						textAlign: "center",
						paddingTop: 24,
						paddingBottom: 28,
					}}
				>
					v1.0.0
				</Text>
			</ScrollView>

			{/* Change Password Modal */}
			<ChangePasswordModal
				visible={showPasswordModal}
				onClose={() => setShowPasswordModal(false)}
			/>
		</TabContainer>
	);
}

/* ─── Sub-components ─── */

function StatItem({
	value,
	label,
	showDivider,
}: {
	value: number;
	label: string;
	showDivider?: boolean;
}) {
	return (
		<View className="flex-1 items-center" style={{ position: "relative" }}>
			<Text
				style={{
					fontFamily: fonts.heading,
					fontSize: 34,
					color: colors.primary[1],
					lineHeight: 34,
					letterSpacing: -1,
					marginBottom: 6,
				}}
			>
				{value}
			</Text>
			<Text
				style={{
					fontFamily: fonts.body,
					fontSize: 11,
					color: colors.secondary[1],
					textTransform: "uppercase",
					letterSpacing: 1.3,
				}}
			>
				{label}
			</Text>
			{showDivider && (
				<View
					style={{
						position: "absolute",
						right: 0,
						top: 8,
						bottom: 8,
						width: 1,
						backgroundColor: "#F0F0F0",
					}}
				/>
			)}
		</View>
	);
}

function SectionHeader({ label }: { label: string }) {
	return (
		<Text
			style={{
				fontFamily: fonts.body,
				fontSize: 10,
				fontWeight: "500",
				color: "#C4C4C4",
				textTransform: "uppercase",
				letterSpacing: 2,
				paddingHorizontal: 24,
				paddingTop: 24,
				paddingBottom: 10,
			}}
		>
			{label}
		</Text>
	);
}

function BareRow({
	icon,
	label,
	onPress,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	label: string;
	onPress: () => void;
}) {
	return (
		<TouchableOpacity
			onPress={onPress}
			activeOpacity={0.7}
			className="flex-row items-center px-6 py-4"
			style={{ gap: 14 }}
		>
			<Ionicons name={icon} size={20} color={colors.secondary[1]} />
			<Text
				className="flex-1"
				style={{
					fontFamily: fonts.body,
					fontSize: 14,
					color: colors.primary[1],
				}}
			>
				{label}
			</Text>
			<Ionicons name="chevron-forward" size={14} color="#E0E0E0" />
		</TouchableOpacity>
	);
}

function ChangePasswordModal({
	visible,
	onClose,
}: {
	visible: boolean;
	onClose: () => void;
}) {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async () => {
		if (newPassword !== confirmPassword) {
			Alert.alert("Error", "New passwords do not match");
			return;
		}
		if (newPassword.length < 8) {
			Alert.alert("Error", "Password must be at least 8 characters");
			return;
		}

		setIsSubmitting(true);
		try {
			await authClient.changePassword({
				currentPassword,
				newPassword,
			});
			Alert.alert("Success", "Password changed successfully");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			onClose();
		} catch {
			Alert.alert(
				"Error",
				"Failed to change password. Check your current password.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<View className="flex-1 bg-primary-2">
				<View className="flex-row items-center justify-between border-secondary-3 border-b px-4 py-4">
					<TouchableOpacity onPress={onClose}>
						<Text
							className="text-base"
							style={{
								fontFamily: fonts.body,
								color: colors.primary[1],
							}}
						>
							Cancel
						</Text>
					</TouchableOpacity>
					<Text
						style={{
							fontFamily: fonts.heading,
							fontSize: 18,
							color: colors.primary[1],
						}}
					>
						Change Password
					</Text>
					<View style={{ width: 50 }} />
				</View>

				<View className="p-4">
					<View className="mb-4">
						<Text
							className="mb-2"
							style={{
								fontFamily: fonts.subheading,
								fontSize: 14,
								color: colors.primary[1],
							}}
						>
							Current Password
						</Text>
						<TextInput
							value={currentPassword}
							onChangeText={setCurrentPassword}
							secureTextEntry
							placeholder="Enter current password"
							placeholderTextColor={colors.secondary[1]}
							className="rounded-xl border border-secondary-3 bg-primary-2 p-3"
							style={{
								color: colors.primary[1],
								fontSize: 16,
								fontFamily: fonts.body,
							}}
						/>
					</View>

					<View className="mb-4">
						<Text
							className="mb-2"
							style={{
								fontFamily: fonts.subheading,
								fontSize: 14,
								color: colors.primary[1],
							}}
						>
							New Password
						</Text>
						<TextInput
							value={newPassword}
							onChangeText={setNewPassword}
							secureTextEntry
							placeholder="Enter new password"
							placeholderTextColor={colors.secondary[1]}
							className="rounded-xl border border-secondary-3 bg-primary-2 p-3"
							style={{
								color: colors.primary[1],
								fontSize: 16,
								fontFamily: fonts.body,
							}}
						/>
					</View>

					<View className="mb-6">
						<Text
							className="mb-2"
							style={{
								fontFamily: fonts.subheading,
								fontSize: 14,
								color: colors.primary[1],
							}}
						>
							Confirm New Password
						</Text>
						<TextInput
							value={confirmPassword}
							onChangeText={setConfirmPassword}
							secureTextEntry
							placeholder="Confirm new password"
							placeholderTextColor={colors.secondary[1]}
							className="rounded-xl border border-secondary-3 bg-primary-2 p-3"
							style={{
								color: colors.primary[1],
								fontSize: 16,
								fontFamily: fonts.body,
							}}
						/>
					</View>

					<TouchableOpacity
						onPress={handleSubmit}
						disabled={
							isSubmitting ||
							!currentPassword ||
							!newPassword ||
							!confirmPassword
						}
						className={`items-center justify-center rounded-xl bg-primary-1 py-4 ${
							isSubmitting ||
							!currentPassword ||
							!newPassword ||
							!confirmPassword
								? "opacity-50"
								: ""
						}`}
					>
						<Text
							style={{
								fontFamily: fonts.subheading,
								fontSize: 16,
								color: colors.primary[2],
							}}
						>
							{isSubmitting ? "Changing..." : "Change Password"}
						</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}
