import { createFileRoute } from "@tanstack/react-router";
import { RolesTabPage, type RolesViewMode } from "@/components/pages/access-control/roles-tab";
import { PermissionsTabPage } from "@/components/pages/access-control/permissions-tab";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/access-control/roles",
)({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "role_management", action: "read" },
			"/dashboard",
		);
	},
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "roles",
		view: ((search.view as string | undefined) ?? "matrix") as RolesViewMode,
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
			{/* ── Page header ─────────────────────────────────────────────── */}
			<div className="shrink-0 px-6 pt-6 pb-4">
				<div className="mb-4 flex items-end justify-between">
					<div>
						<p className="mb-1 text-[10px] font-bold tracking-widest uppercase text-[#737373]">
							ACCESS CONTROL
						</p>
						<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
							Roles &amp; Permissions
						</h1>
						<p className="mt-1 text-sm text-[#737373]">
							Define roles and configure permission levels for your team.
						</p>
					</div>
				</div>

				{/* ── Pill tabs ─────────────────────────────────────────────── */}
				<div className="flex flex-wrap items-center gap-2">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id, view } })}
							className={
								tab === t.id
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
							}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>

			{/* ── Content card — fills remaining height ─────────────────── */}
			<div className="mx-6 mb-6 flex-1 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				<div className="flex h-full min-h-0 overflow-hidden">{content}</div>
			</div>
		</div>
	);
}
