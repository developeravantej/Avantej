/**
 * Members roster table (Plan F.4, Agent Mb).
 *
 * Read-only paginated view for the tenant drill-in Members tab. Props
 * are deliberately dumb — page navigation and filter state live in the
 * parent tab so the table stays trivially testable.
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export type MemberRosterRow = {
	id: string;
	userId: string;
	name: string | null;
	email: string | null;
	role: string;
	hierarchyScopeId: string;
	hierarchyScopeName: string | null;
	joinedAt: Date | string | null;
	lastLoginAt: Date | string | null;
	status: string;
};

function fmtDate(d: Date | string | null): string {
	if (!d) return "—";
	const t = new Date(d).getTime();
	if (Number.isNaN(t)) return "—";
	return new Date(d).toLocaleDateString();
}

export function MembersRosterTable({
	rows,
	total,
	page,
	limit,
	onPageChange,
}: {
	rows: MemberRosterRow[];
	total: number;
	page: number;
	limit: number;
	onPageChange: (next: number) => void;
}) {
	const totalPages = Math.max(1, Math.ceil(total / limit));
	const canPrev = page > 1;
	const canNext = page < totalPages;

	if (rows.length === 0) {
		return (
			<div
				className="text-sm text-muted-foreground border rounded-md p-6 text-center"
				data-testid="members-roster-empty"
			>
				No members found.
			</div>
		);
	}

	return (
		<div className="space-y-3" data-testid="members-roster-table">
			<div className="border rounded-md overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Member</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Hierarchy scope</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Joined</TableHead>
							<TableHead>Last login</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((m) => (
							<TableRow key={m.id} data-testid={`member-row-${m.id}`}>
								<TableCell>
									<div className="flex flex-col">
										<span className="text-sm font-medium">
											{m.name ?? m.email ?? m.userId}
										</span>
										{m.email && m.name && (
											<span className="text-xs text-muted-foreground">
												{m.email}
											</span>
										)}
									</div>
								</TableCell>
								<TableCell>
									<Badge variant="outline" data-testid={`member-role-${m.id}`}>
										{m.role}
									</Badge>
								</TableCell>
								<TableCell className="text-sm">
									{m.hierarchyScopeName ?? m.hierarchyScopeId.slice(0, 8)}
								</TableCell>
								<TableCell>
									<Badge
										variant={m.status === "active" ? "secondary" : "outline"}
										className="text-xs"
									>
										{m.status}
									</Badge>
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{fmtDate(m.joinedAt)}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{fmtDate(m.lastLoginAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			<div
				className="flex items-center justify-between text-xs text-muted-foreground"
				data-testid="members-roster-pagination"
			>
				<span>
					Page {page} of {totalPages} · {total} member{total === 1 ? "" : "s"}
				</span>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={!canPrev}
						onClick={() => onPageChange(page - 1)}
						data-testid="members-roster-prev"
					>
						Prev
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!canNext}
						onClick={() => onPageChange(page + 1)}
						data-testid="members-roster-next"
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
