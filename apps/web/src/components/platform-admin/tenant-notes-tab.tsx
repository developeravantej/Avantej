/**
 * Platform Admin — Tenant Notes tab (Plan F.1).
 *
 * Pinned-first, append-only internal notes per tenant. Author can
 * edit/delete own within 1 hour; thereafter frozen. Super-admin can
 * delete any note. Optimistic UI via TanStack Query invalidation.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pin, PinOff, Pencil, Trash2, Loader2 } from "lucide-react";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EDIT_WINDOW_MS = 60 * 60 * 1000;

type Note = {
	id: string;
	organizationId: string;
	authorUserId: string;
	body: string;
	isPinned: boolean;
	createdAt: Date | string | null;
	updatedAt: Date | string | null;
	authorEmail: string | null;
	authorName: string | null;
};

function fmtRelative(iso: Date | string | null): string {
	if (!iso) return "—";
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return "—";
	const diffSec = Math.round((Date.now() - t) / 1000);
	if (diffSec < 60) return `${diffSec}s ago`;
	if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
	if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
	return new Date(iso).toLocaleString();
}

export function TenantNotesTab({
	organizationId,
	currentUserId,
	isSuperAdmin,
}: {
	organizationId: string;
	currentUserId: string;
	isSuperAdmin: boolean;
}) {
	const qc = useQueryClient();
	const queryKey = [
		"platformAdminTenants",
		"notes",
		"list",
		organizationId,
	] as const;

	const { data, isLoading, error } = useQuery({
		queryKey,
		queryFn: () =>
			client.platformAdminTenants.notes.list({ organizationId }),
	});

	const [body, setBody] = useState("");
	const [pin, setPin] = useState(false);

	const invalidate = () => qc.invalidateQueries({ queryKey });

	const create = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.notes.create({
				organizationId,
				body,
				isPinned: pin,
			}),
		onSuccess: () => {
			toast.success("Note added");
			setBody("");
			setPin(false);
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Add failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const valid = body.trim().length >= 1;

	const notes: Note[] = (data?.notes ?? []) as Note[];

	return (
		<div className="space-y-4" data-testid="tenant-notes-tab">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Add internal note</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Visible only to platform admins. Append-only audit; you can
						edit/delete your own within 1 hour.
					</p>
					<textarea
						className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
						placeholder="Write a note about this tenant…"
						value={body}
						onChange={(e) => setBody(e.target.value)}
						disabled={create.isPending}
						data-testid="note-composer-body"
					/>
					<div className="flex items-center justify-between">
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={pin}
								onChange={(e) => setPin(e.target.checked)}
								disabled={create.isPending}
								data-testid="note-composer-pin"
							/>
							<span>Pin to top</span>
						</label>
						<Button
							size="sm"
							disabled={!valid || create.isPending}
							onClick={() => create.mutate()}
							data-testid="note-composer-submit"
						>
							{create.isPending ? (
								<>
									<Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding…
								</>
							) : (
								"Add note"
							)}
						</Button>
					</div>
				</CardContent>
			</Card>

			{isLoading ? (
				<div className="text-sm text-muted-foreground">Loading notes…</div>
			) : error ? (
				<div className="text-sm text-destructive">
					{(error as Error)?.message ?? "Failed to load notes."}
				</div>
			) : notes.length === 0 ? (
				<div
					className="text-sm text-muted-foreground border rounded-md p-4 text-center"
					data-testid="notes-empty-state"
				>
					No notes yet. Add the first one.
				</div>
			) : (
				<ul className="space-y-2" data-testid="notes-list">
					{notes.map((n) => (
						<NoteRow
							key={n.id}
							note={n}
							currentUserId={currentUserId}
							isSuperAdmin={isSuperAdmin}
							onChange={invalidate}
						/>
					))}
				</ul>
			)}
		</div>
	);
}

function NoteRow({
	note,
	currentUserId,
	isSuperAdmin,
	onChange,
}: {
	note: Note;
	currentUserId: string;
	isSuperAdmin: boolean;
	onChange: () => void;
}) {
	const isAuthor = note.authorUserId === currentUserId;
	const createdMs = note.createdAt ? new Date(note.createdAt).getTime() : 0;
	const withinEditWindow =
		createdMs > 0 && Date.now() - createdMs <= EDIT_WINDOW_MS;
	const mayEdit = isAuthor && withinEditWindow;
	const mayDelete = mayEdit || isSuperAdmin;

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(note.body);
	const [draftPin, setDraftPin] = useState(note.isPinned);

	const update = useMutation({
		mutationFn: (input: { body?: string; isPinned?: boolean }) =>
			client.platformAdminTenants.notes.update({ id: note.id, ...input }),
		onSuccess: () => {
			toast.success("Note updated");
			setEditing(false);
			onChange();
		},
		onError: (e: unknown) =>
			toast.error(`Update failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const del = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.notes.delete({ id: note.id }),
		onSuccess: () => {
			toast.success("Note deleted");
			onChange();
		},
		onError: (e: unknown) =>
			toast.error(`Delete failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const togglePin = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.notes.update({
				id: note.id,
				isPinned: !note.isPinned,
			}),
		onSuccess: () => onChange(),
		onError: (e: unknown) =>
			toast.error(`Pin toggle failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const authorLabel = note.authorName ?? note.authorEmail ?? note.authorUserId;

	return (
		<li
			className="border rounded-md p-3 space-y-2"
			data-testid={`note-row-${note.id}`}
			data-note-id={note.id}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm">
					<span className="font-medium">{authorLabel}</span>
					<span className="text-muted-foreground text-xs">
						{fmtRelative(note.createdAt)}
					</span>
					{note.updatedAt &&
						note.createdAt &&
						new Date(note.updatedAt).getTime() >
							new Date(note.createdAt).getTime() && (
							<span className="text-muted-foreground text-xs italic">
								(edited)
							</span>
						)}
					{note.isPinned && (
						<Badge variant="secondary" className="gap-1">
							<Pin className="h-3 w-3" />
							Pinned
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-1">
					{mayEdit && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => togglePin.mutate()}
							disabled={togglePin.isPending}
							title={note.isPinned ? "Unpin" : "Pin"}
							data-testid={`note-pin-toggle-${note.id}`}
						>
							{note.isPinned ? (
								<PinOff className="h-4 w-4" />
							) : (
								<Pin className="h-4 w-4" />
							)}
						</Button>
					)}
					{mayEdit && !editing && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setDraft(note.body);
								setDraftPin(note.isPinned);
								setEditing(true);
							}}
							title="Edit"
							data-testid={`note-edit-${note.id}`}
						>
							<Pencil className="h-4 w-4" />
						</Button>
					)}
					{mayDelete && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								if (!window.confirm("Delete this note?")) return;
								del.mutate();
							}}
							disabled={del.isPending}
							title="Delete"
							data-testid={`note-delete-${note.id}`}
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>

			{editing ? (
				<div className="space-y-2">
					<textarea
						className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						disabled={update.isPending}
						data-testid={`note-edit-body-${note.id}`}
					/>
					<div className="flex items-center justify-between">
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={draftPin}
								onChange={(e) => setDraftPin(e.target.checked)}
								disabled={update.isPending}
							/>
							<span>Pinned</span>
						</label>
						<div className="flex gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setEditing(false)}
								disabled={update.isPending}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								onClick={() =>
									update.mutate({ body: draft, isPinned: draftPin })
								}
								disabled={update.isPending || draft.trim().length < 1}
								data-testid={`note-edit-save-${note.id}`}
							>
								{update.isPending ? "Saving…" : "Save"}
							</Button>
						</div>
					</div>
				</div>
			) : (
				<div
					className="text-sm whitespace-pre-wrap"
					data-testid={`note-body-${note.id}`}
				>
					{note.body}
				</div>
			)}
		</li>
	);
}
