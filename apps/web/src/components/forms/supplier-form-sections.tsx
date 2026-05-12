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

export type SupplierFormValuesShape = {
	name: string;
	description?: string;
	accountNumber?: string;
	paymentTerms?: string;
	contactPerson?: string;
	contactPhone?: string;
	officePhone?: string;
	email?: string;
	website?: string;
	barcode?: string;
	isActive: boolean;
};

type Props<T extends SupplierFormValuesShape> = {
	form: UseFormReturn<T>;
	inputClass: string;
};

export function SupplierDetailsSection<T extends SupplierFormValuesShape>({
	form,
	inputClass,
}: Props<T>) {
	const f = form as unknown as UseFormReturn<SupplierFormValuesShape>;
	return (
		<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
			<h4 className="text-md font-medium text-brand-primary-1 mb-2">
				Supplier Details
			</h4>
			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={f.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Supplier Name <span className="text-destructive">*</span>
							</FormLabel>
							<FormControl>
								<Input
									placeholder="EG: THE BODY SHOP"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="description"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Supplier Description
							</FormLabel>
							<FormControl>
								<Input
									placeholder="EG: SUPPLY LOTION"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="accountNumber"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Account Number
							</FormLabel>
							<FormControl>
								<Input
									placeholder="888888888888 (BANK)"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="paymentTerms"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Payment Terms
							</FormLabel>
							<FormControl>
								<Input
									placeholder="EG: 30 days"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="barcode"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Barcode
							</FormLabel>
							<FormControl>
								<Input
									placeholder="EG: 1234567890"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="isActive"
					render={({ field }) => (
						<FormItem className="flex items-center gap-2 pt-2">
							<FormControl>
								<Checkbox
									checked={field.value as boolean}
									onCheckedChange={field.onChange}
									id="isActive"
								/>
							</FormControl>
							<FormLabel
								htmlFor="isActive"
								className="ml-2 block text-sm text-brand-primary-1 !mt-0 cursor-pointer"
							>
								Active
							</FormLabel>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);
}

export function SupplierContactSection<T extends SupplierFormValuesShape>({
	form,
	inputClass,
}: Props<T>) {
	const f = form as unknown as UseFormReturn<SupplierFormValuesShape>;
	return (
		<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
			<h4 className="text-md font-medium text-brand-primary-1 mb-2">
				Contact Information
			</h4>
			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={f.control}
					name="contactPerson"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Contact Person
							</FormLabel>
							<FormControl>
								<Input
									placeholder="EG: JONATHAN MORRISON"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="contactPhone"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Mobile Number
							</FormLabel>
							<FormControl>
								<Input
									type="tel"
									placeholder="+60 12-345 6789"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="officePhone"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Office Phone
							</FormLabel>
							<FormControl>
								<Input
									type="tel"
									placeholder="+60 3-1234 5678"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="email"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								E-Mail
							</FormLabel>
							<FormControl>
								<Input
									type="email"
									placeholder="EG: SUPPLIER@EXAMPLE.COM"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={f.control}
					name="website"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="block text-sm font-medium text-brand-primary-1">
								Website
							</FormLabel>
							<FormControl>
								<Input
									type="url"
									placeholder="EG: https://www.example.com"
									className={inputClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);
}
