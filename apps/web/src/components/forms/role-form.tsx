/**
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - priority is a number field (1–99, backend enforced; 100 is reserved for system admin)
 * - Error display: inline <FormMessage> + toast on mutation error
 *
 * NOTE: The previous contents of this file were a misfiled ServiceFormDialog (service
 * incentive form) that was never imported anywhere. Replaced with the correct RoleFormDialog
 * matching packages/api/src/routers/roles.ts which accepts: name, description, priority only.
 * No staffWeightage or incentiveRules fields exist on the roles backend.
 * permissions are managed separately via rolePermissions.add / rolePermissions.remove.
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// 1. Schema — colocated. Backend: name (1–100), description (max 500, optional),
//    priority (int 1–99; 100 is reserved for the system admin role).
const roleFormSchema = z.object({
	name: z
		.string()
		.min(1, "Role name is required")
		.max(100, "Name must be 100 characters or fewer"),
	description: z
		.string()
		.max(500, "Description must be 500 characters or fewer")
		.optional(),
	priority: z
		.number({ message: "Priority must be a number" })
		.int("Priority must be a whole number")
		.min(1, "Priority must be at least 1")
		.max(99, "Priority must be at most 99 (100 is reserved for system admin)"),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

// 2. Props — organizationId is a prop, NOT a form field
interface RoleFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: {
		id?: string;
		name?: string;
		description?: string | null;
		priority?: number;
	};
}

export function RoleFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode,
	initialData,
}: RoleFormDialogProps) {
	// 3. Form instance
	const form = useForm<RoleFormValues>({
		resolver: zodResolver(roleFormSchema),
		defaultValues: {
			name: initialData?.name ?? "",
			description: initialData?.description ?? "",
			priority: initialData?.priority ?? 50,
		},
	});

	// 4. Reset on dialog re-open with fresh initialData
	useEffect(() => {
		if (isOpen) {
			form.reset({
				name: initialData?.name ?? "",
				description: initialData?.description ?? "",
				priority: initialData?.priority ?? 50,
			});
		}
	}, [isOpen, initialData, form]);

	// 5. Mutation — isPending drives submit state
	const mutation = useApiMutation({
		mutationFn: (values: RoleFormValues) =>
			mode === "create"
				? client.roles.create({
						organizationId,
						name: values.name,
						description: values.description || undefined,
						priority: values.priority,
					})
				: client.roles.update({
						organizationId,
						id: initialData!.id!,
						name: values.name,
						description: values.description || undefined,
						priority: values.priority,
					}),
		successMessage: mode === "create" ? "Role created" : "Role updated",
		errorMessage: (err) => err.message || "Failed to save role",
		invalidate: [orpc.roles.list.key()],
		onSuccess: () => onClose(),
	});

	// 6. Submit handler
	const onSubmit = (values: RoleFormValues) => mutation.mutate(values);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Create Role" : "Edit Role"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Create a new custom role. Permissions can be assigned after creation."
							: "Update the role details. Permissions are managed separately."}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Role Name <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Branch Manager" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Describe what this role can do..."
											className="resize-none"
											rows={3}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="priority"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Priority <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={1}
											max={99}
											placeholder="e.g. 50"
											{...field}
											onChange={(e) =>
												field.onChange(e.target.valueAsNumber || 1)
											}
										/>
									</FormControl>
									<FormDescription>
										1–99. Higher numbers = lower authority. 100 is reserved for
										the system admin role.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								disabled={mutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={mutation.isPending}>
								{mutation.isPending
									? mode === "create"
										? "Creating..."
										: "Saving..."
									: mode === "create"
										? "Create Role"
										: "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
