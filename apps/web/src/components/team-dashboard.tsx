import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, ChevronUp } from "lucide-react";
import { Card } from "./ui/card";
import { CardContent } from "./ui/card";

export interface TeamData {
  id: string;
  name: string;
  [key: string]: any; // Allow for dynamic custom data properties
}

interface TeamDashboardProps {
  teams: TeamData[];
  initialTeam?: TeamData;
}

export function TeamDashboard({ teams, initialTeam }: TeamDashboardProps) {
  const [selectedTeam, setSelectedTeam] = React.useState<TeamData>(
    initialTeam || teams[0]
  );

  // Get all custom data keys
  const customDataKeys = selectedTeam.teamData.map((team: any) => team.name);

  const [showValues, setShowValues] = React.useState<Record<string, boolean>>(
    customDataKeys.reduce(
      (acc: any, key: any) => ({ ...acc, [key]: false }),
      {}
    )
  );

  return (
    <Card className="h-full">
      <CardContent className="flex flex-col  h-[250px]">
        <div className="w-full max-w-md mb-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between pl-5">
                <span className="flex justify-center w-full font-semibold">
                  {selectedTeam.name}
                </span>
                <ChevronsUpDown className="mr-3 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full">
              {teams.map((team) => (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                >
                  {team.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="overflow-y-auto max-h-[200px] pr-4 -mr-4  [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-brand-secondary-2 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="space-y-6 max-w-2xl mx-auto">
            {customDataKeys.map((key: any) => {
              const team = selectedTeam.teamData.find(
                (t: any) => t.name === key
              );
              return (
                <Card
                  className="bg-white rounded-lg py-2 shadow-sm w-full"
                  key={key}
                >
                  <CardContent>
                    <h3
                      className=" flex justify-between items-center cursor-pointer"
                      onClick={() =>
                        setShowValues((prev) => ({
                          ...showValues,
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
                    {showValues[key] && (
                      <div className="max-h-[300px] mt-4 overflow-y-auto">
                        <table className="w-full">
                          <thead className="sticky top-0 bg-white">
                            <tr>
                              <th className="text-left pb-2">Target</th>
                              <th className="text-left pb-2">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {team.data.map((dataItem: any, dataIndex: any) => (
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





