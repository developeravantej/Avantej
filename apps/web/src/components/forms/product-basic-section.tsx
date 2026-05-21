import type { AnyFieldApi } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// See supplier-form-sections.tsx for explanation of the loose typing pattern.
type FormShape = {
	Field: (props: {
		name: string;
		children: (field: AnyFieldApi) => React.ReactNode;
	}) => React.ReactNode;
};

export type ProductFormApi = FormShape;

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

type Props = {
	form: ProductFormApi;
	onGenerateSKU: () => void;
	onGenerateBarcode: () => void;
};

export function ProductBasicSection({
	form,
	onGenerateSKU,
	onGenerateBarcode,
}: Props) {
	return (
		<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
			<h5 className="text-sm font-medium text-brand-primary-1 mb-3">
				Basic Information
			</h5>

			<div className="grid grid-cols-1 gap-4">
				<form.Field name="name">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>
								Product Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id={field.name}
								placeholder="Product name"
								value={(field.state.value as string) ?? ""}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>

			<div className="grid grid-cols-2 gap-4 mt-4">
				<form.Field name="sku">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>
								SKU <span className="text-destructive">*</span>
							</Label>
							<div className="flex gap-2">
								<Input
									id={field.name}
									placeholder="Product SKU"
									value={(field.state.value as string) ?? ""}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="flex-1"
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onGenerateSKU}
									className="border-brand-secondary-3 bg-white text-brand-primary-1 hover:bg-brand-secondary-3/50"
								>
									Generate
								</Button>
							</div>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="barcode">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Barcode</Label>
							<div className="flex gap-2">
								<Input
									id={field.name}
									placeholder="Barcode"
									value={(field.state.value as string) ?? ""}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="flex-1"
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onGenerateBarcode}
									className="border-brand-secondary-3 bg-white text-brand-primary-1 hover:bg-brand-secondary-3/50"
								>
									Generate
								</Button>
							</div>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>

			<div className="grid grid-cols-2 gap-4 mt-4">
				<form.Field name="type">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Type</Label>
							<Select
								value={(field.state.value as string) ?? ""}
								onValueChange={(v) => field.handleChange(v || undefined)}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="Select type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="product">Product</SelectItem>
									<SelectItem value="service_item">Service Item</SelectItem>
								</SelectContent>
							</Select>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="status">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Status</Label>
							<Select
								value={(field.state.value as string) ?? "active"}
								onValueChange={(v) =>
									field.handleChange(
										v as "active" | "inactive" | "discontinued",
									)
								}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="inactive">Inactive</SelectItem>
									<SelectItem value="discontinued">Discontinued</SelectItem>
								</SelectContent>
							</Select>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>
		</div>
	);
}
