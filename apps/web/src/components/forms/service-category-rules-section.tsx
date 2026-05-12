import type { UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export type ServiceCategoryRulesValues = {
	requireAdvanceBooking: boolean;
	minAdvanceHours: number;
	enableCancellationWindow: boolean;
	cancellationCutoffHours: number;
	bufferTimeMinutes: number;
};

type Props<T extends ServiceCategoryRulesValues> = {
	form: UseFormReturn<T>;
	requireAdvanceBooking: boolean;
	enableCancellationWindow: boolean;
};

export function ServiceCategoryRulesSection<T extends ServiceCategoryRulesValues>({
	form,
	requireAdvanceBooking,
	enableCancellationWindow,
}: Props<T>) {
	// biome-ignore lint/suspicious/noExplicitAny: generic form field name narrowing
	const f = form as unknown as UseFormReturn<ServiceCategoryRulesValues>;
	return (
		<div className="rounded-2xl border border-brand-secondary-3 bg-card p-6">
			<h3 className="mb-4 font-subheading text-base text-foreground">
				Booking &amp; Cancellation Rules
			</h3>

			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={f.control}
					name="requireAdvanceBooking"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center gap-2 gap-y-0">
							<FormControl>
								<Checkbox
									className="bg-white"
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel className="!mt-0 font-normal">
								Require advance booking
							</FormLabel>
						</FormItem>
					)}
				/>

				<FormField
					control={f.control}
					name="enableCancellationWindow"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center gap-2 gap-y-0">
							<FormControl>
								<Checkbox
									className="bg-white"
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel className="!mt-0 font-normal">
								Enable cancellation window
							</FormLabel>
						</FormItem>
					)}
				/>
			</div>

			<div className="mt-3 grid grid-cols-2 gap-4">
				<FormField
					control={f.control}
					name="minAdvanceHours"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Min advance booking (hours)</FormLabel>
							<FormControl>
								<Input
									className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									type="number"
									min={0}
									disabled={!requireAdvanceBooking}
									placeholder={requireAdvanceBooking ? undefined : "Not required"}
									{...field}
									onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={f.control}
					name="cancellationCutoffHours"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Cancellation cutoff (hours)</FormLabel>
							<FormControl>
								<Input
									className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									type="number"
									min={0}
									disabled={!enableCancellationWindow}
									placeholder={
										enableCancellationWindow ? undefined : "Not required"
									}
									{...field}
									onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<div className="mt-3">
				<FormField
					control={f.control}
					name="bufferTimeMinutes"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Buffer Time (minutes)</FormLabel>
							<FormControl>
								<Input
									className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									type="number"
									min={0}
									max={480}
									{...field}
									onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
								/>
							</FormControl>
							<p className="text-xs text-muted-foreground">
								Minutes required between consecutive bookings for services in
								this category
							</p>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);
}
