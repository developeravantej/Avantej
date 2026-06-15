import { createFileRoute } from "@tanstack/react-router";
import {
	RolesTabPage,
	type RolesViewMode,
} from "@/components/pages/access-control/roles-tab";
import { PermissionsTabPage } from "@/components/pages/access-control/permissions-tab";
import { requirePermission } from "@/lib/route-guards";

import { z } from "zod";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/roles",
)({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "role_management", action: "read" },
			"/dashboard",
		);
	},
	validateSearch: z.object({
		tab: z.string().catch("roles"),
		view: z.enum(["matrix", "cards", "enhanced", "wizard"]).catch("matrix"),
	}),
	component: RolesPage,
});

const TABS = [
	{ id: "roles", label: "Roles & Permissions" },
	{ id: "permissions", label: "Permission Definitions" },
];

function RolesPage() {
	const { tab, view } = Route.useSearch();
	const navigate = Route.useNavigate();

	const content =
		tab === "permissions" ? (
			<PermissionsTabPage />
		) : (
			<RolesTabPage
				view={view}
				onViewChange={(mode) => navigate({ search: { tab, view: mode } })}
			/>
		);

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Settings</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Access Control</span>
				</div>
				<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id, view } })}
							className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${tab === t.id ? "bg-[#0a0a0a] text-white" : "text-muted-foreground hover:text-foreground"}`}
						>
							{t.label}
						</button>
					))}
				</div>
			</header>

			{/* ── Content card — fills remaining height ─────────────────── */}
			<div className="mx-6 my-6 flex-1 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				<div className="flex h-full min-h-0 overflow-hidden">{content}</div>
			</div>
		</div>
	);
}
