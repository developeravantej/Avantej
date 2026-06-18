import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CommsTab({ organizationId }: { organizationId: string }) {
	const [dmSubject, setDmSubject] = useState("");
	const [dmMessage, setDmMessage] = useState("");
	const [annTitle, setAnnTitle] = useState("");
	const [annMessage, setAnnMessage] = useState("");
	const [annPriority, setAnnPriority] = useState<
		"low" | "normal" | "high" | "urgent"
	>("normal");
	const [annAudience, setAnnAudience] = useState<"all" | "staff" | "clients">(
		"all",
	);

	const dm = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.sendTenantDirectMessage({
				organizationId,
				subject: dmSubject,
				message: dmMessage,
			}),
		onSuccess: (r) => {
			const delivered = [
				r.deliveries.email && "email",
				r.deliveries.inApp && "in-app",
			]
				.filter(Boolean)
				.join(" + ");
			toast.success(`DM sent via ${delivered || "audit only"}`);
			if (r.errors.length > 0) toast.warning(r.errors.join("\n"));
			setDmSubject("");
			setDmMessage("");
		},
		onError: (e: unknown) =>
			toast.error(`DM failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const ann = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.createTenantAnnouncement({
				organizationId,
				title: annTitle,
				message: annMessage,
				priority: annPriority,
				targetAudience: annAudience,
			}),
		onSuccess: (r) => {
			toast.success(`Announcement created (${r.announcementId})`);
			setAnnTitle("");
			setAnnMessage("");
		},
		onError: (e: unknown) =>
			toast.error(`Announcement failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const dmValid = dmSubject.trim().length >= 3 && dmMessage.trim().length >= 3;
	const annValid = annTitle.trim().length >= 3 && annMessage.trim().length >= 3;

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Direct message owner</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Email + in-app notification. All deliveries audited.
					</p>
					<Input
						placeholder="Subject"
						value={dmSubject}
						onChange={(e) => setDmSubject(e.target.value)}
						disabled={dm.isPending}
					/>
					<Textarea
						className="min-h-[120px]"
						placeholder="Message"
						value={dmMessage}
						onChange={(e) => setDmMessage(e.target.value)}
						disabled={dm.isPending}
					/>
					<Button
						size="sm"
						disabled={!dmValid || dm.isPending}
						onClick={() => dm.mutate()}
					>
						{dm.isPending ? "Sending…" : "Send DM"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Broadcast announcement</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<p className="text-xs text-muted-foreground">
						Inserts into tenant announcements table.
					</p>
					<Input
						placeholder="Title"
						value={annTitle}
						onChange={(e) => setAnnTitle(e.target.value)}
						disabled={ann.isPending}
					/>
					<Textarea
						className="min-h-[100px]"
						placeholder="Message"
						value={annMessage}
						onChange={(e) => setAnnMessage(e.target.value)}
						disabled={ann.isPending}
					/>
					<div className="flex gap-2">
						<Select
							value={annPriority}
							onValueChange={(v) => setAnnPriority(v as typeof annPriority)}
							disabled={ann.isPending}
						>
							<SelectTrigger className="flex-1">
								<SelectValue placeholder="Priority" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="low">low</SelectItem>
								<SelectItem value="normal">normal</SelectItem>
								<SelectItem value="high">high</SelectItem>
								<SelectItem value="urgent">urgent</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={annAudience}
							onValueChange={(v) => setAnnAudience(v as typeof annAudience)}
							disabled={ann.isPending}
						>
							<SelectTrigger className="flex-1">
								<SelectValue placeholder="Audience" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">all</SelectItem>
								<SelectItem value="staff">staff</SelectItem>
								<SelectItem value="clients">clients</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<Button
						size="sm"
						disabled={!annValid || ann.isPending}
						onClick={() => ann.mutate()}
					>
						{ann.isPending ? "Posting…" : "Post announcement"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
