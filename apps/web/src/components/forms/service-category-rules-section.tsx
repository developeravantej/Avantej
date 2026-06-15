import type { AnyFieldApi } from "@tanstack/react-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ServiceCategoryRulesValues = {
	requireAdvanceBooking: boolean;
	minAdvanceHours: number;
	enableCancellationWindow: boolean;
	cancellationCutoffHours: number;
	bufferTimeMinutes: number;
};

// See supplier-form-sections.tsx for explanation of the loose typing pattern.
type FormShape = {
	Field: (props: {
		name: string;
		children: (field: AnyFieldApi) => React.ReactNode;
	}) => React.ReactNode;
};

export type ServiceCategoryRulesFormApi = FormShape;

type Props = {
	form: ServiceCategoryRulesFormApi;
	requireAdvanceBooking: boolean;
	enableCancellationWindow: boolean;
};

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-destructive">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

export function ServiceCategoryRulesSection({
	form,
	requireAdvanceBooking,
	enableCancellationWindow,
}: Props) {
	return (
		<div className="rounded-2xl border border-brand-secondary-3 bg-card p-6">
			<h3 className="mb-4 font-subheading text-base text-foreground">
				Booking &amp; Cancellation Rules
			</h3>

			<div className="grid grid-cols-2 gap-4">
				<form.Field name="requireAdvanceBooking">
					{(field) => (
						<div className="flex flex-row items-center gap-2">
							<Checkbox
								id={field.name}
								className="bg-white"
								checked={field.state.value}
								onCheckedChange={(v) => field.handleChange(v === true)}
							/>
							<Label htmlFor={field.name} className="font-normal">
								Require advance booking
							</Label>
						</div>
					)}
				</form.Field>

				<form.Field name="enableCancellationWindow">
					{(field) => (
						<div className="flex flex-row items-center gap-2">
							<Checkbox
								id={field.name}
								className="bg-white"
								checked={field.state.value}
								onCheckedChange={(v) => field.handleChange(v === true)}
							/>
							<Label htmlFor={field.name} className="font-normal">
								Enable cancellation window
							</Label>
						</div>
					)}
				</form.Field>
			</div>

			<div className="mt-3 grid grid-cols-2 gap-4">
				<form.Field name="minAdvanceHours">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Min advance booking (hours)</Label>
							<Input
								id={field.name}
								className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								type="number"
								min={0}
								disabled={!requireAdvanceBooking}
								placeholder={requireAdvanceBooking ? undefined : "Not required"}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) =>
									field.handleChange(e.target.valueAsNumber || 0)
								}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="cancellationCutoffHours">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Cancellation cutoff (hours)</Label>
							<Input
								id={field.name}
								className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								type="number"
								min={0}
								disabled={!enableCancellationWindow}
								placeholder={
									enableCancellationWindow ? undefined : "Not required"
								}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) =>
									field.handleChange(e.target.valueAsNumber || 0)
								}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>

			<div className="mt-3">
				<form.Field name="bufferTimeMinutes">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Buffer Time (minutes)</Label>
							<Input
								id={field.name}
								className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								type="number"
								min={0}
								max={480}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) =>
									field.handleChange(e.target.valueAsNumber || 0)
								}
							/>
							<p className="text-xs text-muted-foreground">
								Minutes required between consecutive bookings for services in
								this category
							</p>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>
		</div>
	);
}
