import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
	message: string;
	onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
			<AlertCircle className="h-8 w-8 text-destructive" />
			<p className="text-sm">{message}</p>
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					Retry
				</Button>
			)}
		</div>
	);
}
