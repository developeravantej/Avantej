import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { Shield, Save, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PermissionGroupCollapsible } from "../permission-cards/PermissionGroupCollapsible";
import type {
	Role,
	PermissionResource,
} from "../permission-matrix/permission-matrix.types";

const roleFormSchema = z.object({
	name: z
		.string()
		.min(2, "Role name must be at least 2 characters")
		.max(50, "Role name must be less than 50 characters"),
	description: z
		.string()
		.max(200, "Description must be less than 200 characters")
		.optional(),
	priority: z
		.number()
		.min(1, "Priority must be at least 1")
		.max(10, "Priority must be at most 10"),
});

type RoleFormData = z.infer<typeof roleFormSchema>;

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

interface RoleEditorProps {
	role?: Role;
	resources: PermissionResource[];
	initialPermissions?: Role["permissions"];
	onSave?: (roleData: RoleFormData, permissions: Role["permissions"]) => void;
	onCancel?: () => void;
	isLoading?: boolean;
	className?: string;
}

// Mock resources for UI development
const MOCK_RESOURCES: PermissionResource[] = [
	{
		id: "users",
		name: "Users",
		description: "User management and access control",
		actions: [
			{ id: "create", name: "Create", description: "Create new users" },
			{ id: "read", name: "View", description: "View user profiles" },
			{ id: "update", name: "Edit", description: "Edit user information" },
			{ id: "delete", name: "Delete", description: "Delete users" },
		],
	},
	{
		id: "roles",
		name: "Roles",
		description: "Role and permission management",
		actions: [
			{ id: "create", name: "Create", description: "Create new roles" },
			{ id: "read", name: "View", description: "View roles" },
			{ id: "update", name: "Edit", description: "Edit roles" },
			{ id: "delete", name: "Delete", description: "Delete roles" },
		],
	},
	{
		id: "branches",
		name: "Branches",
		description: "Branch management",
		actions: [
			{ id: "create", name: "Create", description: "Create new branches" },
			{ id: "read", name: "View", description: "View branch data" },
			{ id: "update", name: "Edit", description: "Edit branch information" },
		],
	},
];

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor
export function RoleEditor({
	role,
	resources = MOCK_RESOURCES,
	initialPermissions,
	onSave,
	onCancel,
	isLoading = false,
	className,
}: RoleEditorProps) {
	const isMobile = useIsMobile();
	const [permissions, setPermissions] = useState<Role["permissions"]>(
		role?.permissions ?? initialPermissions ?? [],
	);
	const [expandedResources, setExpandedResources] = useState<Set<string>>(
		new Set(["users"]),
	);

	const form = useForm({
		defaultValues: {
			name: role?.name || "",
			description: role?.description || "",
			priority: role?.priority || 3,
		} as RoleFormData,
		validators: { onSubmit: roleFormSchema },
		onSubmit: async ({ value }) => {
			onSave?.(value, permissions);
		},
	});

	const handlePermissionChange = (
		resourceId: string,
		actionId: string,
		enabled: boolean,
		scope:
			| "own"
			| "team"
			| "organization"
			| "country"
			| "region"
			| "area"
			| "branch"
			| null = "own",
	) => {
		setPermissions((prev) => {
			if (enabled && scope) {
				const filtered = prev.filter(
					(p) => !(p.resourceId === resourceId && p.actionId === actionId),
				);
				return [...filtered, { resourceId, actionId, scope }];
			} else {
				return prev.filter(
					(p) => !(p.resourceId === resourceId && p.actionId === actionId),
				);
			}
		});
	};

	const handleBulkPermissionChange = (
		resourceId: string,
		actionIds: string[],
		enabled: boolean,
	) => {
		setPermissions((prev) => {
			if (enabled) {
				const filtered = prev.filter(
					(p) =>
						!(p.resourceId === resourceId && actionIds.includes(p.actionId)),
				);
				const newPermissions = actionIds.map((actionId) => ({
					resourceId,
					actionId,
					scope: "own" as const,
				}));
				return [...filtered, ...newPermissions];
			} else {
				return prev.filter(
					(p) =>
						!(p.resourceId === resourceId && actionIds.includes(p.actionId)),
				);
			}
		});
	};

	const toggleResourceExpansion = (resourceId: string) => {
		const newExpanded = new Set(expandedResources);
		if (newExpanded.has(resourceId)) {
			newExpanded.delete(resourceId);
		} else {
			newExpanded.add(resourceId);
		}
		setExpandedResources(newExpanded);
	};

	const getTotalPermissions = () => permissions.length;

	// Shared form body — rendered into both mobile and desktop layouts
	const renderFormBody = () => (
		// react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-6"
		>
			<div
				className={cn("grid gap-6", isMobile ? "grid-cols-1" : "grid-cols-2")}
			>
				<form.Field name="name">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Role Name *</Label>
							<Input
								id={field.name}
								placeholder="Enter role name"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								A unique name for this role
							</p>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>

				<form.Field name="priority">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Priority *</Label>
							<Select
								onValueChange={(v) => field.handleChange(Number(v))}
								defaultValue={field.state.value?.toString()}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="Select priority" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">1 - High (Admin level)</SelectItem>
									<SelectItem value="2">2 - Medium (Manager level)</SelectItem>
									<SelectItem value="3">3 - Low (User level)</SelectItem>
									<SelectItem value="4">4 - Minimal (Read-only)</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Lower numbers have higher priority (1 = highest)
							</p>
							<FieldError errors={field.state.meta.errors} />
						</div>
					)}
				</form.Field>
			</div>

			<form.Field name="description">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor={field.name}>Description</Label>
						<Textarea
							id={field.name}
							placeholder="Describe what this role can do..."
							className="resize-none"
							value={field.state.value ?? ""}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Optional description to help identify this role's purpose
						</p>
						<FieldError errors={field.state.meta.errors} />
					</div>
				)}
			</form.Field>

			<Separator />

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-lg font-medium">Permissions</h3>
						<p className="text-sm text-muted-foreground">
							Configure what this role can access and modify
						</p>
					</div>
					<Badge variant="secondary" className="text-sm">
						{getTotalPermissions()} total permissions
					</Badge>
				</div>

				{getTotalPermissions() === 0 && (
					<Alert>
						<AlertTriangle className="size-4" />
						<AlertDescription>
							This role has no permissions assigned. Users with this role won't
							be able to access any features.
						</AlertDescription>
					</Alert>
				)}

				<div className="space-y-4">
					{resources.map((resource) => (
						<PermissionGroupCollapsible
							key={resource.id}
							resource={resource}
							rolePermissions={permissions.filter(
								(p) => p.resourceId === resource.id,
							)}
							onPermissionChange={(actionId, enabled, scope) =>
								handlePermissionChange(resource.id, actionId, enabled, scope)
							}
							onBulkChange={(actionIds, enabled) =>
								handleBulkPermissionChange(resource.id, actionIds, enabled)
							}
							isExpanded={expandedResources.has(resource.id)}
							onToggleExpanded={() => toggleResourceExpansion(resource.id)}
							showBulkActions={true}
						/>
					))}
				</div>
			</div>

			<Separator />

			<form.Subscribe selector={(state) => state.canSubmit}>
				{(canSubmit) => {
					const isFormValid = canSubmit && getTotalPermissions() > 0;
					return (
						<div
							className={cn(
								"flex gap-4",
								isMobile
									? "flex-col space-y-4"
									: "items-center justify-between",
							)}
						>
							<div className="text-sm text-muted-foreground">
								{isFormValid
									? `Ready to ${role ? "update" : "create"} role with ${getTotalPermissions()} permissions`
									: "Complete the form and assign at least one permission to continue"}
							</div>

							<div
								className={cn(
									"flex gap-2",
									isMobile ? "flex-col-reverse" : "items-center",
								)}
							>
								{onCancel && (
									<Button
										type="button"
										variant="outline"
										onClick={onCancel}
										disabled={isLoading}
										className={isMobile ? "w-full" : ""}
									>
										<X className="size-4 mr-2" />
										Cancel
									</Button>
								)}
								<Button
									type="submit"
									disabled={!isFormValid || isLoading}
									className={cn("min-w-[120px]", isMobile && "w-full")}
								>
									<Save className="size-4 mr-2" />
									{isLoading
										? "Saving..."
										: role
											? "Update Role"
											: "Create Role"}
								</Button>
							</div>
						</div>
					);
				}}
			</form.Subscribe>
		</form>
	);

	return (
		<div className={cn("space-y-6", className)}>
			{isMobile ? (
				<div className="space-y-6 px-4">
					<div className="flex items-center gap-2">
						<Shield className="size-5" />
						<h3 className="text-lg font-semibold">
							{role ? "Edit Role" : "Create New Role"}
						</h3>
					</div>
					{renderFormBody()}
				</div>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="size-5" />
							{role ? "Edit Role" : "Create New Role"}
						</CardTitle>
					</CardHeader>
					<CardContent>{renderFormBody()}</CardContent>
				</Card>
			)}
		</div>
	);
}
