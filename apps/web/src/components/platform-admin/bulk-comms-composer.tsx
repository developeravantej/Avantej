/**
 * Platform Admin — Bulk Comms Composer (Plan F.2.5, Agent B).
 *
 * Modal composer used from the tenants list bulk-actions-bar. Picks a
 * template from the F.2.5 Agent-C library (or composes ad-hoc), shows a
 * plaintext preview, and fans out to the selected tenants (≤100 cap) via
 * `platformAdminTenants.bulkSendDirectMessage` or `.bulkSendAnnouncement`.
 *
 * One audit row per target is written by the server using the same
 * action strings as the single-tenant flow (`tenant_dm`,
 * `tenant_announcement_create`) so the outbox renders bulk + single
 * uniformly.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const BULK_CAP = 100;

type Kind = "direct_message" | "announcement";
type Priority = "low" | "normal" | "high" | "urgent";
type Audience = "all" | "staff" | "clients";

export interface BulkCommsComposerProps {
	open: boolean;
	kind: Kind;
	organizationIds: string[];
	organizationNamesPreview?: string[];
	onClose: () => void;
	onSent: (result: { succeeded: number; failed: number }) => void;
}

const SCRATCH = "__scratch__";

export function BulkCommsComposer({
	open,
	kind,
	organizationIds,
	organizationNamesPreview,
	onClose,
	onSent,
}: BulkCommsComposerProps) {
	const isDm = kind === "direct_message";
	const overCap = organizationIds.length > BULK_CAP;
	const tooFew = organizationIds.length === 0;

	const [templateId, setTemplateId] = useState<string>(SCRATCH);
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState<Priority>("normal");
	const [audience, setAudience] = useState<Audience>("all");

	// Reset on open / kind switch
	useEffect(() => {
		if (open) {
			setTemplateId(SCRATCH);
			setSubject("");
			setBody("");
			setTitle("");
			setPriority("normal");
			setAudience("all");
		}
	}, [open, kind]);

	const { data: templatesData } = useQuery({
		queryKey: ["platformAdminComms", "listTemplates", { kind }],
		queryFn: () => client.platformAdminComms.listTemplates({ kind }),
		enabled: open,
	});

	const templates = templatesData?.templates ?? [];

	// Map template priority (info/warning/critical, legacy) → announcements enum.
	const mapTemplatePriority = (p: string | null | undefined): Priority => {
		if (p === "high" || p === "low" || p === "normal" || p === "urgent")
			return p;
		if (p === "info") return "normal";
		if (p === "warning") return "high";
		if (p === "critical") return "urgent";
		return "normal";
	};
	const mapTemplateAudience = (a: string | null | undefined): Audience => {
		if (a === "all" || a === "staff" || a === "clients") return a;
		return "all";
	};

	const handleTemplatePick = (id: string) => {
		setTemplateId(id);
		if (id === SCRATCH) return;
		const tpl = templates.find((t: any) => t.id === id);
		if (!tpl) return;
		if (isDm) {
			setSubject(tpl.subject ?? "");
			setBody(tpl.bodyMarkdown ?? "");
		} else {
			setTitle(tpl.subject ?? "");
			setBody(tpl.bodyMarkdown ?? "");
			setPriority(mapTemplatePriority(tpl.priority));
			setAudience(mapTemplateAudience(tpl.targetAudience));
		}
	};

	const dmMut = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.bulkSendDirectMessage({
				organizationIds,
				subject,
				bodyMarkdown: body,
				templateId: templateId !== SCRATCH ? templateId : undefined,
			}),
		onSuccess: (res) => {
			toast.success(
				`Sent DM to ${res.succeeded}/${organizationIds.length}${res.failed.length ? ` — ${res.failed.length} failed` : ""}.`,
			);
			onSent({ succeeded: res.succeeded, failed: res.failed.length });
		},
		onError: (e: any) => toast.error(e?.message ?? "Bulk DM failed"),
	});

	const annMut = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.bulkSendAnnouncement({
				organizationIds,
				title,
				bodyMarkdown: body,
				priority,
				targetAudience: audience,
				templateId: templateId !== SCRATCH ? templateId : undefined,
			}),
		onSuccess: (res) => {
			toast.success(
				`Announcement sent to ${res.succeeded}/${organizationIds.length}${res.failed.length ? ` — ${res.failed.length} failed` : ""}.`,
			);
			onSent({ succeeded: res.succeeded, failed: res.failed.length });
		},
		onError: (e: any) =>
			toast.error(e?.message ?? "Bulk announcement failed"),
	});

	const isPending = dmMut.isPending || annMut.isPending;

	const canSubmit = useMemo(() => {
		if (overCap || tooFew || isPending) return false;
		if (isDm) return subject.trim().length > 0 && body.trim().length > 0;
		return title.trim().length > 0 && body.trim().length > 0;
	}, [overCap, tooFew, isPending, isDm, subject, body, title]);

	const handleSubmit = () => {
		if (!canSubmit) return;
		if (isDm) dmMut.mutate();
		else annMut.mutate();
	};

	const recipientSummary = (() => {
		const names = organizationNamesPreview ?? [];
		const head = names.slice(0, 3).join(", ");
		const more = Math.max(0, organizationIds.length - 3);
		if (!head) return `${organizationIds.length} tenant${organizationIds.length === 1 ? "" : "s"}`;
		return more > 0 ? `${head} + ${more} more` : head;
	})();

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o && !isPending) onClose();
			}}
		>
			<DialogContent
				className="max-w-2xl"
				data-testid="bulk-comms-composer"
				data-kind={kind}
			>
				<DialogHeader>
					<DialogTitle>
						{isDm
							? `Send DM to ${organizationIds.length} tenant${organizationIds.length === 1 ? "" : "s"}`
							: `Send announcement to ${organizationIds.length} tenant${organizationIds.length === 1 ? "" : "s"}`}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{/* Recipients */}
					<div
						className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
						data-testid="bulk-comms-recipients"
					>
						Sending to: <span className="font-medium text-foreground">{recipientSummary}</span>
					</div>

					{overCap && (
						<div
							className="flex items-center gap-2 text-xs text-destructive"
							data-testid="bulk-comms-overcap"
						>
							<AlertTriangle className="h-3 w-3" />
							Max {BULK_CAP} tenants per bulk send — narrow your selection.
						</div>
					)}

					{/* Template picker */}
					<div className="space-y-1">
						<label className="text-xs text-muted-foreground">Template</label>
						<Select value={templateId} onValueChange={handleTemplatePick}>
							<SelectTrigger data-testid="bulk-comms-template-select">
								<SelectValue placeholder="Compose from scratch" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={SCRATCH}>Compose from scratch</SelectItem>
								{templates.map((t: any) => (
									<SelectItem key={t.id} value={t.id}>
										{t.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Form */}
					{isDm ? (
						<>
							<div className="space-y-1">
								<label className="text-xs text-muted-foreground">Subject</label>
								<Input
									value={subject}
									onChange={(e) => setSubject(e.target.value)}
									placeholder="Subject line"
									data-testid="bulk-comms-subject"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-xs text-muted-foreground">Body (markdown)</label>
								<Textarea
									value={body}
									onChange={(e) => setBody(e.target.value)}
									placeholder="Message body…"
									rows={8}
									data-testid="bulk-comms-body"
								/>
							</div>
						</>
					) : (
						<>
							<div className="space-y-1">
								<label className="text-xs text-muted-foreground">Title</label>
								<Input
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="Announcement title"
									data-testid="bulk-comms-title"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-xs text-muted-foreground">Body (markdown)</label>
								<Textarea
									value={body}
									onChange={(e) => setBody(e.target.value)}
									placeholder="Announcement body…"
									rows={8}
									data-testid="bulk-comms-body"
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1">
									<label className="text-xs text-muted-foreground">Priority</label>
									<Select
										value={priority}
										onValueChange={(v) => setPriority(v as Priority)}
									>
										<SelectTrigger data-testid="bulk-comms-priority">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="low">Low</SelectItem>
											<SelectItem value="normal">Normal</SelectItem>
											<SelectItem value="high">High</SelectItem>
											<SelectItem value="urgent">Urgent</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<label className="text-xs text-muted-foreground">Audience</label>
									<Select
										value={audience}
										onValueChange={(v) => setAudience(v as Audience)}
									>
										<SelectTrigger data-testid="bulk-comms-audience">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All</SelectItem>
											<SelectItem value="staff">Staff</SelectItem>
											<SelectItem value="clients">Clients</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</>
					)}

					{/* Preview */}
					{(isDm ? subject || body : title || body) && (
						<div
							className="rounded-md border bg-muted/30 px-3 py-2"
							data-testid="bulk-comms-preview"
						>
							<div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
								Preview
							</div>
							<div className="text-sm font-medium">{isDm ? subject : title}</div>
							<div className="text-xs whitespace-pre-wrap text-muted-foreground mt-1">
								{body}
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={isPending}
						data-testid="bulk-comms-cancel"
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						data-testid="bulk-comms-submit"
					>
						{isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
						Send to {organizationIds.length} tenant
						{organizationIds.length === 1 ? "" : "s"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
