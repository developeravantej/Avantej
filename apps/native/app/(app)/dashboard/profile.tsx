import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	Alert,
	Linking,
	Modal,
	ScrollView,
	Switch,
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
	const { organizationId, organizations } = useOrganization();
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
		...orpc.packageInstances.listForClient.queryOptions({
			input: { organizationId, status: "active" },
		}),
		enabled: !!organizationId,
	});

	// Fetch upcoming appointments for stats
	const { data: upcomingAppointments } = useQuery({
		...orpc.appointments.listForUser.queryOptions({
			input: { organizationId, statuses: ["pending", "confirmed"] },
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
	const sessionsCount = Array.isArray(upcomingAppointments)
		? upcomingAppointments.length
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

	const userEmail = user?.email ?? "";
	const orgName =
		organizations.find((o) => o.id === organizationId)?.name ?? "";

	return (
		<TabContainer>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: tabBarHeight + 8 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Hero Card */}
				<View
					style={{
						marginHorizontal: 16,
						marginTop: 8,
						backgroundColor: colors.primary[2],
						borderWidth: 1,
						borderColor: colors.secondary[3],
						borderRadius: 20,
						padding: 20,
					}}
				>
					<View
						className="flex-row items-center"
						style={{
							gap: 16,
							marginBottom: 16,
							paddingBottom: 16,
							borderBottomWidth: 1,
							borderBottomColor: colors.secondary[3],
						}}
					>
						<View
							className="items-center justify-center rounded-full"
							style={{
								width: 72,
								height: 72,
								backgroundColor: colors.primary[1],
							}}
						>
							<Text
								style={{
									fontFamily: fonts.heading,
									fontSize: 24,
									fontWeight: "700",
									color: colors.primary[2],
								}}
							>
								{userInitials || "?"}
							</Text>
						</View>
						<View className="flex-1" style={{ minWidth: 0 }}>
							<Text
								style={{
									fontFamily: fonts.heading,
									fontSize: 22,
									fontWeight: "700",
									color: colors.primary[1],
									letterSpacing: -0.3,
									marginBottom: 3,
								}}
							>
								{userName || "User"}
							</Text>
							{userEmail ? (
								<Text
									numberOfLines={1}
									style={{
										fontFamily: fonts.body,
										fontSize: 13,
										color: colors.secondary[1],
										marginBottom: 3,
									}}
								>
									{userEmail}
								</Text>
							) : null}
							{orgName ? (
								<Text
									style={{
										fontFamily: fonts.body,
										fontSize: 12,
										color: colors.secondary[1],
									}}
								>
									{orgName}
								</Text>
							) : null}
						</View>
					</View>
					<View className="flex-row items-center justify-between">
						<View
							style={{
								backgroundColor: colors.primary[1],
								borderRadius: 999,
								paddingHorizontal: 10,
								paddingVertical: 4,
							}}
						>
							<Text
								style={{
									fontFamily: fonts.body,
									fontSize: 10,
									fontWeight: "500",
									color: colors.primary[2],
									textTransform: "uppercase",
									letterSpacing: 1.2,
								}}
							>
								Member
							</Text>
						</View>
						{memberSince ? (
							<Text
								style={{
									fontFamily: fonts.body,
									fontSize: 12,
									color: colors.secondary[1],
								}}
							>
								Since {memberSince}
							</Text>
						) : null}
					</View>
				</View>

				{/* Stats Card */}
				<View
					style={{
						marginHorizontal: 16,
						marginTop: 12,
						backgroundColor: colors.primary[2],
						borderWidth: 1,
						borderColor: colors.secondary[3],
						borderRadius: 20,
						overflow: "hidden",
					}}
				>
					<View
						style={{
							paddingHorizontal: 16,
							paddingTop: 14,
							paddingBottom: 10,
							borderBottomWidth: 1,
							borderBottomColor: colors.secondary[3],
						}}
					>
						<Text
							style={{
								fontFamily: fonts.body,
								fontSize: 11,
								fontWeight: "500",
								color: colors.secondary[1],
								textTransform: "uppercase",
								letterSpacing: 1.5,
							}}
						>
							Activity Overview
						</Text>
					</View>
					<View className="flex-row">
						<StatItem value={sessionsCount} label="Upcoming" showDivider />
						<StatItem value={packagesCount} label="Packages" showDivider />
						<StatItem value={creditsCount} label="Credits" />
					</View>
				</View>

				{/* Account Section */}
				<SectionHeader label="Account" />
				<SettingsCard>
					<SettingsRow
						icon="lock-closed-outline"
						label="Change Password"
						onPress={() => setShowPasswordModal(true)}
					/>
					<SettingsToggleRow
						icon="notifications-outline"
						label="Push notifications"
						value={!!notifPrefs?.pushEnabled}
						onValueChange={(v) =>
							handleToggleNotifPref("pushEnabled", v)
						}
					/>
					<SettingsToggleRow
						icon="mail-outline"
						label="Email notifications"
						value={!!notifPrefs?.emailEnabled}
						onValueChange={(v) =>
							handleToggleNotifPref("emailEnabled", v)
						}
					/>
					<SettingsToggleRow
						icon="chatbubble-outline"
						label="SMS notifications"
						value={!!notifPrefs?.smsEnabled}
						onValueChange={(v) =>
							handleToggleNotifPref("smsEnabled", v)
						}
						isLast
					/>
				</SettingsCard>

				{/* Support Section */}
				<SectionHeader label="Support" />
				<SettingsCard>
					<SettingsRow
						icon="help-circle-outline"
						label="Help & Support"
						onPress={() =>
							Linking.openURL("mailto:support@avantej.com")
						}
					/>
					<SettingsRow
						icon="shield-outline"
						label="Privacy Policy"
						onPress={() =>
							Linking.openURL("https://avantej.com/privacy")
						}
					/>
					<SettingsRow
						icon="document-text-outline"
						label="Terms of Service"
						onPress={() =>
							Linking.openURL("https://avantej.com/terms")
						}
					/>
					<SettingsRow
						icon="log-out-outline"
						label="Sign Out"
						onPress={handleLogout}
						destructive
						isLast
					/>
				</SettingsCard>

				{/* Version Footer */}
				<Text
					style={{
						fontFamily: fonts.body,
						fontSize: 12,
						color: "#C4C4C4",
						textAlign: "center",
						paddingTop: 24,
						paddingBottom: 28,
					}}
				>
					v1.0.0
				</Text>
			</ScrollView>

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
		<View
			className="flex-1 items-center"
			style={{
				paddingVertical: 16,
				paddingHorizontal: 12,
				borderRightWidth: showDivider ? 1 : 0,
				borderRightColor: colors.secondary[3],
			}}
		>
			<Text
				style={{
					fontFamily: fonts.heading,
					fontSize: 28,
					fontWeight: "700",
					color: colors.primary[1],
					lineHeight: 28,
					marginBottom: 5,
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
					letterSpacing: 0.8,
				}}
			>
				{label}
			</Text>
		</View>
	);
}

function SectionHeader({ label }: { label: string }) {
	return (
		<Text
			style={{
				fontFamily: fonts.body,
				fontSize: 11,
				fontWeight: "500",
				color: colors.secondary[1],
				textTransform: "uppercase",
				letterSpacing: 1.5,
				paddingHorizontal: 20,
				paddingTop: 20,
				paddingBottom: 8,
			}}
		>
			{label}
		</Text>
	);
}

function SettingsCard({ children }: { children: React.ReactNode }) {
	return (
		<View
			style={{
				marginHorizontal: 16,
				backgroundColor: colors.primary[2],
				borderWidth: 1,
				borderColor: colors.secondary[3],
				borderRadius: 16,
				overflow: "hidden",
			}}
		>
			{children}
		</View>
	);
}

function SettingsRow({
	icon,
	label,
	onPress,
	destructive,
	isLast,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	label: string;
	onPress: () => void;
	destructive?: boolean;
	isLast?: boolean;
}) {
	return (
		<TouchableOpacity
			onPress={onPress}
			activeOpacity={0.7}
			className="flex-row items-center"
			style={{
				paddingHorizontal: 16,
				paddingVertical: 14,
				gap: 12,
				borderBottomWidth: isLast ? 0 : 1,
				borderBottomColor: colors.secondary[3],
			}}
		>
			<Ionicons
				name={icon}
				size={20}
				color={destructive ? "#B91C1C" : colors.secondary[1]}
			/>
			<Text
				className="flex-1"
				style={{
					fontFamily: fonts.body,
					fontSize: 14,
					color: destructive ? "#B91C1C" : colors.primary[1],
				}}
			>
				{label}
			</Text>
			{!destructive && (
				<Ionicons
					name="chevron-forward"
					size={16}
					color="#C4C4C4"
				/>
			)}
		</TouchableOpacity>
	);
}

function SettingsToggleRow({
	icon,
	label,
	value,
	onValueChange,
	isLast,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	label: string;
	value: boolean;
	onValueChange: (v: boolean) => void;
	isLast?: boolean;
}) {
	return (
		<View
			className="flex-row items-center"
			style={{
				paddingHorizontal: 16,
				paddingVertical: 10,
				gap: 12,
				borderBottomWidth: isLast ? 0 : 1,
				borderBottomColor: colors.secondary[3],
			}}
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
			<Switch
				value={value}
				onValueChange={onValueChange}
				trackColor={{ false: colors.secondary[2], true: colors.primary[1] }}
				thumbColor={colors.primary[2]}
				ios_backgroundColor={colors.secondary[2]}
			/>
		</View>
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
