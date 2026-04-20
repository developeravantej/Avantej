"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface MemberRow {
	id: string;
	userId: string;
	role: "admin" | "trainer" | "staff" | "client";
	hierarchyScopeId: string;
	status: "active" | "suspended";
	joinedAt: Date | null;
	name: string | null;
	email: string | null;
}

interface MemberActionsCellProps {
	member: MemberRow;
	callerIsAdmin: boolean;
	organizationId: string;
}

export function MemberActionsCell({
	member,
	callerIsAdmin,
	organizationId,
}: MemberActionsCellProps) {
	const [dialogOpen, setDialogOpen] = useState(false);

	const mutation = useMutation({
		mutationFn: () =>
			client.tenantAdmin.impersonateMember({
				targetMemberId: member.id,
				organizationId,
			}),
		onSuccess: (result) => {
			// Hard reload so the new session cookie is picked up by the browser
			window.location.href = result.redirectTo;
		},
		onError: (err: Error) => {
			setDialogOpen(false);
			toast.error(err.message ?? "Failed to start impersonation session");
		},
	});

	// Only show the button when caller is admin and target is a staff member
	if (!callerIsAdmin || member.role !== "staff") {
		return null;
	}

	const displayName = member.name || member.email || "this member";

	return (
		<>
			<Button
				size="sm"
				variant="outline"
				onClick={() => setDialogOpen(true)}
			>
				Login as
			</Button>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Log in as {displayName}?</DialogTitle>
						<DialogDescription>
							You will be impersonating this staff member. This session is
							audited and expires in 1 hour. You can return to your own
							account at any time using the banner that appears at the top
							of the page.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setDialogOpen(false)}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => mutation.mutate()}
							disabled={mutation.isPending}
						>
							{mutation.isPending ? "Starting…" : "Confirm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
