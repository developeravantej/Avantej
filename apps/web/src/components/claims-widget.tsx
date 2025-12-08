import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Sample data - you can replace this with your actual data source
const claims = [
  { id: "1", name: "item 1", amount: "$ 1999.00", status: "pending" },
  { id: "2", name: "item 2", amount: "$ 12999.00", status: "pending" },
  { id: "3", name: "item 3", amount: "$ 13999.00", status: "pending" },
  { id: "4", name: "item 4", amount: "$ 14999.00", status: "pending" },
  { id: "5", name: "item 5", amount: "$ 15999.00", status: "pending" },
  { id: "6", name: "item 6", amount: "$ 16999.00", status: "pending" },
  { id: "7", name: "item 7", amount: "$ 17999.00", status: "pending" },
  { id: "8", name: "item 8", amount: "$ 18999.00", status: "pending" },
  { id: "9", name: "item 9", amount: "$ 19999.00", status: "pending" },
 
];

export function ClaimsWidget() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Claims</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4 h-[150px] overflow-y-auto pr-4 -mr-4  [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
                <div
                className="flex items-center justify-between border-b border-gray-200 pr-2 py-2 last:border-0 last:pb-0"
              >
                <div className="flex items-center">
                    <div className="text-lg font-bold">Name</div>
                </div>
                <div className="flex items-center">
                    <div className="text-lg font-bold">Amount</div>
                </div>
                <div className="flex items-center">
                    <div className="text-lg font-bold">Status</div>
                </div>
    
              </div>
            {claims.map((claim, index) => (
              <div
                key={index}
                className="flex items-center justify-between border-b border-gray-200 pr-2 py-2 last:border-0 last:pb-0"
              >
                <div className="flex items-center">
                    <div className="text-lg">{claim.name}</div>
                </div>
                <div className="flex items-center">
                    <div className="text-lg">{claim.amount}</div>
                </div>
                <div className="flex items-center">
                    <div className="text-lg">{claim.status}</div>
                </div>
    
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}


