import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/pages/landing/LandingPage";
import { z } from "zod";

export const Route = createFileRoute("/")({
	component: LandingPage,
	validateSearch: z.object({
		invitationToken: z.string().optional(),
		orgId: z.string().optional(),
	}),
});
