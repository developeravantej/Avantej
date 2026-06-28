import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Mail,
	RefreshCw,
	X,
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
	QrCode,
} from "lucide-react";

// Simple date formatting utility
function formatDistanceToNow(
	date: Date | string,
	_options?: { addSuffix?: boolean },
): string {
	const dateObj = typeof date === "string" ? new Date(date) : date;
	const now = new Date();
	const diffMs = now.getTime() - dateObj.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	const diffMins = Math.floor(diffSecs / 60);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSecs < 60) {
		return "just now";
	} else if (diffMins < 60) {
		return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	} else if (diffHours < 24) {
		return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
	} else if (diffDays < 30) {
		return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
	} else {
		return dateObj.toLocaleDateString();
	}
}

export interface Invitation {
	id: string;
	email: string;
	role: string;
	/** "staff" = emailed invite; "branch_self_signup" = QR/link invite with no target email */
	kind?: string;
	hierarchyScopeId: string;
	status: "pending" | "accepted" | "declined" | "expired";
	expiresAt: Date | string;
	createdAt: Date | string;
}

interface InvitationListProps {
	invitations: Invitation[];
	onRevoke: (invitationId: string) => void;
	onResend: (invitationId: string) => void;
	isRevoking: boolean;
	isResending: boolean;
}

export function InvitationList({
	invitations,
	onRevoke,
	onResend,
	isRevoking,
	isResending,
}: InvitationListProps) {
	// Stable "now" snapshot per mount so expiry comparisons don't drift across
	// re-renders and trigger hydration/render-mismatch concerns.
	const now = useMemo(() => new Date(), []);

	const getStatusBadge = (status: string, expiresAt: Date | string) => {
		const expiresDate = new Date(expiresAt);
		const isExpired = expiresDate < now && status === "pending";

		switch (status) {
			case "pending":
				return (
					<Badge
						variant={isExpired ? "destructive" : "default"}
						className="gap-1"
					>
						{isExpired ? (
							<>
								<AlertCircle className="size-3" />
								Expired
							</>
						) : (
							<>
								<Clock className="size-3" />
								Pending
							</>
						)}
					</Badge>
				);
			case "accepted":
				return (
					<Badge
						variant="outline"
						className="gap-1 text-green-600 border-green-200"
					>
						<CheckCircle className="size-3" />
						Accepted
					</Badge>
				);
			case "declined":
				return (
					<Badge variant="outline" className="gap-1 text-brand-secondary-1">
						<XCircle className="size-3" />
						Declined
					</Badge>
				);
			case "expired":
				return (
					<Badge variant="destructive" className="gap-1">
						<AlertCircle className="size-3" />
						Expired
					</Badge>
				);
			default:
				return <Badge variant="outline">{status}</Badge>;
		}
	};

	const getRoleBadgeVariant = (role: string) => {
		switch (role.toLowerCase()) {
			case "admin":
				return "destructive";
			case "trainer":
				return "default";
			case "staff":
				return "secondary";
			case "client":
				return "outline";
			default:
				return "outline";
		}
	};

	if (invitations.length === 0) {
		return (
			<div className="rounded-lg border border-dashed p-12 text-center">
				<Mail className="size-12 mx-auto text-muted-foreground mb-4" />
				<h3 className="text-lg font-semibold mb-2">No invitations found</h3>
				<p className="text-muted-foreground">
					Get started by inviting a new member to your organization.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Expires</TableHead>
						<TableHead>Created</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{invitations.map((invitation) => {
						const expiresDate = new Date(invitation.expiresAt);
						const isExpired =
							expiresDate < now && invitation.status === "pending";
						// Self-signup (QR/link) invites have no target email, so there
						// is nothing to resend an email to — only allow resend when an
						// email address is present.
						const canResend =
							invitation.status === "pending" &&
							isExpired &&
							!!invitation.email;
						const canRevoke = invitation.status === "pending" && !isExpired;

						return (
							<TableRow key={invitation.id}>
								<TableCell className="font-medium">
									{invitation.email ? (
										invitation.email
									) : invitation.kind === "branch_self_signup" ? (
										<Link
											to="/dashboard/onboarding/view"
											search={{ branch: invitation.hierarchyScopeId }}
											className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
											title="Manage this branch's QR code on the Onboarding page"
										>
											<QrCode className="size-3.5 shrink-0" />
											<span className="italic">Self-signup link</span>
										</Link>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</TableCell>
								<TableCell>
									<Badge variant={getRoleBadgeVariant(invitation.role)}>
										{invitation.role}
									</Badge>
								</TableCell>
								<TableCell>
									{getStatusBadge(invitation.status, invitation.expiresAt)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{formatDistanceToNow(expiresDate, { addSuffix: true })}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{formatDistanceToNow(new Date(invitation.createdAt), {
										addSuffix: true,
									})}
								</TableCell>
								<TableCell className="text-right">
									<div className="flex items-center justify-end gap-2">
										{canResend && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => onResend(invitation.id)}
												disabled={isResending}
											>
												<RefreshCw className="size-4 mr-1" />
												Resend
											</Button>
										)}
										{canRevoke && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => onRevoke(invitation.id)}
												disabled={isRevoking}
											>
												<X className="size-4 mr-1" />
												Revoke
											</Button>
										)}
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
