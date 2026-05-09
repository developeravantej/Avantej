/**
 * All state, hooks, derived values, and event handlers for AddAppointmentModal.
 * Extracted to keep the modal shell under 300 lines.
 */
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { orpc, client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { useAuth } from "@/hooks/useAuth";
import { useAppointmentFormData, type ServiceListItem } from "@/hooks/useAppointmentFormData";
import { validateAppointmentSlot, validateTimeConflicts } from "@/lib/appointment-scheduler";
import type { TestAppointmentData } from "@/components/calendar/appointment-form/TestDataDialog";
import { toast } from "sonner";
import type {
	TeamMember,
	Client,
	Service,
	AppointmentSlot,
	NewAppointment,
	OnSubmitPayload,
} from "@/types/appointments";

// ─── Local raw item types for in-hook queries ─────────────────────────────────

type MemberListItem = {
	id: string;
	userId: string;
	name?: string | null;
	email?: string | null;
};

type PackageInstanceItem = {
	serviceId: string;
};

export type ClassSlotOption = {
	id: string;
	date: string | Date;
	startTime: string;
	endTime: string;
	spotsAvailable?: number | null;
};

// ─── Default recurrence shape ─────────────────────────────────────────────────

function defaultRecurrence() {
	return {
		frequency: 1,
		timeUnit: "week",
		repeatOn: [] as string[],
		monthlyType: "day",
		endsType: "never",
		endsDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
		endsOccurrences: 13,
	};
}

function tomorrowDateStr(base?: Date) {
	const d = base
		? new Date(base.getTime() + 24 * 60 * 60 * 1000)
		: new Date(Date.now() + 24 * 60 * 60 * 1000);
	return d.toISOString().split("T")[0];
}

// ─── Hook input ───────────────────────────────────────────────────────────────

type UseAppointmentFormStateInput = {
	selectedDate?: Date;
	defaultTrainerId?: string | null;
	teamMembers: TeamMember[];
	onSubmit: (payload: OnSubmitPayload) => void;
	onClose: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAppointmentFormState({
	selectedDate,
	defaultTrainerId,
	teamMembers,
	onSubmit,
	onClose,
}: UseAppointmentFormStateInput) {
	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";
	const { user } = useAuth();

	const {
		clients,
		services,
		rawServices: servicesData,
		rooms,
		trainers,
		rawClientMembers: clientMembers,
	} = useAppointmentFormData();

	// ─── Current time helper ───────────────────────────────────────────────────

	const getCurrentTimeRounded = () => {
		const now = new Date();
		const minutes = now.getMinutes();
		const roundedMinutes = Math.round(minutes / 15) * 15;
		const hours = now.getHours();
		if (roundedMinutes >= 60) {
			return `${(hours + 1).toString().padStart(2, "0")}:00`;
		}
		return `${hours.toString().padStart(2, "0")}:${roundedMinutes.toString().padStart(2, "0")}`;
	};

	// ─── State ────────────────────────────────────────────────────────────────

	const [isServiceDialogOpen, setIsServiceDialogOpen] = React.useState(false);
	const [isMultiAppointment, setIsMultiAppointment] = React.useState(false);
	const [isBlockedTiming, setIsBlockedTiming] = React.useState(false);
	const [appointmentSlots, setAppointmentSlots] = React.useState<AppointmentSlot[]>([]);
	const [selectedAppointmentId, setSelectedAppointmentId] = React.useState<string | null>(null);
	const [isTestDialogOpen, setIsTestDialogOpen] = React.useState(false);
	const [testAppointmentData, setTestAppointmentData] = React.useState<TestAppointmentData | null>(null);
	const [selectedClassSlotId, setSelectedClassSlotId] = React.useState<string | null>(null);
	const [additionalSlotTrainers, setAdditionalSlotTrainers] = React.useState<string[]>([]);

	const [newAppointment, setNewAppointment] = React.useState<NewAppointment>({
		clientId: "",
		selectedServices: [],
		remarks: "",
		startDate: tomorrowDateStr(selectedDate),
		startTime: getCurrentTimeRounded(),
		duration: 0,
		assignedTo: defaultTrainerId ?? "none",
		roomId: "",
		employeeId: "",
		recurrence: "none",
		customRecurrence: defaultRecurrence(),
	});

	// ─── Effects ──────────────────────────────────────────────────────────────

	React.useEffect(() => {
		if (selectedDate) {
			setNewAppointment((prev) => ({
				...prev,
				startDate: tomorrowDateStr(selectedDate),
			}));
		}
	}, [selectedDate]);

	React.useEffect(() => {
		setAdditionalSlotTrainers([]);
	}, [newAppointment.selectedServices]);

	React.useEffect(() => {
		if (defaultTrainerId) return;
		if (user?.id && Array.isArray(teamMembers) && teamMembers.length && newAppointment.assignedTo === "none") {
			const selfMember = teamMembers.find((m) => m.id === user.id);
			if (selfMember) {
				setNewAppointment((prev) => ({ ...prev, assignedTo: selfMember.id }));
			}
		}
	}, [user?.id, teamMembers, newAppointment.assignedTo, defaultTrainerId]);

	const firstServiceId = newAppointment.selectedServices[0] ?? null;

	// ─── Derived queries ───────────────────────────────────────────────────────

	const selectedClientUserId = useMemo(() => {
		if (!newAppointment.clientId) return null;
		const member = (clientMembers as MemberListItem[]).find((m) => m.id === newAppointment.clientId);
		return member?.userId ?? null;
	}, [newAppointment.clientId, clientMembers]);

	const { data: clientPackageInstances = [], isLoading: isLoadingPackages } = useQuery({
		...orpc.packageInstances.listAll.queryOptions({
			input: { organizationId, clientId: selectedClientUserId ?? "", status: "active" },
		}),
		enabled: !!organizationId && !!selectedClientUserId,
	});

	const purchasedServiceIds = useMemo(
		() => new Set((clientPackageInstances as PackageInstanceItem[]).map((p) => p.serviceId)),
		[clientPackageInstances],
	);

	const selectedClassSlotService = useMemo(
		() =>
			newAppointment.selectedServices
				.map((id) => services.find((s) => s.id === id))
				.find((s) => s?.schedulingType === "class_slot") ?? null,
		[newAppointment.selectedServices, services],
	);

	const selectedServiceCategoryId = useMemo(() => {
		if (!newAppointment.selectedServices.length) return null;
		const firstServiceId = newAppointment.selectedServices[0];
		const rawSvc = (servicesData as ServiceListItem[]).find((s) => s.id === firstServiceId);
		return rawSvc?.categoryId ?? null;
	}, [newAppointment.selectedServices, servicesData]);

	const { data: serviceTrainers } = useQuery({
		...orpc.serviceMembers.listForService.queryOptions({
			input: {
				organizationId,
				serviceId: firstServiceId ?? "",
			},
		}),
		enabled: !!organizationId && !!firstServiceId,
	});

	const qualifiedTrainerIds = useMemo<Set<string>>(() => {
		if (!serviceTrainers) return new Set();
		return new Set(serviceTrainers.map((t) => t.memberId));
	}, [serviceTrainers]);

	// Clear employeeId when selected service changes and the current trainer is not qualified
	React.useEffect(() => {
		if (!newAppointment.employeeId) return;
		if (!firstServiceId || !serviceTrainers) return;
		if (!qualifiedTrainerIds.has(newAppointment.employeeId)) {
			setNewAppointment((prev) => ({ ...prev, employeeId: "" }));
		}
	}, [firstServiceId, serviceTrainers, qualifiedTrainerIds, newAppointment.employeeId]);

	const hasServiceTrainers = !!firstServiceId && !!serviceTrainers && serviceTrainers.length > 0;

	const derivedTrainers = useMemo(() => {
		if (!hasServiceTrainers) return trainers;
		const filtered = trainers.filter((t) => qualifiedTrainerIds.has(t.id));
		return filtered.length > 0 ? filtered : trainers;
	}, [trainers, hasServiceTrainers, qualifiedTrainerIds]);

	const trainerFilterActive = hasServiceTrainers && derivedTrainers.length < trainers.length;
	const trainerFilterFallback = hasServiceTrainers && derivedTrainers.length === trainers.length && trainers.filter((t) => qualifiedTrainerIds.has(t.id)).length === 0;

	const { data: commissionConfig } = useQuery({
		queryKey: ["categoryCommission", selectedServiceCategoryId, organizationId],
		queryFn: () =>
			client.categoryCommission.getByCategory({
				organizationId,
				categoryId: selectedServiceCategoryId!,
			}),
		enabled: !!selectedServiceCategoryId && !!organizationId,
		staleTime: 60_000,
	});
	const commissionSlots = commissionConfig?.slots ?? [];

	const { data: classSlotOptions = [] } = useQuery({
		...orpc.classSlots.list.queryOptions({
			input: {
				organizationId,
				serviceId: selectedClassSlotService?.id ?? "",
				from: new Date().toISOString(),
			},
		}),
		enabled: !!organizationId && !!selectedClassSlotService,
	});

	const trainerPlaceholder = useMemo(() => {
		if (!newAppointment.roomId) return "Select an area first";
		if (trainers.length === 0) return "No trainers available";
		return "Select a trainer";
	}, [newAppointment.roomId, trainers.length]);

	// ─── Utility ──────────────────────────────────────────────────────────────

	const getWeekPosition = (date: Date): string => {
		const dayOfMonth = date.getDate();
		const weekNumber = Math.ceil((dayOfMonth + 6) / 7);
		if (weekNumber === 1) return "first";
		if (weekNumber === 2) return "second";
		if (weekNumber === 3) return "third";
		if (weekNumber === 4) return "fourth";
		return "last";
	};

	const formatDuration = (minutes: number) => {
		if (minutes === 0) return "0m";
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
		if (hours > 0) return `${hours}h`;
		return `${mins}m`;
	};

	// ─── Handlers — single appointment ────────────────────────────────────────

	const handleClientChange = (clientId: string) => {
		setNewAppointment((prev) => ({ ...prev, clientId, selectedServices: [] }));
		setAppointmentSlots((prev) => prev.map((slot) => ({ ...slot, selectedServices: [] })));
		setAdditionalSlotTrainers([]);
	};

	const handleInputChange = (field: string, value: string | number) => {
		setNewAppointment((prev) => ({ ...prev, [field]: value }));
	};

	const addService = (serviceId: string) => {
		setNewAppointment((prev) => {
			if (prev.selectedServices.includes(serviceId)) return prev;
			const newSelectedServices = [...prev.selectedServices, serviceId];
			const totalDuration = newSelectedServices.reduce((total, id) => {
				const svc = services.find((s) => s.id === id);
				return total + (svc?.durationMinutes ?? 0);
			}, 0);
			return { ...prev, selectedServices: newSelectedServices, duration: totalDuration };
		});
	};

	const removeService = (serviceId: string) => {
		const removedSvc = services.find((s) => s.id === serviceId);
		if (removedSvc?.schedulingType === "class_slot") setSelectedClassSlotId(null);
		setNewAppointment((prev) => {
			const newSelectedServices = prev.selectedServices.filter((id) => id !== serviceId);
			const totalDuration = newSelectedServices.reduce((total, id) => {
				const svc = services.find((s) => s.id === id);
				return total + (svc?.durationMinutes ?? 0);
			}, 0);
			return { ...prev, selectedServices: newSelectedServices, duration: totalDuration };
		});
	};

	const adjustDuration = (increment: number) => {
		setNewAppointment((prev) => ({
			...prev,
			duration: Math.max(5, prev.duration + increment),
		}));
	};

	const handleCustomRecurrenceChange = (field: string, value: unknown) => {
		setNewAppointment((prev) => ({
			...prev,
			customRecurrence: { ...prev.customRecurrence!, [field]: value },
		}));
	};

	const toggleDay = (day: string) => {
		setNewAppointment((prev) => ({
			...prev,
			customRecurrence: {
				...prev.customRecurrence!,
				repeatOn: prev.customRecurrence!.repeatOn.includes(day)
					? prev.customRecurrence!.repeatOn.filter((d) => d !== day)
					: [...prev.customRecurrence!.repeatOn, day],
			},
		}));
	};

	// ─── Handlers — multi-appointment slots ───────────────────────────────────

	const addNewAppointmentSlot = () => {
		if (appointmentSlots.length >= 5) {
			toast.error("Maximum of 5 appointments allowed per booking");
			return;
		}
		const baseDate = selectedDate
			? new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000)
			: new Date(Date.now() + 24 * 60 * 60 * 1000);
		const newSlot: AppointmentSlot = {
			id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			selectedServices: [],
			remarks: "",
			startDate: baseDate.toISOString().split("T")[0],
			startTime: getCurrentTimeRounded(),
			duration: 0,
			assignedTo: "none",
			roomId: "",
			employeeId: "",
			recurrence: "none",
			customRecurrence: defaultRecurrence(),
			title: `Appointment ${appointmentSlots.length + 1}`,
			isActive: true,
		};
		setAppointmentSlots((prev) => [...prev, newSlot]);
		setSelectedAppointmentId(newSlot.id);
	};

	const removeAppointmentSlot = (slotId: string) => {
		setAppointmentSlots((prev) => prev.filter((slot) => slot.id !== slotId));
		if (selectedAppointmentId === slotId) {
			const remaining = appointmentSlots.filter((slot) => slot.id !== slotId);
			setSelectedAppointmentId(remaining.length > 0 ? remaining[0].id : null);
		}
	};

	const selectAppointmentSlot = (slotId: string) => {
		setSelectedAppointmentId(slotId);
	};

	const updateAppointmentSlot = (slotId: string, field: string, value: unknown) => {
		setAppointmentSlots((prev) =>
			prev.map((slot) => {
				if (slot.id !== slotId) return slot;
				const updatedSlot = { ...slot, [field]: value };
				if (field === "startTime" || field === "duration") {
					const startTime = field === "startTime" ? (value as string) : slot.startTime;
					const duration = field === "duration" ? (value as number) : slot.duration;
					if (startTime && duration > 0) {
						const [sh, sm] = startTime.split(":").map(Number);
						const endTotal = sh * 60 + sm + duration;
						updatedSlot.endTime = `${Math.floor(endTotal / 60) % 24}`.padStart(2, "0") + ":" + `${endTotal % 60}`.padStart(2, "0");
					} else {
						updatedSlot.endTime = undefined;
					}
				}
				return updatedSlot;
			}),
		);
	};

	const addServiceToSlot = (slotId: string, serviceId: string) => {
		setAppointmentSlots((prev) =>
			prev.map((slot) => {
				if (slot.id !== slotId) return slot;
				if (slot.selectedServices.includes(serviceId)) return slot;
				const newSvcs = [...slot.selectedServices, serviceId];
				const totalDuration = newSvcs.reduce((t, id) => t + (services.find((s) => s.id === id)?.durationMinutes ?? 0), 0);
				const [sh, sm] = slot.startTime.split(":").map(Number);
				const endTotal = sh * 60 + sm + totalDuration;
				const endTime = `${Math.floor(endTotal / 60) % 24}`.padStart(2, "0") + ":" + `${endTotal % 60}`.padStart(2, "0");
				return { ...slot, selectedServices: newSvcs, duration: totalDuration, endTime };
			}),
		);
	};

	const removeServiceFromSlot = (slotId: string, serviceId: string) => {
		setAppointmentSlots((prev) =>
			prev.map((slot) => {
				if (slot.id !== slotId) return slot;
				const newSvcs = slot.selectedServices.filter((id) => id !== serviceId);
				const totalDuration = newSvcs.reduce((t, id) => t + (services.find((s) => s.id === id)?.durationMinutes ?? 0), 0);
				const [sh, sm] = slot.startTime.split(":").map(Number);
				const endTotal = sh * 60 + sm + totalDuration;
				const endTime = totalDuration > 0
					? `${Math.floor(endTotal / 60) % 24}`.padStart(2, "0") + ":" + `${endTotal % 60}`.padStart(2, "0")
					: undefined;
				return { ...slot, selectedServices: newSvcs, duration: totalDuration, endTime };
			}),
		);
	};

	// ─── Handlers — mode toggles ───────────────────────────────────────────────

	const handleMultiAppointmentToggle = () => {
		const next = !isMultiAppointment;
		const currentClientId = newAppointment.clientId;
		const baseAppointment: NewAppointment = {
			clientId: currentClientId,
			selectedServices: [],
			remarks: "",
			startDate: tomorrowDateStr(selectedDate),
			startTime: getCurrentTimeRounded(),
			duration: 0,
			assignedTo: "none",
			roomId: "",
			employeeId: "",
			recurrence: "none",
			customRecurrence: defaultRecurrence(),
		};
		setNewAppointment(baseAppointment);
		if (next) {
			const baseDate = selectedDate || new Date(Date.now() + 24 * 60 * 60 * 1000);
			const newSlot: AppointmentSlot = {
				id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				selectedServices: [],
				remarks: "",
				startDate: baseDate.toISOString().split("T")[0],
				startTime: getCurrentTimeRounded(),
				duration: 0,
				assignedTo: "none",
				roomId: "",
				employeeId: "",
				recurrence: "none",
				customRecurrence: defaultRecurrence(),
				title: "Appointment 1",
				isActive: true,
			};
			setAppointmentSlots([newSlot]);
			setSelectedAppointmentId(newSlot.id);
		} else {
			setAppointmentSlots([]);
			setSelectedAppointmentId(null);
		}
		setIsMultiAppointment(next);
	};

	const handleBlockedTimingToggle = () => {
		const currentClientId = newAppointment.clientId;
		setIsBlockedTiming(true);
		setNewAppointment({
			clientId: currentClientId,
			selectedServices: [],
			remarks: "",
			startDate: tomorrowDateStr(selectedDate),
			startTime: getCurrentTimeRounded(),
			duration: 0,
			assignedTo: "none",
			roomId: "",
			employeeId: "",
			recurrence: "none",
			customRecurrence: defaultRecurrence(),
		});
		setAppointmentSlots([]);
		setSelectedAppointmentId(null);
		setIsMultiAppointment(false);
	};

	// ─── Handlers — form lifecycle ────────────────────────────────────────────

	const resetForm = () => {
		const currentClientId = newAppointment.clientId;
		setNewAppointment({
			clientId: currentClientId,
			selectedServices: [],
			remarks: "",
			startDate: tomorrowDateStr(selectedDate),
			startTime: getCurrentTimeRounded(),
			duration: 0,
			assignedTo: "none",
			roomId: "",
			employeeId: "",
			recurrence: "none",
			customRecurrence: defaultRecurrence(),
		});
		setAdditionalSlotTrainers([]);
		setIsBlockedTiming(false);
		setAppointmentSlots([]);
		setSelectedAppointmentId(null);
		setIsMultiAppointment(false);
	};

	const clearAllForm = () => {
		setNewAppointment({
			clientId: "",
			selectedServices: [],
			remarks: "",
			startDate: tomorrowDateStr(selectedDate),
			startTime: getCurrentTimeRounded(),
			duration: 0,
			assignedTo: "none",
			roomId: "",
			employeeId: "",
			recurrence: "none",
			customRecurrence: defaultRecurrence(),
		});
		setAdditionalSlotTrainers([]);
		setIsBlockedTiming(false);
		setAppointmentSlots([]);
		setSelectedAppointmentId(null);
		setIsMultiAppointment(false);
	};

	const handleClose = () => {
		setNewAppointment((prev) => ({
			...prev,
			clientId: "",
			selectedServices: [],
			location: undefined,
			remarks: "",
			startDate: "",
			startTime: "",
			duration: 0,
			assignedTo: "none",
			roomId: "",
			employeeId: "",
			recurrence: "none",
			customRecurrence: defaultRecurrence(),
		}));
		setAppointmentSlots([]);
		setSelectedAppointmentId(null);
		setIsMultiAppointment(false);
		setIsBlockedTiming(false);
		onClose();
	};

	// ─── Submit handler ───────────────────────────────────────────────────────

	const handleSubmit = () => {
		if (isBlockedTiming) {
			if (!newAppointment.startDate || !newAppointment.startTime || newAppointment.duration === 0) {
				toast.error("Please fill in date, time, and duration for blocked timing");
				return;
			}
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
				assignedTo: newAppointment.employeeId ? teamMembers.find((m) => m.id === newAppointment.employeeId) : undefined,
				tags: [],
				recurrence: newAppointment.recurrence,
				customRecurrence: newAppointment.recurrence === "custom" ? newAppointment.customRecurrence : undefined,
				endsType: newAppointment.customRecurrence?.endsType ?? "never",
				endsDate: newAppointment.customRecurrence?.endsType === "on" ? newAppointment.customRecurrence?.endsDate : undefined,
				endsOccurrences: newAppointment.customRecurrence?.endsType === "after" ? newAppointment.customRecurrence?.endsOccurrences : undefined,
			};
			setTestAppointmentData({
				type: "BLOCKED TIMING",
				appointment,
				formData: {
					startDate: newAppointment.startDate,
					startTime: newAppointment.startTime,
					duration: newAppointment.duration,
					employeeId: newAppointment.employeeId,
					remarks: newAppointment.remarks,
					recurrence: newAppointment.recurrence,
					customRecurrence: newAppointment.customRecurrence,
				},
			});
			setIsTestDialogOpen(true);
			return;
		}

		if (isMultiAppointment && appointmentSlots.length > 0) {
			const allErrors: string[] = [];
			appointmentSlots.forEach((slot, index) => {
				const slotErrors = validateAppointmentSlot(slot);
				if (slotErrors.length > 0) {
					allErrors.push(`Appointment ${index + 1}: ${slotErrors.join(", ")}`);
				}
			});
			const conflictErrors = validateTimeConflicts(appointmentSlots);
			allErrors.push(...conflictErrors);
			if (allErrors.length > 0) {
				toast.error(`Please fix the following issues: ${allErrors.join("; ")}`);
				return;
			}
			const allAppointments = appointmentSlots.map((slot) => {
				const selectedClient = clients.find((c) => c.id === newAppointment.clientId);
				if (!selectedClient) return null;
				const selectedServices = slot.selectedServices
					.map((serviceId) => services.find((svc) => svc.id === serviceId))
					.filter(Boolean) as Service[];
				const startDateTime = new Date(`${slot.startDate}T${slot.startTime}`);
				const endDateTime = new Date(`${slot.startDate}T${slot.endTime || slot.startTime}`);
				return {
					title: `${selectedServices.map((s) => s.name).join(", ")} - ${selectedClient.name} (${slot.title})`,
					client: selectedClient,
					service: selectedServices.map((s) => s.name).join(", "),
					remarks: slot.remarks || undefined,
					start: startDateTime,
					end: endDateTime,
					duration: slot.duration,
					assignedTo: slot.assignedTo === "none" ? undefined : teamMembers.find((m) => m.id === slot.assignedTo),
					recurrence: slot.recurrence,
					customRecurrence: slot.recurrence === "custom" ? slot.customRecurrence : undefined,
					endsType: slot.customRecurrence?.endsType ?? "never",
					endsDate: slot.customRecurrence?.endsType === "on" ? slot.customRecurrence?.endsDate : undefined,
					endsOccurrences: slot.customRecurrence?.endsType === "after" ? slot.customRecurrence?.endsOccurrences : undefined,
				};
			}).filter(Boolean);
			setTestAppointmentData({
				type: "MULTIPLE APPOINTMENTS",
				appointments: allAppointments,
				totalCount: allAppointments.length,
				clientId: newAppointment.clientId,
			});
			setIsTestDialogOpen(true);
			return;
		}

		if (!newAppointment.clientId && !isBlockedTiming) {
			toast.error("Please select a customer");
			return;
		}
		if (!isBlockedTiming && !isMultiAppointment && newAppointment.selectedServices.length === 0) {
			toast.error("Please select at least one service");
			return;
		}
		if (!newAppointment.startDate || !newAppointment.startTime) {
			toast.error("Please fill in date and time");
			return;
		}
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

		const selectedClient = clients.find((c) => c.id === newAppointment.clientId) ?? null;
		if (!isBlockedTiming && !selectedClient) {
			toast.error("Please select a valid client");
			return;
		}

		const selectedServices = newAppointment.selectedServices
			.map((serviceId) => services.find((svc) => svc.id === serviceId))
			.filter(Boolean) as Service[];

		const startDateTime = new Date(`${newAppointment.startDate}T${newAppointment.startTime}`);
		const totalDuration = selectedServices.reduce((total, svc) => total + (svc.durationMinutes ?? 0), 0);
		const endDateTime = new Date(startDateTime);
		endDateTime.setMinutes(endDateTime.getMinutes() + totalDuration);

		// Translate members.id → members.userId for staffAssignments.
		// The form stores members.id (trainerId FK) but the service expects members.userId (control-panel UUID).
		const allTrainers = [...derivedTrainers, ...trainers];
		const findUserId = (membersId: string): string | null => {
			const found = allTrainers.find((t) => t.id === membersId);
			return found?.userId ?? null;
		};

		const staffAssignments: { staffId: string; slotIndex: number }[] = [
			...(newAppointment.employeeId
				? (() => {
						const userId = findUserId(newAppointment.employeeId);
						return userId ? [{ staffId: userId, slotIndex: 0 }] : [];
					})()
				: []),
			...additionalSlotTrainers
				.map((membersId, i) => {
					if (!membersId) return null;
					const userId = findUserId(membersId);
					return userId ? { staffId: userId, slotIndex: i + 1 } : null;
				})
				.filter((a): a is { staffId: string; slotIndex: number } => a !== null),
		];

		let appointmentType = "SINGLE APPOINTMENT";
		if (isBlockedTiming) appointmentType = "BLOCKED TIME";
		else if (isMultiAppointment) appointmentType = "MULTIPLE APPOINTMENTS";
		else if (newAppointment.recurrence && newAppointment.recurrence !== "none") appointmentType = "RECURRING APPOINTMENT";

		const appointment = {
			title: `${selectedServices.map((s) => s.name).join(", ")} - ${selectedClient?.name}`,
			client: selectedClient ?? { id: "blocked", name: "Blocked Time", email: "", phone: "", creditPoints: 0 },
			service: selectedServices.map((s) => s.name).join(", "),
			remarks: newAppointment.remarks || undefined,
			start: startDateTime,
			end: endDateTime,
			duration: totalDuration,
			assignedTo: newAppointment.assignedTo === "none" ? undefined : teamMembers.find((m) => m.id === newAppointment.assignedTo),
			recurrence: newAppointment.recurrence,
			customRecurrence: newAppointment.recurrence === "custom" ? newAppointment.customRecurrence : undefined,
			endsType: newAppointment.customRecurrence?.endsType ?? "never",
			endsDate: newAppointment.customRecurrence?.endsType === "on" ? newAppointment.customRecurrence?.endsDate : undefined,
			endsOccurrences: newAppointment.customRecurrence?.endsType === "after" ? newAppointment.customRecurrence?.endsOccurrences : undefined,
			staffAssignments: staffAssignments.length > 0 ? staffAssignments : undefined,
		};

		setTestAppointmentData({
			type: appointmentType,
			appointment,
			clientDetails: selectedClient ?? { id: "blocked", name: "Blocked Time", email: "", phone: "", creditPoints: 0 },
			serviceDetails: selectedServices.map((svc) => ({
				id: svc.id,
				name: svc.name,
				durationMinutes: svc.durationMinutes,
				creditCost: svc.creditCost,
			})),
			formData: {
				remarks: newAppointment.remarks,
				startDate: newAppointment.startDate,
				startTime: newAppointment.startTime,
				assignedTo: newAppointment.assignedTo,
				roomId: newAppointment.roomId,
				employeeId: newAppointment.employeeId,
				recurrence: newAppointment.recurrence,
				customRecurrence: newAppointment.customRecurrence,
			},
			calculatedValues: {
				startDateTime: startDateTime.toISOString(),
				endDateTime: endDateTime.toISOString(),
				duration: `${totalDuration} minutes`,
			},
		});
		setIsTestDialogOpen(true);
	};

	// ─── Return all state + handlers ──────────────────────────────────────────

	return {
		// Data
		organizationId,
		clients,
		services,
		rooms,
		trainers,
		// State
		newAppointment,
		isServiceDialogOpen,
		setIsServiceDialogOpen,
		isMultiAppointment,
		setIsMultiAppointment,
		isBlockedTiming,
		setIsBlockedTiming,
		appointmentSlots,
		setAppointmentSlots,
		selectedAppointmentId,
		setSelectedAppointmentId,
		isTestDialogOpen,
		setIsTestDialogOpen,
		testAppointmentData,
		setTestAppointmentData,
		selectedClassSlotId,
		setSelectedClassSlotId,
		additionalSlotTrainers,
		setAdditionalSlotTrainers,
		// Derived
		derivedTrainers,
		trainerFilterActive,
		trainerFilterFallback,
		isLoadingPackages,
		purchasedServiceIds,
		selectedClassSlotService,
		commissionSlots,
		classSlotOptions: classSlotOptions as ClassSlotOption[],
		trainerPlaceholder,
		// Utility
		getWeekPosition,
		formatDuration,
		// Handlers
		handleClientChange,
		handleInputChange,
		addService,
		removeService,
		adjustDuration,
		handleCustomRecurrenceChange,
		toggleDay,
		addNewAppointmentSlot,
		removeAppointmentSlot,
		selectAppointmentSlot,
		updateAppointmentSlot,
		addServiceToSlot,
		removeServiceFromSlot,
		handleMultiAppointmentToggle,
		handleBlockedTimingToggle,
		resetForm,
		clearAllForm,
		handleClose,
		handleSubmit,
	};
}
