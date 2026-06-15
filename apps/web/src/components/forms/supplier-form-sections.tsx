import type { AnyFieldApi } from "@tanstack/react-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

// TanStack Form's generic signature is too complex to cleanly type across file boundaries.
// The form prop is a `useForm()` return value typed against SupplierFormValuesShape — we
// rely on the parent (supplier-form.tsx) to enforce the shape and use loose typing here.
type FormShape = {
	Field: (props: {
		name: string;
		children: (field: AnyFieldApi) => React.ReactNode;
	}) => React.ReactNode;
};

export type SupplierFormApi = FormShape;

type Props = {
	form: SupplierFormApi;
	inputClass: string;
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

export function SupplierDetailsSection({ form, inputClass }: Props) {
	return (
		<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
			<h4 className="text-md font-medium text-brand-primary-1 mb-2">
				Supplier Details
			</h4>
			<div className="grid grid-cols-2 gap-4">
				<form.Field name="name">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Supplier Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id={field.name}
								placeholder="EG: THE BODY SHOP"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="description">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Supplier Description
							</Label>
							<Input
								id={field.name}
								placeholder="EG: SUPPLY LOTION"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="accountNumber">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Account Number
							</Label>
							<Input
								id={field.name}
								placeholder="888888888888 (BANK)"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="paymentTerms">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Payment Terms
							</Label>
							<Input
								id={field.name}
								placeholder="EG: 30 days"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="barcode">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Barcode
							</Label>
							<Input
								id={field.name}
								placeholder="EG: 1234567890"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="isActive">
					{(field) => (
						<div className="flex items-center gap-2 pt-2">
							<Checkbox
								checked={field.state.value}
								onCheckedChange={(v) => field.handleChange(v === true)}
								id={field.name}
							/>
							<Label
								htmlFor={field.name}
								className="ml-2 block text-sm text-brand-primary-1 !mt-0 cursor-pointer"
							>
								Active
							</Label>
						</div>
					)}
				</form.Field>
			</div>
		</div>
	);
}

export function SupplierContactSection({ form, inputClass }: Props) {
	return (
		<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
			<h4 className="text-md font-medium text-brand-primary-1 mb-2">
				Contact Information
			</h4>
			<div className="grid grid-cols-2 gap-4">
				<form.Field name="contactPerson">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Contact Person
							</Label>
							<Input
								id={field.name}
								placeholder="EG: JONATHAN MORRISON"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="contactPhone">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Mobile Number
							</Label>
							<Input
								id={field.name}
								type="tel"
								placeholder="+60 12-345 6789"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="officePhone">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Office Phone
							</Label>
							<Input
								id={field.name}
								type="tel"
								placeholder="+60 3-1234 5678"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="email">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								E-Mail
							</Label>
							<Input
								id={field.name}
								type="email"
								placeholder="EG: SUPPLIER@EXAMPLE.COM"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="website">
					{(field) => (
						<div className="space-y-1">
							<Label
								htmlFor={field.name}
								className="block text-sm font-medium text-brand-primary-1"
							>
								Website
							</Label>
							<Input
								id={field.name}
								type="url"
								placeholder="EG: https://www.example.com"
								className={inputClass}
								value={field.state.value ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>
		</div>
	);
}
