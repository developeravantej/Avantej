import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, AlertTriangle } from "lucide-react";

type MissingRateCategory = { categoryId: string; configId: string };

const EMPTY_FORM = { name: "", rank: 0, description: "" };

export function TrainerTiersPage() {
	const { data: userContext } = useUserContext();
	const orgId = userContext?.currentOrganizationId ?? "";

	const [createOpen, setCreateOpen] = useState(false);
	const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
	const [missingRateBanner, setMissingRateBanner] = useState<
		MissingRateCategory[] | null
	>(null);
	const [createForm, setCreateForm] = useState(EMPTY_FORM);

	const {
		data: tiers = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["trainerTiers", orgId, "list"],
		queryFn: () =>
			client.trainerTiers.list({ organizationId: orgId, includeInactive: true }),
		enabled: !!orgId,
	});

	const createMutation = useApiMutation({
		mutationFn: (data: { name: string; description?: string; rank: number }) =>
			client.trainerTiers.create({ organizationId: orgId, ...data }),
		successMessage: "Tier created",
		errorMessage: (err) => err.message || "Failed to create tier",
		onSuccess: (result) => {
			setCreateOpen(false);
			setCreateForm(EMPTY_FORM);
			refetch();
			const missing = result && typeof result === "object" && "missingRateCategories" in result
				? (result as { missingRateCategories: MissingRateCategory[] }).missingRateCategories
				: [];
			if (missing.length > 0) {
				setMissingRateBanner(missing);
			}
		},
	});

	const deactivateMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.trainerTiers.deactivate({ organizationId: orgId, id }),
		successMessage: "Tier deactivated",
		errorMessage: (err) => err.message || "Failed to deactivate tier",
		onSuccess: () => {
			setDeactivateTarget(null);
			refetch();
		},
	});

	const reactivateMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.trainerTiers.reactivate({ organizationId: orgId, id }),
		successMessage: "Tier reactivated",
		errorMessage: (err) => err.message || "Failed to reactivate tier",
		onSuccess: (result) => {
			refetch();
			const missing = result && typeof result === "object" && "missingRateCategories" in result
				? (result as { missingRateCategories: MissingRateCategory[] }).missingRateCategories
				: [];
			if (missing.length > 0) {
				setMissingRateBanner(missing);
			}
		},
	});

	function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		if (!createForm.name.trim()) {
			toast.error("Name is required");
			return;
		}
		createMutation.mutate({
			name: createForm.name.trim(),
			rank: createForm.rank,
			description: createForm.description.trim() || undefined,
		});
	}

	if (!orgId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to manage trainer tiers.
			</div>
		);
	}

	return (
		<div className="p-6">
			<div className="flex items-center justify-end mb-4">
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="w-4 h-4 mr-2" />
					New Tier
				</Button>
			</div>

			{missingRateBanner && missingRateBanner.length > 0 && (
				<Alert variant="destructive" className="mb-4">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						The following categories don't have a commission rate for this tier
						yet. Commission for trainers with this tier will be silently skipped
						until updated.
						<ul className="mt-1 list-disc list-inside text-xs">
							{missingRateBanner.map((c) => (
								<li key={c.categoryId}>{c.categoryId}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{isError ? (
				<Alert variant="destructive" className="mb-4">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription className="flex items-center justify-between">
						<span>
							{error instanceof Error
								? error.message
								: "Failed to load trainer tiers."}
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => refetch()}
							className="ml-4 shrink-0"
						>
							Retry
						</Button>
					</AlertDescription>
				</Alert>
			) : isLoading ? (
				<div className="text-center py-12 text-muted-foreground">Loading...</div>
			) : tiers.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground">
					No tiers yet. Create your first tier.
				</div>
			) : (
				<div className="rounded-md border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/50">
								<th className="px-4 py-3 text-left font-medium text-muted-foreground">
									Name
								</th>
								<th className="px-4 py-3 text-left font-medium text-muted-foreground">
									Rank
								</th>
								<th className="px-4 py-3 text-left font-medium text-muted-foreground">
									Status
								</th>
								<th className="px-4 py-3 text-right font-medium text-muted-foreground">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{tiers.map((tier) => {
								const isActive = tier.isActive !== false;
								return (
									<tr key={tier.id} className="border-b last:border-0">
										<td className="px-4 py-3 font-medium">{tier.name}</td>
										<td className="px-4 py-3 text-muted-foreground">
											{tier.rank ?? 0}
										</td>
										<td className="px-4 py-3">
											{isActive ? (
												<Badge variant="default">Active</Badge>
											) : (
												<Badge variant="secondary">Inactive</Badge>
											)}
										</td>
										<td className="px-4 py-3 text-right">
											{isActive ? (
												<Button
													variant="outline"
													size="sm"
													onClick={() => setDeactivateTarget(tier.id)}
													disabled={deactivateMutation.isPending}
												>
													Deactivate
												</Button>
											) : (
												<Button
													variant="outline"
													size="sm"
													onClick={() => reactivateMutation.mutate(tier.id)}
													disabled={reactivateMutation.isPending}
												>
													Reactivate
												</Button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			<Dialog
				open={createOpen}
				onOpenChange={(open) => {
					if (!open) {
						setCreateOpen(false);
						setCreateForm(EMPTY_FORM);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>New Tier</DialogTitle>
						<DialogDescription>
							Create a new seniority tier for commission calculation.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCreate} className="flex flex-col gap-4 pt-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tier-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="tier-name"
								placeholder="e.g. Senior Trainer"
								value={createForm.name}
								onChange={(e) =>
									setCreateForm((f) => ({ ...f, name: e.target.value }))
								}
								autoComplete="off"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tier-rank">Rank</Label>
							<Input
								id="tier-rank"
								type="number"
								min={0}
								value={createForm.rank}
								onChange={(e) =>
									setCreateForm((f) => ({
										...f,
										rank: parseInt(e.target.value, 10) || 0,
									}))
								}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tier-description">Description</Label>
							<Textarea
								id="tier-description"
								placeholder="Optional description..."
								rows={3}
								value={createForm.description}
								onChange={(e) =>
									setCreateForm((f) => ({ ...f, description: e.target.value }))
								}
							/>
						</div>
						<DialogFooter className="pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setCreateOpen(false);
									setCreateForm(EMPTY_FORM);
								}}
								disabled={createMutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={createMutation.isPending}>
								{createMutation.isPending ? "Creating..." : "Create Tier"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={deactivateTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeactivateTarget(null);
				}}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Deactivate Tier</DialogTitle>
						<DialogDescription>
							Are you sure you want to deactivate{" "}
							<span className="font-semibold text-foreground">
								{tiers.find((t) => t.id === deactivateTarget)?.name ??
									"this tier"}
							</span>
							? Trainers assigned to it will have their commission skipped until
							the tier is reactivated.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="pt-2">
						<Button
							variant="outline"
							onClick={() => setDeactivateTarget(null)}
							disabled={deactivateMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (deactivateTarget)
									deactivateMutation.mutate(deactivateTarget);
							}}
							disabled={deactivateMutation.isPending}
						>
							{deactivateMutation.isPending
								? "Deactivating..."
								: "Deactivate"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
