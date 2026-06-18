import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	HeadContent,
	Outlet,
	createRootRouteWithContext,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { orpc } from "@/utils/orpc";
import "../index.css";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{
				title: "avantej-core",
			},
			{
				name: "description",
				content: "avantej-core is a web application",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});

function RootComponent() {
	const isFetching = useRouterState({
		select: (s) => s.isLoading,
	});

	return (
		<ErrorBoundary>
			<HeadContent />
			<AuthProvider>
				<ThemeProvider
					attribute="class"
					forcedTheme="light"
					enableSystem={false}
					disableTransitionOnChange
					storageKey="vite-ui-theme"
				>
					{isFetching && (
						<div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary animate-pulse" />
					)}
					<Outlet />
					<Toaster richColors />
				</ThemeProvider>
			</AuthProvider>
			<TanStackRouterDevtools position="bottom-left" />
			<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
		</ErrorBoundary>
	);
}
