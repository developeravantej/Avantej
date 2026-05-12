import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type OrgSettingsValues = {
	gracePeriodDays: number;
	commissionPct: number;
	locale: "en-MY" | "en-US";
	packageApprovalRequired: boolean;
};

type Props = {
	form: UseFormReturn<OrgSettingsValues>;
	isAdmin: boolean;
	onSubmit: (values: OrgSettingsValues) => void | Promise<void>;
};

export function OrganizationSettingsForm({ form, isAdmin, onSubmit }: Props) {
	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				<FormField
					control={form.control}
					name="gracePeriodDays"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-brand-primary-1">
								Grace Period (Days)
							</FormLabel>
							<FormControl>
								<Input
									type="number"
									min={1}
									max={365}
									disabled={!isAdmin}
									{...field}
									className="max-w-xs"
								/>
							</FormControl>
							<FormDescription className="text-brand-secondary-1">
								Number of days after a payment due date before an account is
								considered overdue. Range: 1–365 days.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="commissionPct"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-brand-primary-1">
								Default Commission (%)
							</FormLabel>
							<FormControl>
								<div className="relative max-w-xs">
									<Input
										type="number"
										min={0}
										max={100}
										step={0.01}
										disabled={!isAdmin}
										{...field}
										className="pr-8"
									/>
									<span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary-1 text-sm pointer-events-none">
										%
									</span>
								</div>
							</FormControl>
							<FormDescription className="text-brand-secondary-1">
								Default commission percentage applied to staff sales. Range:
								0–100%.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="locale"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-brand-primary-1">Locale</FormLabel>
							<Select
								disabled={!isAdmin}
								value={field.value}
								onValueChange={field.onChange}
							>
								<FormControl>
									<SelectTrigger className="max-w-xs">
										<SelectValue placeholder="Select locale" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="en-MY">English (Malaysia)</SelectItem>
									<SelectItem value="en-US">English (United States)</SelectItem>
								</SelectContent>
							</Select>
							<FormDescription className="text-brand-secondary-1">
								Locale used for date, currency, and number formatting across the
								organization.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="packageApprovalRequired"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 max-w-lg">
							<div className="space-y-0.5">
								<FormLabel className="text-brand-primary-1 text-base">
									Require Package Approval
								</FormLabel>
								<FormDescription className="text-brand-secondary-1">
									When enabled, customer-purchased packages start as "Pending"
									and require a trainer to be assigned before sessions can be
									booked.
								</FormDescription>
							</div>
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
									disabled={!isAdmin}
								/>
							</FormControl>
						</FormItem>
					)}
				/>

				<div className="flex items-center gap-3 pt-2">
					<Button
						type="submit"
						disabled={!isAdmin || form.formState.isSubmitting}
					>
						{form.formState.isSubmitting ? "Saving…" : "Save Settings"}
					</Button>
					{!isAdmin && (
						<p className="text-sm text-muted-foreground">
							You need admin permissions to change these settings.
						</p>
					)}
				</div>
			</form>
		</Form>
	);
}
