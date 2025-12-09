import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createORPCClientConfig } from "@avantej-core/api/client";
import { authClient } from "@/lib/auth-client";

export const { queryClient, client, orpc } = createORPCClientConfig({
  serverUrl: process.env.EXPO_PUBLIC_SERVER_URL || "",
  QueryClient,
  QueryCache,
  onError: (error) => {
    console.log(error);
  },
  getAuthHeaders: () => {
    const headers: Record<string, string> = {};
    const cookies = authClient.getCookie();
    if (cookies) {
      headers.Cookie = cookies;
    }
    return headers;
  },
});
