import { useState, useMemo } from "react";
import { AlertCircle, ChevronDown, Check } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-left transition hover:bg-[#f3f3f3]"
					data-testid="batch-staff-combobox"
				>
					<span className="flex flex-1 flex-wrap gap-1">
						{selectedLabels.length === 0 ? (
							<span className="text-sm text-[#737373]">
								Select staff members…
							</span>
						) : selectedLabels.length <= 3 ? (
							selectedLabels.map((name) => (
								<span
									key={name}
									className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700"
								>
									{name}
								</span>
							))
						) : (
							<>
								{selectedLabels.slice(0, 2).map((name) => (
									<span
										key={name}
										className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700"
									>
										{name}
									</span>
								))}
								<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
									+{selectedLabels.length - 2} more
								</span>
							</>
						)}
					</span>
					<ChevronDown className="h-4 w-4 shrink-0 text-[#737373]" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-0" align="start">
				<Command>
					<CommandInput placeholder="Search staff…" />
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
											selectedSet.has(opt.id) ? "opacity-100" : "opacity-0",
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
			<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
				<div className="flex items-center gap-2 text-sm text-[#737373]">
					<div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0a0a0a] border-t-transparent" />
					Calculating preview…
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
				<div className="flex items-center gap-2 text-sm text-rose-600">
					<AlertCircle className="h-4 w-4 shrink-0" />
					{error.message ?? "Failed to load preview."}
				</div>
			</div>
		);
	}

	if (count === 0) {
		return (
			<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
				<p className="text-center text-sm text-[#737373]">
					No approved splits found for the selected staff and date range.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3 rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<div className="flex items-center justify-between">
				<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
					Batch Preview
				</p>
				<p className="font-mono text-2xl font-bold tabular-nums text-[#0a0a0a]">
					{formatPrice(totalAmountCents, "MYR")}
				</p>
			</div>

			<div className="text-xs text-[#737373]" data-testid="batch-preview-count">
				<span className="font-mono tabular-nums text-[#0a0a0a]">{count}</span>{" "}
				approved split{count !== 1 ? "s" : ""} across{" "}
				<span className="font-mono tabular-nums text-[#0a0a0a]">
					{byStaff.length}
				</span>{" "}
				staff member{byStaff.length !== 1 ? "s" : ""}
			</div>

			{byStaff.length > 0 && (
				<div className="max-h-40 space-y-px overflow-y-auto rounded-xl border border-[#e5e5e5] bg-white">
					{byStaff.map((s) => (
						<div
							key={s.staffId}
							className="flex items-center justify-between px-3 py-2 text-xs hover:bg-[#fafafa]"
						>
							<span className="truncate text-[#0a0a0a]">{s.staffName}</span>
							<span className="ml-2 shrink-0 font-mono tabular-nums text-[#737373]">
								{s.count} split{s.count !== 1 ? "s" : ""} ·{" "}
								<span className="text-[#0a0a0a]">
									{formatPrice(s.totalCents, "MYR")}
								</span>
							</span>
						</div>
					))}
				</div>
			)}

			{truncated && (
				<p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
					<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
	const { mutate: runBatch, isPending: isRunning } =
		useRunBatch(organizationId);

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
			<SheetContent
				side="right"
				className="w-full border-l border-[#e5e5e5] bg-white p-0 sm:max-w-[460px]"
				data-testid="run-batch-drawer"
			>
				<div className="flex h-full flex-col">
					{/* Header */}
					<div className="border-b border-[#e5e5e5] px-6 pb-4 pt-6">
						<p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Commission Payouts
						</p>
						<h2 className="text-lg font-bold text-[#0a0a0a]">
							Run Payout Batch
						</h2>
						<p className="mt-1 text-sm text-[#737373]">
							Batch-pay approved commission splits for selected staff and date
							range.
						</p>
					</div>

					{/* Scrollable body */}
					<div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
						{/* Staff selection */}
						<div className="flex flex-col gap-1.5">
							<Label className="text-sm text-[#0a0a0a]">
								Staff Members <span className="text-rose-600">*</span>
							</Label>
							<StaffMultiSelect
								options={staffOptions}
								selected={selectedStaffIds}
								onChange={setSelectedStaffIds}
							/>
							{selectedStaffIds.length === 0 && (
								<p className="text-xs text-[#737373]">
									Select at least one staff member to continue.
								</p>
							)}
						</div>

						{/* Date range */}
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1.5">
								<Label className="text-sm text-[#0a0a0a]">Period Start</Label>
								<Input
									type="date"
									value={periodStart}
									onChange={(e) => setPeriodStart(e.target.value)}
									className="h-9 font-mono tabular-nums"
									data-testid="batch-period-start"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label className="text-sm text-[#0a0a0a]">Period End</Label>
								<Input
									type="date"
									value={periodEnd}
									onChange={(e) => setPeriodEnd(e.target.value)}
									className="h-9 font-mono tabular-nums"
									data-testid="batch-period-end"
								/>
							</div>
						</div>

						{/* Payment method */}
						<div className="flex flex-col gap-1.5">
							<Label className="text-sm text-[#0a0a0a]">Payment Method</Label>
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
						<div className="flex flex-col gap-1.5">
							<Label className="text-sm text-[#0a0a0a]">
								Reference{" "}
								<span className="font-normal text-[#737373]">(optional)</span>
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

					{/* Sticky footer */}
					<div className="flex justify-end gap-2 border-t border-[#e5e5e5] bg-[#fafafa] px-6 py-4">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							disabled={isRunning}
							className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3] disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleConfirm}
							disabled={!canConfirm}
							className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-50"
							data-testid="batch-confirm-button"
						>
							{isRunning ? "Processing…" : "Confirm Payout"}
						</button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
