/**
 * Platform Admin — Template Editor dialog (Plan F.2.5, Agent C).
 *
 * Create / edit a comms template. Two-column layout: form on the left,
 * plain-text preview on the right. v1 treats body as plain text — Agent B
 * will wire markdown preview when the bulk composer needs it.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type TemplateEditorInput = {
	name: string;
	subject: string;
	bodyMarkdown: string;
	kind: "direct_message" | "announcement";
	priority?: "info" | "warning" | "critical" | null;
	targetAudience?: "all" | "staff" | "clients" | null;
};

export type Template = {
	id: string;
	name: string;
	subject: string;
	bodyMarkdown: string;
	kind: string;
	priority: string | null;
	targetAudience: string | null;
};

export type TemplateEditorDialogProps = {
	open: boolean;
	template?: Template;
	onSubmit: (input: TemplateEditorInput) => void | Promise<void>;
	onClose: () => void;
	isSubmitting?: boolean;
};

const PRIORITY_OPTS = ["info", "warning", "critical"] as const;
const AUDIENCE_OPTS = ["all", "staff", "clients"] as const;

export function TemplateEditorDialog(props: TemplateEditorDialogProps) {
	const isEdit = Boolean(props.template);
	const [name, setName] = useState("");
	const [subject, setSubject] = useState("");
	const [bodyMarkdown, setBodyMarkdown] = useState("");
	const [kind, setKind] = useState<"direct_message" | "announcement">(
		"direct_message",
	);
	const [priority, setPriority] = useState<"info" | "warning" | "critical">(
		"info",
	);
	const [audience, setAudience] = useState<"all" | "staff" | "clients">("all");

	useEffect(() => {
		if (props.open && props.template) {
			setName(props.template.name);
			setSubject(props.template.subject);
			setBodyMarkdown(props.template.bodyMarkdown);
			setKind(
				props.template.kind === "announcement"
					? "announcement"
					: "direct_message",
			);
			if (
				props.template.priority &&
				(PRIORITY_OPTS as readonly string[]).includes(props.template.priority)
			) {
				setPriority(props.template.priority as "info" | "warning" | "critical");
			}
			if (
				props.template.targetAudience &&
				(AUDIENCE_OPTS as readonly string[]).includes(
					props.template.targetAudience,
				)
			) {
				setAudience(
					props.template.targetAudience as "all" | "staff" | "clients",
				);
			}
		}
		if (props.open && !props.template) {
			setName("");
			setSubject("");
			setBodyMarkdown("");
			setKind("direct_message");
			setPriority("info");
			setAudience("all");
		}
	}, [props.open, props.template]);

	const canSubmit =
		name.trim().length > 0 &&
		subject.trim().length > 0 &&
		bodyMarkdown.trim().length > 0 &&
		!props.isSubmitting;

	const handleSubmit = () => {
		if (!canSubmit) return;
		const payload: TemplateEditorInput = {
			name: name.trim(),
			subject: subject.trim(),
			bodyMarkdown: bodyMarkdown.trim(),
			kind,
			priority: kind === "announcement" ? priority : null,
			targetAudience: kind === "announcement" ? audience : null,
		};
		void props.onSubmit(payload);
	};

	return (
		<Dialog
			open={props.open}
			onOpenChange={(o) => {
				if (!o) props.onClose();
			}}
		>
			<DialogContent className="max-w-3xl" data-testid="template-editor-dialog">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Edit template" : "New template"}</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update the content of this message template."
							: "Create a new reusable message template."}
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="space-y-3">
						<div>
							<Label htmlFor="tpl-name">Name</Label>
							<Input
								id="tpl-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Internal name"
								data-testid="template-name-input"
							/>
						</div>
						{!isEdit && (
							<div>
								<Label>Kind</Label>
								<div className="flex gap-4 mt-1">
									<label className="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="kind"
											checked={kind === "direct_message"}
											onChange={() => setKind("direct_message")}
											data-testid="template-kind-dm"
										/>
										Direct message
									</label>
									<label className="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="kind"
											checked={kind === "announcement"}
											onChange={() => setKind("announcement")}
											data-testid="template-kind-announce"
										/>
										Announcement
									</label>
								</div>
							</div>
						)}
						<div>
							<Label htmlFor="tpl-subject">Subject</Label>
							<Input
								id="tpl-subject"
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
								placeholder="Email/announcement subject"
								data-testid="template-subject-input"
							/>
						</div>
						<div>
							<Label htmlFor="tpl-body">Body (markdown)</Label>
							<Textarea
								id="tpl-body"
								value={bodyMarkdown}
								onChange={(e) => setBodyMarkdown(e.target.value)}
								rows={10}
								placeholder="Markdown body…"
								data-testid="template-body-input"
							/>
						</div>
						{kind === "announcement" && (
							<>
								<div>
									<Label>Priority</Label>
									<Select
										value={priority}
										onValueChange={(v) =>
											setPriority(v as "info" | "warning" | "critical")
										}
									>
										<SelectTrigger data-testid="template-priority-select">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="info">Info</SelectItem>
											<SelectItem value="warning">Warning</SelectItem>
											<SelectItem value="critical">Critical</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div>
									<Label>Target audience</Label>
									<Select
										value={audience}
										onValueChange={(v) =>
											setAudience(v as "all" | "staff" | "clients")
										}
									>
										<SelectTrigger data-testid="template-audience-select">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All</SelectItem>
											<SelectItem value="staff">Staff</SelectItem>
											<SelectItem value="clients">Clients</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</>
						)}
					</div>
					<div className="space-y-2 border rounded-md p-4 bg-muted/30">
						<div className="text-xs text-muted-foreground">Preview</div>
						<div className="flex items-center gap-2">
							<Badge variant="outline" className="text-xs">
								{kind === "direct_message" ? "DM" : "Announce"}
							</Badge>
							{kind === "announcement" && (
								<Badge variant="secondary" className="text-xs">
									{priority}
								</Badge>
							)}
						</div>
						<div>
							<div className="text-xs text-muted-foreground">Subject</div>
							<div className="text-sm font-medium break-words">
								{subject || "(empty)"}
							</div>
						</div>
						<div>
							<div className="text-xs text-muted-foreground">Body</div>
							<div className="text-sm whitespace-pre-wrap break-words">
								{bodyMarkdown || "(empty)"}
							</div>
						</div>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={props.onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						data-testid="template-submit-button"
					>
						{isEdit ? "Save changes" : "Create template"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
