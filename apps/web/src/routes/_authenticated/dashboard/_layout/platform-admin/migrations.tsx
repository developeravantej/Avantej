/**
 * Platform Admin — Migrations Viewer (Plan F.4 — Agent Mi).
 *
 * Read-only operational view of drizzle migration state for both schemas:
 *   - Control Panel (shared DB)
 *   - Tenant (per-org Neon branches — applied[] not surfaced here, the journal
 *     is shown so ops can see what SHOULD be applied to every tenant)
 *
 * Surface only — NO apply button. Apply migrations via CLI:
 *   `bun db:push`  /  `bun db:migrate`
 *
 * Banner flags journal drift (orphaned migrations applied via raw SQL outside
 * drizzle — Agent F.1.5 documented this on the dev DB).
 */

import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { StatusCallout } from "@/components/ui/status-callout";
import { client } from "@/utils/orpc";
import { BigNumberCard } from "@/components/platform-admin/big-number-card";
import { MigrationStatusTable } from "@/components/platform-admin/migration-status-table";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/migrations",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin) {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			throw redirect({ to: "/dashboard" });
		}
	},
	component: PlatformAdminMigrationsPage,
});

type SchemaKind = "control-panel" | "tenant";

function MigrationsTab({ schema }: { schema: SchemaKind }) {
	const [openTag, setOpenTag] = useState<string | null>(null);

	const listQ = useQuery({
		queryKey: ["platformAdminMigrations", "listMigrations", schema],
		queryFn: () => client.platformAdminMigrations.listMigrations({ schema }),
		staleTime: 0,
		refetchOnWindowFocus: true,
	});

	const fileQ = useQuery({
		queryKey: ["platformAdminMigrations", "getMigrationFile", schema, openTag],
		queryFn: () =>
			client.platformAdminMigrations.getMigrationFile({
				schema,
				tag: openTag!,
			}),
		enabled: Boolean(openTag),
	});

	const summary = listQ.data?.summary;

	return (
		<div className="space-y-4" data-testid={`migrations-tab-${schema}`}>
			{summary && summary.orphanedCount > 0 ? (
				<div data-testid="migrations-orphaned-banner">
					<StatusCallout variant="error" title="Journal drift detected">
						<p className="text-sm">
							{summary.orphanedCount} migration(s) applied to the DB but not in
							the drizzle journal. Investigate before generating new migrations.
						</p>
					</StatusCallout>
				</div>
			) : null}

			{listQ.isLoading ? (
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
			) : summary ? (
				<div
					className="grid grid-cols-2 lg:grid-cols-4 gap-3"
					data-testid="migrations-kpi-row"
				>
					<BigNumberCard
						title="Journal entries"
						value={summary.journalCount}
						subLabel="meta/_journal.json"
						testId="kpi-migrations-journal"
					/>
					<BigNumberCard
						title="Applied"
						value={summary.appliedCount}
						subLabel={
							schema === "tenant"
								? "per-tenant — not shown"
								: "drizzle.__drizzle_migrations"
						}
						band={summary.appliedCount > 0 ? "green" : "neutral"}
						testId="kpi-migrations-applied"
					/>
					<BigNumberCard
						title="Pending"
						value={summary.pendingCount}
						subLabel="in journal, not in DB"
						band={summary.pendingCount > 0 ? "amber" : "neutral"}
						testId="kpi-migrations-pending"
					/>
					<BigNumberCard
						title="Orphaned"
						value={summary.orphanedCount}
						subLabel="in DB, not in journal"
						band={summary.orphanedCount > 0 ? "red" : "neutral"}
						testId="kpi-migrations-orphaned"
					/>
				</div>
			) : null}

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Migration timeline</CardTitle>
					<div className="text-xs text-muted-foreground mt-1">
						{schema === "control-panel"
							? "Shared control-panel schema. Apply via `bun db:migrate:control-panel`."
							: "Per-tenant schema. Apply via `bun db:migrate:tenant` (runs against every tenant branch)."}
					</div>
				</CardHeader>
				<CardContent>
					{listQ.error ? (
						<StatusCallout
							variant="error"
							title="Couldn't load migrations"
							message={
								listQ.error instanceof Error
									? listQ.error.message
									: "An error occurred"
							}
							onRetry={() => listQ.refetch()}
						/>
					) : (
						<MigrationStatusTable
							status={listQ.data?.status ?? []}
							isLoading={listQ.isLoading || listQ.isFetching}
							onRowClick={(tag) => setOpenTag(tag)}
						/>
					)}
				</CardContent>
			</Card>

			<Dialog
				open={openTag !== null}
				onOpenChange={(o) => {
					if (!o) setOpenTag(null);
				}}
			>
				<DialogContent
					className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
					data-testid="migration-sql-dialog"
				>
					<DialogHeader>
						<DialogTitle className="font-mono text-base">
							{openTag ?? ""}
						</DialogTitle>
						<DialogDescription>
							Read-only SQL preview from{" "}
							<code className="text-xs">
								packages/db/src/migrations/{schema}/{openTag}.sql
							</code>
						</DialogDescription>
					</DialogHeader>
					<div className="flex-1 overflow-auto">
						{fileQ.isLoading ? (
							<Skeleton className="h-48 w-full" />
						) : fileQ.error ? (
							<div className="text-sm text-red-700">
								Could not load: {(fileQ.error as Error).message}
							</div>
						) : fileQ.data ? (
							<pre
								className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/40 rounded p-3"
								data-testid="migration-sql-content"
							>
								{fileQ.data.sql}
							</pre>
						) : null}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setOpenTag(null)}
							data-testid="migration-sql-close"
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function PlatformAdminMigrationsPage() {
	const [tab, setTab] = useState<SchemaKind>("control-panel");

	return (
		<div className="p-6 space-y-6" data-testid="migrations-page">
			<header className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs text-muted-foreground">Platform admin</div>
					<h1 className="text-2xl font-semibold">Migrations</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Read-only viewer. Apply via{" "}
						<code className="text-xs">bun db:push</code> /{" "}
						<code className="text-xs">bun db:migrate</code> from the CLI.
					</p>
				</div>
			</header>

			<Tabs
				value={tab}
				onValueChange={(v) => setTab(v as SchemaKind)}
				data-testid="migrations-tabs"
			>
				<TabsList>
					<TabsTrigger
						value="control-panel"
						data-testid="migrations-tab-trigger-control-panel"
					>
						Control Panel
					</TabsTrigger>
					<TabsTrigger
						value="tenant"
						data-testid="migrations-tab-trigger-tenant"
					>
						Tenant
					</TabsTrigger>
				</TabsList>
				<TabsContent value="control-panel" className="mt-4">
					<MigrationsTab schema="control-panel" />
				</TabsContent>
				<TabsContent value="tenant" className="mt-4">
					<MigrationsTab schema="tenant" />
				</TabsContent>
			</Tabs>
		</div>
	);
}
