import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";

export function ClaimsWidget() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: expenses = [], isLoading } = useQuery({
		...orpc.expenses.list.queryOptions({
			input: { organizationId: organizationId!, status: "pending", limit: 10 },
		}),
		enabled: !!organizationId,
	});

	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle className="text-2xl font-bold">Claims</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col gap-y-4 max-h-[280px] overflow-y-auto pr-4 -mr-4 scrollbar-warm">
					{isLoading ? (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							Loading...
						</div>
					) : expenses.length === 0 ? (
						<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
							No pending claims
						</div>
					) : (
						expenses.map((expense) => (
							<div
								key={expense.id}
								className="flex items-center justify-between text-sm"
							>
								<div className="flex items-center gap-2 min-w-0">
									<Badge variant="secondary" className="capitalize shrink-0">
										{expense.category}
									</Badge>
									<span className="truncate text-muted-foreground">
										{expense.description}
									</span>
								</div>
								<span className="font-medium shrink-0 ml-2">
									{formatPrice(expense.amount, "MYR")}
								</span>
							</div>
						))
					)}
				</div>
			</CardContent>
		</Card>
	);
}
