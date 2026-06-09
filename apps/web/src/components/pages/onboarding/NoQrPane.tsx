import { QrCode } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Row } from "./types";

interface NoQrPaneProps {
	row: Row;
	canCreate: boolean;
	isPending: boolean;
	onGenerate: (branchId: string, maxUses: number | undefined) => void;
}

export function NoQrPane({
	row,
	canCreate,
	isPending,
	onGenerate,
}: NoQrPaneProps) {
	const [maxUsesInput, setMaxUsesInput] = useState("");

	const parsedMaxUses = maxUsesInput.trim()
		? parseInt(maxUsesInput.trim(), 10) || undefined
		: undefined;

	return (
		<div className="flex h-full flex-col items-center justify-center px-8 py-12">
			<div className="w-full max-w-sm">
				{/* QR placeholder */}
				<div className="mx-auto mb-8 flex h-48 w-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#e5e5e5] bg-white">
					<QrCode className="h-12 w-12 text-[#737373] opacity-30" />
					<p className="mt-2 text-center text-xs text-[#737373] max-w-[120px]">
						QR code will appear here after generation
					</p>
				</div>

				{/* Branch callout */}
				<div className="mb-4 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 flex items-center justify-between">
					<div>
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
							Branch
						</p>
						<p className="mt-0.5 text-sm font-semibold text-[#0a0a0a]">
							{row.branchName}
						</p>
					</div>
				</div>

				{/* Max uses input */}
				<div className="mb-4 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3">
					<Label
						htmlFor="max-uses"
						className="text-[10px] font-bold tracking-widest uppercase text-[#737373]"
					>
						Max Uses
					</Label>
					<Input
						id="max-uses"
						type="number"
						min={1}
						placeholder="Unlimited"
						value={maxUsesInput}
						onChange={(e) => setMaxUsesInput(e.target.value)}
						className="mt-1.5 font-mono tabular-nums"
					/>
					<p className="mt-1.5 text-xs text-[#737373]">
						Leave blank for no registration cap.
					</p>
				</div>

				<button
					type="button"
					className="inline-flex w-full items-center justify-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50 disabled:cursor-not-allowed"
					disabled={!canCreate || isPending}
					onClick={() => onGenerate(row.branchId, parsedMaxUses)}
					data-testid={`generate-${row.branchId}`}
				>
					<QrCode className="h-4 w-4" />
					{isPending ? "Generating…" : "Generate QR Code"}
				</button>

				{!canCreate && (
					<p className="mt-3 text-center text-xs text-[#737373]">
						You don't have permission to generate QR codes.
					</p>
				)}
			</div>
		</div>
	);
}
