/**
 * Auth Provider Component
 *
 * Provides authentication context to the router and manages auth state.
 * This component wraps the entire application to provide auth context.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { UseAuthReturn } from "@/types/auth";

// Create context
const AuthContext = createContext<UseAuthReturn | null>(null);

// Provider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuthContext(): UseAuthReturn {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

// Export for router context integration
export { AuthContext };



