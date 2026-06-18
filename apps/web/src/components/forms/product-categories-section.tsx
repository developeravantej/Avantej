import type { AnyFieldApi } from "@tanstack/react-form";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name: string };
type UomOption = { id: string; name: string; symbol?: string | null };

// See supplier-form-sections.tsx for explanation of the loose typing pattern.
type FormShape = {
	Field: (props: {
		name: string;
		children: (field: AnyFieldApi) => React.ReactNode;
	}) => React.ReactNode;
};

type Props = {
	form: FormShape;
	mode: "create" | "edit";
	brands: Option[];
	categories: Option[];
	suppliers: Option[];
	uoms: UomOption[];
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

export function ProductCategoriesSection({
	form,
	mode,
	brands,
	categories,
	suppliers,
	uoms,
}: Props) {
	return (
		<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
			<h5 className="text-sm font-medium text-brand-primary-1 mb-3">
				Categories &amp; Relationships
			</h5>
			<div className="grid grid-cols-2 gap-4">
				<form.Field name="brandId">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Brand</Label>
							<Select
								value={(field.state.value as string) ?? ""}
								onValueChange={(v) => field.handleChange(v || null)}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="Select brand" />
								</SelectTrigger>
								<SelectContent>
									{brands.map((b) => (
										<SelectItem key={b.id} value={b.id}>
											{b.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="categoryId">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Category</Label>
							<Select
								value={(field.state.value as string) ?? ""}
								onValueChange={(v) => field.handleChange(v || null)}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="Select category" />
								</SelectTrigger>
								<SelectContent>
									{categories.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="supplierId">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>Supplier</Label>
							<Select
								value={(field.state.value as string) ?? ""}
								onValueChange={(v) => field.handleChange(v || null)}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="Select supplier" />
								</SelectTrigger>
								<SelectContent>
									{suppliers.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="uomId">
					{(field) => (
						<div className="space-y-1">
							<Label htmlFor={field.name}>
								Unit of Measure{" "}
								{mode === "create" && (
									<span className="text-destructive">*</span>
								)}
							</Label>
							<Select
								value={(field.state.value as string) ?? ""}
								onValueChange={(v) => field.handleChange(v)}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="Select unit" />
								</SelectTrigger>
								<SelectContent>
									{uoms.map((u) => (
										<SelectItem key={u.id} value={u.id}>
											{u.name}
											{u.symbol ? ` (${u.symbol})` : ""}
										</SelectItem>
									))}
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
