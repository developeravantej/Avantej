export type PendingRow = {
	id: string;
	clientId: string | null;
	serviceId: string;
	serviceName: string | null;
	branchId: string | null;
	totalPrice: number | null;
	creditsTotal: number;
	createdAt: string | Date;
	customerName: string | null;
	customerEmail: string | null;
	preferredTrainerId: string | null;
	preferredTrainerName: string | null;
	paymentMethod: string | null;
	paymentStatus: string | null;
	preferredTimes: Array<{ dayOfWeek: string; time: string; priority: number }>;
};

export type PriorityLevel = "high" | "med" | "low";
export type DateGroup = "today" | "yesterday" | "earlier" | "older";

export type TrainerMember = {
	role: string;
	status: string;
	id: string;
	userId: string;
	name: string;
};
