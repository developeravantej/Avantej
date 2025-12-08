import { Check, ChevronsUpDown, X, Clock, User, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

// Sample data - you can replace this with your actual data source
const appointments = [
  { 
    id: "1",
    title: "Hair Cut & Style",
    start: new Date(new Date().setHours(9, 0, 0, 0)),
    end: new Date(new Date().setHours(10, 30, 0, 0)),
    clientName: "John Smith",
    service: "Hair Styling",
    status: "confirmed" as const
  },
  { 
    id: "2",
    title: "Manicure",
    start: new Date(new Date().setHours(11, 0, 0, 0)),
    end: new Date(new Date().setHours(11, 45, 0, 0)),
    clientName: "Sarah Johnson",
    service: "Nail Care",
    status: "pending" as const
  },
  { 
    id: "3",
    title: "Facial Treatment",
    start: new Date(new Date().setHours(14, 0, 0, 0)),
    end: new Date(new Date().setHours(15, 30, 0, 0)),
    clientName: "Emily Davis",
    service: "Skincare",
    status: "confirmed" as const
  },
  { 
    id: "4",
    title: "Hair Coloring",
    start: new Date(new Date().setHours(16, 0, 0, 0)),
    end: new Date(new Date().setHours(18, 0, 0, 0)),
    clientName: "Michael Brown",
    service: "Hair Coloring",
    status: "cancelled" as const
  },
  { 
    id: "5",
    title: "Pedicure",
    start: new Date(new Date().setHours(19, 0, 0, 0)),
    end: new Date(new Date().setHours(19, 45, 0, 0)),
    clientName: "Lisa Wilson",
    service: "Nail Care",
    status: "pending" as const
  }
];

export function AppointmentsWidget() {
  const navigate = useNavigate();

  const handleWidgetClick = () => {
    // TODO: Navigate to appointment calendar with weekly view when route is created
    // navigate({ 
    //   to: "/dashboard/appointment/view",
    //   search: { view: "weekly" }
    // });
    console.log("Navigate to appointment calendar (route not yet created)");
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusColor = (status: "confirmed" | "pending" | "cancelled") => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800 border-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatDuration = (start: Date, end: Date) => {
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes > 0 ? `${minutes}m` : ""}`.trim();
    }
    return `${minutes}m`;
  };

  return (
    <Card className="h-full cursor-pointer hover:shadow-md transition-shadow" onClick={handleWidgetClick}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold">Appointments</CardTitle>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-3 h-[220px] overflow-y-auto pr-4 -mr-4 [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
          {appointments.map((appointment) => (
            <div
              key={appointment.id}
              className="flex flex-col gap-2 border-b border-gray-200 pr-2 py-2 last:border-0 last:pb-0 hover:bg-gray-50 rounded-md p-2 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">{appointment.title}</h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs border",
                        getStatusColor(appointment.status)
                      )}
                    >
                      {appointment.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {formatTime(appointment.start)} - {formatTime(appointment.end)}
                      </span>
                      <span className="text-xs">({formatDuration(appointment.start, appointment.end)})</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  <span>{appointment.clientName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{appointment.service}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

