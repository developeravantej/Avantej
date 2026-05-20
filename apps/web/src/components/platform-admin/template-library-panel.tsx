/**
 * Platform Admin — Template Library panel (Plan F.2.5, Agent C).
 *
 * Card grid of reusable comms templates. Super-admin gets edit + archive
 * + "New template" actions; other admin roles see read-only cards.
 */

import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type Template = {
	id: string;
	name: string;
	subject: string;
	bodyMarkdown: string;
	kind: string;
	priority: string | null;
	targetAudience: string | null;
	createdByUserId: string;
	createdAt: Date | string;
	updatedAt: Date | string;
	archivedAt: Date | string | null;
};

export type TemplateLibraryPanelProps = {
	templates: Template[];
	isSuperAdmin: boolean;
	isLoading?: boolean;
	kindFilter: "all" | "direct_message" | "announcement";
	includeArchived: boolean;
	onKindChange: (k: "all" | "direct_message" | "announcement") => void;
	onIncludeArchivedChange: (v: boolean) => void;
	onCreate: () => void;
	onEdit: (id: string) => void;
	onArchive: (id: string) => void;
	onUnarchive: (id: string) => void;
};

export function TemplateLibraryPanel(props: TemplateLibraryPanelProps) {
	return (
		<div className="space-y-4" data-testid="template-library-panel">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Select
						value={props.kindFilter}
						onValueChange={(v) => props.onKindChange(v as typeof props.kindFilter)}
					>
						<SelectTrigger className="w-48" data-testid="template-kind-filter">
							<SelectValue placeholder="Kind" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All kinds</SelectItem>
							<SelectItem value="direct_message">Direct message</SelectItem>
							<SelectItem value="announcement">Announcement</SelectItem>
						</SelectContent>
					</Select>
					<div className="flex items-center gap-2">
						<Switch
							id="include-archived"
							checked={props.includeArchived}
							onCheckedChange={props.onIncludeArchivedChange}
							data-testid="template-include-archived"
						/>
						<Label htmlFor="include-archived" className="text-sm">
							Include archived
						</Label>
					</div>
				</div>
				{props.isSuperAdmin && (
					<Button onClick={props.onCreate} data-testid="template-new-button">
						New template
					</Button>
				)}
			</div>

			{props.isLoading ? (
				<div className="text-sm text-muted-foreground">Loading…</div>
			) : props.templates.length === 0 ? (
				<div className="rounded-xl border border-brand-secondary-3 bg-card">
					<EmptyState
						icon={FileText}
						title="No templates yet"
						description={
							props.isSuperAdmin
								? "Create one to get started."
								: undefined
						}
						action={
							props.isSuperAdmin
								? { label: "New template", onClick: props.onCreate }
								: undefined
						}
					/>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{props.templates.map((t) => (
						<Card
							key={t.id}
							className={t.archivedAt ? "opacity-60" : ""}
							data-testid={`template-card-${t.id}`}
						>
							<CardHeader>
								<div className="flex items-start justify-between gap-2">
									<CardTitle className="text-base">{t.name}</CardTitle>
									<div className="flex gap-1 flex-wrap">
										<Badge variant="outline" className="text-xs">
											{t.kind === "direct_message" ? "DM" : "Announce"}
										</Badge>
										{t.priority && (
											<Badge
												variant={
													t.priority === "critical" ? "destructive" : "secondary"
												}
												className="text-xs"
											>
												{t.priority}
											</Badge>
										)}
										{t.archivedAt && (
											<Badge variant="outline" className="text-xs">
												archived
											</Badge>
										)}
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-3">
								<div>
									<div className="text-xs text-muted-foreground">Subject</div>
									<div className="text-sm font-medium truncate" title={t.subject}>
										{t.subject}
									</div>
								</div>
								<div>
									<div className="text-xs text-muted-foreground">Preview</div>
									<div className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
										{t.bodyMarkdown}
									</div>
								</div>
								<div className="flex flex-wrap gap-2 pt-2">
									<Button
										variant="secondary"
										size="sm"
										data-testid={`template-use-${t.id}`}
										// Agent B will wire this to the bulk composer.
										onClick={() => {
											console.info("[template-use] stub — wired by Agent B", t.id);
										}}
									>
										Use
									</Button>
									{props.isSuperAdmin && !t.archivedAt && (
										<>
											<Button
												variant="outline"
												size="sm"
												onClick={() => props.onEdit(t.id)}
												data-testid={`template-edit-${t.id}`}
											>
												Edit
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => props.onArchive(t.id)}
												data-testid={`template-archive-${t.id}`}
											>
												Archive
											</Button>
										</>
									)}
									{props.isSuperAdmin && t.archivedAt && (
										<Button
											variant="outline"
											size="sm"
											onClick={() => props.onUnarchive(t.id)}
											data-testid={`template-unarchive-${t.id}`}
										>
											Unarchive
										</Button>
									)}
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
