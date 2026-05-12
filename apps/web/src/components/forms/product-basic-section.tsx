import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	FormControl,
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

type Props<T extends Record<string, unknown>> = {
	form: UseFormReturn<T>;
	onGenerateSKU: () => void;
	onGenerateBarcode: () => void;
};

export function ProductBasicSection<T extends Record<string, unknown>>({
	form,
	onGenerateSKU,
	onGenerateBarcode,
}: Props<T>) {
	// biome-ignore lint/suspicious/noExplicitAny: generic form name narrowing
	const f = form as any;
	return (
		<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
			<h5 className="text-sm font-medium text-brand-primary-1 mb-3">
				Basic Information
			</h5>

			<div className="grid grid-cols-1 gap-4">
				<FormField
					control={f.control}
					name="name"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>
								Product Name <span className="text-destructive">*</span>
							</FormLabel>
							<FormControl>
								<Input placeholder="Product name" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<div className="grid grid-cols-2 gap-4 mt-4">
				<FormField
					control={f.control}
					name="sku"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>
								SKU <span className="text-destructive">*</span>
							</FormLabel>
							<FormControl>
								<div className="flex gap-2">
									<Input
										placeholder="Product SKU"
										{...field}
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
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={f.control}
					name="barcode"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>Barcode</FormLabel>
							<FormControl>
								<div className="flex gap-2">
									<Input
										placeholder="Barcode"
										{...field}
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
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<div className="grid grid-cols-2 gap-4 mt-4">
				<FormField
					control={f.control}
					name="type"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>Type</FormLabel>
							<Select
								value={field.value ?? ""}
								onValueChange={(v) => field.onChange(v || undefined)}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="product">Product</SelectItem>
									<SelectItem value="service_item">Service Item</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={f.control}
					name="status"
					render={({ field }: { field: any }) => (
						<FormItem>
							<FormLabel>Status</FormLabel>
							<Select
								value={field.value ?? "active"}
								onValueChange={(v) =>
									field.onChange(v as "active" | "inactive" | "discontinued")
								}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select status" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="inactive">Inactive</SelectItem>
									<SelectItem value="discontinued">Discontinued</SelectItem>
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
