import {
	type MutationFunction,
	type QueryKey,
	useMutation,
	type UseMutationOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { queryClient } from "@/utils/orpc";

type SuccessMessageSource<TData, TVariables> =
	| string
	| false
	| ((data: TData, vars: TVariables) => string);

type ErrorMessageSource<TVariables> =
	| string
	| false
	| ((err: Error, vars: TVariables) => string);

type InvalidateSource<TData, TVariables> =
	| QueryKey[]
	| ((data: TData, vars: TVariables) => QueryKey[]);

export type UseApiMutationOptions<TData = unknown, TVariables = void, TContext = unknown> = Omit<
	UseMutationOptions<TData, Error, TVariables, TContext>,
	"mutationFn"
> & {
	mutationFn: MutationFunction<TData, TVariables>;
	successMessage?: SuccessMessageSource<TData, TVariables>;
	errorMessage?: ErrorMessageSource<TVariables>;
	invalidate?: InvalidateSource<TData, TVariables>;
};

export function useApiMutation<TData = unknown, TVariables = void, TContext = unknown>(
	opts: UseApiMutationOptions<TData, TVariables, TContext>,
) {
	const {
		successMessage,
		errorMessage,
		invalidate,
		onSuccess,
		onError,
		...rest
	} = opts;

	return useMutation<TData, Error, TVariables, TContext>({
		...rest,
		onSuccess: ((...args: unknown[]) => {
			const [data, vars] = args as [TData, TVariables, unknown, unknown];
			if (successMessage !== false && successMessage !== undefined) {
				const msg =
					typeof successMessage === "function"
						? successMessage(data, vars)
						: successMessage;
				if (msg) toast.success(msg);
			}

			if (invalidate !== undefined) {
				const keys =
					typeof invalidate === "function"
						? invalidate(data, vars)
						: invalidate;
				for (const queryKey of keys) {
					queryClient.invalidateQueries({ queryKey });
				}
			}

			return (onSuccess as ((...a: unknown[]) => unknown) | undefined)?.(...args);
		}) as UseMutationOptions<TData, Error, TVariables, TContext>["onSuccess"],

		onError: ((...args: unknown[]) => {
			const [err, vars] = args as [Error, TVariables, unknown, unknown];
			if (errorMessage === false) {
				// suppress
			} else {
				const msg =
					errorMessage === undefined
						? err.message
						: typeof errorMessage === "function"
							? errorMessage(err, vars)
							: errorMessage;
				if (msg) toast.error(msg);
			}
			if (import.meta.env.DEV) console.error("[useApiMutation]", err);
			return (onError as ((...a: unknown[]) => unknown) | undefined)?.(...args);
		}) as UseMutationOptions<TData, Error, TVariables, TContext>["onError"],
	});
}
