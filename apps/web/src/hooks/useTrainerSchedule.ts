import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
	getAppointmentQueryRange,
	mapApiAppointmentToCalendar,
} from "@/lib/appointment-mapper";
import { useUserContext } from "@/hooks/useUserContext";
import { useScope } from "@/components/scope/ScopeProvider";
import { orpc } from "@/utils/orpc";

/**
 * Shared trainer-schedule data layer for the /appointment/view schedule tab and
 * the embedded launchpad SchedulePanel. Owns the role gate (admin/staff see all
 * trainers; others see only themselves), the appointments query for the current
 * range, and the calendar mapping. `enabled` lets the route disable it while the
 * Attendance tab is active.
 */
export function useTrainerSchedule({
	organizationId,
	enabled = true,
}: {
	organizationId: string | null;
	enabled?: boolean;
}) {
	const { data: userContext } = useUserContext();
	const { scopeNodeId } = useScope();
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberRole = currentOrg?.hierarchy?.member?.role?.toLowerCase();
	const memberId = currentOrg?.hierarchy?.member?.id;
	const canViewAllTrainers = memberRole === "admin" || memberRole === "staff";

	const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(
		null,
	);
	const selectedTrainerId = canViewAllTrainers
		? sidebarSelectedId
		: (memberId ?? null);

	// A non-admin/staff user must resolve to their own memberId before we query.
	// Without this guard, a trainer whose memberId is missing from context would
	// query with trainerId=undefined and pull EVERY trainer's appointments —
	// the client intent is self-only. Fail closed: don't fire the query.
	const selfScopeReady = canViewAllTrainers || !!memberId;

	const { startFrom, startTo } = getAppointmentQueryRange();

	const {
		data: apiAppointments = [],
		isLoading,
		error,
	} = useQuery({
		...orpc.appointments.list.queryOptions({
			input: {
				organizationId: organizationId!,
				trainerId: selectedTrainerId ?? undefined,
				branchId: scopeNodeId,
				startFrom,
				startTo,
				limit: 200,
			},
		}),
		enabled: !!organizationId && enabled && selfScopeReady,
		staleTime: 60_000,
	});

	const appointments = useMemo(
		() => apiAppointments.map(mapApiAppointmentToCalendar),
		[apiAppointments],
	);

	return {
		canViewAllTrainers,
		sidebarSelectedId,
		setSidebarSelectedId,
		selectedTrainerId,
		appointments,
		isLoading,
		error,
	};
}
