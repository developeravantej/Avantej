import { useMemo, useState } from "react";
import {
	Search,
	Shield,
	Settings,
	Users,
	Database,
	FileText,
	Trash2,
	MoreVertical,
	Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { PermissionResource } from "@/components/access-control/permission-matrix/permission-matrix.types";
import { client } from "@/utils/orpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { toast } from "sonner";

/** Map resource identifiers to display-friendly names */
function formatResourceName(resource: string): string {
	return resource
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** Map action identifiers to display-friendly names */
function formatActionName(action: string): string {
	const map: Record<string, string> = {
		create: "Create",
		read: "View",
		update: "Edit",
		delete: "Delete",
		export: "Export",
		import: "Import",
		approve: "Approve",
		reject: "Reject",
		transfer: "Transfer",
	};
	return map[action] || action.charAt(0).toUpperCase() + action.slice(1);
}

/** Map resource identifiers to icons */
const RESOURCE_ICON_MAP: Record<string, typeof Shield> = {
	user_management: Users,
	role_management: Shield,
	hierarchy_management: Database,
	reports: FileText,
	inventory_management: Settings,
};

interface ResourceCardProps {
	resource: PermissionResource;
	onRemovePermissions: () => void;
}

function ResourceCard({ resource, onRemovePermissions }: ResourceCardProps) {
	const Icon = resource.icon || Shield;

	return (
		<Card className="hover:shadow-md transition-shadow">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3 flex-1">
						<div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center">
							<Icon className="size-5 text-primary" />
						</div>
						<div className="space-y-1 flex-1">
							<CardTitle className="text-base">{resource.name}</CardTitle>
							<p className="text-sm text-muted-foreground">
								{resource.description}
							</p>
						</div>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" className="size-8 p-0">
								<MoreVertical className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={onRemovePermissions}
								className="cursor-pointer text-destructive focus:text-destructive"
							>
								<Trash2 className="size-4 mr-2" />
								Remove All Permissions
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="flex items-center gap-2">
					<Badge variant="secondary" className="text-xs">
						{resource.actions.length} actions
					</Badge>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="space-y-2">
					<div className="text-sm font-medium text-muted-foreground">
						Available Actions
					</div>
					<div className="flex flex-wrap gap-1">
						{resource.actions.map((action) => (
							<Badge key={action.id} variant="outline" className="text-xs">
								{action.name}
							</Badge>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function PermissionsTabPage() {
	const isMobile = useIsMobile();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	type PermissionItem = Awaited<ReturnType<typeof client.permissions.list>>[number];
	type RolePermissionItem = Awaited<ReturnType<typeof client.rolePermissions.list>>[number];

	const { data: permissions = [] as PermissionItem[], isLoading } = useQuery({
		queryKey: ["permissions", organizationId],
		queryFn: async (): Promise<PermissionItem[]> => {
			if (!organizationId) return [];
			return client.permissions.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	// Fetch all role-permission assignments so we can look up permissionIds by resource
	const { data: rolePermissionAssignments = [] as RolePermissionItem[] } = useQuery({
		queryKey: ["rolePermissions", organizationId],
		queryFn: async (): Promise<RolePermissionItem[]> => {
			if (!organizationId) return [];
			return client.rolePermissions.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	// Group flat permission records into PermissionResource objects
	const resources = useMemo<PermissionResource[]>(() => {
		const grouped = new Map<string, PermissionResource>();

		for (const perm of permissions) {
			let resource = grouped.get(perm.resource);
			if (!resource) {
				resource = {
					id: perm.resource,
					name: formatResourceName(perm.resource),
					description: `${formatResourceName(perm.resource)} permissions`,
					icon: RESOURCE_ICON_MAP[perm.resource] || Shield,
					actions: [],
				};
				grouped.set(perm.resource, resource);
			}
			resource.actions.push({
				id: perm.action,
				name: formatActionName(perm.action),
				description: perm.description ?? undefined,
			});
		}

		return Array.from(grouped.values());
	}, [permissions]);

	const [searchQuery, setSearchQuery] = useState("");
	const [confirmResource, setConfirmResource] =
		useState<PermissionResource | null>(null);
	const [isRemoving, setIsRemoving] = useState(false);

	const filteredResources = resources.filter(
		(resource) =>
			resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			resource.description
				?.toLowerCase()
				.includes(searchQuery.toLowerCase()) ||
			resource.actions.some(
				(action) =>
					action.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					action.description
						?.toLowerCase()
						.includes(searchQuery.toLowerCase()),
			),
	);

	// Remove all role-permission assignments for a given resource
	const handleConfirmRemovePermissions = async () => {
		if (!confirmResource || !organizationId) return;
		setIsRemoving(true);
		try {
			// Find all permission IDs that belong to this resource
			const resourcePermIds = permissions.flatMap((p) =>
				p.resource === confirmResource.id ? [p.id] : [],
			);

			// Find all role-permission assignments for those permissions
			const assignmentsToRemove = rolePermissionAssignments.filter((rp) =>
				resourcePermIds.includes(rp.permissionId),
			);

			// Remove each assignment
			await Promise.all(
				assignmentsToRemove.map((rp) =>
					client.rolePermissions.remove({
						organizationId,
						roleId: rp.roleId,
						permissionId: rp.permissionId,
					}),
				),
			);

			await queryClient.invalidateQueries({
				queryKey: ["rolePermissions", organizationId],
			});
			toast.success(
				`Removed all role assignments for ${confirmResource.name} (${assignmentsToRemove.length} removed)`,
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to remove permissions",
			);
		} finally {
			setIsRemoving(false);
			setConfirmResource(null);
		}
	};

	const getTotalActions = () => {
		return resources.reduce(
			(total, resource) => total + resource.actions.length,
			0,
		);
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold font-heading">
						Permission Management
					</h1>
					<p className="text-brand-secondary-1">
						View and manage permission resources and actions
					</p>
				</div>
			</div>

			{/* Confirm Remove All Permissions Dialog */}
			<Dialog
				open={!!confirmResource}
				onOpenChange={(open) => {
					if (!open) setConfirmResource(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Remove All Permissions for {confirmResource?.name}
						</DialogTitle>
						<DialogDescription>
							This will remove all role assignments for every action in the{" "}
							<strong>{confirmResource?.name}</strong> resource. The resource
							itself will remain in the system but no roles will have access to
							it. This cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmResource(null)}
							disabled={isRemoving}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleConfirmRemovePermissions}
							disabled={isRemoving}
						>
							{isRemoving ? "Removing..." : "Remove All Permissions"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Stats Cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card>
					<CardContent className="p-4">
						<div className="text-center">
							<div className="text-2xl font-bold">{resources.length}</div>
							<div className="text-sm text-muted-foreground">Resources</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="text-center">
							<div className="text-2xl font-bold">{getTotalActions()}</div>
							<div className="text-sm text-muted-foreground">Total Actions</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="p-4">
						<div className="text-center">
							<div className="text-2xl font-bold">
								{resources.length > 0
									? Math.round(getTotalActions() / resources.length)
									: 0}
							</div>
							<div className="text-sm text-muted-foreground">
								Avg Actions/Resource
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search */}
			<Card>
				<CardContent className="py-4">
					<div className="relative max-w-md">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground size-4" />
						<Input
							placeholder="Search resources or actions..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-10"
						/>
					</div>
				</CardContent>
			</Card>

			{/* Resource Grid */}
			{isLoading ? (
				<Card>
					<CardContent className="py-12">
						<div className="text-center">
							<Loader2 className="size-8 mx-auto text-muted-foreground mb-4 animate-spin" />
							<p className="text-muted-foreground">Loading permissions…</p>
						</div>
					</CardContent>
				</Card>
			) : (
				<>
					<div
						className={cn(
							"grid gap-4",
							isMobile
								? "grid-cols-1"
								: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
						)}
					>
						{filteredResources.map((resource) => (
							<ResourceCard
								key={resource.id}
								resource={resource}
								onRemovePermissions={() => setConfirmResource(resource)}
							/>
						))}
					</div>

					{filteredResources.length === 0 && (
						<Card>
							<CardContent className="py-12">
								<div className="text-center">
									<Shield className="size-12 mx-auto text-brand-secondary-2 mb-4" />
									<h3 className="text-lg font-medium mb-2 text-brand-primary-1">
										No resources found
									</h3>
									<p className="text-brand-secondary-1 mb-4">
										{searchQuery
											? "No resources match your search criteria."
											: "No permission resources are configured for this organization."}
									</p>
								</div>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	);
}
