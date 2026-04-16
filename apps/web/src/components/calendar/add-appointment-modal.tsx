import React from "react";
import { UserPlus, X, ThumbsDown, Calendar, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { orpc, client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color?: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  creditPoints: number;
}

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  creditCost: number;
}

interface AppointmentSlot {
  id: string;
  selectedServices: string[];
  remarks: string;
  startDate: string;
  startTime: string;
  duration: number;
  assignedTo: string;
  roomId: string;
  employeeId: string;
  recurrence: string;
  customRecurrence?: {
    frequency: number;
    timeUnit: string;
    repeatOn: string[];
    monthlyType?: string;
    endsType: string;
    endsDate: string;
    endsOccurrences: number;
  };
  // Additional fields for better multi-appointment handling
  title?: string;
  endTime?: string;
  isActive?: boolean;
}

interface NewAppointment {
  clientId: string;
  selectedServices: string[];
  remarks: string;
  startDate: string;
  startTime: string;
  duration: number;
  assignedTo: string;
  roomId: string;
  employeeId: string;
  recurrence: string;
  customRecurrence?: {
    frequency: number;
    timeUnit: string;
    repeatOn: string[];
    monthlyType?: string; // Added for monthly recurrence
    endsType: string;
    endsDate: string;
    endsOccurrences: number;
  };
}

interface AddAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (appointment: {
    title: string;
    client: Client;
    service: string;
    location?: string;
    remarks?: string;
    start: Date;
    end: Date;
    duration: number;
    assignedTo?: TeamMember;
    tags: string[];
    recurrence: string;
    customRecurrence?: {
      frequency: number;
      timeUnit: string;
      repeatOn: string[];
    };
    endsType: string;
    endsDate?: string;
    endsOccurrences?: number;
  }) => void;
  teamMembers: TeamMember[];
  selectedDate?: Date;
  defaultTrainerId?: string | null;
}

