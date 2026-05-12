import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import {
	Plus,
	Search,
	Shield,
	Users,
	Settings,
	HelpCircle,
	Check,
	X,
	ChevronDown,
	ChevronRight,
	Database,
	FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { EnhancedPermissionMatrix } from "@/components/access-control/permission-matrix/EnhancedPermissionMatrix";
import { RoleCard } from "@/components/access-control/permission-cards/RoleCard";
import { RoleEditor } from "@/components/access-control/editors/RoleEditor";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
	Role,
	PermissionResource,
} from "@/components/access-control/permission-matrix/PermissionMatrix";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoles } from "@/hooks/useRoles";
import { toast } from "sonner";

// Role templates for quick setup
const ROLE_TEMPLATES = [
	{
		id: "admin",
		name: "Administrator",
		description: "Full access to all resources",
		icon: Shield,
	},
	{
		id: "manager",
		name: "Manager",
		description: "Department-level management access",
		icon: Users,
	},
	{
		id: "basic",
		name: "Basic User",
		description: "Standard access for daily operations",
		icon: Users,
	},
	{
		id: "readonly",
		name: "Read Only",
		description: "View-only access to resources",
		icon: Users,
	},
];

/** Map resource identifiers to display-friendly icons */
const RESOURCE_ICON_MAP: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	user_management: Users,
	users: Users,
	role_management: Shield,
	roles: Shield,
	hierarchy_management: Database,
	branches: Settings,
	reports: FileText,
};

