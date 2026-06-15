import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import {
	inferAdditionalFields,
	magicLinkClient,
} from "better-auth/client/plugins";
import type { auth } from "@avantej-core/auth";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const scheme = Constants.expoConfig?.scheme;
if (!scheme || typeof scheme !== "string") {
	throw new Error(
		"app.json is missing `expo.scheme` — required for Better-Auth Expo client",
	);
}

export const authClient = createAuthClient({
	baseURL: process.env.EXPO_PUBLIC_SERVER_URL,
	plugins: [
		expoClient({
			scheme,
			storagePrefix: scheme,
			storage: SecureStore,
		}),
		inferAdditionalFields<typeof auth>(),
		magicLinkClient(),
	],
});
