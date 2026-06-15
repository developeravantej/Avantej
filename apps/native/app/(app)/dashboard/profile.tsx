import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	Alert,
	Linking,
	Modal,
	Pressable,
	ScrollView,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { TabContainer, useTabBarHeight } from "@/components/container";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { authClient } from "@/lib/auth-client";
import { colors } from "@/lib/colors";
import { client, orpc } from "@/utils/orpc";

export default function ProfileScreen() {
	const { user, logout } = useAuth();
	const { organizationId } = useOrganization();
	const queryClient = useQueryClient();
	const tabBarHeight = useTabBarHeight();

	const [showPasswordModal, setShowPasswordModal] = useState(false);

	// Fetch customer profile (gated on organizationId — first paint after sign-in
	// can have a brief undefined org).
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

	// Phone lives on the Better-Auth user row (configured as an additional
	// field). Fall back to customer_profiles.phone for legacy data.
	const userPhone =
		((user as unknown as { phone?: string | null })?.phone ?? "") ||
		((profile as any)?.phone ?? "");
	const userName = user?.name ?? "";
	const userEmail = user?.email ?? "";

	const memberSince = user?.createdAt
		? new Date(user.createdAt).toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
			})
		: "";

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

	const emailEnabled = (notifPrefs as any)?.emailEnabled ?? true;
	const pushEnabled = (notifPrefs as any)?.pushEnabled ?? false;

	return (
		<TabContainer>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentInset={{ bottom: tabBarHeight + 8 }}
				showsVerticalScrollIndicator={false}
			>
				<View className="px-4 pt-4">
					<UserSummaryCard name={userName} memberSince={memberSince} />
					<PersonalInfoSection
						name={userName}
						email={userEmail}
						phone={userPhone}
					/>
					<NotificationPrefsSection
						emailEnabled={emailEnabled}
						pushEnabled={pushEnabled}
						onToggle={handleToggleNotifPref}
					/>
					<AccountSection
						onChangePassword={() => setShowPasswordModal(true)}
						onLogout={handleLogout}
					/>
				</View>
			</ScrollView>

			{/* Change Password Modal */}
			<ChangePasswordModal
				visible={showPasswordModal}
				onClose={() => setShowPasswordModal(false)}
			/>
		</TabContainer>
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
			<View className="flex-1 bg-secondary-3">
				<View className="flex-row items-center justify-between border-secondary-3 border-b bg-primary-2 p-4">
					<Pressable onPress={onClose}>
						<Text className="text-base text-primary-1">Cancel</Text>
					</Pressable>
					<Text className="font-bold text-lg text-primary-1">
						Change Password
					</Text>
					<View style={{ width: 50 }} />
				</View>

				<View className="p-4">
					<View className="mb-4">
						<Text className="mb-2 font-medium text-base text-primary-1">
							Current Password
						</Text>
						<TextInput
							value={currentPassword}
							onChangeText={setCurrentPassword}
							secureTextEntry
							placeholder="Enter current password"
							placeholderTextColor={colors.secondary[1]}
							className="rounded-xl border border-secondary-3 bg-primary-2 p-3"
							style={{ color: colors.primary[1], fontSize: 16 }}
						/>
					</View>

					<View className="mb-4">
						<Text className="mb-2 font-medium text-base text-primary-1">
							New Password
						</Text>
						<TextInput
							value={newPassword}
							onChangeText={setNewPassword}
							secureTextEntry
							placeholder="Enter new password"
							placeholderTextColor={colors.secondary[1]}
							className="rounded-xl border border-secondary-3 bg-primary-2 p-3"
							style={{ color: colors.primary[1], fontSize: 16 }}
						/>
					</View>

					<View className="mb-6">
						<Text className="mb-2 font-medium text-base text-primary-1">
							Confirm New Password
						</Text>
						<TextInput
							value={confirmPassword}
							onChangeText={setConfirmPassword}
							secureTextEntry
							placeholder="Confirm new password"
							placeholderTextColor={colors.secondary[1]}
							className="rounded-xl border border-secondary-3 bg-primary-2 p-3"
							style={{ color: colors.primary[1], fontSize: 16 }}
						/>
					</View>

					<Pressable
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
						<Text className="font-semibold text-base text-primary-2">
							{isSubmitting ? "Changing..." : "Change Password"}
						</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

function UserSummaryCard({
	name,
	memberSince,
}: {
	name: string;
	memberSince: string;
}) {
	return (
		<View className="mb-4 rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
			<View className="flex-row items-center">
				<View
					className="mr-4 size-16 items-center justify-center rounded-full"
					style={{ backgroundColor: colors.secondary[2] }}
				>
					<Ionicons name="person" size={32} color={colors.secondary[1]} />
				</View>
				<View className="flex-1">
					<Text className="mb-1 font-bold text-primary-1 text-xl">
						{name || "User"}
					</Text>
					<Text className="text-secondary-1 text-sm">
						Member since {memberSince}
					</Text>
				</View>
			</View>
		</View>
	);
}

function InfoRow({
	label,
	value,
	last,
}: {
	label: string;
	value: string;
	last?: boolean;
}) {
	return (
		<View className={last ? "" : "mb-4 border-secondary-3 border-b pb-4"}>
			<Text className="mb-1 text-secondary-1 text-xs uppercase tracking-wider">
				{label}
			</Text>
			<Text className="text-base" style={{ color: colors.primary[1] }}>
				{value || "—"}
			</Text>
		</View>
	);
}

function PersonalInfoSection({
	name,
	email,
	phone,
}: {
	name: string;
	email: string;
	phone: string;
}) {
	return (
		<View className="mb-4">
			<Text className="mb-3 font-bold text-secondary-1 text-sm uppercase tracking-wide">
				PERSONAL INFORMATION
			</Text>
			<View className="rounded-2xl border border-secondary-3 bg-primary-2 p-4 shadow-sm">
				<InfoRow label="Full Name" value={name} />
				<InfoRow label="Email" value={email} />
				<InfoRow label="Phone Number" value={phone} last />
			</View>
		</View>
	);
}

function NotifToggleRow({
	title,
	description,
	value,
	onChange,
	last,
}: {
	title: string;
	description: string;
	value: boolean;
	onChange: (v: boolean) => void;
	last?: boolean;
}) {
	return (
		<View className={last ? "p-4" : "border-secondary-3 border-b p-4"}>
			<View className="flex-row items-center justify-between">
				<View className="mr-4 flex-1">
					<Text className="mb-1 font-semibold text-base text-primary-1">
						{title}
					</Text>
					<Text className="text-secondary-1 text-sm">{description}</Text>
				</View>
				<Switch
					value={value}
					onValueChange={onChange}
					trackColor={{ false: colors.secondary[3], true: colors.primary[1] }}
					thumbColor={colors.primary[2]}
				/>
			</View>
		</View>
	);
}

function NotificationPrefsSection({
	emailEnabled,
	pushEnabled,
	onToggle,
}: {
	emailEnabled: boolean;
	pushEnabled: boolean;
	onToggle: (
		key: "emailEnabled" | "pushEnabled" | "smsEnabled",
		value: boolean,
	) => void;
}) {
	return (
		<View className="mb-4">
			<Text className="mb-3 font-bold text-secondary-1 text-sm uppercase tracking-wide">
				NOTIFICATION PREFERENCES
			</Text>
			<View className="rounded-2xl border border-secondary-3 bg-primary-2 shadow-sm">
				<NotifToggleRow
					title="Email Notifications"
					description="Receive updates about your workouts and bookings"
					value={emailEnabled}
					onChange={(v) => onToggle("emailEnabled", v)}
				/>
				<NotifToggleRow
					title="Push Notifications"
					description="Get instant alerts on your device"
					value={pushEnabled}
					onChange={(v) => onToggle("pushEnabled", v)}
					last
				/>
			</View>
		</View>
	);
}

function AccountRow({
	icon,
	label,
	onPress,
	destructive,
	last,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	onPress: () => void;
	destructive?: boolean;
	last?: boolean;
}) {
	return (
		<Pressable
			onPress={onPress}
			className={
				last
					? "flex-row items-center p-4"
					: "flex-row items-center border-secondary-3 border-b p-4"
			}
		>
			<Ionicons
				name={icon}
				size={20}
				color={destructive ? "#EF4444" : colors.primary[1]}
			/>
			<Text
				className={`ml-3 flex-1 text-base ${destructive ? "text-red-500" : "text-primary-1"}`}
			>
				{label}
			</Text>
			{!destructive && (
				<Ionicons
					name="chevron-forward"
					size={20}
					color={colors.secondary[1]}
				/>
			)}
		</Pressable>
	);
}

function AccountSection({
	onChangePassword,
	onLogout,
}: {
	onChangePassword: () => void;
	onLogout: () => void;
}) {
	return (
		<View>
			<Text className="mb-3 font-bold text-secondary-1 text-sm uppercase tracking-wide">
				ACCOUNT
			</Text>
			<View className="rounded-2xl border border-secondary-3 bg-primary-2 shadow-sm">
				<AccountRow
					icon="lock-closed-outline"
					label="Change Password"
					onPress={onChangePassword}
				/>
				<AccountRow
					icon="help-circle-outline"
					label="Help & Support"
					onPress={() => Linking.openURL("mailto:support@avantej.com")}
				/>
				<AccountRow
					icon="document-text-outline"
					label="Terms & Privacy"
					onPress={() => Linking.openURL("https://avantej.com/terms")}
				/>
				<AccountRow
					icon="log-out-outline"
					label="Sign Out"
					onPress={onLogout}
					destructive
					last
				/>
			</View>
		</View>
	);
}
