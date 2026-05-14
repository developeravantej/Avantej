/**
 * usePushNotifications
 *
 * Registers the device for Expo push notifications, stores the resulting
 * Expo push token on the server (per-tenant `push_tokens` table), and
 * routes notification taps to the correct screen.
 *
 * Module-level `currentPushTokenRef` is exposed so `useAuth.logout()`
 * can unregister the token on sign-out without needing hook-call ordering.
 */

import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useOrganization } from "@/hooks/useOrganization";
import { orpc } from "@/utils/orpc";

const EAS_PROJECT_ID =
	Constants.expoConfig?.extra?.eas?.projectId ??
	(Constants.easConfig as { projectId?: string } | undefined)?.projectId;

// Module-level shared ref so `useAuth.logout()` can find the active token
// to unregister, without sharing hook state directly.
export const currentPushTokenRef: {
	token: string | null;
	organizationId: string | null;
} = {
	token: null,
	organizationId: null,
};

// Configure foreground notification handling once at module load.
Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowAlert: true,
		shouldPlaySound: true,
		shouldSetBadge: false,
		shouldShowBanner: true,
		shouldShowList: true,
	}),
});

export function usePushNotifications() {
	const router = useRouter();
	const { organizationId } = useOrganization();
	const tokenRef = useRef<string | null>(null);

	const registerMutation = useMutation(
		orpc.pushTokens.register.mutationOptions(),
	);
	const unregisterMutation = useMutation(
		orpc.pushTokens.unregister.mutationOptions(),
	);

	useEffect(() => {
		let cancelled = false;

		async function register() {
			try {
				if (!Device.isDevice) return;
				if (!organizationId) return;
				if (!EAS_PROJECT_ID) {
					console.warn("[push] missing EAS projectId; skipping registration");
					return;
				}

				const { status: existingStatus } =
					await Notifications.getPermissionsAsync();
				let finalStatus = existingStatus;
				if (existingStatus !== "granted") {
					const { status } = await Notifications.requestPermissionsAsync();
					finalStatus = status;
				}
				if (finalStatus !== "granted") return;

				const tokenData = await Notifications.getExpoPushTokenAsync({
					projectId: EAS_PROJECT_ID,
				});
				if (cancelled) return;

				tokenRef.current = tokenData.data;
				currentPushTokenRef.token = tokenData.data;
				currentPushTokenRef.organizationId = organizationId;

				await registerMutation.mutateAsync({
					organizationId,
					token: tokenData.data,
					platform: Platform.OS === "ios" ? "ios" : "android",
				});
			} catch (err) {
				console.warn("[push] registration failed", err);
			}
		}

		register();

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [organizationId]);

	// Notification-received listener — fires when a push arrives while the
	// app is foregrounded (or when the OS hands one off in the background).
	// Useful for cache invalidation / badge updates side-effects.
	useEffect(() => {
		const sub = Notifications.addNotificationReceivedListener(
			(notification) => {
				const data = notification.request.content.data as {
					type?: string;
				};
				if (__DEV__) {
					console.log("[push] received", data?.type ?? "unknown");
				}
			},
		);
		return () => sub.remove();
	}, []);

	// Notification tap handler — deep-links into the relevant screen.
	useEffect(() => {
		const sub = Notifications.addNotificationResponseReceivedListener(
			(response) => {
				const data = response.notification.request.content.data as {
					type?: string;
					referenceId?: string;
				};
				if (
					(data?.type === "package_assigned" ||
						data?.type === "package_rejected") &&
					data.referenceId
				) {
					router.push(`/dashboard/packages/${data.referenceId}` as never);
				} else {
					router.push("/dashboard/notifications" as never);
				}
			},
		);
		return () => sub.remove();
	}, [router]);

	return {
		expoPushToken: tokenRef.current,
		cleanup: async () => {
			try {
				if (tokenRef.current && organizationId) {
					await unregisterMutation.mutateAsync({
						organizationId,
						token: tokenRef.current,
					});
				}
			} catch (err) {
				console.warn("[push] cleanup failed", err);
			} finally {
				tokenRef.current = null;
				currentPushTokenRef.token = null;
				currentPushTokenRef.organizationId = null;
			}
		},
	};
}
