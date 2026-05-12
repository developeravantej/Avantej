import { Badge } from "@/components/ui/badge"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import React from "react"

interface CopyableCellProps {
	value: string | null | undefined
	displayText?: React.ReactNode
}

export const CopyableCell: React.FC<CopyableCellProps> = ({ value, displayText }) => {
	const onCopy = (textToCopy: string) => {
		navigator.clipboard
			.writeText(textToCopy)
			.then(() => {
				toast.success("Copied to clipboard!")
			})
			.catch((err) => {
				toast.error("Failed to copy: " + err)
			})
	}

	if (!value) return <span className="text-muted-foreground">-</span>

	const displayContent = displayText || value

	return (
		<button
			type="button"
			className="cursor-pointer flex items-center group bg-transparent border-0 p-0"
			onClick={() => onCopy(value)}
		>
			<Badge
				variant="outline"
				className="flex items-center gap-x-1.5 truncate font-mono text-xs"
				title={value}
			>
				{displayContent}
				<Copy className="size-3 text-muted-foreground" />
			</Badge>
		</button>
	)
}
