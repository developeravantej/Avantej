import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
	error: Error | null;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[ErrorBoundary]", error, info);
		this.props.onError?.(error, info);
	}

	render() {
		if (this.state.error) {
			if (this.props.fallback !== undefined) {
				return this.props.fallback;
			}
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

export default ErrorBoundary;
