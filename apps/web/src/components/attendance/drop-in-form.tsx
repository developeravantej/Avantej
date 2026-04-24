import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	queryKey: _queryKey,
}: DropInFormProps) {
	const [clientId, setClientId] = useState("");
	const [clientType, setClientType] = useState<"member" | "walk_in">("member");
	const [displayName, setDisplayName] = useState("");
	const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
	const [duplicateMins, setDuplicateMins] = useState<string | null>(null);

	// UUID validation — used to gate the active package query
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const isValidUuid = uuidRegex.test(clientId.trim());

	// Credits lookup — fires only when clientType is "member" and clientId is a valid UUID
	const { data: activePackage } = useQuery({
		queryKey: ["activePackageForMember", organizationId, clientId.trim()],
		queryFn: async () =>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(client as any).checkIns.getActivePackageForMember({
				organizationId,
				clientId: clientId.trim(),
			}),
		enabled: clientType === "member" && isValidUuid,
		staleTime: 30 * 1000,
	});

	const checkInMutation = useApiMutation({
		mutationFn: async () => {
			const payload =
				clientType === "walk_in"
					? {
							organizationId,
							clientType: "walk_in" as const,
							branchId,
							source: "drop_in" as const,
							outcome: "attended" as const,
							clientDisplayName: displayName.trim() || undefined,
						}
					: {
							organizationId,
							clientType: "member" as const,
							clientId: clientId.trim(),
							branchId,
							source: "drop_in" as const,
							outcome: "attended" as const,
						};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (client as any).checkIns.recordCheckIn(payload);
		},
		successMessage: () =>
			`Drop-in check-in recorded${displayName ? ` for ${displayName}` : ""}.`,
		errorMessage: false,
		invalidate: [["attendance"]],
		onSuccess: () => {
			setClientId("");
			setDisplayName("");
		},
		onError: (err) => {
			const msg = err.message || "Unknown error";
			if (
				msg.toLowerCase().includes("already_checked_in") ||
				msg.toLowerCase().includes("already checked in")
			) {
				const mins = msg.match(/\d+/)?.[0] ?? null;
				setDuplicateMins(mins);
				setDuplicateDialogOpen(true);
			} else {
				toast.error(`Check-in failed: ${msg}`);
			}
		},
	});

	const canSubmit =
		(clientType === "walk_in" || clientId.trim().length > 0) &&
		!checkInMutation.isPending;

	return (
		<>
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

					{/* Client ID or Walk-in (depends on mode) */}
					{clientType === "member" ? (
						<div className="space-y-1">
							<Label className="text-xs">Member User ID</Label>
							<Input
								placeholder="Paste member user ID..."
								value={clientId}
								onChange={(e) => setClientId(e.target.value)}
								className="font-mono text-xs"
							/>
							<p className="text-[11px] text-muted-foreground">
								Find via Customer Directory — copy the user ID.
							</p>
							{/* Credits lookup result */}
							{clientType === "member" && isValidUuid && (
								<div className="mt-2">
									{activePackage === null && (
										<p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
											No active package credits. Check-in will not debit anything.
										</p>
									)}
									{activePackage && (
										<p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
											{activePackage.creditsRemaining} credits remaining on active
											package
										</p>
									)}
								</div>
							)}
						</div>
					) : (
						<div className="space-y-1">
							<Label className="text-xs">Display Name (optional)</Label>
							<Input
								placeholder="e.g. Sarah Tan"
								value={displayName}
								onChange={(e) => setDisplayName(e.target.value)}
							/>
							<p className="text-[11px] text-muted-foreground">
								Optional — shown in the check-in log.
							</p>
						</div>
					)}

					{/* Check-in button */}
					<Button
						className="w-full"
						disabled={!canSubmit}
						onClick={() => checkInMutation.mutate()}
					>
						{checkInMutation.isPending ? "Checking in..." : "Check In (Drop-in)"}
					</Button>
				</CardContent>
			</Card>

			<Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Already Checked In</DialogTitle>
						<DialogDescription>
							{duplicateMins
								? `This client was already checked in ${duplicateMins} minutes ago.`
								: "This client was already checked in recently."}
							{" "}Check-ins within 30 minutes are not allowed.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setDuplicateDialogOpen(false)}>Dismiss</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
