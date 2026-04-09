import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";

export function PayrollWidget() {
  const { data: userCtx } = useUserContext();
  const organizationId = userCtx?.currentOrganizationId ?? "";

  const { data = [] } = useQuery({
    ...orpc.payouts.list.queryOptions({ input: { organizationId, limit: 20 } }),
    enabled: !!organizationId,
  });

  const payrolls = data.map((payout: any) => ({
    id: payout.id,
    name: payout.recipientName ?? "Unknown",
    amount: formatCents(payout.amount),
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Payroll</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4 max-h-[280px] overflow-y-auto pr-4 -mr-4 scrollbar-warm">
          {payrolls.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No payroll data available
            </div>
          ) : (
            payrolls.map((payroll: any) => (
              <div
                key={payroll.id}
                className="flex items-center justify-between border-b border-brand-secondary-3 pr-2 py-2 last:border-0 last:pb-0"
              >
                <div className="flex items-center">
                  <div className="text-lg font-medium">{payroll.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-lg">{payroll.amount}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}





