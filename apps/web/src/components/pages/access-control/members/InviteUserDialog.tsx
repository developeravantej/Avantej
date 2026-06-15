import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SYSTEM_ROLES } from "./types";
import type { SystemRole } from "./types";

interface InviteUserDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onInvite: (email: string, role: SystemRole) => Promise<void>;
	isLoading?: boolean;
}

export function InviteUserDialog({
	isOpen,
	onClose,
	onInvite,
	isLoading,
}: InviteUserDialogProps) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<SystemRole>("staff");

	const handleSubmit = async () => {
		if (!email) {
			toast.error("Please enter an email address");
			return;
		}

		await onInvite(email, role);

		// Reset form
		setEmail("");
		setRole("staff");
	};

	const handleClose = () => {
		setEmail("");
		setRole("staff");
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						ACCESS CONTROL
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Invite User
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Send an invitation email to a new user.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="mt-2 space-y-4">
						<div className="space-y-2">
							<label
								htmlFor="invite-user-email"
								className="text-sm font-medium"
							>
								Email
							</label>
							<Input
								id="invite-user-email"
								type="email"
								placeholder="Enter user email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<label htmlFor="invite-user-role" className="text-sm font-medium">
								Role
							</label>
							<Select
								value={role}
								onValueChange={(value) => setRole(value as SystemRole)}
							>
								<SelectTrigger id="invite-user-role">
									<SelectValue placeholder="Select a role" />
								</SelectTrigger>
								<SelectContent>
									{SYSTEM_ROLES.map((r) => (
										<SelectItem key={r.value} value={r.value}>
											<div>
												<div className="font-medium">{r.label}</div>
												<div className="text-xs text-[#737373]">
													{r.description}
												</div>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isLoading}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isLoading ? "Sending..." : "Send Invitation"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
