import React, { useState, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Calendar, CalendarDays, Clock, X, User, Calendar as CalendarIcon, MapPin, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AddAppointmentModal } from "./add-appointment-modal";
import { useUserContext } from "@/hooks/useUserContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";

interface Appointment {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: "confirmed" | "pending" | "cancelled";
  clientName: string;
  service: string;
  // Team member information
  assignedTo?: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    color?: string; // For visual distinction
  };
  // Optional fields for more detailed information
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  notes?: string;
  duration?: number; // in minutes
}

type CalendarView = "monthly" | "weekly";

interface AppointmentCalendarProps {
  appointments?: Appointment[];
  onDateSelect?: (date: Date) => void;
  onAppointmentClick?: (appointment: Appointment) => void;
  onAddAppointment?: () => void;
  initialView?: CalendarView;
}

export function AppointmentCalendar({
  appointments = [],
  onDateSelect,
  onAppointmentClick,
  onAddAppointment,
  initialView = "monthly",
}: AppointmentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>(initialView);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedAppointments, setSelectedAppointments] = useState<Set<string>>(new Set());
  const [isGroupSelectMode, setIsGroupSelectMode] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showCancelled, setShowCancelled] = useState(true);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<Set<string>>(new Set());
  const [showTeamFilter, setShowTeamFilter] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: userCtx } = useUserContext();
  const organizationId = userCtx?.currentOrganizationId ?? "";
  const org = userCtx?.organizations.find((o) => o.id === organizationId);
  const branchId = org?.hierarchy.member?.hierarchyScopeId ?? "";
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (params: { start: Date; duration: number; notes?: string }) =>
      client.appointments.create({
        organizationId,
        type: "private",
        startTime: params.start.toISOString(),
        duration: params.duration,
        branchId,
        sessionTotal: 1,
        pricePerClient: 0,
        notes: params.notes ?? null,
      }),
    onSuccess: () => {
      toast.success("Appointment created");
      closeAddModal();
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to create appointment");
    },
  });

  // Debug: Log modal state changes
  useEffect(() => {
    console.log('Modal state changed:', showAddModal);
  }, [showAddModal]);

  const {
    monthStart,
    monthEnd,
    startDate,
    endDate,
    dateDisplay,
    prevPeriod,
    nextPeriod,
  } = useMemo(() => {
    if (view === "monthly") {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const startDate = new Date(monthStart);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      const endDate = new Date(monthEnd);
      endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

      return {
        monthStart,
        monthEnd,
        startDate,
        endDate,
        dateDisplay: currentDate.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
        prevPeriod: () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)),
        nextPeriod: () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)),
      };
    } else {
      // Weekly view
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      return {
        monthStart: weekStart,
        monthEnd: weekEnd,
        startDate: weekStart,
        endDate: weekEnd,
        dateDisplay: `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        prevPeriod: () => {
          const newDate = new Date(currentDate);
          newDate.setDate(currentDate.getDate() - 7);
          setCurrentDate(newDate);
        },
        nextPeriod: () => {
          const newDate = new Date(currentDate);
          newDate.setDate(currentDate.getDate() + 7);
          setCurrentDate(newDate);
        },
      };
    }
  }, [currentDate, view]);

  const calendarDays = useMemo(() => {
    const days = [];
    const day = new Date(startDate);

    while (day <= endDate) {
      days.push(new Date(day));
      day.setDate(day.getDate() + 1);
    }

    return days;
  }, [startDate, endDate]);

  const getAppointmentsForDate = (date: Date) => {
    return getFilteredAppointments().filter((appointment) => {
      const appointmentDate = new Date(appointment.start);
      return (
        appointmentDate.getDate() === date.getDate() &&
        appointmentDate.getMonth() === date.getMonth() &&
        appointmentDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const getStatusColor = (status: Appointment["status"]) => {
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

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentPeriod = (date: Date) => {
    if (view === "monthly") {
      return (
        date.getMonth() === currentDate.getMonth() &&
        date.getFullYear() === currentDate.getFullYear()
      );
    } else {
      // Weekly view - all days in the week are current
      return date >= startDate && date <= endDate;
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    onDateSelect?.(date);
  };

  const closeTimeline = () => {
    setSelectedDate(null);
  };

  const closeAppointmentModal = () => {
    setSelectedAppointment(null);
  };

  const openAddModal = () => {
    console.log('Opening add modal');
    setShowAddModal(true);
    console.log('Modal state after opening:', true);
  };

  const closeAddModal = () => {
    console.log('Closing add modal');
    setShowAddModal(false);
    console.log('Modal state after closing:', false);
  };

  const handleSubmitAppointment = (appointment: any) => {
    if (organizationId && branchId) {
      createMutation.mutate({
        start: new Date(appointment.start),
        duration: appointment.duration,
        notes: appointment.remarks,
      });
    } else {
      onAddAppointment?.();
      closeAddModal();
    }
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    if (isGroupSelectMode) {
      // Only allow selection of pending appointments in group mode
      if (appointment.status === "pending") {
        const newSelected = new Set(selectedAppointments);
        if (newSelected.has(appointment.id)) {
          newSelected.delete(appointment.id);
        } else {
          newSelected.add(appointment.id);
        }
        setSelectedAppointments(newSelected);
      }
    } else {
      // Normal single appointment selection
      setSelectedAppointment(appointment);
      onAppointmentClick?.(appointment);
    }
  };

  const toggleGroupSelectMode = () => {
    setIsGroupSelectMode(!isGroupSelectMode);
    setSelectedAppointments(new Set());
  };

  const handleBulkStatusChange = (newStatus: "confirmed" | "cancelled") => {
    // Handle bulk status change
    console.log(`Bulk ${newStatus} appointments:`, Array.from(selectedAppointments));
    // You can add your bulk status change logic here
    // For example: updateMultipleAppointmentStatus(Array.from(selectedAppointments), newStatus)
    
    // Clear selection and exit group mode
    setSelectedAppointments(new Set());
    setIsGroupSelectMode(false);
  };

  const getPendingAppointments = () => {
    return appointments.filter(appointment => appointment.status === "pending");
  };

  const getFilteredAppointments = () => {
    return appointments.filter(appointment => {
      // Filter by status
      if (appointment.status === "confirmed" && !showConfirmed) return false;
      if (appointment.status === "cancelled" && !showCancelled) return false;
      
      // Filter by team member
      if (selectedTeamMembers.size > 0 && appointment.assignedTo) {
        if (!selectedTeamMembers.has(appointment.assignedTo.id)) return false;
      }
      
      return true;
    });
  };

  const getTeamMembers = () => {
    const teamMembers = new Map<string, { id: string; name: string; email?: string; avatar?: string; color?: string }>();
    
    appointments.forEach(appointment => {
      if (appointment.assignedTo) {
        teamMembers.set(appointment.assignedTo.id, appointment.assignedTo);
      }
    });
    
    return Array.from(teamMembers.values());
  };

  const toggleTeamMember = (memberId: string) => {
    const newSelected = new Set(selectedTeamMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedTeamMembers(newSelected);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getSortedAppointmentsForDate = (date: Date) => {
    const dayAppointments = getAppointmentsForDate(date);
    return dayAppointments.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  };

  const renderTimeline = () => {
    if (!selectedDate) return null;

    const dayAppointments = getSortedAppointmentsForDate(selectedDate);
    const pendingAppointments = dayAppointments.filter(app => app.status === "pending");
    const dateString = selectedDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="fixed inset-0 bg-gray-500/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <CardHeader className="space-y-0 pb-4">
            <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-gray-600" />
              <CardTitle className="text-xl font-semibold">{dateString}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={closeTimeline}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
            </div>
            
            {/* Action Buttons - Moved to bottom of header */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center space-x-2">
                {/* Group Selection Toggle for Daily View */}
                {pendingAppointments.length > 0 && (
                  <Button
                    variant={isGroupSelectMode ? "default" : "outline"}
                    size="sm"
                    onClick={toggleGroupSelectMode}
                    className="flex items-center space-x-2"
                  >
                    <Calendar className="h-4 w-4" />
                    <span>{isGroupSelectMode ? "Exit Selection" : "Group Select"}</span>
                  </Button>
                )}
                
                {/* Bulk Actions for Daily View */}
                {isGroupSelectMode && (
                  <div className="flex items-center space-x-2">
                    {/* Select All Button */}
                    {pendingAppointments.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (selectedAppointments.size === pendingAppointments.length) {
                            // Deselect all
                            setSelectedAppointments(new Set());
                          } else {
                            // Select all pending
                            const allPendingIds = new Set(pendingAppointments.map(app => app.id));
                            setSelectedAppointments(allPendingIds);
                          }
                        }}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        {selectedAppointments.size === pendingAppointments.length ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                    
                    {/* Bulk Action Buttons */}
                    {selectedAppointments.size > 0 && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleBulkStatusChange("confirmed")}
                          className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        >
                          Mark as Confirm ({selectedAppointments.size})
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleBulkStatusChange("cancelled")}
                          className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                        >
                          Mark as Cancel ({selectedAppointments.size})
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[60vh]">
            {dayAppointments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">No appointments scheduled</p>
                <p className="text-sm">This day is free for new appointments</p>
                <Button
                  onClick={openAddModal}
                  className="mt-4"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Appointment
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {dayAppointments.map((appointment, index) => (
                  <div
                    key={appointment.id}
                    className={cn(
                      "flex items-start space-x-4 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 relative",
                      getStatusColor(appointment.status),
                      isGroupSelectMode && appointment.status === "pending" && "hover:ring-2 hover:ring-blue-300",
                      isGroupSelectMode && selectedAppointments.has(appointment.id) && "ring-2 ring-blue-500 bg-blue-50",
                      appointment.assignedTo && "border-l-4"
                    )}
                    style={appointment.assignedTo ? { borderLeftColor: appointment.assignedTo.color || '#6B7280' } : undefined}
                    onClick={() => handleAppointmentClick(appointment)}
                  >
                    {/* Selection indicator for group mode - using border style instead of radio button */}
                    {isGroupSelectMode && appointment.status === "pending" && !selectedAppointments.has(appointment.id) && (
                      <div className="absolute inset-0 border-2 border-dashed border-gray-400 rounded pointer-events-none" style={{ margin: '-2px' }} />
                    )}
                    
                    {/* Time indicator */}
                    <div className="flex-shrink-0 w-20 text-center">
                      <div className="text-sm font-medium text-gray-900">
                        {formatTime(new Date(appointment.start))}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTime(new Date(appointment.end))}
                      </div>
                    </div>

                    {/* Timeline line */}
                    <div className="flex-shrink-0 w-4 flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      {index < dayAppointments.length - 1 && (
                        <div className="w-0.5 h-8 bg-gray-300 mt-1"></div>
                      )}
                    </div>

                    {/* Appointment details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {appointment.title}
                          </h3>
                          <p className="text-sm text-gray-600 truncate">
                            {appointment.clientName}
                          </p>
                          {appointment.assignedTo && (
                            <p 
                              className="text-xs truncate"
                              style={{ color: appointment.assignedTo.color || '#6B7280' }}
                            >
                              {appointment.assignedTo.name}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 truncate">
                            {appointment.service}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "ml-2 text-xs",
                            appointment.status === "confirmed" && "bg-green-100 text-green-800",
                            appointment.status === "pending" && "bg-yellow-100 text-yellow-800",
                            appointment.status === "cancelled" && "bg-red-100 text-red-800"
                          )}
                        >
                          {appointment.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };



  const renderAppointmentDetailModal = () => {
    if (!selectedAppointment) return null;

    const formatDate = (date: Date) => {
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    const formatDuration = (start: Date, end: Date) => {
      const durationMs = new Date(end).getTime() - new Date(start).getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      
      if (hours > 0) {
        return `${hours}h ${minutes > 0 ? `${minutes}m` : ""}`.trim();
      }
      return `${minutes}m`;
    };

    return (
      <div className="fixed inset-0 bg-gray-500/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center space-x-2">
              <CalendarIcon className="h-5 w-5 text-gray-600" />
              <CardTitle className="text-xl font-semibold">Appointment Details</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={closeAppointmentModal}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[70vh] space-y-6">
            {/* Status Badge and Action Buttons */}
            <div className="flex justify-between items-start">
              <Badge
                variant="secondary"
                className={cn(
                  "text-sm px-3 py-1",
                  selectedAppointment.status === "confirmed" && "bg-green-100 text-green-800 border-green-200",
                  selectedAppointment.status === "pending" && "bg-yellow-100 text-yellow-800 border-yellow-200",
                  selectedAppointment.status === "cancelled" && "bg-red-100 text-red-800 border-red-200"
                )}
              >
                {selectedAppointment.status.charAt(0).toUpperCase() + selectedAppointment.status.slice(1)}
              </Badge>
              
              {/* Status Change Buttons - Only show for pending appointments */}
              {selectedAppointment.status === "pending" && (
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      // Handle confirm appointment
                      console.log("Confirm appointment:", selectedAppointment.id);
                      // You can add your confirmation logic here
                      // For example: updateAppointmentStatus(selectedAppointment.id, "confirmed")
                    }}
                    className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                  >
                    Mark as Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Handle cancel appointment
                      console.log("Cancel appointment:", selectedAppointment.id);
                      // You can add your cancellation logic here
                      // For example: updateAppointmentStatus(selectedAppointment.id, "cancelled")
                    }}
                    className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                  >
                    Mark as Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Appointment Title */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {selectedAppointment.title}
              </h2>
              <p className="text-lg text-gray-600">
                {selectedAppointment.service}
              </p>
            </div>

            {/* Date and Time */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5 text-gray-600" />
                <span>Date & Time</span>
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Date:</span>
                  <span className="text-sm text-gray-900">{formatDate(new Date(selectedAppointment.start))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Start Time:</span>
                  <span className="text-sm text-gray-900">{formatTime(new Date(selectedAppointment.start))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">End Time:</span>
                  <span className="text-sm text-gray-900">{formatTime(new Date(selectedAppointment.end))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Duration:</span>
                  <span className="text-sm text-gray-900">{formatDuration(new Date(selectedAppointment.start), new Date(selectedAppointment.end))}</span>
                </div>
              </div>
            </div>

            {/* Client Information */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <User className="h-5 w-5 text-gray-600" />
                <span>Client Information</span>
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Name:</span>
                  <span className="text-sm text-gray-900">{selectedAppointment.clientName}</span>
                </div>
                {selectedAppointment.clientEmail && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 flex items-center space-x-1">
                      <Mail className="h-4 w-4" />
                      <span>Email:</span>
                    </span>
                    <span className="text-sm text-gray-900">{selectedAppointment.clientEmail}</span>
                  </div>
                )}
                {selectedAppointment.clientPhone && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 flex items-center space-x-1">
                      <Phone className="h-4 w-4" />
                      <span>Phone:</span>
                    </span>
                    <span className="text-sm text-gray-900">{selectedAppointment.clientPhone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            {selectedAppointment.location && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                  <MapPin className="h-5 w-5 text-gray-600" />
                  <span>Location</span>
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-900">{selectedAppointment.location}</p>
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedAppointment.notes && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedAppointment.notes}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={closeAppointmentModal}
                className="flex-1"
              >
                Close
              </Button>
              
              {/* Edit Button - Show for all statuses */}
              <Button
                onClick={() => {
                  // Handle edit appointment
                  console.log("Edit appointment:", selectedAppointment.id);
                }}
                className="flex-1"
              >
                Edit Appointment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderCalendarGrid = () => {
    if (view === "monthly") {
      return (
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {/* Day Headers */}
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="bg-gray-50 p-3 text-center text-sm font-medium text-gray-700"
            >
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {calendarDays.map((date, index) => {
            const dayAppointments = getAppointmentsForDate(date);
            const isCurrentPeriodDay = isCurrentPeriod(date);
            const isTodayDate = isToday(date);

            return (
              <div
                key={index}
                className={cn(
                  "min-h-[120px] bg-white p-2 cursor-pointer transition-colors hover:bg-gray-50",
                  !isCurrentPeriodDay && "bg-gray-50 text-gray-400",
                  isTodayDate && "bg-blue-50 border-2 border-blue-200"
                )}
                onClick={() => handleDateSelect(date)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isTodayDate && "text-blue-600 font-bold"
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {dayAppointments.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
                    >
                      {dayAppointments.length}
                    </Badge>
                  )}
                </div>

                {/* Appointments for this day */}
                <div className="space-y-1">
                  {dayAppointments.slice(0, 2).map((appointment) => (
                    <div
                      key={appointment.id}
                      className={cn(
                        "text-xs p-1 rounded border cursor-pointer truncate relative",
                        getStatusColor(appointment.status),
                        isGroupSelectMode && appointment.status === "pending" && "hover:ring-2 hover:ring-blue-300",
                        isGroupSelectMode && selectedAppointments.has(appointment.id) && "ring-2 ring-blue-500 bg-blue-50",
                        appointment.assignedTo && "border-l-4"
                      )}
                      style={appointment.assignedTo ? { borderLeftColor: appointment.assignedTo.color || '#6B7280' } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAppointmentClick(appointment);
                      }}
                      title={`${appointment.title} - ${appointment.clientName}`}
                    >
                      {/* Selection indicator for group mode - using border style instead of radio button */}
                      {isGroupSelectMode && appointment.status === "pending" && !selectedAppointments.has(appointment.id) && (
                        <div className="absolute inset-0 border-2 border-dashed border-gray-400 rounded pointer-events-none" />
                      )}
                      
                      <div className="font-medium truncate">
                        {appointment.title}
                      </div>
                      <div className="text-xs opacity-75 truncate">
                        {appointment.clientName}
                      </div>
                      {appointment.assignedTo && (
                        <div 
                          className="text-xs opacity-60 truncate"
                          style={{ color: appointment.assignedTo.color || '#6B7280' }}
                        >
                          {appointment.assignedTo.name}
                        </div>
                      )}
                      <div className="text-xs opacity-60 truncate">
                        {formatTime(new Date(appointment.start))} - {formatTime(new Date(appointment.end))}
                      </div>
                    </div>
                  ))}
                  {dayAppointments.length > 2 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{dayAppointments.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    } else {
      // Weekly view
      return (
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {/* Day Headers */}
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="bg-gray-50 p-3 text-center text-sm font-medium text-gray-700"
            >
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {calendarDays.map((date, index) => {
            const dayAppointments = getSortedAppointmentsForDate(date);
            const isTodayDate = isToday(date);

            return (
              <div
                key={index}
                className={cn(
                  "min-h-[150px] bg-white p-2 cursor-pointer transition-colors hover:bg-gray-50",
                  isTodayDate && "bg-blue-50 border-2 border-blue-200"
                )}
                onClick={() => handleDateSelect(date)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isTodayDate && "text-blue-600 font-bold"
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {dayAppointments.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
                    >
                      {dayAppointments.length}
                    </Badge>
                  )}
                </div>

                {/* Appointments for this day */}
                <div className="space-y-1">
                  {dayAppointments.slice(0, 15).map((appointment) => (
                    <div
                      key={appointment.id}
                      className={cn(
                        "text-xs p-1 rounded border cursor-pointer truncate relative",
                        getStatusColor(appointment.status),
                        isGroupSelectMode && appointment.status === "pending" && "hover:ring-2 hover:ring-blue-300",
                        isGroupSelectMode && selectedAppointments.has(appointment.id) && "ring-2 ring-blue-500 bg-blue-50",
                        appointment.assignedTo && "border-l-4"
                      )}
                      style={appointment.assignedTo ? { borderLeftColor: appointment.assignedTo.color || '#6B7280' } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAppointmentClick(appointment);
                      }}
                      title={`${appointment.title} - ${appointment.clientName}`}
                    >
                      {/* Selection indicator for group mode - using border style instead of radio button */}
                      {isGroupSelectMode && appointment.status === "pending" && !selectedAppointments.has(appointment.id) && (
                        <div className="absolute inset-0 border-2 border-dashed border-gray-400 rounded pointer-events-none" />
                      )}
                      
                      <div className="font-medium truncate">
                        {appointment.title}
                      </div>
                      <div className="text-xs opacity-75 truncate">
                        {appointment.clientName}
                      </div>
                      {appointment.assignedTo && (
                        <div 
                          className="text-xs opacity-60 truncate"
                          style={{ color: appointment.assignedTo.color || '#6B7280' }}
                        >
                          {appointment.assignedTo.name}
                        </div>
                      )}
                      <div className="text-xs opacity-60 truncate">
                        {formatTime(new Date(appointment.start))} - {formatTime(new Date(appointment.end))}
                      </div>
                    </div>
                  ))}
                  {dayAppointments.length > 15 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{dayAppointments.length - 15} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-semibold">Appointments Calendar</CardTitle>
          <div className="flex items-center space-x-2">
            {/* Group Selection Mode Toggle */}
            {getFilteredAppointments().filter(appointment => appointment.status === "pending").length > 0 && (
              <Button
                variant={isGroupSelectMode ? "default" : "outline"}
                size="sm"
                onClick={toggleGroupSelectMode}
                className="flex items-center space-x-2"
              >
                <Calendar className="h-4 w-4" />
                <span>{isGroupSelectMode ? "Exit Selection" : "Group Select"}</span>
              </Button>
            )}
            
            {/* Bulk Actions - Only show in group select mode */}
            {isGroupSelectMode && selectedAppointments.size > 0 && (
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  onClick={() => handleBulkStatusChange("confirmed")}
                  className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                >
                  Mark as Confirm ({selectedAppointments.size})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkStatusChange("cancelled")}
                  className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                >
                  Mark as Cancel ({selectedAppointments.size})
                </Button>
              </div>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={openAddModal}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Appointment</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* View Switcher and Status Filters */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setView("monthly")}
                  className={cn(
                    "flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                    view === "monthly"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <Calendar className="h-4 w-4" />
                  <span>Month</span>
                </button>
                <button
                  onClick={() => setView("weekly")}
                  className={cn(
                    "flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                    view === "weekly"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                  <span>Week</span>
                </button>
              </div>
            </div>
            
            {/* Status Filter Toggles */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowConfirmed(!showConfirmed)}
                  className="flex items-center space-x-2 cursor-pointer"
                >
                  <div className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
                    showConfirmed ? "bg-green-500" : "bg-gray-300"
                  )}>
                    <div className={cn(
                      "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200",
                      showConfirmed ? "translate-x-5" : "translate-x-1"
                    )} />
                  </div>
                  <span className={cn(
                    "text-sm font-medium",
                    showConfirmed ? "text-green-700" : "text-gray-500"
                  )}>
                    Confirmed
                  </span>
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowCancelled(!showCancelled)}
                  className="flex items-center space-x-2 cursor-pointer"
                >
                  <div className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
                    showCancelled ? "bg-red-500" : "bg-gray-300"
                  )}>
                    <div className={cn(
                      "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200",
                      showCancelled ? "translate-x-5" : "translate-x-1"
                    )} />
                  </div>
                  <span className={cn(
                    "text-sm font-medium",
                    showCancelled ? "text-red-700" : "text-gray-500"
                  )}>
                    Cancelled
                  </span>
                </button>
              </div>
              
              {/* Team Member Filter */}
              {getTeamMembers().length > 0 && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowTeamFilter(!showTeamFilter)}
                    className="flex items-center space-x-2 cursor-pointer"
                  >
                    <div className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
                      showTeamFilter ? "bg-blue-500" : "bg-gray-300"
                    )}>
                      <div className={cn(
                        "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200",
                        showTeamFilter ? "translate-x-5" : "translate-x-1"
                      )} />
                    </div>
                    <span className={cn(
                      "text-sm font-medium",
                      showTeamFilter ? "text-blue-700" : "text-gray-500"
                    )}>
                      Team Filter
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Team Member Filter Dropdown */}
          {showTeamFilter && getTeamMembers().length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Filter by Team Member</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {getTeamMembers().map((member) => (
                  <button
                    key={member.id}
                    onClick={() => toggleTeamMember(member.id)}
                    className={cn(
                      "flex items-center space-x-2 p-2 rounded-md text-sm transition-colors",
                      selectedTeamMembers.has(member.id)
                        ? "bg-blue-100 text-blue-700 border border-blue-200"
                        : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: member.color || '#6B7280' }}
                    />
                    <span className="truncate">{member.name}</span>
                  </button>
                ))}
              </div>
              {selectedTeamMembers.size > 0 && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {selectedTeamMembers.size} member(s) selected
                  </span>
                  <button
                    onClick={() => setSelectedTeamMembers(new Set())}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Calendar Navigation */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={prevPeriod}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">{dateDisplay}</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={nextPeriod}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar Grid */}
          {renderCalendarGrid()}

          {/* Legend */}
          <div className="mt-6 flex items-center justify-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
              <span>Confirmed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
              <span>Pending</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
              <span>Cancelled</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Modal */}
      {renderTimeline()}

      {/* Appointment Detail Modal */}
      {renderAppointmentDetailModal()}

      {/* Add Appointment Modal */}
      <AddAppointmentModal
        isOpen={showAddModal}
        onClose={closeAddModal}
        onSubmit={handleSubmitAppointment}
        teamMembers={getTeamMembers()}
        selectedDate={selectedDate || undefined}
      />
    </>
  );
}

export default AppointmentCalendar;
