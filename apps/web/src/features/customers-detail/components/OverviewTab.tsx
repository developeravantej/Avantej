import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/money";
import { formatDate, formatDateTime, appointmentStatusVariant, paymentStatusVariant } from "../utils";

type Payment = {
	id: string;
	totalAmount?: number | null;
	createdAt?: Date | string | null;
	paymentMethod?: string | null;
	status?: string | null;
};

type Appointment = {
	id: string;
	startTime?: Date | string | null;
	status?: string | null;
};

interface OverviewTabProps {
	recentPayments: Payment[];
	upcomingAppts: Appointment[] | undefined;
}

export function OverviewTab({ recentPayments, upcomingAppts }: OverviewTabProps) {
	return (
		<div className="space-y-4">
			{/* Recent Payments */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Recent Payments</CardTitle>
				</CardHeader>
				<CardContent>
					{recentPayments.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							No payments on record.
						</p>
					) : (
						<div className="space-y-2">
							{recentPayments.slice(0, 5).map((payment) => (
								<div
									key={payment.id}
									className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
								>
									<div className="flex flex-col gap-0.5">
										<span className="font-medium tabular-nums">
											{formatPrice(payment.totalAmount ?? 0, "MYR")}
										</span>
										<span className="text-muted-foreground text-xs">
											{formatDate(payment.createdAt)}
											{payment.paymentMethod
												? ` · ${payment.paymentMethod}`
												: ""}
										</span>
									</div>
									<Badge
										variant={paymentStatusVariant(payment.status ?? "")}
									>
										{payment.status ?? "unknown"}
									</Badge>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Upcoming Appointments */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Upcoming Appointments</CardTitle>
				</CardHeader>
				<CardContent>
					{!upcomingAppts || upcomingAppts.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							No upcoming appointments.
						</p>
					) : (
						<div className="space-y-2">
							{upcomingAppts.map((appt) => (
								<div
									key={appt.id}
									className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
								>
									<div className="flex flex-col gap-0.5">
										<span className="font-medium">
											{(appt as { serviceName?: string | null }).serviceName ?? "—"}
										</span>
										<span className="text-muted-foreground text-xs">
											{formatDateTime(appt.startTime)}
										</span>
									</div>
									<Badge variant={appointmentStatusVariant(appt.status ?? "")}>
										{appt.status ?? "unknown"}
									</Badge>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
