/**
 * Auth Provider Component
 *
 * Historically this wrapped the app in an auth context, but the context was
 * never consumed — session state is read directly via `authClient.useSession()`
 * and permissions via `useUserContext()`. Kept as a passthrough so the tree in
 * `__root.tsx` stays stable; safe to inline away later.
 */

import type { ReactNode } from "react";

interface AuthProviderProps {
	children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	return <>{children}</>;
}