export function AddAppointmentModal({
  isOpen,
  onClose,
  onSubmit,
  teamMembers,
  selectedDate,
  defaultTrainerId,
}: AddAppointmentModalProps) {
  // Helper function to get the week position (e.g., "1st", "2nd", "3rd", "4th", "last")
  const getWeekPosition = (date: Date): string => {
    const dayOfMonth = date.getDate();
    const weekNumber = Math.ceil((dayOfMonth + 6) / 7); // Calculate week number

    if (weekNumber === 1) return "first";
    if (weekNumber === 2) return "second";
    if (weekNumber === 3) return "third";
    if (weekNumber === 4) return "fourth";
    return "last";
  };

  const { data: userCtx } = useUserContext();
  const organizationId = userCtx?.currentOrganizationId ?? "";

  const { data: clientMembers = [] } = useQuery({
    ...orpc.members.list.queryOptions({ input: { organizationId, role: "client", status: "active" } }),
    enabled: !!organizationId,
  });

  const clients: Client[] = clientMembers.map((m: any) => ({
    id: m.id,
    name: m.name ?? m.email ?? m.userId,
    email: m.email ?? "",
    phone: "",
    creditPoints: 0, // TODO: populate from package_instances in future phase
  }));

  const { data: servicesData = [] } = useQuery({
    ...orpc.services.list.queryOptions({ input: { organizationId, isActive: true } }),
    enabled: !!organizationId,
  });

  const services: Service[] = servicesData.map((s: any) => ({
    id: s.id,
    name: s.name,
    durationMinutes: Math.round(s.duration / 60), // seconds → minutes
    creditCost: s.price ?? 0, // cents; TODO: confirm display unit with team
  }));

  const { data: roomsData = [] } = useQuery({
    queryKey: ["rooms", organizationId],
    queryFn: () => client.rooms.list({ organizationId }),
    enabled: !!organizationId,
  });

  const rooms = roomsData.map((r: any) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    type: r.roomType ?? "",
  }));

  const { data: staffData = [] } = useQuery({
    queryKey: ["members", organizationId, "staff"],
    queryFn: () => client.members.list({ organizationId }),
    enabled: !!organizationId,
  });

  const employees: { id: string; name: string; role: string; department: string }[] = staffData.map((m: any) => ({
    id: m.id as string,
    name: (m.name ?? m.email ?? m.userId) as string,
    role: (m.role ?? "") as string,
    department: "",
  }));

  const { user } = useAuth();

  // Helper function to get current time rounded to nearest 15-minute interval
  const getCurrentTimeRounded = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    const hours = now.getHours();
    
    if (roundedMinutes >= 60) {
      return `${(hours + 1).toString().padStart(2, '0')}:00`;
    }
    return `${hours.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`;
  };

  const [isServiceDialogOpen, setIsServiceDialogOpen] = React.useState(false);
  const [isMultiAppointment, setIsMultiAppointment] = React.useState(false);
  
  // Handle multi-appointment toggle with data clearing
  const handleMultiAppointmentToggle = () => {
    const newMultiAppointmentState = !isMultiAppointment;
    const currentClientId = newAppointment.clientId; // Preserve current client ID
    
    if (newMultiAppointmentState) {
      // Switching TO multi-appointment mode
      // Clear single appointment data but keep client ID
      setNewAppointment({
        clientId: currentClientId, // Keep the selected client
        selectedServices: [],
        remarks: "",
        startDate: selectedDate ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        startTime: getCurrentTimeRounded(),
        duration: 0,
        assignedTo: "none",
        roomId: "",
        employeeId: "",
        recurrence: "none",
        customRecurrence: {
          frequency: 1,
          timeUnit: "week",
          repeatOn: [],
          monthlyType: "day",
          endsType: "never",
          endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endsOccurrences: 13,
        },
      });
      
      // Initialize with one empty slot
      const baseDate = selectedDate || new Date(Date.now() + 24 * 60 * 60 * 1000);
      const newSlot: AppointmentSlot = {
        id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        selectedServices: [],
        remarks: "",
        startDate: baseDate.toISOString().split('T')[0],
        startTime: getCurrentTimeRounded(),
        duration: 0,
        assignedTo: "none",
        roomId: "",
        employeeId: "",
        recurrence: "none",
        customRecurrence: {
          frequency: 1,
          timeUnit: "week",
          repeatOn: [],
          monthlyType: "day",
          endsType: "never",
          endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endsOccurrences: 13,
        },
        title: `Appointment 1`,
        isActive: true,
      };
      setAppointmentSlots([newSlot]);
      setSelectedAppointmentId(newSlot.id);
    } else {
      // Switching FROM multi-appointment mode
      // Clear multi-appointment data but keep client ID
      setAppointmentSlots([]);
      setSelectedAppointmentId(null);
      
      // Reset to single appointment with current date/time but keep client ID
      setNewAppointment({
        clientId: currentClientId, // Keep the selected client
        selectedServices: [],
        remarks: "",
        startDate: selectedDate ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        startTime: getCurrentTimeRounded(),
        duration: 0,
        assignedTo: "none",
        roomId: "",
        employeeId: "",
        recurrence: "none",
        customRecurrence: {
          frequency: 1,
          timeUnit: "week",
          repeatOn: [],
          monthlyType: "day",
          endsType: "never",
          endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endsOccurrences: 13,
        },
      });
    }
    
    setIsMultiAppointment(newMultiAppointmentState);
  };

  // Handle blocked timing toggle with data clearing
  const handleBlockedTimingToggle = () => {
    const currentClientId = newAppointment.clientId; // Preserve current client ID
    setIsBlockedTiming(true);
    
    // Clear all appointment data when switching to blocked timing but keep client ID
    setNewAppointment({
      clientId: currentClientId, // Keep the selected client for when switching back
      selectedServices: [],
      remarks: "",
      startDate: selectedDate ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      startTime: getCurrentTimeRounded(),
      duration: 0,
      assignedTo: "none",
      roomId: "",
      employeeId: "",
      recurrence: "none",
      customRecurrence: {
        frequency: 1,
        timeUnit: "week",
        repeatOn: [],
        monthlyType: "day",
        endsType: "never",
        endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endsOccurrences: 13,
      },
    });
    
    // Clear multi-appointment data
    setAppointmentSlots([]);
    setSelectedAppointmentId(null);
    setIsMultiAppointment(false);
  };
  const [isBlockedTiming, setIsBlockedTiming] = React.useState(false);
  const [appointmentSlots, setAppointmentSlots] = React.useState<AppointmentSlot[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = React.useState<string | null>(null);
  const [isTestDialogOpen, setIsTestDialogOpen] = React.useState(false);
  const [testAppointmentData, setTestAppointmentData] = React.useState<any>(null);

  const [newAppointment, setNewAppointment] = React.useState<NewAppointment>({
    clientId: "",
    selectedServices: [],
    remarks: "",
    startDate: selectedDate ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    startTime: getCurrentTimeRounded(),
    duration: 0,
    assignedTo: defaultTrainerId ?? "none",
    roomId: "",
    employeeId: "",
    recurrence: "none",
    customRecurrence: {
      frequency: 1,
      timeUnit: "week",
      repeatOn: [],
      monthlyType: "day",
      endsType: "never",
      endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endsOccurrences: 13,
    },
  });

  // Update startDate when selectedDate changes
  React.useEffect(() => {
    if (selectedDate) {
      setNewAppointment(prev => ({
        ...prev,
        startDate: new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }));
    }
  }, [selectedDate]);

  // Default assignment to current user if present in teamMembers.
  // Skip if a defaultTrainerId was provided — that takes precedence over the logged-in user.
  React.useEffect(() => {
    if (defaultTrainerId) return;
    if (user?.id && Array.isArray(teamMembers) && teamMembers.length && newAppointment.assignedTo === "none") {
      const selfMember = teamMembers.find((m) => m.id === user.id);
      if (selfMember) {
        setNewAppointment((prev) => ({ ...prev, assignedTo: selfMember.id }));
      }
    }
  }, [user?.id, teamMembers, newAppointment.assignedTo, defaultTrainerId]);

  const handleInputChange = (field: string, value: string | number) => {
    setNewAppointment(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const addService = (serviceId: string) => {
    setNewAppointment(prev => {
      if (prev.selectedServices.includes(serviceId)) {
        return prev; // Don't add if already selected
      }
      
      const newSelectedServices = [...prev.selectedServices, serviceId];
      const totalDuration = newSelectedServices.reduce((total, id) => {
        const service = services.find(s => s.id === id);
        return total + (service?.durationMinutes || 0);
      }, 0);
      
      return {
        ...prev,
        selectedServices: newSelectedServices,
        duration: totalDuration,
      };
    });
  };

  const removeService = (serviceId: string) => {
    setNewAppointment(prev => {
      const newSelectedServices = prev.selectedServices.filter(id => id !== serviceId);
      const totalDuration = newSelectedServices.reduce((total, id) => {
        const service = services.find(s => s.id === id);
        return total + (service?.durationMinutes || 0);
      }, 0);
      
      return {
        ...prev,
        selectedServices: newSelectedServices,
        duration: totalDuration,
      };
    });
  };

  const adjustDuration = (increment: number) => {
    setNewAppointment(prev => ({
      ...prev,
      duration: Math.max(5, prev.duration + increment), // Minimum 5 minutes
    }));
  };

  const formatDuration = (minutes: number) => {
    if (minutes === 0) return "0m";
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  };

  // Multi-appointment management functions
  const addNewAppointmentSlot = () => {
    // Check maximum appointment limit
    if (appointmentSlots.length >= 5) {
      toast.error("Maximum of 5 appointments allowed per booking");
      return;
    }
    
    const baseDate = selectedDate ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    // Calculate next available time slot (increment by 30 minutes from last appointment)
    const nextStartTime = getCurrentTimeRounded();

    const newSlot: AppointmentSlot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      selectedServices: [],
      remarks: "",
      startDate: baseDate.toISOString().split('T')[0],
      startTime: nextStartTime,
      duration: 0,
      assignedTo: "none",
      roomId: "",
      employeeId: "",
      recurrence: "none",
      customRecurrence: {
        frequency: 1,
        timeUnit: "week",
        repeatOn: [],
        endsType: "never",
        endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endsOccurrences: 13,
      },
      title: `Appointment ${appointmentSlots.length + 1}`,
      isActive: true,
    };
    
    setAppointmentSlots(prev => [...prev, newSlot]);
    setSelectedAppointmentId(newSlot.id);
  };

  const removeAppointmentSlot = (slotId: string) => {
    setAppointmentSlots(prev => prev.filter(slot => slot.id !== slotId));
    if (selectedAppointmentId === slotId) {
      const remainingSlots = appointmentSlots.filter(slot => slot.id !== slotId);
      setSelectedAppointmentId(remainingSlots.length > 0 ? remainingSlots[0].id : null);
    }
  };

  const selectAppointmentSlot = (slotId: string) => {
    setSelectedAppointmentId(slotId);
  };

  const updateAppointmentSlot = (slotId: string, field: string, value: any) => {
    setAppointmentSlots(prev => prev.map(slot => {
      if (slot.id === slotId) {
        const updatedSlot = { ...slot, [field]: value };
        
        // Recalculate end time when start time or duration changes
        if (field === 'startTime' || field === 'duration') {
          const startTime = field === 'startTime' ? value : slot.startTime;
          const duration = field === 'duration' ? value : slot.duration;
          
          if (startTime && duration > 0) {
            const [startHours, startMinutes] = startTime.split(':').map(Number);
            const startTotalMinutes = startHours * 60 + startMinutes;
            const endTotalMinutes = startTotalMinutes + duration;
            const endHours = Math.floor(endTotalMinutes / 60) % 24;
            const endMins = endTotalMinutes % 60;
            updatedSlot.endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
          } else {
            updatedSlot.endTime = undefined;
          }
        }
        
        return updatedSlot;
      }
      return slot;
    }));
  };

  const addServiceToSlot = (slotId: string, serviceId: string) => {
    setAppointmentSlots(prev => prev.map(slot => {
      if (slot.id === slotId) {
        if (slot.selectedServices.includes(serviceId)) {
          return slot; // Don't add if already selected
        }
        
        const newSelectedServices = [...slot.selectedServices, serviceId];
        const totalDuration = newSelectedServices.reduce((total, id) => {
          const service = services.find(s => s.id === id);
          return total + (service?.durationMinutes || 0);
        }, 0);
        
        // Calculate end time
        const [startHours, startMinutes] = slot.startTime.split(':').map(Number);
        const startTotalMinutes = startHours * 60 + startMinutes;
        const endTotalMinutes = startTotalMinutes + totalDuration;
        const endHours = Math.floor(endTotalMinutes / 60) % 24;
        const endMins = endTotalMinutes % 60;
        const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
        
        return {
          ...slot,
          selectedServices: newSelectedServices,
          duration: totalDuration,
          endTime: endTime,
        };
      }
      return slot;
    }));
  };

  const removeServiceFromSlot = (slotId: string, serviceId: string) => {
    setAppointmentSlots(prev => prev.map(slot => {
      if (slot.id === slotId) {
        const newSelectedServices = slot.selectedServices.filter(id => id !== serviceId);
        const totalDuration = newSelectedServices.reduce((total, id) => {
          const service = services.find(s => s.id === id);
          return total + (service?.durationMinutes || 0);
        }, 0);
        
        // Recalculate end time
        const [startHours, startMinutes] = slot.startTime.split(':').map(Number);
        const startTotalMinutes = startHours * 60 + startMinutes;
        const endTotalMinutes = startTotalMinutes + totalDuration;
        const endHours = Math.floor(endTotalMinutes / 60) % 24;
        const endMins = endTotalMinutes % 60;
        const endTime = totalDuration > 0 ? `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}` : undefined;
        
        return {
          ...slot,
          selectedServices: newSelectedServices,
          duration: totalDuration,
          endTime: endTime,
        };
      }
      return slot;
    }));
  };

  const handleCustomRecurrenceChange = (field: string, value: any) => {
    setNewAppointment(prev => ({
      ...prev,
      customRecurrence: {
        ...prev.customRecurrence!,
        [field]: value,
      },
    }));
  };

  const toggleDay = (day: string) => {
    setNewAppointment(prev => ({
      ...prev,
      customRecurrence: {
        ...prev.customRecurrence!,
        repeatOn: prev.customRecurrence!.repeatOn.includes(day)
          ? prev.customRecurrence!.repeatOn.filter(d => d !== day)
          : [...prev.customRecurrence!.repeatOn, day],
      },
    }));
  };

  // Validation functions
  const validateAppointmentSlot = (slot: AppointmentSlot): string[] => {
    const errors: string[] = [];
    
    if (!slot.selectedServices.length) {
      errors.push("At least one service must be selected");
    }
    
    if (!slot.startDate) {
      errors.push("Start date is required");
    }
    
    if (!slot.startTime) {
      errors.push("Start time is required");
    }
    
    if (!slot.roomId) {
      errors.push("Room selection is required");
    }
    
    return errors;
  };

  const validateTimeConflicts = (slots: AppointmentSlot[]): string[] => {
    const errors: string[] = [];
    const sortedSlots = [...slots].sort((a, b) => {
      const timeA = new Date(`${a.startDate}T${a.startTime}`);
      const timeB = new Date(`${b.startDate}T${b.startTime}`);
      return timeA.getTime() - timeB.getTime();
    });

    for (let i = 0; i < sortedSlots.length - 1; i++) {
      const current = sortedSlots[i];
      const next = sortedSlots[i + 1];
      
      if (current.startDate === next.startDate) {
        const currentEnd = new Date(`${current.startDate}T${current.endTime || current.startTime}`);
        const nextStart = new Date(`${next.startDate}T${next.startTime}`);
        
        if (currentEnd > nextStart) {
          errors.push(`Time conflict: ${current.title || 'Appointment'} overlaps with ${next.title || 'Appointment'}`);
        }
      }
    }

    return errors;
  };

  const handleSubmit = () => {
    // Handle blocked timing submission
    if (isBlockedTiming) {
      if (!newAppointment.startDate || !newAppointment.startTime || newAppointment.duration === 0) {
        toast.error("Please fill in date, time, and duration for blocked timing");
        return;
      }

      // Validate custom recurrence if selected
      if (newAppointment.recurrence === "custom") {
        if (!newAppointment.customRecurrence?.frequency || newAppointment.customRecurrence.frequency < 1) {
          toast.error("Please enter a valid frequency for custom recurrence");
          return;
        }
        if (newAppointment.customRecurrence.timeUnit === "week" && newAppointment.customRecurrence.repeatOn.length === 0) {
          toast.error("Please select at least one day for weekly custom recurrence");
          return;
        }
        if (newAppointment.customRecurrence.endsType === "on" && !newAppointment.customRecurrence.endsDate) {
          toast.error("Please select an end date for the recurrence");
          return;
        }
        if (newAppointment.customRecurrence.endsType === "after" && (!newAppointment.customRecurrence.endsOccurrences || newAppointment.customRecurrence.endsOccurrences < 1)) {
          toast.error("Please enter a valid number of occurrences");
          return;
        }
      }

      // Create blocked timing appointment
      const startDateTime = new Date(`${newAppointment.startDate}T${newAppointment.startTime}`);
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + newAppointment.duration);

      const appointment = {
        title: "BLOCKED TIME",
        client: { id: "blocked", name: "Blocked Time", email: "", phone: "", creditPoints: 0 },
        service: "Blocked Time",
        location: undefined,
        remarks: newAppointment.remarks || undefined,
        start: startDateTime,
        end: endDateTime,
        duration: newAppointment.duration,
        assignedTo: newAppointment.employeeId ? teamMembers.find(m => m.id === newAppointment.employeeId) : undefined,
        tags: [],
        recurrence: newAppointment.recurrence,
        customRecurrence: newAppointment.recurrence === "custom" ? newAppointment.customRecurrence : undefined,
        endsType: newAppointment.customRecurrence?.endsType,
        endsDate: newAppointment.customRecurrence?.endsType === "on" ? newAppointment.customRecurrence?.endsDate : undefined,
        endsOccurrences: newAppointment.customRecurrence?.endsType === "after" ? newAppointment.customRecurrence?.endsOccurrences : undefined,
      };

      // Show test dialog with appointment data
      setTestAppointmentData({
        type: 'BLOCKED TIMING',
        appointment: appointment,
        formData: {
          startDate: newAppointment.startDate,
          startTime: newAppointment.startTime,
          duration: newAppointment.duration,
          employeeId: newAppointment.employeeId,
          remarks: newAppointment.remarks,
          recurrence: newAppointment.recurrence,
          customRecurrence: newAppointment.customRecurrence
        }
      });
      setIsTestDialogOpen(true);
    }

    // Handle multi-appointment submission
    if (isMultiAppointment && appointmentSlots.length > 0) {
      // Validate all appointment slots
      const allErrors: string[] = [];
      
      appointmentSlots.forEach((slot, index) => {
        const slotErrors = validateAppointmentSlot(slot);
        if (slotErrors.length > 0) {
          allErrors.push(`Appointment ${index + 1}: ${slotErrors.join(', ')}`);
        }
      });

      // Check for time conflicts
      const conflictErrors = validateTimeConflicts(appointmentSlots);
      allErrors.push(...conflictErrors);

      if (allErrors.length > 0) {
        toast.error(`Please fix the following issues: ${allErrors.join("; ")}`);
        return;
      }

      // Prepare all appointments for test dialog
      const allAppointments = appointmentSlots.map((slot ) => {
        const selectedClient = clients.find(client => client.id === newAppointment.clientId);
        if (!selectedClient) return null;

        const selectedServices = slot.selectedServices.map(serviceId => 
          services.find(svc => svc.id === serviceId)
        ).filter(Boolean);

        const startDateTime = new Date(`${slot.startDate}T${slot.startTime}`);
        const endDateTime = new Date(`${slot.startDate}T${slot.endTime || slot.startTime}`);

        return {
          title: `${selectedServices.map(s => s?.name).join(', ')} - ${selectedClient?.name} (${slot.title})`,
          client: selectedClient,
          service: selectedServices.map(s => s?.name).join(', '),
          remarks: slot.remarks || undefined,
          start: startDateTime,
          end: endDateTime,
          duration: slot.duration,
          assignedTo: slot.assignedTo === "none" ? undefined : teamMembers.find(m => m.id === slot.assignedTo),
          recurrence: slot.recurrence,
          customRecurrence: slot.recurrence === "custom" ? slot.customRecurrence : undefined,
          endsType: slot.customRecurrence?.endsType,
          endsDate: slot.customRecurrence?.endsType === "on" ? slot.customRecurrence?.endsDate : undefined,
          endsOccurrences: slot.customRecurrence?.endsType === "after" ? slot.customRecurrence?.endsOccurrences : undefined,
        };
      }).filter(Boolean);

      // Show test dialog with all appointments
      setTestAppointmentData({
        type: 'MULTIPLE APPOINTMENTS',
        appointments: allAppointments,
        totalCount: allAppointments.length,
        clientId: newAppointment.clientId
      });
      setIsTestDialogOpen(true);
      return;
    }

    // Handle single appointment submission
    if (!newAppointment.clientId && !isBlockedTiming) {
      toast.error("Please select a customer");
      return;
    }

    if (!isBlockedTiming && !isMultiAppointment && newAppointment.selectedServices.length === 0) {
      toast.error("Please select at least one service");
      return;
    }

    // For multi-appointment mode, check if all slots have services
    if (!isBlockedTiming && isMultiAppointment) {
      const slotsWithoutServices = appointmentSlots.filter(slot => slot.selectedServices.length === 0);
      if (slotsWithoutServices.length > 0) {
        toast.error(`Please select services for all appointment slots. ${slotsWithoutServices.length} slot(s) are missing services.`);
        return;
      }
    }

    if (!newAppointment.startDate || !newAppointment.startTime) {
      toast.error("Please fill in date and time");
      return;
    }

    // Validate custom recurrence if selected
    if (newAppointment.recurrence === "custom") {
      if (!newAppointment.customRecurrence?.frequency || newAppointment.customRecurrence.frequency < 1) {
        toast.error("Please enter a valid frequency for custom recurrence");
        return;
      }
      if (newAppointment.customRecurrence.timeUnit === "week" && newAppointment.customRecurrence.repeatOn.length === 0) {
        toast.error("Please select at least one day for weekly custom recurrence");
        return;
      }
      if (newAppointment.customRecurrence.endsType === "on" && !newAppointment.customRecurrence.endsDate) {
        toast.error("Please select an end date for the recurrence");
        return;
      }
      if (newAppointment.customRecurrence.endsType === "after" && (!newAppointment.customRecurrence.endsOccurrences || newAppointment.customRecurrence.endsOccurrences < 1)) {
        toast.error("Please enter a valid number of occurrences");
        return;
      }
    }

    // Find the selected client (only for regular appointments)
    const selectedClient = isBlockedTiming ? null : clients.find(client => client.id === newAppointment.clientId);
    if (!isBlockedTiming && !selectedClient) {
      toast.error("Please select a valid client");
      return;
    }

    // Get selected services (only for regular appointments)
    const selectedServices = isBlockedTiming ? [] : newAppointment.selectedServices.map(serviceId =>
      services.find(svc => svc.id === serviceId)
    ).filter(Boolean);

    if (!isBlockedTiming && !isMultiAppointment && selectedServices.length === 0) {
      toast.error("Please select at least one service");
      return;
    }

    // Create the appointment object
    const startDateTime = new Date(`${newAppointment.startDate}T${newAppointment.startTime}`);
    const totalDuration = isBlockedTiming ? newAppointment.duration : selectedServices.reduce((total, service) => total + (service?.durationMinutes || 0), 0);
    const endDateTime = new Date(startDateTime);
    endDateTime.setMinutes(endDateTime.getMinutes() + totalDuration);

    const appointment = {
      title: isBlockedTiming 
        ? "BLOCKED TIME" 
        : `${selectedServices.map(s => s?.name).join(', ')} - ${selectedClient?.name}`,
      client: isBlockedTiming 
        ? { id: "blocked", name: "Blocked Time", email: "", phone: "", creditPoints: 0 }
        : selectedClient,
      service: isBlockedTiming ? "Blocked Time" : selectedServices.map(s => s?.name).join(', '),
      remarks: newAppointment.remarks || undefined,
      start: startDateTime,
      end: endDateTime,
      duration: totalDuration,
      assignedTo: newAppointment.assignedTo === "none" ? undefined : teamMembers.find(m => m.id === newAppointment.assignedTo),
      recurrence: newAppointment.recurrence,
      customRecurrence: newAppointment.recurrence === "custom" ? newAppointment.customRecurrence : undefined,
      endsType: newAppointment.customRecurrence?.endsType,
      endsDate: newAppointment.customRecurrence?.endsType === "on" ? newAppointment.customRecurrence?.endsDate : undefined,
      endsOccurrences: newAppointment.customRecurrence?.endsType === "after" ? newAppointment.customRecurrence?.endsOccurrences : undefined,
    };

    // Determine appointment type dynamically
    let appointmentType = 'SINGLE APPOINTMENT';
    if (isBlockedTiming) {
      appointmentType = 'BLOCKED TIME';
    } else if (isMultiAppointment) {
      appointmentType = 'MULTIPLE APPOINTMENTS';
    } else if (newAppointment.recurrence && newAppointment.recurrence !== 'none') {
      appointmentType = 'RECURRING APPOINTMENT';
    }

    // Show test dialog with appointment data
    setTestAppointmentData({
      type: appointmentType,
      appointment: appointment,
      clientDetails: selectedClient ? {
        id: selectedClient.id,
        name: selectedClient.name,
        email: selectedClient.email,
        phone: selectedClient.phone,
        creditPoints: selectedClient.creditPoints
      } : { id: "blocked", name: "Blocked Time", email: "", phone: "", creditPoints: 0 },
      serviceDetails: selectedServices.map(service => ({
        id: service?.id,
        name: service?.name,
        durationMinutes: service?.durationMinutes,
        creditCost: service?.creditCost
      })),
      formData: {
        remarks: newAppointment.remarks,
        startDate: newAppointment.startDate,
        startTime: newAppointment.startTime,
        assignedTo: newAppointment.assignedTo,
        roomId: newAppointment.roomId,
        employeeId: newAppointment.employeeId,
        recurrence: newAppointment.recurrence,
        customRecurrence: newAppointment.customRecurrence
      },
      calculatedValues: {
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        duration: `${totalDuration} minutes`
      },
    });
    setIsTestDialogOpen(true);
  };

  const handleClose = () => {
    // Reset form
    setNewAppointment(prev => ({
      ...prev,
      clientId: "",
      selectedServices: [],
      location: "",
      remarks: "",
      startDate: "",
      startTime: "",
      duration: 0,
      assignedTo: "none",
      roomId: "",
      employeeId: "",
      tags: [],
      recurrence: "none",
      customRecurrence: {
        frequency: 1,
        timeUnit: "week",
        repeatOn: [],
        endsType: "never",
        endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endsOccurrences: 13,
      },
      endsType: "never",
      endsDate: "",
      endsOccurrences: 13,
    }));
    
    // Reset multi-appointment state
    setAppointmentSlots([]);
    setSelectedAppointmentId(null);
    setIsMultiAppointment(false);
    setIsBlockedTiming(false);
    
    onClose();
  };


  const resetForm = () => {
    const currentClientId = newAppointment.clientId; // Preserve current client ID
    setNewAppointment({
      clientId: currentClientId, // Keep the selected client
      selectedServices: [],
      remarks: "",
      startDate: selectedDate ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      startTime: getCurrentTimeRounded(),
      duration: 0,
      assignedTo: "none",
      roomId: "",
      employeeId: "",
      recurrence: "none",
      customRecurrence: {
        frequency: 1,
        timeUnit: "week",
        repeatOn: [],
        endsType: "never",
        endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endsOccurrences: 13,
      },
    
    });
    setIsBlockedTiming(false);
    
    // Clear multi-appointment data
    setAppointmentSlots([]);
    setSelectedAppointmentId(null);
    setIsMultiAppointment(false);
  };

  const clearAllForm = () => {
    setNewAppointment({
      clientId: "", // Clear client ID
      selectedServices: [],
      remarks: "",
      startDate: selectedDate ? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      startTime: getCurrentTimeRounded(),
      duration: 0,
      assignedTo: "none",
      roomId: "",
      employeeId: "",
      recurrence: "none",
      customRecurrence: {
        frequency: 1,
        timeUnit: "week",
        repeatOn: [],
        endsType: "never",
        endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endsOccurrences: 13,
      },
    });
    setIsBlockedTiming(false);
    
    // Clear multi-appointment data
    setAppointmentSlots([]);
    setSelectedAppointmentId(null);
    setIsMultiAppointment(false);
  };

  if (!isOpen) {
    return null;
  }

  // Safety check to prevent crashes
  if (!teamMembers || !Array.isArray(teamMembers)) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <Card className="w-full max-w-7xl max-h-[90vh] py-0 !important overflow-hidden bg-white shadow-2xl relative">
        <CardContent className="overflow-y-auto relative z-[10000] w-full px-0">
          <TooltipProvider>    
              <div className="grid grid-cols-6 grid-rows-5 ">
                  {/* Profile Part */}
                  <div className="col-span-1 row-span-5 bg-brand-secondary-3/50 border border-brand-secondary-3 rounded-lg p-6 flex flex-col space-y-4">
                    {/* Profile Icon */}
                    <div className="w-20 h-20 bg-brand-secondary-2 rounded-full flex items-center justify-center">
                      <UserPlus className="h-10 w-10 text-brand-secondary-1" />
                    </div>
                    
                    {/* Customer Name */}
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-brand-primary-1">
                        {newAppointment.clientId ? 
                          clients.find(c => c.id === newAppointment.clientId)?.name || 'Select Customer' 
                          : 'Select Customer'
                        }
                      </h3>
                      
                      {/* No Show Count */}
                      {newAppointment.clientId && (
                        <div className="flex gap-1 text-sm text-brand-secondary-1 items-center">
                          <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                            <ThumbsDown className="h-4 w-4 text-white" />
                          </div>
                          <span>0 No show(s)</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Blue Separator Line */}
                    <div className="w-full h-1 bg-blue-500"></div>
                    
                    {/* Appointment Details */}
                    <div className="space-y-4 w-full">
                      <div className="text-left">
                        <div className="flex flex-col gap-0 text-sm text-brand-primary-1">
                          <span className="font-medium">MOVE PRIVATE FITNESS -</span>
                          <div className="flex gap-2 items-center">
                            <Calendar className="h-4 w-4 text-brand-secondary-1" />
                            <span className="text-brand-secondary-1">{new Date().toLocaleDateString('en-US', { 
                              month: '2-digit', 
                              day: '2-digit', 
                              year: 'numeric' 
                            })}</span>
                          </div>
                          
                        </div>
                      </div>
                      
                      {/* Multi-Appointment Toggle */}
                      {newAppointment.clientId && (<div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium text-brand-primary-1">Multi-Appointment</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                ?
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                              <p className="text-black font-medium">Enable to create multiple appointments for the same customer with different time slots.</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center space-x-3">
                          <button
                            type="button"
                            onClick={handleMultiAppointmentToggle}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                              isMultiAppointment ? 'bg-blue-600' : 'bg-brand-secondary-3'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                isMultiAppointment ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className="text-sm text-brand-secondary-1">
                            {isMultiAppointment ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </div>)}
                      
                    </div>
                  </div>

                   {/* Form Part */}
                  <div className="col-span-5 row-span-5 rounded-lg py-2 flex flex-col items-center font-semibold">
                      <div>
                        <div className="text-center pb-6">
                            <h1 className="text-2xl font-bold text-brand-primary-1">Add New Appointment</h1>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClose}
                          className="absolute top-4 right-4 h-8 w-8 p-0 hover:bg-brand-secondary-3 z-10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                    {/* Customer Information */}
                    {!newAppointment.clientId && !isBlockedTiming && (
                      <div className="space-y-2 w-full px-6">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="clientId" className="text-sm font-medium text-brand-primary-1">Customer *</Label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                ?
                              </button>
                            </TooltipTrigger>
                            <TooltipContent  side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                              <p className="text-black font-medium">Select the client for this appointment. Their credit balance will be checked against the service cost.</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex gap-2">
                          <Select value={newAppointment.clientId} onValueChange={(value) => handleInputChange('clientId', value)}>
                            <SelectTrigger className="flex-1 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                              <SelectValue placeholder="Search Customer by Name" />
                            </SelectTrigger>
                            <SelectContent className="z-[10001]">
                              {clients.map((client) => (
                                <SelectItem key={client.id} value={client.id}>
                                  <div className="flex items-center justify-between w-full">
                                    <span className="font-medium pr-2">{client.name}</span>
                                    <span className="text-sm text-brand-secondary-1">{client.email}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            className="px-5 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                            onClick={() => {
                              // Add your plus button functionality here
                            }}
                          >
                            <UserPlus className="h-5 w-5" />
                          </Button>
                        </div>


                        {/* add the seperator line */}
                        <div className="relative flex items-center justify-center my-4">
                          <div className="w-full h-px bg-brand-secondary-3"></div>
                          <span className="absolute bg-white px-3 text-sm text-brand-secondary-1 font-medium">or</span>
                        </div>
                            
                        {/* Blocked Timing Button */}
                        <div className="pt-2 flex justify-center">
                          <Button
                            type="button"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 justify-center py-2"
                            onClick={handleBlockedTimingToggle}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Blocked Timing
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Blocked Timing Form */}
                    {isBlockedTiming && (
                      <div className="w-full px-6">
                        <div className="space-y-6">
                          {/* Date and Time */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="startDate" className="text-sm font-medium text-brand-primary-1">Date *</Label>
                              <Input
                                id="startDate"
                                type="date"
                                value={newAppointment.startDate}
                                onChange={(e) => handleInputChange('startDate', e.target.value)}
                                required
                                className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-brand-primary-1">Start Time *</Label>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <Select 
                                    value={newAppointment.startTime ? newAppointment.startTime.split(':')[0] : ''} 
                                    onValueChange={(hour) => {
                                      const currentMinute = newAppointment.startTime ? newAppointment.startTime.split(':')[1] || '00' : '00';
                                      const timeString = `${hour.padStart(2, '0')}:${currentMinute}`;
                                      handleInputChange('startTime', timeString);
                                    }}
                                  >
                                    <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                      <SelectValue placeholder="Hour" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[10001]">
                                      {Array.from({ length: 24 }, (_, hour) => {
                                        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                        const ampm = hour < 12 ? 'AM' : 'PM';
                                        return (
                                          <SelectItem key={hour} value={hour.toString().padStart(2, '0')}>
                                            {hour12} {ampm}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="flex-1">
                                  <Select 
                                    value={newAppointment.startTime ? newAppointment.startTime.split(':')[1] : ''} 
                                    onValueChange={(minute) => {
                                      const currentHour = newAppointment.startTime ? newAppointment.startTime.split(':')[0] || '00' : '00';
                                      const timeString = `${currentHour}:${minute}`;
                                      handleInputChange('startTime', timeString);
                                    }}
                                  >
                                    <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                      <SelectValue placeholder="Minute" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[10001]">
                                      {['00', '15', '30', '45'].map((minute) => (
                                        <SelectItem key={minute} value={minute}>
                                          {minute}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label htmlFor="recurrence" className="text-sm font-medium text-brand-primary-1">Recurrence</Label>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                      ?
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                                    <p className="text-black font-medium">Set how often this blocked time repeats.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <Select value={newAppointment.recurrence} onValueChange={(value) => handleInputChange('recurrence', value)}>
                                <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                  <SelectValue placeholder="Select recurrence" />
                                </SelectTrigger>
                                <SelectContent className="z-[10001]">
                                  <SelectItem value="none">Does not repeat</SelectItem>
                                  <SelectItem value="daily">Daily</SelectItem>
                                  <SelectItem value="weekly">Weekly on {newAppointment.startDate ? new Date(newAppointment.startDate).toLocaleDateString('en-US', { weekday: 'long' }) : 'selected day'}</SelectItem>
                                  <SelectItem value="monthly-week">Monthly on the {newAppointment.startDate ? getWeekPosition(new Date(newAppointment.startDate)) : 'selected week'} {newAppointment.startDate ? new Date(newAppointment.startDate).toLocaleDateString('en-US', { weekday: 'long' }) : 'selected day'}</SelectItem>
                                  <SelectItem value="annually">Annually on {newAppointment.startDate ? new Date(newAppointment.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'MM DD'}</SelectItem>
                                  <SelectItem value="weekdays">Every weekday (Mon-Fri)</SelectItem>
                                  <SelectItem value="custom">Custom</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Duration */}
                          <div className="space-y-2">
                            <Label htmlFor="duration" className="text-sm font-medium text-brand-primary-1">Duration *</Label>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => adjustDuration(-5)}
                                className="h-10 w-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                                disabled={newAppointment.duration <= 5}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              
                              <div className="flex-1 text-center py-2 px-3 bg-brand-secondary-3/50 border border-brand-secondary-3 rounded-md">
                                <span className="text-sm font-medium text-brand-primary-1">
                                  {formatDuration(newAppointment.duration)}
                                </span>
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => adjustDuration(5)}
                                className="h-10 w-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            <div className="text-xs text-brand-secondary-1 text-center">
                              START: {newAppointment.startTime} | END: {
                                (() => {
                                  const [hours, minutes] = newAppointment.startTime.split(':').map(Number);
                                  const totalMinutes = hours * 60 + minutes + newAppointment.duration;
                                  const endHours = Math.floor(totalMinutes / 60) % 24;
                                  const endMinutes = totalMinutes % 60;
                                  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
                                })()
                              }
                            </div>
                          </div>

                          {/* Employee */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label htmlFor="employeeId" className="text-sm font-medium text-brand-primary-1">Employee</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                    ?
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                                  <p className="text-black font-medium">Select the employee for this blocked time.</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <Select value={newAppointment.employeeId} onValueChange={(value) => handleInputChange('employeeId', value)}>
                              <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                <SelectValue placeholder="Select employee (optional)" />
                              </SelectTrigger>
                              <SelectContent className="z-[10001]">
                                {employees.map((employee) => (
                                  <SelectItem key={employee.id} value={employee.id}>
                                    {employee.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Remarks */}
                          <div className="space-y-2">
                            <Label htmlFor="remarks" className="text-sm font-medium text-brand-primary-1">Remarks</Label>
                            <Textarea
                              id="remarks"
                              value={newAppointment.remarks}
                              onChange={(e) => handleInputChange('remarks', e.target.value)}
                              placeholder="Enter reason for blocked time..."
                              rows={3}
                              className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
                            />
                          </div>

                          {/* Action Buttons */}
                          <div className="flex space-x-3 pt-4">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setIsBlockedTiming(false);
                                resetForm();
                              }}
                              className="flex-1 border-brand-secondary-3 text-brand-primary-1 hover:bg-brand-secondary-3/50"
                            >
                              Cancel
                            </Button>
                            
                            <Button
                              onClick={handleSubmit}
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                              disabled={!newAppointment.startDate || !newAppointment.startTime || newAppointment.duration === 0}
                            >
                              Create Blocked Time
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {(newAppointment.clientId && 
                      <div className="grid grid-cols-6 grid-rows-5 w-full">
                        {/* Row A */}
                        <div className="col-span-3 row-span-5 border-r border-brand-secondary-3 p-2 flex flex-col space-y-4">
                            {/* Customer Information */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Label htmlFor="clientId" className="text-sm font-medium text-brand-primary-1">Customer *</Label>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                        ?
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent  side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                                      <p className="text-black font-medium">Select the client for this appointment. Their credit balance will be checked against the service cost.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                                <div className="flex gap-2">
                                    <Select value={newAppointment.clientId} onValueChange={(value) => handleInputChange('clientId', value)}>
                                                    <SelectTrigger className="flex-1 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                                      <SelectValue placeholder="Search Customer by Name" />
                                      </SelectTrigger>
                                      <SelectContent className="z-[10001]">
                                        {clients.map((client) => (
                                          <SelectItem key={client.id} value={client.id}>
                                            <div className="flex items-center justify-between w-full">
                                              <span className="font-medium pr-2">{client.name}</span>
                                              <span className="text-sm text-brand-secondary-1">{client.email}</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="default"
                                    className="px-5 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                                    onClick={() => {
                                      // Add your plus button functionality here
                                    }}
                                  >
                                    <UserPlus className="h-5 w-5" />
                                  </Button>
                                </div>
                            </div>
                            {/* Multi-Appointment: Add New Appointment Button */}
                            {isMultiAppointment && (
                              <div className="space-y-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 justify-start"
                                  onClick={addNewAppointmentSlot}
                                  disabled={appointmentSlots.length >= 5}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add New Appointment {appointmentSlots.length >= 5 ? '(Max 5)' : ''}
                                </Button>
                                
                                {/* Appointment Cards */}
                                {appointmentSlots.length > 0 && (
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium text-brand-primary-1">Appointments:</Label>
                                    <div className="space-y-2 max-h-[475px] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-brand-secondary-2 [&::-webkit-scrollbar-thumb]:rounded-full">
                                      {appointmentSlots.map((slot, index) => (
                                        <Card 
                                          key={slot.id} 
                                          className={`cursor-pointer transition-colors ${
                                            selectedAppointmentId === slot.id 
                                              ? 'border-blue-500 bg-blue-50' 
                                              : 'border-brand-secondary-3 hover:border-brand-secondary-3'
                                          }`}
                                          onClick={() => selectAppointmentSlot(slot.id)}
                                        >
                                          <CardContent className="p-3">
                                            {/* Appointment Header */}
                                            <div className="flex items-center justify-between mb-3">
                                              <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full ${
                                                  selectedAppointmentId === slot.id ? 'bg-blue-500' : 'bg-brand-secondary-2'
                                                }`}></div>
                                                <div>
                                                  <div className="text-sm font-medium text-brand-primary-1">
                                                    Appointment {index + 1}
                                                  </div>
                                                  <div className="text-xs text-brand-secondary-1">
                                                    {slot.startDate} at {slot.startTime}
                                                    {slot.endTime && ` → ${slot.endTime}`}
                                                    {slot.duration > 0 && ` • ${formatDuration(slot.duration)}`}
                                                  </div>
                                                </div>
                                              </div>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  removeAppointmentSlot(slot.id);
                                                }}
                                                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                              >
                                                <X className="h-3 w-3" />
                                              </Button>
                                            </div>

                                            {/* Service Selection for this Appointment */}
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-2">
                                                <Label className="text-xs font-medium text-brand-secondary-1">Services:</Label>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-6 px-2 text-xs border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedAppointmentId(slot.id);
                                                    setIsServiceDialogOpen(true);
                                                  }}
                                                >
                                                  <Plus className="h-3 w-3 mr-1" />
                                                  Add
                                                </Button>
                                              </div>
                                              
                                              {/* Selected Services for this Appointment */}
                                              {slot.selectedServices.length > 0 && (
                                                <div className="space-y-1">
                                                  {slot.selectedServices.map((serviceId) => {
                                                    const service = services.find(s => s.id === serviceId);
                                                    return service ? (
                                                      <div key={serviceId} className="flex items-center justify-between p-2 bg-white border border-brand-secondary-3 rounded text-xs">
                                                        <div className="flex items-center gap-2">
                                                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                                          <span className="font-medium text-brand-primary-1">{service.name}</span>
                                                          <span className="text-brand-secondary-1">({service.durationMinutes}m)</span>
                                                        </div>
                                                        <Button
                                                          type="button"
                                                          variant="ghost"
                                                          size="sm"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeServiceFromSlot(slot.id, serviceId);
                                                          }}
                                                          className="h-4 w-4 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                        >
                                                          <X className="h-2.5 w-2.5" />
                                                        </Button>
                                                      </div>
                                                    ) : null;
                                                  })}
                                                </div>
                                              )}
                                              
                                              {slot.selectedServices.length === 0 && (
                                                <div className="text-center py-2 text-brand-secondary-2 text-xs">
                                                  No services selected
                                                </div>
                                              )}
                                            </div>
                                          </CardContent>
                                        </Card>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Service Selection - Only show when NOT in multi-appointment mode */}
                            {!isMultiAppointment && (
                              <div className="space-y-2 h-full">
                                <div className="flex items-center gap-2">
                                  <Label className="text-sm font-medium text-brand-primary-1">Services *</Label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                          ?
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                                                        <p className="text-black font-medium">Add services to this appointment. Duration will be calculated automatically.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                
                                {/* Add Service Button */}
                                <Button
                                  type="button"
                                  variant="outline"
                                  className=" border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 justify-start"
                                  onClick={() => setIsServiceDialogOpen(true)}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Service
                                </Button>

                                
                                {/* Selected Services List */}
                                {newAppointment.selectedServices.length > 0 && (
                                  <div className="space-y-2 mt-3">
                                    <Label className="text-sm font-medium text-brand-primary-1">Selected Services:</Label>
                                    <div className="space-y-2">
                                      {newAppointment.selectedServices.map((serviceId) => {
                                        const service = services.find(s => s.id === serviceId);
                                        return service ? (
                                          <div key={serviceId} className="flex items-center justify-between p-3 bg-brand-secondary-3/50 border border-brand-secondary-3 rounded-lg">
                                            <div className="flex items-center gap-3">
                                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                              <div>
                                                <span className="font-medium text-brand-primary-1">{service.name}</span>
                                                <span className="text-sm text-brand-secondary-1 ml-2">({service.durationMinutes} min)</span>
                                              </div>
                                            </div>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => removeService(serviceId)}
                                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        ) : null;
                                      })}
                                    </div>
                                  </div>
                                )}
                                
                                {newAppointment.selectedServices.length === 0 && (
                                  <div className="text-center py-8 text-brand-secondary-1">
                                    <div className="text-sm">No services selected</div>
                                    <div className="text-xs mt-1">Add services using the button above</div>
                                  </div>
                                )}
                              </div>
                            )}

                        </div>

                        {/* Shared Service Selection Modal */}
                        {isServiceDialogOpen && (
                          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
                            <Card className="w-full max-w-md max-h-[80vh] overflow-hidden bg-white shadow-2xl">
                              <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                  <h3 className="text-lg font-semibold text-brand-primary-1">Select Services</h3>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsServiceDialogOpen(false)}
                                    className="h-8 w-8 p-0 hover:bg-brand-secondary-3"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                  {services
                                    .filter(svc => {
                                      if (isMultiAppointment && selectedAppointmentId) {
                                        const selectedSlot = appointmentSlots.find(slot => slot.id === selectedAppointmentId);
                                        return selectedSlot && !selectedSlot.selectedServices.includes(svc.id);
                                      }
                                      return !newAppointment.selectedServices.includes(svc.id);
                                    })
                                    .map((svc) => (
                                      <div
                                        key={svc.id}
                                        className="flex items-center justify-between p-3 border border-brand-secondary-3 rounded-lg hover:bg-brand-secondary-3/50 cursor-pointer"
                                        onClick={() => {
                                          if (isMultiAppointment && selectedAppointmentId) {
                                            addServiceToSlot(selectedAppointmentId, svc.id);
                                          } else {
                                            addService(svc.id);
                                          }
                                          setIsServiceDialogOpen(false);
                                        }}
                                      >
                                        <div className="flex justify-between w-full">
                                          <span className="font-medium pr-2">{svc.name}</span>
                                          <span className="text-sm text-brand-secondary-1">{svc.durationMinutes} min</span>
                                        </div>
                                      </div>
                                    ))}
                                  {services.filter(svc => {
                                    if (isMultiAppointment && selectedAppointmentId) {
                                      const selectedSlot = appointmentSlots.find(slot => slot.id === selectedAppointmentId);
                                      return selectedSlot && !selectedSlot.selectedServices.includes(svc.id);
                                    }
                                    return !newAppointment.selectedServices.includes(svc.id);
                                  }).length === 0 && (
                                    <div className="text-center py-4 text-brand-secondary-1">
                                      All services have been selected
                              </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        )}

                        {/* Row B */}
                        <div className="col-span-3 row-span-5 p-2 flex flex-col space-y-4">
                          {/* Selected Appointment Title */}
                          {isMultiAppointment && selectedAppointmentId && (
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <h3 className="text-sm font-semibold text-blue-900">
                                  Editing: {(() => {
                                    const index = appointmentSlots.findIndex(slot => slot.id === selectedAppointmentId);
                                    return `Appointment ${index + 1}`;
                                  })()}
                                </h3>
                          </div>
                              {(() => {
                                const selectedSlot = appointmentSlots.find(slot => slot.id === selectedAppointmentId);
                                return selectedSlot && (
                                  <div className="text-xs text-blue-700 mt-1">
                                    {selectedSlot.startDate} at {selectedSlot.startTime} • {formatDuration(selectedSlot.duration)}
                                    {selectedSlot.endTime && (
                                      <span className="ml-2">→ {selectedSlot.endTime}</span>
                                    )}
            </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Multi-Appointment Form Fields */}
                          {isMultiAppointment && selectedAppointmentId && (() => {
                            const selectedSlot = appointmentSlots.find(slot => slot.id === selectedAppointmentId);
                            if (!selectedSlot) return null;

                            return (
                              <div className="space-y-4 mb-6 p-4 bg-brand-secondary-3/50 rounded-lg border">
                                <h4 className="text-sm font-semibold text-brand-primary-1">Edit Appointment Details</h4>
                                
                                {/* Date and Time for Selected Slot */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium text-brand-primary-1">Date</Label>
                                    <Input
                                      type="date"
                                      value={selectedSlot.startDate}
                                      onChange={(e) => updateAppointmentSlot(selectedSlot.id, 'startDate', e.target.value)}
                                      className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium text-brand-primary-1">Start Time</Label>
                                    <div className="flex gap-2">
                                      <div className="flex-1">
                                        <Select 
                                          value={selectedSlot.startTime ? selectedSlot.startTime.split(':')[0] : ''} 
                                          onValueChange={(hour) => {
                                            const currentMinute = selectedSlot.startTime ? selectedSlot.startTime.split(':')[1] || '00' : '00';
                                            const timeString = `${hour.padStart(2, '0')}:${currentMinute}`;
                                            updateAppointmentSlot(selectedSlot.id, 'startTime', timeString);
                                          }}
                                        >
                                          <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                            <SelectValue placeholder="Hour" />
                                          </SelectTrigger>
                                          <SelectContent className="z-[10001]">
                                            {Array.from({ length: 24 }, (_, hour) => {
                                              const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                              const ampm = hour < 12 ? 'AM' : 'PM';
                                              return (
                                                <SelectItem key={hour} value={hour.toString().padStart(2, '0')}>
                                                  {hour12} {ampm}
                                                </SelectItem>
                                              );
                                            })}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      
                                      <div className="flex-1">
                                        <Select 
                                          value={selectedSlot.startTime ? selectedSlot.startTime.split(':')[1] : ''} 
                                          onValueChange={(minute) => {
                                            const currentHour = selectedSlot.startTime ? selectedSlot.startTime.split(':')[0] || '00' : '00';
                                            const timeString = `${currentHour}:${minute}`;
                                            updateAppointmentSlot(selectedSlot.id, 'startTime', timeString);
                                          }}
                                        >
                                          <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                            <SelectValue placeholder="Minute" />
                                          </SelectTrigger>
                                          <SelectContent className="z-[10001]">
                                            {['00', '15', '30', '45'].map((minute) => (
                                              <SelectItem key={minute} value={minute}>
                                                {minute}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Room and Employee for Selected Slot */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium text-brand-primary-1">Area</Label>
                                    <Select value={selectedSlot.roomId} onValueChange={(value) => updateAppointmentSlot(selectedSlot.id, 'roomId', value)}>
                                      <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                        <SelectValue placeholder="Please Choose..." />
                                      </SelectTrigger>
                                      <SelectContent className="z-[10001]">
                                        {rooms.map((room) => (
                                          <SelectItem key={room.id} value={room.id}>
                                            {room.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium text-brand-primary-1">Employee</Label>
                                    <Select value={selectedSlot.employeeId} onValueChange={(value) => updateAppointmentSlot(selectedSlot.id, 'employeeId', value)}>
                                      <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                        <SelectValue placeholder="There are no employees available" />
                                      </SelectTrigger>
                                      <SelectContent className="z-[10001]">
                                        {employees.map((employee) => (
                                          <SelectItem key={employee.id} value={employee.id}>
                                            {employee.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                {/* Duration for Selected Slot */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium text-brand-primary-1">Duration</Label>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const newDuration = Math.max(5, selectedSlot.duration - 5);
                                        updateAppointmentSlot(selectedSlot.id, 'duration', newDuration);
                                      }}
                                      className="h-10 w-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                                      disabled={selectedSlot.duration <= 5}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                    
                                    <div className="flex-1 text-center py-2 px-3 bg-white border border-brand-secondary-3 rounded-md">
                                      <span className="text-sm font-medium text-brand-primary-1">
                                        {formatDuration(selectedSlot.duration)}
                                      </span>
                                    </div>

                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const newDuration = selectedSlot.duration + 5;
                                        updateAppointmentSlot(selectedSlot.id, 'duration', newDuration);
                                      }}
                                      className="h-10 w-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  
                                  <div className="text-xs text-brand-secondary-1 text-center">
                                    START: {selectedSlot.startTime} | END: {
                                      selectedSlot.endTime || (() => {
                                        const [hours, minutes] = selectedSlot.startTime.split(':').map(Number);
                                        const totalMinutes = hours * 60 + minutes + selectedSlot.duration;
                                        const endHours = Math.floor(totalMinutes / 60) % 24;
                                        const endMinutes = totalMinutes % 60;
                                        return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
                                      })()
                                    }
                                  </div>
                                </div>

                                {/* Remarks for Selected Slot */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium text-brand-primary-1">Remarks</Label>
                                  <Textarea
                                    value={selectedSlot.remarks}
                                    onChange={(e) => updateAppointmentSlot(selectedSlot.id, 'remarks', e.target.value)}
                                    placeholder="Enter any additional remarks for this appointment..."
                                    rows={2}
                                    className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
                                  />
                                </div>
                              </div>
                            );
                          })()}

                          {/* Single Appointment Form Fields - Only show when NOT in multi-appointment mode */}
                          {!isMultiAppointment && (
                            <div className="space-y-6">
                              {/* Date and Time */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="startDate" className="text-sm font-medium text-brand-primary-1">Date *</Label>
                                  <Input
                                    id="startDate"
                                    type="date"
                                    value={newAppointment.startDate}
                                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                                    required
                                    className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
                                  />
                                </div>
                                
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium text-brand-primary-1">Start Time *</Label>
                                  <div className="flex gap-2">
                                    {/* Hour Selector */}
                                    <div className="flex-1">
                                      <Select 
                                        value={newAppointment.startTime ? newAppointment.startTime.split(':')[0] : ''} 
                                        onValueChange={(hour) => {
                                          const currentMinute = newAppointment.startTime ? newAppointment.startTime.split(':')[1] || '00' : '00';
                                          const timeString = `${hour.padStart(2, '0')}:${currentMinute}`;
                                          handleInputChange('startTime', timeString);
                                        }}
                                      >
                                        <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                          <SelectValue placeholder="Hour" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[10001]">
                                          {Array.from({ length: 24 }, (_, hour) => {
                                            const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                            const ampm = hour < 12 ? 'AM' : 'PM';
                                            return (
                                              <SelectItem key={hour} value={hour.toString().padStart(2, '0')}>
                                                {hour12} {ampm}
                                              </SelectItem>
                                            );
                                          })}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    
                                    {/* Minute Selector - 15 minute intervals */}
                                    <div className="flex-1">
                                      <Select 
                                        value={newAppointment.startTime ? newAppointment.startTime.split(':')[1] : ''} 
                                        onValueChange={(minute) => {
                                          const currentHour = newAppointment.startTime ? newAppointment.startTime.split(':')[0] || '00' : '00';
                                          const timeString = `${currentHour}:${minute}`;
                                          handleInputChange('startTime', timeString);
                                        }}
                                      >
                                        <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                          <SelectValue placeholder="Minute" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[10001]">
                                          {['00', '15', '30', '45'].map((minute) => (
                                            <SelectItem key={minute} value={minute}>
                                              {minute}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Label htmlFor="recurrence" className="text-sm font-medium text-brand-primary-1">Recurrence</Label>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                          ?
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                                        <p className="text-black font-medium">Set how often this appointment repeats. Recurring appointments will multiply the credit cost.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <Select value={newAppointment.recurrence} onValueChange={(value) => handleInputChange('recurrence', value)}>
                                    <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                      <SelectValue placeholder="Select recurrence" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[10001]">
                                      <SelectItem value="none">Does not repeat</SelectItem>
                                      <SelectItem value="daily">Daily</SelectItem>
                                      <SelectItem value="weekly">Weekly on {newAppointment.startDate ? new Date(newAppointment.startDate).toLocaleDateString('en-US', { weekday: 'long' }) : 'selected day'}</SelectItem>
                                      <SelectItem value="monthly-week">Monthly on the {newAppointment.startDate ? getWeekPosition(new Date(newAppointment.startDate)) : 'selected week'} {newAppointment.startDate ? new Date(newAppointment.startDate).toLocaleDateString('en-US', { weekday: 'long' }) : 'selected day'}</SelectItem>
                                      <SelectItem value="annually">Annually on {newAppointment.startDate ? new Date(newAppointment.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'MM DD'}</SelectItem>
                                      <SelectItem value="weekdays">Every weekday (Mon-Fri)</SelectItem>
                                      <SelectItem value="custom">Custom</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Custom Recurrence Section */}
                              {newAppointment.recurrence === "custom" && (
                                <div className="space-y-6 p-6 bg-brand-secondary-3/50 rounded-lg border border-brand-secondary-3">
                                  <h4 className="text-lg font-semibold text-brand-primary-1">Custom Recurrence</h4>
                                  
                                  {/* Repeat every section */}
                                  <div className="space-y-3">
                                    <Label className="text-sm font-medium text-brand-primary-1">Repeat every</Label>
                                    <div className="flex items-center space-x-3">
                                      <Input
                                        type="number"
                                        min="1"
                                        max="99"
                                        value={newAppointment.customRecurrence?.frequency || 1}
                                        onChange={(e) => handleCustomRecurrenceChange('frequency', parseInt(e.target.value) || 1)}
                                        className="w-20 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 text-center"
                                      />
                                      <Select 
                                        value={newAppointment.customRecurrence?.timeUnit || "week"} 
                                        onValueChange={(value) => handleCustomRecurrenceChange('timeUnit', value)}
                                      >
                                        <SelectTrigger className="w-32 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="z-[10001]">
                                          <SelectItem value="day">day</SelectItem>
                                          <SelectItem value="week">week</SelectItem>
                                          <SelectItem value="month">month</SelectItem>
                                          <SelectItem value="year">year</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  {/* Repeat on section - only show for weekly recurrence */}
                                  {newAppointment.customRecurrence?.timeUnit === "week" && (
                                    <div className="space-y-3">
                                      <Label className="text-sm font-medium text-brand-primary-1">Repeat on</Label>
                                      <div className="flex gap-2">
                                        {[
                                          { key: 'M', label: 'M', full: 'Monday' },
                                          { key: 'T', label: 'T', full: 'Tuesday' },
                                          { key: 'W', label: 'W', full: 'Wednesday' },
                                          { key: 'TH', label: 'T', full: 'Thursday' },
                                          { key: 'F', label: 'F', full: 'Friday' },
                                          { key: 'S', label: 'S', full: 'Saturday' },
                                          { key: 'SU', label: 'S', full: 'Sunday' },
                                        ].map((day) => (
                                          <button
                                            key={day.key}
                                            type="button"
                                            onClick={() => toggleDay(day.key)}
                                            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-medium transition-colors ${
                                              newAppointment.customRecurrence?.repeatOn.includes(day.key)
                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                : 'bg-white border-brand-secondary-3 text-brand-secondary-1 hover:border-brand-secondary-2'
                                            }`}
                                            title={day.full}
                                          >
                                            {day.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Monthly recurrence options */}
                                  {newAppointment.customRecurrence?.timeUnit === "month" && (
                                    <div className="space-y-3">
                                      <Label className="text-sm font-medium text-brand-primary-1">Monthly on</Label>
                                      <Select 
                                        value={newAppointment.customRecurrence.monthlyType || "day"} 
                                        onValueChange={(value) => handleCustomRecurrenceChange('monthlyType', value)}
                                      >
                                        <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="z-[10001]">
                                          <SelectItem value="day">
                                            Monthly on day {newAppointment.startDate ? new Date(newAppointment.startDate).getDate() : 'selected day'}
                                          </SelectItem>
                                          <SelectItem value="week">
                                            Monthly on the {newAppointment.startDate ? getWeekPosition(new Date(newAppointment.startDate)) : 'selected week'} {newAppointment.startDate ? new Date(newAppointment.startDate).toLocaleDateString('en-US', { weekday: 'long' }) : 'selected day'}
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}

                                  {/* Ends section */}
                                  <div className="space-y-3">
                                    <Label className="text-sm font-medium text-brand-primary-1">Ends</Label>
                                    <div className="space-y-2">
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="radio"
                                          id="ends-never"
                                          name="ends"
                                          value="never"
                                          checked={newAppointment.customRecurrence?.endsType === "never"}
                                          onChange={() => handleCustomRecurrenceChange('endsType', 'never')}
                                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-brand-secondary-3"
                                        />
                                        <Label htmlFor="ends-never" className="text-sm text-brand-primary-1 cursor-pointer">
                                          Never
                                        </Label>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="radio"
                                          id="ends-on"
                                          name="ends"
                                          value="on"
                                          checked={newAppointment.customRecurrence?.endsType === "on"}
                                          onChange={() => handleCustomRecurrenceChange('endsType', 'on')}
                                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-brand-secondary-3"
                                        />
                                        <Label htmlFor="ends-on" className="text-sm text-brand-primary-1 cursor-pointer">
                                          On
                                        </Label>
                                        <div className="ml-2 px-3 py-1 bg-brand-secondary-3 border border-brand-secondary-3 rounded text-sm text-brand-secondary-1">
                                          <Input
                                            type="date"
                                            value={newAppointment.customRecurrence?.endsDate || ''}
                                            onChange={(e) => handleCustomRecurrenceChange('endsDate', e.target.value)}
                                            className="w-full border-0 bg-transparent focus:ring-0"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="radio"
                                          id="ends-after"
                                          name="ends"
                                          value="after"
                                          checked={newAppointment.customRecurrence?.endsType === "after"}
                                          onChange={() => handleCustomRecurrenceChange('endsType', 'after')}
                                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-brand-secondary-3"
                                        />
                                        <Label htmlFor="ends-after" className="text-sm text-brand-primary-1 cursor-pointer">
                                          After
                                        </Label>
                                        <div className="ml-2 flex items-center space-x-1">
                                          <Input
                                            type="number"
                                            min="1"
                                            max="999"
                                            value={newAppointment.customRecurrence?.endsOccurrences || 1}
                                            onChange={(e) => handleCustomRecurrenceChange('endsOccurrences', parseInt(e.target.value) || 1)}
                                            className="w-16 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 text-center"
                                          />
                                          <span className="text-sm text-brand-secondary-1">occurrences</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-2">
                                <Label htmlFor="duration" className="text-sm font-medium text-brand-primary-1">Duration</Label>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => adjustDuration(-5)}
                                    className="h-10 w-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                                    disabled={newAppointment.duration <= 5}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  
                                  <div className="flex-1 text-center py-2 px-3 bg-brand-secondary-3/50 border border-brand-secondary-3 rounded-md">
                                    <span className="text-sm font-medium text-brand-primary-1">
                                      {formatDuration(newAppointment.duration)}
                                    </span>
                                  </div>

                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => adjustDuration(5)}
                                    className="h-10 w-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                <div className="text-xs text-brand-secondary-1 text-center">
                                  START: {newAppointment.startTime} | END: {
                                    (() => {
                                      const [hours, minutes] = newAppointment.startTime.split(':').map(Number);
                                      const totalMinutes = hours * 60 + minutes + newAppointment.duration;
                                      const endHours = Math.floor(totalMinutes / 60) % 24;
                                      const endMinutes = totalMinutes % 60;
                                      return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
                                    })()
                                  }
                                </div>
                              </div>

                              {/* Room and Employee Section */}
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Label htmlFor="roomId" className="text-sm font-medium text-brand-primary-1">Area *</Label>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                            ?
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                                          <p className="text-black font-medium">Select the room where the appointment will take place.</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Select value={newAppointment.roomId} onValueChange={(value) => handleInputChange('roomId', value)}>
                                      <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                        <SelectValue placeholder="Please Choose..." />
                                      </SelectTrigger>
                                      <SelectContent className="z-[10001]">
                                        {rooms.map((room) => (
                                          <SelectItem key={room.id} value={room.id}>
                                            {room.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Label htmlFor="employeeId" className="text-sm font-medium text-brand-primary-1">Employee</Label>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button type="button" className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium">
                                            ?
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" align="start" className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none">
                                          <p className="text-black font-medium">Select the employee who will handle this appointment.</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Select value={newAppointment.employeeId} onValueChange={(value) => handleInputChange('employeeId', value)}>
                                      <SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
                                        <SelectValue placeholder="There are no employees available" />
                                      </SelectTrigger>
                                      <SelectContent className="z-[10001]">
                                        {employees.map((employee) => (
                                          <SelectItem key={employee.id} value={employee.id}>
                                            {employee.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>

                              {/* Remarks Section */}
                              <div className="space-y-4">                              
                                <div className="space-y-2">
                                  <Label htmlFor="remarks" className="text-sm font-medium text-brand-primary-1">Remarks</Label>
                                  <Textarea
                                    id="remarks"
                                    value={newAppointment.remarks}
                                    onChange={(e) => handleInputChange('remarks', e.target.value)}
                                    placeholder="Enter any additional remarks..."
                                    rows={3}
                                    className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
                                  />
                                </div>
                              </div>

                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons - Visible for both single and multi-appointments */}
                    {newAppointment.clientId && (
                      <div className="px-6 pt-4">
                        <div className="flex space-x-3">
                          <Button
                            variant="outline"
                            onClick={clearAllForm}
                            className="flex-1 border-brand-secondary-3 text-brand-primary-1 hover:bg-brand-secondary-3/50"
                          >
                            Reset
                          </Button>
                          
                          <Button
                            onClick={handleSubmit}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={
                              // For multi-appointment mode
                              isMultiAppointment 
                                ? appointmentSlots.length === 0 || 
                                  appointmentSlots.some(slot => 
                                    !slot.selectedServices.length || 
                                    !slot.startDate || 
                                    !slot.startTime || 
                                    !slot.roomId
                                  )
                                // For single appointment mode
                                : !newAppointment.startDate || 
                                  !newAppointment.startTime || 
                                  (!isBlockedTiming && !isMultiAppointment && newAppointment.selectedServices.length === 0) ||
                                  (!isBlockedTiming && !newAppointment.roomId)
                            }
                          >
                            {isMultiAppointment 
                              ? `Create ${appointmentSlots.length} Appointment${appointmentSlots.length !== 1 ? 's' : ''}` 
                              : isBlockedTiming 
                                ? 'Create Blocked Time' 
                                : 'Create Appointment'
                            }
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
              </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Test Dialog for Appointment Data */}
      {isTestDialogOpen && testAppointmentData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white shadow-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-brand-primary-1">
                  🧪 Test Data - {testAppointmentData.type}
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsTestDialogOpen(false);
                      setTestAppointmentData(null);
                    }}
                    className="border-brand-secondary-3 text-brand-primary-1 hover:bg-brand-secondary-3/50"
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      // Actually submit the appointment
                      if (testAppointmentData.type === 'SINGLE APPOINTMENT' || testAppointmentData.type === 'RECURRING APPOINTMENT') {
                        onSubmit(testAppointmentData.appointment);
                        resetForm();
                        onClose();
                      } else if (testAppointmentData.type === 'BLOCKED TIMING' || testAppointmentData.type === 'BLOCKED TIME') {
                        onSubmit(testAppointmentData.appointment);
                        setIsBlockedTiming(false);
                        resetForm();
                        onClose();
                      } else if (testAppointmentData.type === 'MULTIPLE APPOINTMENTS') {
                        testAppointmentData.appointments.forEach((appointment: any) => {
                          onSubmit(appointment);
                        });
                        setAppointmentSlots([]);
                        setSelectedAppointmentId(null);
                        setIsMultiAppointment(false);
                        onClose();
                      }
                      setIsTestDialogOpen(false);
                      setTestAppointmentData(null);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Confirm & Submit
                  </Button>
                </div>
              </div>
              
              <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Appointment Object */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-brand-primary-1">📋 Appointment Object:</h4>
                  <div className="bg-brand-secondary-3/50 p-3 rounded-lg border">
                    <pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
                      {JSON.stringify(testAppointmentData.appointment || testAppointmentData.appointments, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Client Details */}
                {testAppointmentData.clientDetails && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-brand-primary-1">👤 Client Details:</h4>
                    <div className="bg-blue-50 p-3 rounded-lg border">
                      <pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
                        {JSON.stringify(testAppointmentData.clientDetails, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Service Details */}
                {testAppointmentData.serviceDetails && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-brand-primary-1">🔧 Service Details:</h4>
                    <div className="bg-green-50 p-3 rounded-lg border">
                      <pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
                        {JSON.stringify(testAppointmentData.serviceDetails, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Form Data */}
                {testAppointmentData.formData && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-brand-primary-1">📝 Form Data:</h4>
                    <div className="bg-yellow-50 p-3 rounded-lg border">
                      <pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
                        {JSON.stringify(testAppointmentData.formData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Calculated Values */}
                {testAppointmentData.calculatedValues && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-brand-primary-1">⚡ Calculated Values:</h4>
                    <div className="bg-purple-50 p-3 rounded-lg border">
                      <pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
                        {JSON.stringify(testAppointmentData.calculatedValues, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Multiple Appointments Slot Details */}
                {testAppointmentData.type === 'MULTIPLE APPOINTMENTS' && testAppointmentData.appointments && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-brand-primary-1">📊 Multiple Appointments Slots:</h4>
                    <div className="space-y-3">
                      {testAppointmentData.appointments.map((appointment: any, index: number) => (
                        <div key={index} className="bg-orange-50 p-3 rounded-lg border">
                          <div className="text-sm font-medium text-brand-primary-1 mb-2">
                            Slot {index + 1}: {appointment.title}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-brand-secondary-1">
                            <div><strong>Date:</strong> {appointment.start ? new Date(appointment.start).toLocaleDateString('en-US') : 'N/A'}</div>
                            <div><strong>Time:</strong> {appointment.start ? new Date(appointment.start).toLocaleTimeString('en-US') : 'N/A'}</div>
                            <div><strong>Duration:</strong> {appointment.duration} minutes</div>
                            <div><strong>Services:</strong> {appointment.service}</div>
                            <div><strong>Assigned To:</strong> {appointment.assignedTo?.name || 'Unassigned'}</div>
                            <div><strong>Remarks:</strong> {appointment.remarks || 'None'}</div>
                          </div>
                          {appointment.recurrence && appointment.recurrence !== 'none' && (
                            <div className="mt-2 text-xs text-brand-secondary-1">
                              <strong>Recurrence:</strong> {appointment.recurrence}
                              {appointment.customRecurrence && (
                                <div className="ml-2">
                                  <div>Frequency: Every {appointment.customRecurrence.frequency} {appointment.customRecurrence.timeUnit}</div>
                                  {appointment.customRecurrence.repeatOn && appointment.customRecurrence.repeatOn.length > 0 && (
                                    <div>Repeat on: {appointment.customRecurrence.repeatOn.join(', ')}</div>
                                  )}
                                  {appointment.customRecurrence.endsType && (
                                    <div>Ends: {appointment.customRecurrence.endsType === 'on' ? 
                                      `On ${appointment.customRecurrence.endsDate}` : 
                                      `After ${appointment.customRecurrence.endsOccurrences} occurrences`
                                    }</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg border">
                      <div className="text-sm text-brand-primary-1">
                        <p><strong>Total Appointments:</strong> {testAppointmentData.totalCount}</p>
                        <p><strong>Client ID:</strong> {testAppointmentData.clientId}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
} 