import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
	return (
		<div className="space-y-6 p-6">
			<div className="flex items-center gap-3">
				<Skeleton className="size-16 rounded-full" />
				<div className="space-y-2">
					<Skeleton className="h-6 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
			</div>
			<div className="grid grid-cols-4 gap-4">
				{[0, 1, 2, 3].map((n) => (
					<Skeleton key={`skel-${n}`} className="h-24 rounded-xl" />
				))}
			</div>
			<Skeleton className="h-72 rounded-xl" />
		</div>
	);
}
