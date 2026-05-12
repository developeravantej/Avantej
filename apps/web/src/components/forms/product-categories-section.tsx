import type { UseFormReturn } from "react-hook-form";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name: string };
type UomOption = { id: string; name: string; symbol?: string | null };

type Props<T extends Record<string, unknown>> = {
	form: UseFormReturn<T>;
	mode: "create" | "edit";
	brands: Option[];
	categories: Option[];
	suppliers: Option[];
	uoms: UomOption[];
};

export function ProductCategoriesSection<T extends Record<string, unknown>>({
	form,
	mode,
	brands,
	categories,
	suppliers,
	uoms,
}: Props<T>) {
	// biome-ignore lint/suspicious/noExplicitAny: generic form field name narrowing
	const f = form as any;
	return (
		<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
			<h5 className="text-sm font-medium text-brand-primary-1 mb-3">
				Categories &amp; Relationships
			</h5>
			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={f.control}
					name="brandId"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>Brand</FormLabel>
							<Select
								value={field.value ?? ""}
								onValueChange={(v) => field.onChange(v || null)}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select brand" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{brands.map((b) => (
										<SelectItem key={b.id} value={b.id}>
											{b.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={f.control}
					name="categoryId"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>Category</FormLabel>
							<Select
								value={field.value ?? ""}
								onValueChange={(v) => field.onChange(v || null)}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select category" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{categories.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={f.control}
					name="supplierId"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>Supplier</FormLabel>
							<Select
								value={field.value ?? ""}
								onValueChange={(v) => field.onChange(v || null)}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select supplier" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{suppliers.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={f.control}
					name="uomId"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>
								Unit of Measure{" "}
								{mode === "create" && (
									<span className="text-destructive">*</span>
								)}
							</FormLabel>
							<Select
								value={field.value ?? ""}
								onValueChange={(v) => field.onChange(v)}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select unit" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{uoms.map((u) => (
										<SelectItem key={u.id} value={u.id}>
											{u.name}
											{u.symbol ? ` (${u.symbol})` : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);
}
