export type SampleAmountInputProps = {
	sampleInput: string;
	onSampleInputChange: (raw: string, parsed: number | null) => void;
	onBlur: () => void;
};

export function SampleAmountInput({
	sampleInput,
	onSampleInputChange,
	onBlur,
}: SampleAmountInputProps) {
	return (
		<div className="flex items-center gap-1.5 text-xs text-[#737373]">
			<span>Sample amount</span>
			<div className="flex items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1">
				<span className="font-medium text-[#737373]">RM</span>
				<input
					type="text"
					value={sampleInput}
					onChange={(e) => {
						const raw = e.target.value.replace(/,/g, "");
						const n = parseFloat(raw);
						onSampleInputChange(
							e.target.value,
							!Number.isNaN(n) && n > 0 ? n : null,
						);
					}}
					onBlur={onBlur}
					className="w-16 bg-transparent font-mono text-xs font-medium text-[#0a0a0a] tabular-nums outline-none"
				/>
			</div>
		</div>
	);
}
