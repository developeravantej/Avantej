/**
 * Assign Trainer drawer — admin picks a trainer for a pending package_instance.
 * Calls `packageInstances.assignTrainer` (Pattern C: assignment IS approval).
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";

type PendingRow = {
	id: string;
	customerName?: string | null;
	customerEmail?: string | null;
	serviceName?: string | null;
	branchId?: string | null;
};

type AssignTrainerDrawerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	pkg: PendingRow | null;
	/** Pre-select a trainer (used by trainer self-assign flow). */
	defaultTrainerMemberId?: string;
	/** Hide the trainer picker entirely (self-assign mode). */
	lockTrainer?: boolean;
	onAssigned?: () => void;
};

export function AssignTrainerDrawer({
	open,
	onOpenChange,
	organizationId,
	pkg,
	defaultTrainerMemberId,
	lockTrainer,
	onAssigned,
}: AssignTrainerDrawerProps) {
	const [trainerMemberId, setTrainerMemberId] = useState<string | null>(
		defaultTrainerMemberId ?? null,
	);

	useEffect(() => {
		if (open) {
			setTrainerMemberId(defaultTrainerMemberId ?? null);
		}
	}, [open, defaultTrainerMemberId]);

	// Load trainers in the package's branch.
	const { data: members = [], isLoading: loadingTrainers } = useQuery({
		queryKey: ["members", organizationId, "trainer-list", pkg?.branchId],
		queryFn: () => client.members.list({ organizationId }),
		enabled: open && !!pkg && !lockTrainer,
	});

	const trainers = useMemo(() => {
		return members.filter(
			(m: { role: string; status: string; id: string; userId: string; name: string }) =>
				(m.role === "trainer" || m.role === "admin") &&
				m.status === "active",
		);
	}, [members]);

	const mutation = useApiMutation({
		mutationFn: () => {
			if (!pkg || !trainerMemberId) {
				throw new Error("Missing package or trainer");
			}
			return client.packageInstances.assignTrainer({
				organizationId,
				packageInstanceId: pkg.id,
				trainerMemberId,
			});
		},
		successMessage: "Trainer assigned. Package is now active.",
		errorMessage: (err) =>
			err?.message ?? "Failed to assign trainer.",
		invalidate: [
			["packageInstances"],
			["notifications"],
		],
		onSuccess: () => {
			onAssigned?.();
			onOpenChange(false);
		},
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
				<SheetHeader className="border-b pb-4">
					<SheetTitle className="font-semibold text-base">
						Assign Trainer
					</SheetTitle>
					<SheetDescription>
						{pkg
							? `Pick a trainer for ${pkg.customerName ?? "this customer"}'s ${pkg.serviceName ?? "package"}. Pattern C: assignment auto-approves the package.`
							: "Loading…"}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 p-4">
					{pkg && (
						<div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm">
							<div className="mb-1 font-medium text-foreground">
								{pkg.customerName ?? "Customer"}{" "}
								<span className="font-normal text-muted-foreground">
									{pkg.customerEmail ? `· ${pkg.customerEmail}` : ""}
								</span>
							</div>
							<div className="text-muted-foreground">
								{pkg.serviceName ?? "Package"}
							</div>
						</div>
					)}

					{!lockTrainer && (
						<div className="space-y-2">
							<Label htmlFor="trainer-select">Trainer</Label>
							<Select
								value={trainerMemberId ?? ""}
								onValueChange={(v) => setTrainerMemberId(v)}
							>
								<SelectTrigger id="trainer-select">
									<SelectValue
										placeholder={
											loadingTrainers ? "Loading…" : "Select a trainer"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{trainers.length === 0 && !loadingTrainers && (
										<div className="px-2 py-1 text-muted-foreground text-sm">
											No active trainers in this branch
										</div>
									)}
									{(trainers as { role: string; status: string; id: string; userId: string; name: string }[]).map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.name ?? t.userId}
											<span className="ml-2 text-muted-foreground text-xs">
												({t.role})
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{lockTrainer && (
						<p className="text-sm text-muted-foreground">
							You'll be assigned as the primary trainer for this package.
						</p>
					)}
				</div>

				<SheetFooter className="border-t pt-4">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending || !trainerMemberId}
					>
						{mutation.isPending ? "Assigning…" : "Confirm"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
