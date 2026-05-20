import { useState, useMemo } from "react";
import { AlertCircle, ChevronDown, Check } from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
import { useDebounce } from "@/hooks/useDebounce";
import { usePreviewBatch, useRunBatch } from "../api";
import type {
	PreviewBatchParams,
	PreviewBatchResult,
	RunBatchParams,
} from "../api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StaffOption = {
	id: string; // members.userId
	name: string;
};

interface RunBatchDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	staffOptions: StaffOption[];
}

// ---------------------------------------------------------------------------
// Multi-staff combobox
// ---------------------------------------------------------------------------

function StaffMultiSelect({
	options,
	selected,
	onChange,
}: {
	options: StaffOption[];
	selected: string[];
	onChange: (ids: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const selectedSet = useMemo(() => new Set(selected), [selected]);

	function toggle(id: string) {
		const next = new Set(selectedSet);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		onChange(Array.from(next));
	}

	const selectedLabels = options
		.filter((o) => selectedSet.has(o.id))
		.map((o) => o.name);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between font-normal h-auto min-h-9 py-1.5"
					data-testid="batch-staff-combobox"
				>
					<span className="flex flex-wrap gap-1 text-left">
						{selectedLabels.length === 0 ? (
							<span className="text-muted-foreground text-sm">
								Select staff members...
							</span>
						) : selectedLabels.length <= 3 ? (
							selectedLabels.map((name) => (
								<Badge key={name} variant="secondary" className="text-xs">
									{name}
								</Badge>
							))
						) : (
							<>
								{selectedLabels.slice(0, 2).map((name) => (
									<Badge key={name} variant="secondary" className="text-xs">
										{name}
									</Badge>
								))}
								<Badge variant="secondary" className="text-xs">
									+{selectedLabels.length - 2} more
								</Badge>
							</>
						)}
					</span>
					<ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-0" align="start">
				<Command>
					<CommandInput placeholder="Search staff..." />
					<CommandList>
						<CommandEmpty>No staff found.</CommandEmpty>
						<CommandGroup>
							{options.map((opt) => (
								<CommandItem
									key={opt.id}
									value={opt.name}
									onSelect={() => toggle(opt.id)}
								>
									<Check
										className={cn(
											"mr-2 h-4 w-4",
											selectedSet.has(opt.id)
												? "opacity-100"
												: "opacity-0",
										)}
									/>
									{opt.name}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

// ---------------------------------------------------------------------------
// Preview panel
// ---------------------------------------------------------------------------

function PreviewPanel({
	count,
	totalAmountCents,
	byStaff,
	truncated,
	isLoading,
	error,
}: {
	count: number;
	totalAmountCents: number;
	byStaff: Array<{
		staffId: string;
		staffName: string;
		count: number;
		totalCents: number;
	}>;
	truncated?: boolean;
	isLoading: boolean;
	error: Error | null;
}) {
	if (isLoading) {
		return (
			<div className="rounded-lg border bg-muted/30 p-4">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					Calculating preview...
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
				<div className="flex items-center gap-2 text-sm text-destructive">
					<AlertCircle className="h-4 w-4 shrink-0" />
					{error.message ?? "Failed to load preview."}
				</div>
			</div>
		);
	}

	if (count === 0) {
		return (
			<div className="rounded-lg border bg-muted/30 p-4">
				<p className="text-sm text-muted-foreground text-center">
					No approved splits found for the selected staff and date range.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-lg border bg-muted/20 p-4 space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium">Batch Preview</p>
				<p className="text-sm font-semibold tabular-nums">
					{formatPrice(totalAmountCents, "MYR")} total
				</p>
			</div>

			<div className="text-xs text-muted-foreground" data-testid="batch-preview-count">
				{count} approved split{count !== 1 ? "s" : ""} across {byStaff.length}{" "}
				staff member{byStaff.length !== 1 ? "s" : ""}
			</div>

			{byStaff.length > 0 && (
				<div className="space-y-1.5 max-h-40 overflow-y-auto">
					{byStaff.map((s) => (
						<div
							key={s.staffId}
							className="flex items-center justify-between text-xs"
						>
							<span className="truncate text-foreground">{s.staffName}</span>
							<span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
								{s.count} split{s.count !== 1 ? "s" : ""} ·{" "}
								{formatPrice(s.totalCents, "MYR")}
							</span>
						</div>
					))}
				</div>
			)}

			{truncated && (
				<p className="text-xs text-amber-600">
					Showing first 500 splits — narrow the date range to confirm the full
					count before confirming.
				</p>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main drawer
// ---------------------------------------------------------------------------

/** Returns YYYY-MM-DD for the first day of the current month */
function firstOfMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Returns YYYY-MM-DD for today */
function today(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toIsoStart(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toISOString();
}

function toIsoEnd(dateStr: string): string {
	return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

export function RunBatchDrawer({
	open,
	onOpenChange,
	organizationId,
	staffOptions,
}: RunBatchDrawerProps) {
	// ── Form state ──────────────────────────────────────────────────────────────
	const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
	const [periodStart, setPeriodStart] = useState(firstOfMonth());
	const [periodEnd, setPeriodEnd] = useState(today());
	const [paymentMethod, setPaymentMethod] =
		useState<RunBatchParams["paymentMethod"]>("bank_transfer");
	const [reference, setReference] = useState("");

	// ── Debounced preview params ────────────────────────────────────────────────
	const rawPreviewParams: PreviewBatchParams = {
		staffIds: selectedStaffIds,
		periodStart: toIsoStart(periodStart),
		periodEnd: toIsoEnd(periodEnd),
	};

	const debouncedPreviewParams = useDebounce(rawPreviewParams, 500);

	const previewEnabled =
		selectedStaffIds.length > 0 && !!periodStart && !!periodEnd;

	const {
		data: previewRaw,
		isLoading: isPreviewLoading,
		error: previewError,
	} = usePreviewBatch(organizationId, debouncedPreviewParams, previewEnabled);

	const preview = previewRaw as PreviewBatchResult | undefined;

	// ── Run batch mutation ──────────────────────────────────────────────────────
	const { mutate: runBatch, isPending: isRunning } = useRunBatch(organizationId);

	function handleConfirm() {
		runBatch(
			{
				organizationId,
				staffIds: selectedStaffIds,
				periodStart: toIsoStart(periodStart),
				periodEnd: toIsoEnd(periodEnd),
				paymentMethod,
				reference: reference.trim() || undefined,
			},
			{
				onSuccess: () => {
					onOpenChange(false);
					// Reset form
					setSelectedStaffIds([]);
					setPeriodStart(firstOfMonth());
					setPeriodEnd(today());
					setPaymentMethod("bank_transfer");
					setReference("");
				},
			},
		);
	}

	const canConfirm =
		!isRunning &&
		selectedStaffIds.length > 0 &&
		!!periodStart &&
		!!periodEnd &&
		!!preview &&
		preview.count > 0;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-lg flex flex-col" data-testid="run-batch-drawer">
				<SheetHeader className="pb-2">
					<SheetTitle>Run Payout Batch</SheetTitle>
					<SheetDescription>
						Select staff and date range to batch-pay approved commission splits.
					</SheetDescription>
				</SheetHeader>

				{/* Scrollable body */}
				<div className="flex-1 overflow-y-auto px-4 space-y-5">
					{/* Staff selection */}
					<div className="space-y-1.5">
						<Label className="text-sm">Staff Members</Label>
						<StaffMultiSelect
							options={staffOptions}
							selected={selectedStaffIds}
							onChange={setSelectedStaffIds}
						/>
						{selectedStaffIds.length === 0 && (
							<p className="text-xs text-muted-foreground">
								Select at least one staff member to continue.
							</p>
						)}
					</div>

					{/* Date range */}
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label className="text-sm">Period Start</Label>
							<Input
								type="date"
								value={periodStart}
								onChange={(e) => setPeriodStart(e.target.value)}
								className="h-9"
								data-testid="batch-period-start"
							/>
						</div>
						<div className="space-y-1.5">
							<Label className="text-sm">Period End</Label>
							<Input
								type="date"
								value={periodEnd}
								onChange={(e) => setPeriodEnd(e.target.value)}
								className="h-9"
								data-testid="batch-period-end"
							/>
						</div>
					</div>

					{/* Payment method */}
					<div className="space-y-1.5">
						<Label className="text-sm">Payment Method</Label>
						<Select
							value={paymentMethod}
							onValueChange={(v) =>
								setPaymentMethod(v as RunBatchParams["paymentMethod"])
							}
						>
							<SelectTrigger className="h-9">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="bank_transfer">Bank Transfer</SelectItem>
								<SelectItem value="cash">Cash</SelectItem>
								<SelectItem value="check">Cheque</SelectItem>
								<SelectItem value="other">Other</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Reference (optional) */}
					<div className="space-y-1.5">
						<Label className="text-sm">
							Reference{" "}
							<span className="text-muted-foreground font-normal">
								(optional)
							</span>
						</Label>
						<Input
							placeholder="e.g. May 2026 payroll, cheque #1234"
							value={reference}
							onChange={(e) => setReference(e.target.value)}
							className="h-9"
						/>
					</div>

					{/* Preview panel */}
					{previewEnabled && (
						<PreviewPanel
							count={preview?.count ?? 0}
							totalAmountCents={preview?.totalAmountCents ?? 0}
							byStaff={preview?.byStaff ?? []}
							truncated={preview?.truncated}
							isLoading={isPreviewLoading}
							error={previewError}
						/>
					)}
				</div>

				<SheetFooter className="border-t pt-4 gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isRunning}
						className="flex-1 sm:flex-none"
					>
						Cancel
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={!canConfirm}
						className="flex-1 sm:flex-none"
						data-testid="batch-confirm-button"
					>
						{isRunning ? "Processing..." : "Confirm Payout"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