export function RolesTabPage() {
	const isMobile = useIsMobile();
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	type PermissionItem = Awaited<ReturnType<typeof client.permissions.list>>[number];
	type RoleItem = Awaited<ReturnType<typeof client.roles.list>>[number];
	type MemberItem = Awaited<ReturnType<typeof client.members.list>>[number];

	// Fetch permissions (resources + actions)
	const { data: permissionsData = [] as PermissionItem[] } = useQuery({
		queryKey: ["permissions", organizationId],
		queryFn: (): Promise<PermissionItem[]> => {
			if (!organizationId) return Promise.resolve([]);
			return client.permissions.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	// Fetch roles
	const { data: rolesApiData = [] as RoleItem[], isLoading: rolesLoading } = useQuery({
		queryKey: ["roles", organizationId],
		queryFn: (): Promise<RoleItem[]> => {
			if (!organizationId) return Promise.resolve([]);
			return client.roles.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	// Fetch role-permission assignments for member counts (by role)
	const { data: membersData = [] as MemberItem[] } = useQuery({
		queryKey: ["members", organizationId],
		queryFn: (): Promise<MemberItem[]> => {
			if (!organizationId) return Promise.resolve([]);
			return client.members.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	// Build PermissionResource list from flat permissions
	const resources = useMemo<PermissionResource[]>(() => {
		const grouped = new Map<string, PermissionResource>();
		for (const perm of permissionsData) {
			let res = grouped.get(perm.resource);
			if (!res) {
				res = {
					id: perm.resource,
					name: perm.resource
						.split("_")
						.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
						.join(" "),
					description: `${perm.resource
						.split("_")
						.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
						.join(" ")} permissions`,
					icon: RESOURCE_ICON_MAP[perm.resource] || Settings,
					actions: [],
				};
				grouped.set(perm.resource, res);
			}
			res.actions.push({
				id: perm.action,
				name: perm.action.charAt(0).toUpperCase() + perm.action.slice(1),
				description: perm.description ?? undefined,
			});
		}
		return Array.from(grouped.values());
	}, [permissionsData]);

	// Build Role list from API data
	const displayRoles = useMemo<Role[]>(() => {
		return rolesApiData.map((r) => ({
			id: r.id,
			name: r.name,
			description: r.description ?? undefined,
			priority: r.priority,
			permissions: [],
		}));
	}, [rolesApiData]);

	// Count members per role
	const userCounts = useMemo<Record<string, number>>(() => {
		const counts: Record<string, number> = {};
		for (const member of membersData) {
			const role = member.role;
			if (role) {
				// roles from API have names; find matching role by name
				const matched = displayRoles.find(
					(r) => r.name.toLowerCase() === role.toLowerCase(),
				);
				if (matched) {
					counts[matched.id] = (counts[matched.id] ?? 0) + 1;
				}
			}
		}
		return counts;
	}, [membersData, displayRoles]);

	const loading = rolesLoading;
	const error: string | null = null;

	const { createRole, addPermission, removePermission } = useRoles(
		organizationId ?? "",
	);

	const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
	const [searchQuery, setSearchQuery] = useState("");
	const [editingRole, setEditingRole] = useState<Role | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [viewMode, setViewMode] = useState<"cards" | "enhanced" | "wizard">(
		"cards",
	);
	const [showGuide, setShowGuide] = useState(true);
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
		new Set(["users"]),
	);
	const [wizardStep, setWizardStep] = useState(1);
	const [selectedTemplate, setSelectedTemplate] = useState("");
	const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
	// Wizard step 2: track which actions are checked per resource
	// key: `${resourceId}:${actionId}`, value: boolean
	const [wizardPermissions, setWizardPermissions] = useState<
		Record<string, boolean>
	>({});

	// Filter roles based on search query
	const filteredRoles = displayRoles.filter(
		(role) =>
			role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			role.description?.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	// Role selection handlers
	const handleRoleSelect = (roleId: string, selected: boolean) => {
		setSelectedRoles((prev) => {
			const newSet = new Set(prev);
			if (selected) {
				newSet.add(roleId);
			} else {
				newSet.delete(roleId);
			}
			return newSet;
		});
	};

	// Role editing handlers
	const handleEditRole = (role: Role) => {
		setEditingRole(role);
		setIsCreating(false);
	};

	const handleCreateRole = () => {
		setEditingRole(null);
		setIsCreating(true);
		setSelectedTemplate("");
	};

	const handleCreateFromTemplate = (templateId: string) => {
		setEditingRole(null);
		setIsCreating(true);
		setSelectedTemplate(templateId);
	};

	const handleDeleteRole = (_roleId: string) => {
		// No-op: roles can only be deleted via the API; RoleCard calls this for optimistic UI
		// Real deletion would use deleteRole mutation from useRoles
	};

	const handleDuplicateRole = (_role: Role) => {
		// No-op: duplication is not a supported API operation
	};

	const handleSaveRole = async (
		roleData: { name: string; description?: string; priority: number },
		rolePerms: Role["permissions"],
	) => {
		if (!organizationId) {
			toast.error("No organization selected.");
			return;
		}
		try {
			const newRole = await createRole.mutateAsync({
				name: roleData.name,
				description: roleData.description,
				priority: roleData.priority,
			});

			for (const perm of rolePerms) {
				const matched = permissionsData.find(
					(p) => p.resource === perm.resourceId && p.action === perm.actionId,
				);
				if (!matched) continue;
				await addPermission.mutateAsync({
					roleId: newRole.id,
					permissionId: matched.id,
				});
			}

			toast.success("Role created.");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to save role";
			toast.error(msg);
			return;
		}
		setEditingRole(null);
		setIsCreating(false);
	};

	const handlePermissionChange = async (
		roleId: string,
		resourceId: string,
		actionId: string,
		enabled: boolean,
		_scope?:
			| "own"
			| "team"
			| "organization"
			| "country"
			| "region"
			| "area"
			| "branch"
			| null,
	) => {
		if (!organizationId) return;

		const updateKey = `${roleId}-${resourceId}-${actionId}`;
		const roleName = displayRoles.find((r) => r.id === roleId)?.name ?? "Role";
		const actionName = actionId.charAt(0).toUpperCase() + actionId.slice(1);

		// Find permissionId for this resource+action
		const perm = permissionsData.find(
			(p) => p.resource === resourceId && p.action === actionId,
		);
		if (!perm) {
			toast.error(`Could not find permission for ${actionId} on ${resourceId}`);
			return;
		}

		try {
			setPendingUpdates((prev) => new Set([...prev, updateKey]));
			if (enabled) {
				await addPermission.mutateAsync({ roleId, permissionId: perm.id });
				toast.success(`Added ${actionName} permission to ${roleName}`);
			} else {
				await removePermission.mutateAsync({ roleId, permissionId: perm.id });
				toast.success(`Removed ${actionName} permission from ${roleName}`);
			}
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Failed to update permission";
			toast.error(`${errorMessage}`);
		} finally {
			setPendingUpdates((prev) => {
				const newSet = new Set(prev);
				newSet.delete(updateKey);
				return newSet;
			});
		}
	};

	// Group expansion handler
	const toggleGroupExpansion = (groupId: string) => {
		setExpandedGroups((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(groupId)) {
				newSet.delete(groupId);
			} else {
				newSet.add(groupId);
			}
			return newSet;
		});
	};

	// Wizard: toggle all actions for a resource
	const handleWizardSetAll = (resourceId: string, checked: boolean) => {
		const resource = resources.find((r) => r.id === resourceId);
		if (!resource) return;
		setWizardPermissions((prev) => {
			const next = { ...prev };
			for (const action of resource.actions) {
				next[`${resourceId}:${action.id}`] = checked;
			}
			return next;
		});
	};

	// Wizard navigation
	const nextWizardStep = () => {
		setWizardStep((prev) => Math.min(prev + 1, 3));
	};

	const prevWizardStep = () => {
		setWizardStep((prev) => Math.max(prev - 1, 1));
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold font-heading">Role Management</h1>
					<p className="text-brand-secondary-1">
						Create and manage user roles and permissions
					</p>
				</div>

				<div className="flex items-center gap-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={() => setShowGuide(!showGuide)}
								>
									<HelpCircle className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Toggle help guide</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<Dialog
						open={isCreating || !!editingRole}
						onOpenChange={(open) => {
							if (!open) {
								setIsCreating(false);
								setEditingRole(null);
							}
						}}
					>
						<DialogTrigger asChild>
							<Button onClick={handleCreateRole}>
								<Plus className="size-4 mr-2" />
								Create Role
							</Button>
						</DialogTrigger>
						<DialogContent
							className={cn(
								"sm:max-w-2xl flex flex-col",
								isMobile && "h-[85vh]",
							)}
						>
							<DialogHeader className="flex-shrink-0">
								<DialogTitle>
									{editingRole ? "Edit Role" : "Create New Role"}
								</DialogTitle>
								{!editingRole && (
									<DialogDescription>
										Create a new role to define what users can access and do in
										your system
									</DialogDescription>
								)}
							</DialogHeader>
							<div className="flex-1 overflow-y-auto min-h-0 mt-6">
								<RoleEditor
									role={editingRole || undefined}
									resources={resources}
									initialPermissions={
										isCreating
											? Object.entries(wizardPermissions)
													.filter(([, enabled]) => enabled)
													.map(([key]) => {
														const [resourceId, actionId] = key.split(":");
														return {
															resourceId,
															actionId,
															scope: "own" as const,
														};
													})
											: undefined
									}
									onSave={handleSaveRole}
									onCancel={() => {
										setIsCreating(false);
										setEditingRole(null);
									}}
									className="pb-safe"
								/>
							</div>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			{/* Loading State */}
			{loading && (
				<Card>
					<CardContent className="py-12">
						<div className="text-center">
							<div className="animate-spin rounded-full size-12 border-b-2 border-primary mx-auto mb-4" />
							<h3 className="text-lg font-medium mb-2">Loading roles...</h3>
							<p className="text-muted-foreground">
								Please wait while we fetch your role configuration.
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Error State */}
			{error && !loading && (
				<Card className="border-destructive">
					<CardContent className="py-12">
						<div className="text-center">
							<X className="size-12 mx-auto text-destructive mb-4" />
							<h3 className="text-lg font-medium mb-2">Failed to load roles</h3>
							<p className="text-muted-foreground mb-4">
								{error || "An error occurred while loading role data."}
							</p>
							<Button
								variant="outline"
								onClick={() => window.location.reload()}
							>
								Try Again
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Main Content - Only show if not loading and no error */}
			{!loading && !error && (
				<>
					{/* Beginner Guide */}
					{showGuide && (
						<Card className="border-blue-200 bg-blue-50/50">
							<CardHeader className="pb-2">
								<CardTitle className="text-lg">Quick Start Guide</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-4">
									<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
										<div className="bg-white p-4 rounded-lg border shadow-sm">
											<div className="flex items-center gap-3 mb-2">
												<div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
													<span className="font-bold">1</span>
												</div>
												<h3 className="font-medium">Start with a Template</h3>
											</div>
											<p className="text-sm text-muted-foreground mb-3">
												Choose a pre-configured role template to get started
												quickly
											</p>
											<div className="grid grid-cols-2 gap-2">
												{ROLE_TEMPLATES.slice(0, 2).map((template) => (
													<Button
														key={template.id}
														variant="outline"
														size="sm"
														className="justify-start"
														onClick={() =>
															handleCreateFromTemplate(template.id)
														}
													>
														<template.icon className="size-3 mr-2" />
														{template.name}
													</Button>
												))}
											</div>
										</div>

										<div className="bg-white p-4 rounded-lg border shadow-sm">
											<div className="flex items-center gap-3 mb-2">
												<div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
													<span className="font-bold">2</span>
												</div>
												<h3 className="font-medium">Customize Permissions</h3>
											</div>
											<p className="text-sm text-muted-foreground mb-3">
												Easily toggle permissions by resource or individual
												actions
											</p>
											<div className="flex items-center gap-2">
												<Badge variant="outline" className="gap-1 items-center">
													<Check className="size-3" /> Enabled
												</Badge>
												<Badge variant="outline" className="gap-1 items-center">
													<X className="size-3" /> Disabled
												</Badge>
											</div>
										</div>

										<div className="bg-white p-4 rounded-lg border shadow-sm">
											<div className="flex items-center gap-3 mb-2">
												<div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
													<span className="font-bold">3</span>
												</div>
												<h3 className="font-medium">Assign to Users</h3>
											</div>
											<p className="text-sm text-muted-foreground mb-3">
												Once created, assign roles to users in the User
												Assignment section
											</p>
											<Button asChild variant="outline" size="sm">
												<a href="/dashboard/access-control/user-assignment">
													<Users className="size-3 mr-2" />
													User Assignment
												</a>
											</Button>
										</div>
									</div>

									<div className="flex justify-end">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setShowGuide(false)}
										>
											<X className="size-3 mr-2" />
											Hide Guide
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* View Mode Selector */}
					<Card>
						<CardContent className="py-4">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
								<div className="relative flex-1 max-w-md">
									<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground size-4" />
									<Input
										placeholder="Search roles..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="pl-10"
									/>
								</div>

								<div className="flex items-center gap-2">
									<Tabs
										defaultValue="cards"
										onValueChange={(value) => setViewMode(value as "cards" | "enhanced" | "wizard")}
									>
										<TabsList>
											<TabsTrigger value="cards">Cards</TabsTrigger>
											<TabsTrigger value="enhanced">Matrix</TabsTrigger>
											<TabsTrigger value="wizard">Wizard</TabsTrigger>
										</TabsList>
									</Tabs>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Content based on view mode */}
					{viewMode === "cards" && (
						<div
							className={cn(
								"grid gap-4",
								isMobile
									? "grid-cols-1"
									: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
							)}
						>
							{filteredRoles.map((role) => (
								<RoleCard
									key={role.id}
									role={role}
									resources={resources}
									userCount={userCounts[role.id]}
									isSelected={selectedRoles.has(role.id)}
									onSelect={(selected) => handleRoleSelect(role.id, selected)}
									onEdit={() => handleEditRole(role)}
									onDelete={() => handleDeleteRole(role.id)}
									onDuplicate={() => handleDuplicateRole(role)}
									showDetails={true}
								/>
							))}
						</div>
					)}

					{viewMode === "enhanced" && (
						<div className="relative">
							{pendingUpdates.size > 0 && (
								<div className="absolute top-0 right-0 z-50 m-4">
									<div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
										<div className="size-3 rounded-full bg-blue-600 animate-pulse" />
										{pendingUpdates.size} update
										{pendingUpdates.size > 1 ? "s" : ""} in progress
									</div>
								</div>
							)}
							<EnhancedPermissionMatrix
								roles={filteredRoles}
								resources={resources}
								onPermissionChange={handlePermissionChange}
								selectedRoles={Array.from(selectedRoles)}
								maxVisibleRoles={6}
								hideControls={true}
							/>
						</div>
					)}

					{viewMode === "wizard" && (
						<Card>
							<CardHeader>
								<CardTitle>Role Creation Wizard</CardTitle>
								<CardDescription>
									Follow these steps to create and configure roles
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-6">
									{/* Step indicator */}
									<div className="flex items-center justify-between max-w-md mx-auto">
										{[1, 2, 3].map((step) => (
											<div key={step} className="flex flex-col items-center">
												<div
													className={cn(
														"size-10 rounded-full flex items-center justify-center",
														wizardStep === step
															? "bg-primary text-primary-foreground"
															: wizardStep > step
																? "bg-primary/20"
																: "bg-muted",
													)}
												>
													{wizardStep > step ? (
														<Check className="size-5" />
													) : (
														step
													)}
												</div>
												<span className="text-xs mt-1">
													{step === 1
														? "Select Template"
														: step === 2
															? "Configure"
															: "Review"}
												</span>
											</div>
										))}
									</div>

									{/* Step content */}
									<div className="py-4">
										{wizardStep === 1 && (
											<div className="space-y-4">
												<h3 className="text-lg font-medium">
													Choose a Role Template
												</h3>
												<p className="text-muted-foreground">
													Start with a pre-configured template or create a
													custom role
												</p>

												<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
													{ROLE_TEMPLATES.map((template) => (
														<Card
															key={template.id}
															className={cn(
																"cursor-pointer hover:border-primary transition-colors",
																selectedTemplate === template.id &&
																	"border-primary bg-primary/5",
															)}
															onClick={() => setSelectedTemplate(template.id)}
														>
															<CardContent className="p-4">
																<div className="flex items-center gap-3">
																	<div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center">
																		<template.icon className="size-5 text-primary" />
																	</div>
																	<div>
																		<h4 className="font-medium">
																			{template.name}
																		</h4>
																		<p className="text-sm text-muted-foreground">
																			{template.description}
																		</p>
																	</div>
																	{selectedTemplate === template.id && (
																		<Check className="size-5 text-primary ml-auto" />
																	)}
																</div>
															</CardContent>
														</Card>
													))}

													<Card
														className={cn(
															"cursor-pointer hover:border-primary transition-colors border-dashed",
															selectedTemplate === "custom" &&
																"border-primary bg-primary/5",
														)}
														onClick={() => setSelectedTemplate("custom")}
													>
														<CardContent className="p-4">
															<div className="flex items-center gap-3">
																<div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center">
																	<Plus className="size-5 text-primary" />
																</div>
																<div>
																	<h4 className="font-medium">Custom Role</h4>
																	<p className="text-sm text-muted-foreground">
																		Create a role from scratch
																	</p>
																</div>
																{selectedTemplate === "custom" && (
																	<Check className="size-5 text-primary ml-auto" />
																)}
															</div>
														</CardContent>
													</Card>
												</div>
											</div>
										)}

										{wizardStep === 2 && (
											<div className="space-y-4">
												<h3 className="text-lg font-medium">
													Configure Permissions
												</h3>
												<p className="text-muted-foreground">
													Select which resources this role can access
												</p>

												<div className="space-y-4 mt-4">
													{resources.map((resource) => {
														const isExpanded = expandedGroups.has(resource.id);
														const Icon = resource.icon || Shield;

														return (
															<Collapsible
																key={resource.id}
																open={isExpanded}
																onOpenChange={() =>
																	toggleGroupExpansion(resource.id)
																}
															>
																<Card>
																	<CollapsibleTrigger className="w-full text-left">
																		<CardHeader className="p-4">
																			<div className="flex items-center justify-between">
																				<div className="flex items-center gap-3">
																					<div className="size-10 bg-primary/10 rounded-lg flex items-center justify-center">
																						<Icon className="size-5 text-primary" />
																					</div>
																					<div>
																						<h4 className="font-medium">
																							{resource.name}
																						</h4>
																						<p className="text-sm text-muted-foreground">
																							{resource.description}
																						</p>
																					</div>
																				</div>
																				<div className="flex items-center gap-2">
																					<Button
																						variant="outline"
																						size="sm"
																						className="gap-1"
																						onClick={(e) => {
																							e.stopPropagation();
																							handleWizardSetAll(
																								resource.id,
																								true,
																							);
																						}}
																					>
																						<Check className="size-3" /> All
																					</Button>
																					<Button
																						variant="outline"
																						size="sm"
																						className="gap-1"
																						onClick={(e) => {
																							e.stopPropagation();
																							handleWizardSetAll(
																								resource.id,
																								false,
																							);
																						}}
																					>
																						<X className="size-3" /> None
																					</Button>
																					{isExpanded ? (
																						<ChevronDown className="size-5" />
																					) : (
																						<ChevronRight className="size-5" />
																					)}
																				</div>
																			</div>
																		</CardHeader>
																	</CollapsibleTrigger>
																	<CollapsibleContent>
																		<CardContent className="p-4 pt-0">
																			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
																				{resource.actions.map((action) => (
																					<Card key={action.id} className="p-3">
																						<div className="flex items-center justify-between">
																							<div>
																								<h5 className="font-medium">
																									{action.name}
																								</h5>
																								<p className="text-xs text-muted-foreground">
																									{action.description}
																								</p>
																							</div>
																							<div className="flex items-center gap-2">
																								<Select defaultValue="own">
																									<SelectTrigger className="w-28">
																										<SelectValue placeholder="Scope" />
																									</SelectTrigger>
																									<SelectContent>
																										<SelectItem value="own">
																											Own
																										</SelectItem>
																										<SelectItem value="team">
																											Team
																										</SelectItem>
																										<SelectItem value="organization">
																											Organization
																										</SelectItem>
																									</SelectContent>
																								</Select>
																								<Checkbox
																									checked={
																										!!wizardPermissions[
																											`${resource.id}:${action.id}`
																										]
																									}
																									onCheckedChange={(checked) =>
																										setWizardPermissions(
																											(prev) => ({
																												...prev,
																												[`${resource.id}:${action.id}`]:
																													!!checked,
																											}),
																										)
																									}
																								/>
																							</div>
																						</div>
																					</Card>
																				))}
																			</div>
																		</CardContent>
																	</CollapsibleContent>
																</Card>
															</Collapsible>
														);
													})}
												</div>
											</div>
										)}

										{wizardStep === 3 && (
											<div className="space-y-4">
												<h3 className="text-lg font-medium">
													Review and Save
												</h3>
												<p className="text-muted-foreground">
													Review your role configuration before saving
												</p>

												<Card>
													<CardContent className="p-4">
														<div className="space-y-4">
															<div>
																<h4 className="text-sm font-medium">
																	Role Name
																</h4>
																<p>New Custom Role</p>
															</div>

															<div>
																<h4 className="text-sm font-medium">
																	Description
																</h4>
																<p className="text-sm text-muted-foreground">
																	Custom role with selected permissions
																</p>
															</div>

															<div>
																<h4 className="text-sm font-medium">
																	Permissions
																</h4>
																<div className="mt-2 space-y-2">
																	{resources.map((resource) => (
																		<div
																			key={resource.id}
																			className="flex items-center gap-2"
																		>
																			<Badge variant="outline">
																				{resource.name}
																			</Badge>
																			<span className="text-xs text-muted-foreground">
																				{resource.actions.length} actions
																			</span>
																		</div>
																	))}
																</div>
															</div>
														</div>
													</CardContent>
												</Card>
											</div>
										)}
									</div>

									{/* Navigation buttons */}
									<div className="flex items-center justify-between pt-4">
										<Button
											variant="outline"
											onClick={prevWizardStep}
											disabled={wizardStep === 1}
										>
											Previous
										</Button>

										{wizardStep < 3 ? (
											<Button
												onClick={nextWizardStep}
												disabled={wizardStep === 1 && !selectedTemplate}
											>
												Next
											</Button>
										) : (
											<Button
												onClick={() => {
													// Wizard creates role via the RoleEditor sheet flow
													handleCreateRole();
													setWizardStep(1);
													setSelectedTemplate("");
													setWizardPermissions({});
												}}
											>
												Save Role
											</Button>
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{filteredRoles.length === 0 && (
						<Card>
							<CardContent className="py-12">
								<div className="text-center">
									<Shield className="size-12 mx-auto text-brand-secondary-2 mb-4" />
									<h3 className="text-lg font-medium mb-2 text-brand-primary-1">
										No roles found
									</h3>
									<p className="text-brand-secondary-1 mb-4">
										{searchQuery
											? "No roles match your search criteria."
											: "Get started by creating your first role."}
									</p>
									{!searchQuery && (
										<Button onClick={handleCreateRole}>
											<Plus className="size-4 mr-2" />
											Create Role
										</Button>
									)}
								</div>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	);
}
