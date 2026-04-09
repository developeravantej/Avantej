import type * as React from "react";

export function SectionHeader({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
			{children}
		</h3>
	);
}
