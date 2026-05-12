import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPrice } from "@/lib/money";

type Service = {
	name: string;
	duration: number;
	durationUnitType: string | null;
	maxAttendees: number;
	price: number | null;
	schedulingType: string | null;
	isActive: boolean;
	description: string | null;
	type: string | null;
	taxable: boolean;
	taxPercentage: number;
	location: string | null;
	features: string[] | null;
	expirable: boolean;
	expiryDays: number | null;
	sessionCount: number | null;
	isRecommended: boolean;
	timePresetConfig: {
		recurringDays: string[];
		timeSlotsPerDay: Record<string, string[]>;
	} | null;
	createdAt: Date | string;
	updatedAt: Date | string;
};

function formatDate(date: Date | string | null | undefined): string {
	if (!date) return "N/A";
	try {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "N/A";
	}
}

function formatDuration(duration: number, unit?: string | null): string {
	if (unit === "hours") return `${duration} hour(s)`;
	if (unit === "minutes") return `${duration} minute(s)`;
	return `${duration} second(s)`;
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</p>
			<div className="mt-1 text-sm text-foreground">{children}</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-brand-secondary-3 bg-card p-6">
			<h3 className="font-subheading text-base text-foreground mb-4">
				{title}
			</h3>
			{children}
		</div>
	);
}

export function ServiceDetailsTab({ service }: { service: Service }) {
	return (
		<div className="space-y-6">
			<Section title="Overview">
				<div className="space-y-4">
					<Field label="Name">{service.name}</Field>
					{service.description && (
						<Field label="Description">{service.description}</Field>
					)}
					<div className="grid grid-cols-2 gap-4">
						<Field label="Status">
							<StatusBadge status={service.isActive ? "active" : "inactive"} />
						</Field>
						{service.isRecommended && (
							<Field label="Recommended">
								<Badge variant="default">Yes</Badge>
							</Field>
						)}
					</div>
				</div>
			</Section>

			<Section title="Scheduling">
				<div className="grid grid-cols-2 gap-4">
					<Field label="Duration">
						{formatDuration(service.duration, service.durationUnitType)}
					</Field>
					<Field label="Max attendees">{service.maxAttendees}</Field>
					<Field label="Scheduling type">
						<Badge variant="outline">
							{service.schedulingType === "class_slot"
								? "Class slot"
								: "Appointment"}
						</Badge>
					</Field>
					<Field label="Type">
						<Badge variant="outline" className="capitalize">
							{service.type ?? "—"}
						</Badge>
					</Field>
				</div>
			</Section>

			{service.schedulingType === "class_slot" && (
				<Section title="Time-Preset Schedule">
					{service.timePresetConfig &&
					service.timePresetConfig.recurringDays.length > 0 ? (
						<div className="space-y-4">
							<Field label="Recurring Days">
								<div className="flex flex-wrap gap-1">
									{service.timePresetConfig.recurringDays.map((day) => (
										<Badge key={day} variant="outline">
											{day}
										</Badge>
									))}
								</div>
							</Field>
							<Field label="Time Slots per Day">
								<div className="space-y-2">
									{service.timePresetConfig.recurringDays.map((day) => {
										const slots =
											service.timePresetConfig?.timeSlotsPerDay[day] ?? [];
										return (
											<div
												key={day}
												className="flex flex-wrap items-center gap-2"
											>
												<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground w-20 shrink-0">
													{day}
												</span>
												{slots.length > 0 ? (
													slots.map((time) => (
														<Badge
															key={`${day}-${time}`}
															variant="secondary"
														>
															{time}
														</Badge>
													))
												) : (
													<span className="text-sm text-muted-foreground italic">
														No slots configured
													</span>
												)}
											</div>
										);
									})}
								</div>
							</Field>
						</div>
					) : (
						<p className="text-sm text-muted-foreground italic">
							No recurring schedule configured.
						</p>
					)}
				</Section>
			)}

			<Section title="Pricing & Tax">
				<div className="grid grid-cols-2 gap-4">
					<Field label="Price">
						{service.price != null
							? formatPrice(service.price, "MYR")
							: "—"}
					</Field>
					<Field label="Taxable">
						{service.taxable
							? `Yes (${service.taxPercentage}%)`
							: "No"}
					</Field>
				</div>
			</Section>

			<Section title="Sessions & Expiry">
				<div className="grid grid-cols-2 gap-4">
					<Field label="Sessions">{service.sessionCount ?? "—"}</Field>
					{service.expirable && (
						<Field label="Expiry">
							{service.expiryDays ? `${service.expiryDays} days` : "—"}
						</Field>
					)}
				</div>
			</Section>

			{(service.location ||
				(service.features && service.features.length > 0)) && (
				<Section title="Details">
					<div className="space-y-4">
						{service.location && (
							<Field label="Location">{service.location}</Field>
						)}
						{service.features && service.features.length > 0 && (
							<Field label="Features">
								<div className="flex flex-wrap gap-1">
									{service.features.map((f) => (
										<Badge key={f} variant="secondary">
											{f}
										</Badge>
									))}
								</div>
							</Field>
						)}
					</div>
				</Section>
			)}

			<div className="grid grid-cols-2 gap-4 border-t border-brand-secondary-3 pt-4">
				<Field label="Created">{formatDate(service.createdAt)}</Field>
				<Field label="Updated">{formatDate(service.updatedAt)}</Field>
			</div>
		</div>
	);
}
