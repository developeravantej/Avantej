import { useCallback, useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";

export function useAuth() {
	const { data: session, isPending, error, refetch } = authClient.useSession();

	const isAuthenticated = useMemo(
		() => !isPending && !!session?.user,
		[isPending, session],
	);

	const login = useCallback(
		async (email: string, password: string) => {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				throw new Error(result.error.message || "Failed to sign in");
			}
			await refetch();
			await queryClient.invalidateQueries({
				predicate: (query) => {
					const key = query.queryKey[0];
					return key === "auth" || key === "userContext";
				},
			});
			return result.data;
		},
		[refetch],
	);

	const signUp = useCallback(
		async (name: string, email: string, password: string, firstName?: string, lastName?: string) => {
			const result = await authClient.signUp.email({
				name,
				email,
				password,
				firstName: firstName || name.split(" ")[0] || "",
				lastName: lastName || name.split(" ").slice(1).join(" ") || "",
			});
			if (result.error) {
				throw new Error(result.error.message || "Failed to sign up");
			}
			if (!result.data) {
				throw new Error("An account with this email already exists");
			}
			return result.data;
		},
		[],
	);

	const logout = useCallback(async () => {
		await authClient.signOut();
		await refetch();
		queryClient.clear();
	}, [refetch]);

	const forgotPassword = useCallback(async (email: string) => {
		const result = await authClient.requestPasswordReset({ email, redirectTo: "/(auth)/login" });
		if (result.error) {
			throw new Error(result.error.message || "Failed to send reset email");
		}
		return result.data;
	}, []);

	const resetPassword = useCallback(
		async (token: string, newPassword: string) => {
			const result = await authClient.resetPassword({
				newPassword,
				token,
			});
			if (result.error) {
				throw new Error(result.error.message || "Failed to reset password");
			}
			return result.data;
		},
		[],
	);

	return {
		session: session ?? null,
		user: session?.user ?? null,
		isPending,
		isAuthenticated,
		error,
		login,
		signUp,
		logout,
		forgotPassword,
		resetPassword,
		refetch,
	};
}
