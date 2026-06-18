export function ErrorCard({
	error,
	refetch,
}: {
	error: unknown;
	refetch: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-12">
			<p className="font-medium text-rose-600 text-lg">Failed to load data</p>
			<p className="mb-4 text-[#737373] text-sm">
				{error instanceof Error
					? error.message
					: "An unexpected error occurred"}
			</p>
			<button
				type="button"
				onClick={refetch}
				className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition"
			>
				Try Again
			</button>
		</div>
	);
}
