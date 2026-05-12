import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { client, orpc } from "@/utils/orpc";
import { rmToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	defaultServiceId?: string;
	onSuccess: () => void;
}

function localDatetimeDefault(): string {
	return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
		.toISOString()
		.slice(0, 16);
}

export function ServicePriceOverrideDialog({
	open,
	onOpenChange,
	organizationId,
	defaultServiceId,
	onSuccess,
}: Props) {
	const [serviceId, setServiceId] = useState(defaultServiceId ?? "");
	const [branchId, setBranchId] = useState<string>("__org_wide__");
	const [customerType, setCustomerType] = useState<string>("__all__");
	const [priceRm, setPriceRm] = useState("");
	const [effectiveFrom, setEffectiveFrom] = useState(() => localDatetimeDefault());
	const [effectiveUntil, setEffectiveUntil] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	const { data: services = [] } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId },
		}),
	});

	const { data: hierarchyData } = useQuery({
		queryKey: ["hierarchy-nodes", organizationId],
		queryFn: () => client.hierarchy.listNodes({ organizationId }),
	});

	const branchNodes = (hierarchyData?.nodes ?? []).filter(
		(n: { id: string; name: string; type: string }) => n.type === "branch",
	);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!serviceId) {
			toast.error("Please select a service.");
			return;
		}
		let priceCents: number;
		try {
			priceCents = rmToCents(priceRm);
		} catch {
			toast.error("Enter a valid price in RM.");
			return;
		}

		setIsSaving(true);
		try {
			await client.services.setBranchPrice({
				organizationId,
				serviceId,
				branchId: branchId === "__org_wide__" ? null : branchId,
				customerType:
					customerType === "__all__" ? null : (customerType as "member" | "walk_in"),
				priceCents,
				effectiveFrom: effectiveFrom
					? new Date(effectiveFrom).toISOString()
					: undefined,
				effectiveUntil: effectiveUntil
					? new Date(effectiveUntil).toISOString()
					: null,
			});
			toast.success("Price override saved.");
			onSuccess();
			resetForm();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to save price override.",
			);
		} finally {
			setIsSaving(false);
		}
	}

	function resetForm() {
		setServiceId(defaultServiceId ?? "");
		setBranchId("__org_wide__");
		setCustomerType("__all__");
		setPriceRm("");
		setEffectiveFrom(localDatetimeDefault());
		setEffectiveUntil("");
	}

	function handleOpenChange(v: boolean) {
		if (!v) resetForm();
		onOpenChange(v);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Service Price Override</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Service */}
					<div className="space-y-1.5">
						<Label htmlFor="spo-service">Service</Label>
						<Select value={serviceId} onValueChange={setServiceId}>
							<SelectTrigger id="spo-service">
								<SelectValue placeholder="Select service..." />
							</SelectTrigger>
							<SelectContent>
								{services.map((s: any) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Branch */}
					<div className="space-y-1.5">
						<Label htmlFor="spo-branch">Branch</Label>
						<Select value={branchId} onValueChange={setBranchId}>
							<SelectTrigger id="spo-branch">
								<SelectValue placeholder="Select branch..." />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__org_wide__">Org-wide / All branches</SelectItem>
								{branchNodes.map((n: { id: string; name: string }) => (
									<SelectItem key={n.id} value={n.id}>
										{n.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Customer type */}
					<div className="space-y-1.5">
						<Label htmlFor="spo-ct">Customer Type</Label>
						<Select value={customerType} onValueChange={setCustomerType}>
							<SelectTrigger id="spo-ct">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__all__">All</SelectItem>
								<SelectItem value="member">Member</SelectItem>
								<SelectItem value="walk_in">Walk-in</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Price */}
					<div className="space-y-1.5">
						<Label htmlFor="spo-price">Price (RM)</Label>
						<div className="relative">
							<span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground text-sm">
								RM
							</span>
							<Input
								id="spo-price"
								type="number"
								min="0"
								step="0.01"
								className="pl-9"
								placeholder="0.00"
								value={priceRm}
								onChange={(e) => setPriceRm(e.target.value)}
								required
							/>
						</div>
					</div>

					{/* Effective from */}
					<div className="space-y-1.5">
						<Label htmlFor="spo-from">Effective From</Label>
						<Input
							id="spo-from"
							type="datetime-local"
							value={effectiveFrom}
							onChange={(e) => setEffectiveFrom(e.target.value)}
						/>
					</div>

					{/* Effective until */}
					<div className="space-y-1.5">
						<Label htmlFor="spo-until">
							Effective Until{" "}
							<span className="font-normal text-muted-foreground">(leave blank for open-ended)</span>
						</Label>
						<Input
							id="spo-until"
							type="datetime-local"
							value={effectiveUntil}
							onChange={(e) => setEffectiveUntil(e.target.value)}
						/>
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={isSaving}>
							{isSaving ? "Saving..." : "Save Override"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
