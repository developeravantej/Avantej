import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/pages/landing/LandingPage";
import type { LandingSearch } from "@/components/pages/landing/types";

export const Route = createFileRoute("/")({
	component: LandingPage,
	validateSearch: (search: Record<string, unknown>): LandingSearch => {
		return {
			invitationToken:
				typeof search.invitationToken === "string"
					? search.invitationToken
					: undefined,
			orgId: typeof search.orgId === "string" ? search.orgId : undefined,
		};
	},
});
