import { Check, ChevronsUpDown, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Sample data - you can replace this with your actual data source
const announcements = [
  { topic: "Topic 1", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
  { topic: "Topic 2", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
  { topic: "Topic 3", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
  { topic: "Topic 4", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
  { topic: "Topic 5", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
  { topic: "Topic 6", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
  { topic: "Topic 7", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
  { topic: "Topic 8", date: "date", description: "There has been an issue that has been fixed regarding the client's issue with the new software that has been installed" },
];

export function AnnouncementsWidget() {
  return (
    <Card className="h-full">
      {/* <CardHeader>
        <h1 className="font-heading font-bold text-2xl">Announcements</h1>
      </CardHeader> */}
      <CardContent>
      
        <div className="flex flex-col  h-[220px] overflow-y-auto [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="flex justify-between items-center p-2">
          <h1 className="font-heading font-bold text-2xl">Announcements</h1>
          <ChevronsUpDown className="mr-3 h-4 w-4" />
        </div>
          {announcements.map((announcement, index) => (
            <div
              key={index}
              className="flex flex-col border-b border-gray-200 pr-2 py-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center">
                <div className="text-lg font-bold">{announcement.topic} </div>
                <div className="text-sm pl-1">( {announcement.date} )</div>
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {announcement.description}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}





