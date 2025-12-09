import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Sample data - you can replace this with your actual data source
const payrolls = [
  { id: "1", name: "sales 1", amount: "$ 1999.00" },
  { id: "2", name: "sales 2", amount: "$ 12999.00" },
  { id: "3", name: "sales 3", amount: "$ 13999.00" },
  { id: "4", name: "sales 4", amount: "$ 14999.00" },
  { id: "5", name: "sales 5", amount: "$ 15999.00" },
  { id: "6", name: "sales 6", amount: "$ 16999.00" },
  { id: "7", name: "sales 7", amount: "$ 17999.00" },
  { id: "8", name: "sales 8", amount: "$ 18999.00" },
  { id: "9", name: "sales 9", amount: "$ 19999.00" },
];

export function PayrollWidget() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Payroll</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4 h-[150px] overflow-y-auto pr-4 -mr-4  [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
          {payrolls.map((payroll, index) => (
            <div
              key={index}
              className="flex items-center justify-between border-b border-gray-200 pr-2 py-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center">
                <div className="text-lg font-medium">{payroll.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-lg">{payroll.amount}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}





