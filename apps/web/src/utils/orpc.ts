import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createORPCClientConfig } from "@avantej-core/api/client";

const { queryClient, client, orpc } = createORPCClientConfig({
	serverUrl: import.meta.env.VITE_SERVER_URL ?? "",
	QueryClient,
	QueryCache,
	onError: (error) => {
		toast.error(`Error: ${error.message}`, {
			action: {
				label: "retry",
				onClick: () => {
					queryClient.invalidateQueries();
				},
			},
		});
	},
	fetchOptions: {
		credentials: "include",
	},
});

export { queryClient, client, orpc };
export type { AppRouterClient } from "@avantej-core/api/routers/index";
