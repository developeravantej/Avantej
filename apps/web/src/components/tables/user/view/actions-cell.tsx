import { useState } from "react";
import { client } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
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

	const mutation = useApiMutation({
		mutationFn: () =>
			client.tenantAdmin.impersonateMember({
				targetMemberId: member.id,
				organizationId,
			}),
		errorMessage: (err) =>
			err.message || "Failed to start impersonation session",
		onSuccess: (result) => {
			// Hard reload so the new session cookie is picked up by the browser
			window.location.href = result.redirectTo;
		},
		onError: () => {
			setDialogOpen(false);
		},
	});

	// Only show the button when caller is admin and target is a staff member
	if (!callerIsAdmin || member.role !== "staff") {
		return null;
	}

	const displayName = member.name || member.email || "this member";

	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
				Login as
			</Button>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent
					hideCloseButton
					className="p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							ACCESS CONTROL
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Log in as {displayName}?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							You will be impersonating this staff member. This session is
							audited and expires in 1 hour. You can return to your own account
							at any time using the banner that appears at the top of the page.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						>
							{mutation.isPending ? "Starting…" : "Confirm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
