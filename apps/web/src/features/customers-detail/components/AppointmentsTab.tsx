import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appointmentStatusVariant } from "../utils";

type Appointment = {
	id: string;
	startTime?: Date | string | null;
	status?: string | null;
};

interface AppointmentsTabProps {
	allAppts: Appointment[] | undefined;
}

export function AppointmentsTab({ allAppts }: AppointmentsTabProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Appointment History</CardTitle>
			</CardHeader>
			<CardContent>
				{!allAppts || allAppts.length === 0 ? (
					<p className="py-4 text-center text-muted-foreground text-sm">
						No appointments found.
					</p>
				) : (
					<div className="overflow-hidden rounded-md border">
						<table className="w-full text-sm">
							<thead className="bg-muted/50">
								<tr>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Service
									</th>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Date
									</th>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Time
									</th>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Status
									</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{allAppts.map((appt) => {
									const start = appt.startTime
										? appt.startTime instanceof Date
											? appt.startTime
											: new Date(appt.startTime)
										: null;
									return (
										<tr key={appt.id}>
											<td className="px-3 py-2 font-medium">
												{(appt as { serviceName?: string | null }).serviceName ?? "—"}
											</td>
											<td className="px-3 py-2 text-muted-foreground tabular-nums">
												{start ? start.toISOString().slice(0, 10) : "—"}
											</td>
											<td className="px-3 py-2 text-muted-foreground tabular-nums">
												{start ? start.toTimeString().slice(0, 5) : "—"}
											</td>
											<td className="px-3 py-2">
												<Badge
													variant={appointmentStatusVariant(appt.status ?? "")}
													className="text-xs"
												>
													{appt.status ?? "unknown"}
												</Badge>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
