import * as React from "react";

import { cn } from "@/lib/utils";

type PageCardPadding = "default" | "compact" | "none";
type PageCardElement = "section" | "article" | "div";

interface PageCardProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Render as a different semantic element. Defaults to "div". */
	as?: PageCardElement;
	/** Reduce border-radius for nested cards. Defaults to false. */
	nested?: boolean;
	/** Internal padding variant. Defaults to "default" (p-6). */
	padding?: PageCardPadding;
}

const paddingClasses: Record<PageCardPadding, string> = {
	default: "p-6",
	compact: "p-5",
	none: "p-0",
};

function PageCard({
	as: Tag = "div",
	nested = false,
	padding = "default",
	className,
	...props
}: PageCardProps) {
	return (
		<Tag
			className={cn(
				nested ? "rounded-xl" : "rounded-2xl",
				"border border-brand-secondary-3 bg-card",
				paddingClasses[padding],
				className,
			)}
			{...props}
		/>
	);
}

export { PageCard };
export type { PageCardProps, PageCardPadding, PageCardElement };
