/** Shared empty/placeholder pane for the customer directory (page + panel). */
export function DirectoryEmptyPane({
	heading,
	helper,
}: {
	heading: string;
	helper: string;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center">
			<p className="text-sm font-medium text-[#0a0a0a]">{heading}</p>
			<p className="mt-1 text-xs text-[#737373]">{helper}</p>
		</div>
	);
}
