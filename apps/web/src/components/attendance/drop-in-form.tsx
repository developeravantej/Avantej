import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * V1: free-text search — the searchClient backend procedure may not be available
 * during parallel phase delivery. User types a name/ID, selects clientType, submits.
 */
type DropInFormProps = {
	organizationId: string;
	branchId: string;
	/** TanStack Query key to invalidate after a successful check-in */
	queryKey: unknown[];
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DropInForm({
	organizationId,
	branchId,
	queryKey,
}: DropInFormProps) {
	const queryClient = useQueryClient();

	const [clientId, setClientId] = useState("");
	const [clientType, setClientType] = useState<"member" | "walk_in">("member");
	const [displayName, setDisplayName] = useState("");

	const checkInMutation = useMutation({
		mutationFn: async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (client as any).checkIns.recordCheckIn({
				organizationId,
				clientType,
				clientId: clientId.trim(),
				branchId,
				source: "drop_in",
				outcome: "attended",
			});
		},
		onSuccess: () => {
			toast.success(
				`Drop-in check-in recorded${displayName ? ` for ${displayName}` : ""}.`,
			);
			setClientId("");
			setDisplayName("");
			// Invalidate both bookings + check-ins log — both share the "attendance" prefix
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
		},
		onError: (err: unknown) => {
			const msg = err instanceof Error ? err.message : "Unknown error";
			if (
				msg.toLowerCase().includes("already_checked_in") ||
				msg.toLowerCase().includes("already checked in")
			) {
				const mins = msg.match(/\d+/)?.[0];
				toast.warning(
					mins
						? `Already checked in ${mins} minutes ago`
						: "Already checked in recently",
				);
			} else {
				toast.error(`Check-in failed: ${msg}`);
			}
		},
	});

	const canSubmit = clientId.trim().length > 0 && !checkInMutation.isPending;

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Drop-in Check-in</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Client type toggle */}
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => setClientType("member")}
						className={`flex-1 rounded-md border py-2 font-medium text-sm transition-colors ${
							clientType === "member"
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-background text-foreground hover:bg-muted"
						}`}
					>
						Member
					</button>
					<button
						type="button"
						onClick={() => setClientType("walk_in")}
						className={`flex-1 rounded-md border py-2 font-medium text-sm transition-colors ${
							clientType === "walk_in"
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-background text-foreground hover:bg-muted"
						}`}
					>
						Walk-in
					</button>
				</div>

				{/* Client ID field */}
				<div className="space-y-1">
					<Label className="text-xs">
						{clientType === "member" ? "Member User ID" : "Walk-in Customer ID"}
					</Label>
					<Input
						placeholder={
							clientType === "member"
								? "Paste member user ID..."
								: "Paste walk-in customer ID..."
						}
						value={clientId}
						onChange={(e) => setClientId(e.target.value)}
						className="font-mono text-xs"
					/>
					<p className="text-[11px] text-muted-foreground">
						{clientType === "member"
							? "Find via Customer Directory — copy the user ID."
							: "Find via Walk-in Customers — copy the customer ID."}
					</p>
				</div>

				{/* Optional display name (local only — helps staff confirm identity) */}
				<div className="space-y-1">
					<Label className="text-xs">Display Name (optional)</Label>
					<Input
						placeholder="e.g. Sarah Tan"
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
					/>
					<p className="text-[11px] text-muted-foreground">
						For your reference only — not stored.
					</p>
				</div>

				{/* Check-in button */}
				<Button
					className="w-full"
					disabled={!canSubmit}
					onClick={() => checkInMutation.mutate()}
				>
					{checkInMutation.isPending ? "Checking in..." : "Check In (Drop-in)"}
				</Button>

				{/* Create new walk-in shortcut */}
				<div className="border-t pt-3">
					<Link
						to="/dashboard/customers/walk-in/view"
						className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
					>
						<UserPlus className="h-4 w-4" />+ Create New Walk-in
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
