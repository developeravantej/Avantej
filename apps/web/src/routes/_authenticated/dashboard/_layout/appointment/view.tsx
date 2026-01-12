import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { AppointmentCalendar } from "@/components/calendar/appointment";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/appointment/view"
)({
  beforeLoad: async () => {
    await requirePermission(
      { resource: "appointment_management", action: "read" },
      "/dashboard"
    );
  },
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      view: search.view as string | undefined,
    };
  },
});

function RouteComponent() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/dashboard/_layout/appointment/view" });
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      // Wait for auth to complete
      if (authLoading) return;

      // Check if user is authenticated
      if (!isAuthenticated) {
        return; // useAuth will handle redirect to login
      }

      // Load the data
      try {
        setIsLoading(true);
        // TODO: Implement actual API call when backend is ready
        // Simulating data fetch
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Mock appointment data for UI display
        // Generate mock appointments for the current month
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const mockAppointments = [
          {
            id: "1",
            title: "Client Consultation",
            start: new Date(year, month, 15, 10, 0),
            end: new Date(year, month, 15, 11, 0),
            status: "confirmed" as const,
            clientName: "John Smith",
            service: "Initial Consultation",
            assignedTo: {
              id: "dr-smith",
              name: "Sarah Smith",
              color: "#3B82F6"
            }
          },
          {
            id: "2",
            title: "Team Training",
            start: new Date(year, month, 8, 14, 0),
            end: new Date(year, month, 8, 16, 0),
            status: "pending" as const,
            clientName: "ABC Corporation",
            service: "Team Workshop",
            assignedTo: {
              id: "dr-jones",
              name: "Michael Jones",
              color: "#EF4444"
            }
          },
          {
            id: "3",
            title: "Follow-up Meeting",
            start: new Date(year, month, 12, 9, 30),
            end: new Date(year, month, 12, 10, 30),
            status: "confirmed" as const,
            clientName: "Sarah Johnson",
            service: "Progress Review",
            assignedTo: {
              id: "dr-wilson",
              name: "Emily Wilson",
              color: "#10B981"
            }
          },
          {
            id: "4",
            title: "Project Review",
            start: new Date(year, month, 18, 15, 0),
            end: new Date(year, month, 18, 16, 30),
            status: "cancelled" as const,
            clientName: "XYZ Industries",
            service: "Project Assessment",
            assignedTo: {
              id: "dr-brown",
              name: "David Brown",
              color: "#F59E0B"
            }
          },
          {
            id: "5",
            title: "Strategy Session",
            start: new Date(year, month, 22, 9, 0),
            end: new Date(year, month, 22, 12, 30),
            status: "pending" as const,
            clientName: "Tech Solutions Inc",
            service: "Strategic Planning",
            assignedTo: {
              id: "dr-smith",
              name: "Sarah Smith",
              color: "#3B82F6"
            }
          },
          {
            id: "6",
            title: "Quick Check-in",
            start: new Date(year, month, 8, 10, 0),
            end: new Date(year, month, 8, 10, 30),
            status: "confirmed" as const,
            clientName: "Mike Wilson",
            service: "Status Update",
            assignedTo: {
              id: "dr-wilson",
              name: "Emily Wilson",
              color: "#10B981"
            }
          },
          {
            id: "7",
            title: "Lunch Meeting",
            start: new Date(year, month, 8, 12, 0),
            end: new Date(year, month, 8, 13, 0),
            status: "confirmed" as const,
            clientName: "Lisa Chen",
            service: "Business Lunch",
            assignedTo: {
              id: "dr-brown",
              name: "David Brown",
              color: "#F59E0B"
            }
          },
          {
            id: "8",
            title: "Afternoon Review",
            start: new Date(year, month, 12, 14, 0),
            end: new Date(year, month, 12, 15, 0),
            status: "pending" as const,
            clientName: "David Brown",
            service: "Code Review",
            assignedTo: {
              id: "dr-jones",
              name: "Michael Jones",
              color: "#EF4444"
            }
          },
          {
            id: "9",
            title: "Evening Consultation",
            start: new Date(year, month, 12, 17, 0),
            end: new Date(year, month, 12, 18, 0),
            status: "confirmed" as const,
            clientName: "Emma Davis",
            service: "Technical Support",
            assignedTo: {
              id: "dr-smith",
              name: "Sarah Smith",
              color: "#3B82F6"
            }
          },
          {
            id: "10",
            title: "Morning Standup",
            start: new Date(year, month, 18, 9, 0),
            end: new Date(year, month, 18, 9, 30),
            status: "confirmed" as const,
            clientName: "Internal Team",
            service: "Daily Standup",
            assignedTo: {
              id: "dr-garcia",
              name: "Maria Garcia",
              color: "#8B5CF6"
            }
          },
          {
            id: "11",
            title: "Client Demo",
            start: new Date(year, month, 18, 11, 0),
            end: new Date(year, month, 18, 12, 0),
            status: "confirmed" as const,
            clientName: "Global Tech Corp",
            service: "Product Demo",
            assignedTo: {
              id: "dr-wilson",
              name: "Emily Wilson",
              color: "#10B981"
            }
          },
          {
            id: "12",
            title: "Planning Session",
            start: new Date(year, month, 22, 14, 0),
            end: new Date(year, month, 22, 15, 30),
            status: "pending" as const,
            clientName: "Marketing Team",
            service: "Q1 Planning",
            assignedTo: {
              id: "dr-jones",
              name: "Michael Jones",
              color: "#EF4444"
            }
          },
          {
            id: "13",
            title: "Client Onboarding",
            start: new Date(year, month, 25, 10, 0),
            end: new Date(year, month, 25, 11, 30),
            status: "confirmed" as const,
            clientName: "StartupXYZ",
            service: "Onboarding Session",
            assignedTo: {
              id: "self",
              name: "Self",
              color: "#6B7280"
            }
          },
          {
            id: "14",
            title: "Team Retrospective",
            start: new Date(year, month, 25, 14, 0),
            end: new Date(year, month, 25, 15, 0),
            status: "confirmed" as const,
            clientName: "Development Team",
            service: "Sprint Retrospective",
            assignedTo: {
              id: "dr-smith",
              name: "Sarah Smith",
              color: "#3B82F6"
            }
          },
          {
            id: "15",
            title: "Budget Review",
            start: new Date(year, month, 25, 16, 0),
            end: new Date(year, month, 25, 17, 0),
            status: "pending" as const,
            clientName: "Finance Department",
            service: "Monthly Budget Review",
            assignedTo: {
              id: "self",
              name: "Self",
              color: "#6B7280"
            }
          },
        ];

        setAppointments(mockAppointments);
      } catch (error) {
        console.error("Failed to load appointment data:", error);
        toast.error("Failed to load appointments");
        navigate({ to: "/dashboard" });
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthAndLoadData();
  }, [user, authLoading, isAuthenticated, navigate]);

  const handleDateSelect = (date: Date) => {
    console.log("Selected date:", date);
    // TODO: Implement date selection logic
    toast.info(`Selected date: ${date.toLocaleDateString()}`);
  };

  const handleAppointmentClick = (appointment: any) => {
    console.log("Clicked appointment:", appointment);
    // TODO: Implement appointment details view
    toast.info(`Appointment: ${appointment.title} with ${appointment.clientName}`);
  };

  const handleAddAppointment = () => {
    console.log("Add appointment clicked");
    // TODO: Implement add appointment form
    toast.info("Add appointment functionality coming soon");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Appointments</h1>
      </div>
      <AppointmentCalendar
        appointments={appointments}
        onDateSelect={handleDateSelect}
        onAppointmentClick={handleAppointmentClick}
        onAddAppointment={handleAddAppointment}
        initialView={search.view === "weekly" ? "weekly" : "monthly"}
      />
    </div>
  );
}
