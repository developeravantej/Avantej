import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { QueryClient, QueryCache } from "@tanstack/react-query";
import type { AppRouterClient } from "./routers/index";

export interface CreateORPCClientConfig {
	serverUrl: string;
	onError?: (error: Error) => void;
	getAuthHeaders?: () => Record<string, string>;
	fetchOptions?: RequestInit;
	QueryClient: new (config?: any) => QueryClient;
	QueryCache: new (config?: any) => QueryCache;
}

export function createORPCClientConfig(config: CreateORPCClientConfig) {
	const { QueryClient, QueryCache, serverUrl, onError, getAuthHeaders, fetchOptions } = config;

	const queryClient = new QueryClient({
		queryCache: new QueryCache({
			onError: onError || ((error) => console.error(error)),
		}),
	});

	const link = new RPCLink({
		url: `${serverUrl}/rpc`,
		headers: getAuthHeaders,
		fetch: fetchOptions
			? (url, options) => fetch(url, { ...options, ...fetchOptions })
			: undefined,
	});

	const client: AppRouterClient = createORPCClient(link);
	const orpc = createTanstackQueryUtils(client);

	return { queryClient, client, orpc };
}

