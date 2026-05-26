import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";
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
import { Component, type ErrorInfo, type ReactNode } from "react";
import "../index.css";

class RootErrorBoundary extends Component<
	{ children: ReactNode },
	{ error: Error | null }
> {
	state = { error: null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[RootErrorBoundary]", error, info);
	}
	render() {
		if (this.state.error) {
			return (
				<div className="flex min-h-screen items-center justify-center p-8">
					<div className="max-w-xl space-y-4">
						<h1 className="text-xl font-semibold text-destructive">
							Something went wrong
						</h1>
						<pre className="overflow-auto rounded bg-muted p-4 text-sm">
							{String(this.state.error)}
						</pre>
						<button
							type="button"
							className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
							onClick={() => window.location.reload()}
						>
							Reload
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

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
		<RootErrorBoundary>
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
		</RootErrorBoundary>
	);
}
