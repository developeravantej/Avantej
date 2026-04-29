"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { client } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WaitlistPanelProps {
	classSlotId: string;
	organizationId: string;
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
	if (status === "waiting") {
		return <Badge variant="secondary">Waiting</Badge>;
	}
	if (status === "promoted") {
		return <Badge variant="default">Promoted</Badge>;
	}
	if (status === "cancelled") {
		return <Badge variant="destructive">Cancelled</Badge>;
	}
	return <Badge variant="outline">{status}</Badge>;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function WaitlistSkeleton() {
	return (
		<div className="space-y-3 mt-4">
			{[1, 2, 3].map((i) => (
				<div key={i} className="flex items-center gap-3">
					<Skeleton className="h-5 w-6" />
					<Skeleton className="h-5 flex-1" />
					<Skeleton className="h-5 w-20" />
					<Skeleton className="h-5 w-16" />
					<Skeleton className="h-8 w-16" />
				</div>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// WaitlistPanel component
// ---------------------------------------------------------------------------

export function WaitlistPanel({ classSlotId, organizationId }: WaitlistPanelProps) {
	const [selectedMemberId, setSelectedMemberId] = useState<string>("");

	// -------------------------------------------------------------------------
	// Queries
	// -------------------------------------------------------------------------

	const {
		data: waitlistEntries = [],
		isLoading: waitlistLoading,
		error: waitlistError,
		refetch: refetchWaitlist,
	} = useQuery({
		queryKey: ["waitlist", organizationId, classSlotId],
		queryFn: () =>
			client.waitlist.list({ organizationId, classSlotId }),
		staleTime: 30_000,
		enabled: !!organizationId && !!classSlotId,
	});

	// members.list does not support a limit param — fetch all and use first 50 for the add combobox
	const { data: membersData = [] } = useQuery({
		queryKey: ["members", organizationId],
		queryFn: () => client.members.list({ organizationId }),
		staleTime: 60_000,
		enabled: !!organizationId,
	});

	// Build a userId → name map for cross-referencing waitlist entries
	// entry.userId holds the control panel userId (text); member.userId is the same
	const userNameMap = new Map<string, string>(
		membersData.map((m: any) => [m.userId, m.name]),
	);

	// Limit member combobox to first 50 (S1 scalability note: members.list has no limit param)
	const memberOptions = membersData.slice(0, 50);

	// -------------------------------------------------------------------------
	// Mutations
	// -------------------------------------------------------------------------

	const waitlistKey = ["waitlist", organizationId, classSlotId];

	const promoteMutation = useApiMutation({
		mutationFn: () =>
			client.waitlist.promote({ organizationId, classSlotId }),
		successMessage: "First person promoted",
		errorMessage: (err) => `Failed to promote: ${err.message}`,
		invalidate: [waitlistKey],
	});

	const removeMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.waitlist.remove({ organizationId, id }),
		successMessage: "Removed from waitlist",
		errorMessage: (err) => `Failed to remove: ${err.message}`,
		invalidate: [waitlistKey],
	});

	const addMutation = useApiMutation({
		mutationFn: (memberId: string) =>
			client.waitlist.add({ organizationId, classSlotId, memberId }),
		successMessage: "Added to waitlist",
		// Surface BAD_REQUEST (e.g. duplicate) as a user-friendly error
		errorMessage: (err) => err.message || "Failed to add to waitlist",
		invalidate: [waitlistKey],
		onSuccess: () => {
			setSelectedMemberId("");
		},
	});

	// -------------------------------------------------------------------------
	// Derived state
	// -------------------------------------------------------------------------

	const hasWaitingEntries = waitlistEntries.some((e) => e.status === "waiting");

	// -------------------------------------------------------------------------
	// Error state
	// -------------------------------------------------------------------------

	if (waitlistError) {
		return (
			<div className="mt-4 space-y-3">
				<p className="text-sm text-destructive">
					{waitlistError instanceof Error
						? waitlistError.message
						: "Failed to load waitlist"}
				</p>
				<Button variant="outline" size="sm" onClick={() => refetchWaitlist()}>
					Retry
				</Button>
			</div>
		);
	}

	// -------------------------------------------------------------------------
	// Render
	// -------------------------------------------------------------------------

	return (
		<div className="mt-4 space-y-6">
			{/* ----------------------------------------------------------------- */}
			{/* Promote first button                                               */}
			{/* ----------------------------------------------------------------- */}
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{waitlistLoading
						? "Loading..."
						: `${waitlistEntries.length} entr${waitlistEntries.length === 1 ? "y" : "ies"}`}
				</p>
				<Button
					variant="secondary"
					size="sm"
					disabled={
						promoteMutation.isPending ||
						waitlistLoading ||
						!hasWaitingEntries
					}
					onClick={() => promoteMutation.mutate()}
				>
					{promoteMutation.isPending ? "Promoting..." : "Promote First"}
				</Button>
			</div>

			{/* ----------------------------------------------------------------- */}
			{/* Waitlist table                                                     */}
			{/* ----------------------------------------------------------------- */}
			{waitlistLoading ? (
				<WaitlistSkeleton />
			) : waitlistEntries.length === 0 ? (
				<div className="rounded-lg border border-dashed p-8 text-center">
					<p className="text-sm text-muted-foreground">
						No one on the waitlist
					</p>
				</div>
			) : (
				<div className="rounded-md border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/50">
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">
									#
								</th>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">
									Member
								</th>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">
									Added
								</th>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground">
									Status
								</th>
								<th className="px-3 py-2 text-right font-medium text-muted-foreground">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{waitlistEntries.map((entry) => (
								<tr key={entry.id} className="border-b last:border-0">
									<td className="px-3 py-2 text-muted-foreground">
										{entry.position}
									</td>
									<td className="px-3 py-2 font-medium">
										{userNameMap.get(entry.userId) ?? "Unknown"}
									</td>
									<td className="px-3 py-2 text-muted-foreground">
										{new Date((entry as any).addedAt ?? entry.createdAt).toLocaleDateString()}
									</td>
									<td className="px-3 py-2">
										<StatusBadge status={entry.status} />
									</td>
									<td className="px-3 py-2 text-right">
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive hover:text-destructive"
											disabled={removeMutation.isPending}
											onClick={() => removeMutation.mutate(entry.id)}
										>
											Remove
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* ----------------------------------------------------------------- */}
			{/* Add to waitlist section                                            */}
			{/* ----------------------------------------------------------------- */}
			<div className="space-y-3 rounded-lg border bg-card p-4">
				<p className="text-sm font-medium">Add to Waitlist</p>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="waitlist-member">Member</Label>
					<Select
						value={selectedMemberId}
						onValueChange={setSelectedMemberId}
					>
						<SelectTrigger id="waitlist-member" className="w-full">
							<SelectValue placeholder="Select a member" />
						</SelectTrigger>
						<SelectContent>
							{memberOptions.map((m: any) => (
								<SelectItem key={m.id} value={m.id}>
									{m.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					className="w-full"
					disabled={!selectedMemberId || addMutation.isPending}
					onClick={() => {
						if (selectedMemberId) {
							addMutation.mutate(selectedMemberId);
						}
					}}
				>
					{addMutation.isPending ? "Adding..." : "Add to Waitlist"}
				</Button>
			</div>
		</div>
	);
}
