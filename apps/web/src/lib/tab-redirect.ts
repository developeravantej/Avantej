import { redirect } from "@tanstack/react-router";

export function makeTabRedirect(to: string, tab: string) {
	return () => {
		throw redirect({ to, search: { tab } });
	};
}
