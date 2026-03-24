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
			queryClient.refetchQueries();
			return result.data;
		},
		[refetch],
	);

	const signUp = useCallback(
		async (name: string, email: string, password: string) => {
			const result = await authClient.signUp.email({
				name,
				email,
				password,
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
		queryClient.clear();
		await refetch();
	}, [refetch]);

	const forgotPassword = useCallback(async (email: string) => {
		const result = await authClient.forgetPassword({ email, redirectTo: "/(auth)/login" });
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
