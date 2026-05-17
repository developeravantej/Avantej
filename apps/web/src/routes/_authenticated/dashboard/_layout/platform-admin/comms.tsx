/**
 * Platform Admin — Comms page (Plan F.2.5, Agent C).
 *
 * Two tabs: Outbox (chronological view over admin_session_actions
 * filtered to comms action types) and Templates (CRUD on
 * comms_templates). Bulk composer arrives next via Agent B and will
 * consume the template library.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
	CommsOutboxList,
	type OutboxRow,
} from "@/components/platform-admin/comms-outbox-list";
import {
	TemplateLibraryPanel,
	type Template,
} from "@/components/platform-admin/template-library-panel";
import {
	TemplateEditorDialog,
	type TemplateEditorInput,
} from "@/components/platform-admin/template-editor-dialog";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/comms",
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
	component: PlatformAdminCommsPage,
});

function isUuid(s: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		s,
	);
}

function PlatformAdminCommsPage() {
	const queryClient = useQueryClient();

	const { data: me } = useQuery({
		queryKey: ["admin", "me"],
		queryFn: () => client.admin.me({}),
	});
	const isSuperAdmin = me?.isPlatformAdmin && me?.role === "super_admin";

	// ── Outbox tab state ───────────────────────────────────────────────
	const [kind, setKind] = useState<"all" | "direct_message" | "announcement">(
		"all",
	);
	const [days, setDays] = useState(90);
	const [actor, setActor] = useState("");
	const [targetOrg, setTargetOrg] = useState("");
	const [page, setPage] = useState(1);
	const dActor = useDebounce(actor, 300);
	const dTarget = useDebounce(targetOrg, 300);

	const outboxQuery = useQuery({
		queryKey: [
			"platformAdminComms",
			"listOutbox",
			{ kind, days, dActor, dTarget, page },
		],
		queryFn: () =>
			client.platformAdminComms.listOutbox({
				kind: kind === "all" ? undefined : kind,
				actorUserId: dActor || undefined,
				targetOrgId: isUuid(dTarget) ? dTarget : undefined,
				days,
				page,
				limit: 50,
			}),
	});

	const outboxRows: OutboxRow[] = useMemo(
		() =>
			(outboxQuery.data?.rows ?? []).map((r) => ({
				...r,
				sentAt: r.sentAt,
			})),
		[outboxQuery.data],
	);

	// ── Templates tab state ────────────────────────────────────────────
	const [tplKind, setTplKind] = useState<
		"all" | "direct_message" | "announcement"
	>("all");
	const [includeArchived, setIncludeArchived] = useState(false);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const templatesQuery = useQuery({
		queryKey: [
			"platformAdminComms",
			"listTemplates",
			{ tplKind, includeArchived },
		],
		queryFn: () =>
			client.platformAdminComms.listTemplates({
				kind: tplKind === "all" ? undefined : tplKind,
				includeArchived,
			}),
	});

	const editingTemplate: Template | undefined = useMemo(() => {
		if (!editingId) return undefined;
		return (templatesQuery.data?.templates ?? []).find(
			(t) => t.id === editingId,
		) as Template | undefined;
	}, [editingId, templatesQuery.data]);

	const invalidateTemplates = () =>
		queryClient.invalidateQueries({
			queryKey: ["platformAdminComms", "listTemplates"],
		});

	const createMutation = useMutation({
		mutationFn: (input: TemplateEditorInput) =>
			client.platformAdminComms.createTemplate({
				name: input.name,
				subject: input.subject,
				bodyMarkdown: input.bodyMarkdown,
				kind: input.kind,
				priority: input.priority ?? undefined,
				targetAudience: input.targetAudience ?? undefined,
			}),
		onSuccess: () => {
			toast.success("Template created.");
			setEditorOpen(false);
			setEditingId(null);
			void invalidateTemplates();
		},
		onError: (e: unknown) => {
			toast.error(
				e instanceof Error ? e.message : "Failed to create template.",
			);
		},
	});

	const updateMutation = useMutation({
		mutationFn: (vars: { id: string; input: TemplateEditorInput }) =>
			client.platformAdminComms.updateTemplate({
				id: vars.id,
				name: vars.input.name,
				subject: vars.input.subject,
				bodyMarkdown: vars.input.bodyMarkdown,
				priority: vars.input.priority ?? null,
				targetAudience: vars.input.targetAudience ?? null,
			}),
		onSuccess: () => {
			toast.success("Template updated.");
			setEditorOpen(false);
			setEditingId(null);
			void invalidateTemplates();
		},
		onError: (e: unknown) => {
			toast.error(
				e instanceof Error ? e.message : "Failed to update template.",
			);
		},
	});

	const archiveMutation = useMutation({
		mutationFn: (id: string) =>
			client.platformAdminComms.archiveTemplate({ id }),
		onSuccess: () => {
			toast.success("Template archived.");
			void invalidateTemplates();
		},
		onError: (e: unknown) => {
			toast.error(
				e instanceof Error ? e.message : "Failed to archive template.",
			);
		},
	});

	const unarchiveMutation = useMutation({
		mutationFn: (id: string) =>
			client.platformAdminComms.unarchiveTemplate({ id }),
		onSuccess: () => {
			toast.success("Template restored.");
			void invalidateTemplates();
		},
		onError: (e: unknown) => {
			toast.error(
				e instanceof Error ? e.message : "Failed to restore template.",
			);
		},
	});

	const handleSubmit = (input: TemplateEditorInput) => {
		if (editingId) {
			updateMutation.mutate({ id: editingId, input });
		} else {
			createMutation.mutate(input);
		}
	};

	return (
		<div className="p-6 space-y-4" data-testid="comms-page">
			<div>
				<h1 className="text-2xl font-semibold">Comms</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Outbox + template library.
				</p>
			</div>

			<Tabs defaultValue="outbox" className="space-y-4">
				<TabsList>
					<TabsTrigger value="outbox" data-testid="tab-outbox">
						Outbox
					</TabsTrigger>
					<TabsTrigger value="templates" data-testid="tab-templates">
						Templates
					</TabsTrigger>
				</TabsList>

				<TabsContent value="outbox" className="space-y-4">
					<CommsOutboxList
						rows={outboxRows}
						total={outboxQuery.data?.total ?? 0}
						page={page}
						limit={50}
						isLoading={outboxQuery.isLoading}
						kindFilter={kind}
						daysFilter={days}
						actorFilter={actor}
						targetOrgFilter={targetOrg}
						onKindChange={(k) => {
							setKind(k);
							setPage(1);
						}}
						onDaysChange={(d) => {
							setDays(d);
							setPage(1);
						}}
						onActorChange={(v) => {
							setActor(v);
							setPage(1);
						}}
						onTargetOrgChange={(v) => {
							setTargetOrg(v);
							setPage(1);
						}}
						onPageChange={setPage}
					/>
				</TabsContent>

				<TabsContent value="templates" className="space-y-4">
					<TemplateLibraryPanel
						templates={
							(templatesQuery.data?.templates ?? []) as unknown as Template[]
						}
						isSuperAdmin={Boolean(isSuperAdmin)}
						isLoading={templatesQuery.isLoading}
						kindFilter={tplKind}
						includeArchived={includeArchived}
						onKindChange={setTplKind}
						onIncludeArchivedChange={setIncludeArchived}
						onCreate={() => {
							setEditingId(null);
							setEditorOpen(true);
						}}
						onEdit={(id) => {
							setEditingId(id);
							setEditorOpen(true);
						}}
						onArchive={(id) => archiveMutation.mutate(id)}
						onUnarchive={(id) => unarchiveMutation.mutate(id)}
					/>
				</TabsContent>
			</Tabs>

			<TemplateEditorDialog
				open={editorOpen}
				template={editingTemplate}
				isSubmitting={createMutation.isPending || updateMutation.isPending}
				onSubmit={handleSubmit}
				onClose={() => {
					setEditorOpen(false);
					setEditingId(null);
				}}
			/>
		</div>
	);
}
