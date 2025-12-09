import * as React from "react";
import { ChevronUp, ChevronsUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface TeamData {
  id: string;
  name: string;
  teamData: Array<{
    name: string;
    data: Array<{
      target: string;
      score: number;
    }>;
  }>;
}

interface SingleTeamDashboardProps {
  team: TeamData;
}

export function SingleTeamDashboard({ team }: SingleTeamDashboardProps) {
  // Get all custom data keys
  const customDataKeys = team.teamData.map((team) => team.name);

  const [showValues, setShowValues] = React.useState<Record<string, boolean>>(
    customDataKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {})
  );

  return (
    <Card className="h-full">
      <CardContent className="flex flex-col h-[250px]">
        <div className="overflow-y-auto pr-4 -mr-4 [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="flex justify-between items-center p-2">
            <h1 className="font-heading font-bold text-2xl">{team.name}</h1>
            <ChevronsUpDown className="mr-3 h-4 w-4" />
          </div>
          <div className="space-y-6 max-w-2xl mx-auto">
            {customDataKeys.map((key) => {
              const teamData = team.teamData.find((t) => t.name === key);
              return (
                <Card
                  className="bg-white rounded-lg py-2 shadow-sm w-full"
                  key={key}
                >
                  <CardContent>
                    <h3
                      className="flex justify-between items-center cursor-pointer"
                      onClick={() =>
                        setShowValues((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                    >
                      {key}
                      <ChevronUp
                        className="h-4 w-4 transition-transform duration-200"
                        style={{
                          transform: showValues[key]
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                        }}
                      />
                    </h3>
                    {showValues[key] && teamData && (
                      <div className="max-h-[300px] mt-4 overflow-y-auto">
                        <table className="w-full">
                          <thead className="sticky top-0 bg-white">
                            <tr>
                              <th className="text-left pb-2">Target</th>
                              <th className="text-left pb-2">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teamData.data.map((dataItem, dataIndex) => (
                              <tr key={dataIndex} className="border-t">
                                <td className="py-2">{dataItem.target}</td>
                                <td className="py-2">{dataItem.score}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





