import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { useRoles, useRoleMatrix } from "@/hooks/useRoles";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/access-control/roles"
)({
  beforeLoad: async () => {
    await requirePermission(
      { resource: "role_management", action: "read" },
      "/dashboard"
    );
  },
  component: RoleManagementPage,
});

// Mock data for UI development
const MOCK_RESOURCES: PermissionResource[] = [
  {
    id: "users",
    name: "Users",
    description: "User management and access control",
    icon: Users,
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
    icon: Shield,
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
    icon: Settings,
    actions: [
      { id: "create", name: "Create", description: "Create new branches" },
      { id: "read", name: "View", description: "View branch data" },
      { id: "update", name: "Edit", description: "Edit branch information" },
    ],
  },
];

const MOCK_ROLES: Role[] = [
  {
    id: "1",
    name: "System Admin",
    description: "Full system access with all permissions",
    priority: 1,
    permissions: [
      { resourceId: "users", actionId: "create", scope: "organization" },
      { resourceId: "users", actionId: "read", scope: "organization" },
      { resourceId: "users", actionId: "update", scope: "organization" },
      { resourceId: "users", actionId: "delete", scope: "organization" },
      { resourceId: "roles", actionId: "create", scope: "organization" },
      { resourceId: "roles", actionId: "read", scope: "organization" },
      { resourceId: "roles", actionId: "update", scope: "organization" },
      { resourceId: "roles", actionId: "delete", scope: "organization" },
    ],
  },
  {
    id: "2",
    name: "Organization Owner",
    description: "Organization-wide administrative access",
    priority: 1,
    permissions: [
      { resourceId: "users", actionId: "create", scope: "organization" },
      { resourceId: "users", actionId: "read", scope: "organization" },
      { resourceId: "users", actionId: "update", scope: "organization" },
      { resourceId: "roles", actionId: "read", scope: "organization" },
      { resourceId: "branches", actionId: "create", scope: "organization" },
      { resourceId: "branches", actionId: "read", scope: "organization" },
      { resourceId: "branches", actionId: "update", scope: "organization" },
    ],
  },
  {
    id: "3",
    name: "Department Manager",
    description: "Department-level management access",
    priority: 2,
    permissions: [
      { resourceId: "users", actionId: "read", scope: "team" },
      { resourceId: "users", actionId: "update", scope: "team" },
      { resourceId: "branches", actionId: "read", scope: "team" },
      { resourceId: "branches", actionId: "update", scope: "team" },
    ],
  },
  {
    id: "4",
    name: "Team Lead",
    description: "Team leadership with limited admin access",
    priority: 2,
    permissions: [
      { resourceId: "users", actionId: "read", scope: "team" },
      { resourceId: "users", actionId: "update", scope: "team" },
      { resourceId: "branches", actionId: "read", scope: "team" },
    ],
  },
  {
    id: "5",
    name: "Senior Employee",
    description: "Experienced employee with extended access",
    priority: 3,
    permissions: [
      { resourceId: "users", actionId: "read", scope: "own" },
      { resourceId: "users", actionId: "update", scope: "own" },
      { resourceId: "branches", actionId: "read", scope: "own" },
      { resourceId: "branches", actionId: "update", scope: "own" },
    ],
  },
  {
    id: "6",
    name: "Employee",
    description: "Standard employee access for daily operations",
    priority: 3,
    permissions: [
      { resourceId: "users", actionId: "read", scope: "own" },
      { resourceId: "users", actionId: "update", scope: "own" },
      { resourceId: "branches", actionId: "read", scope: "own" },
    ],
  },
  {
    id: "7",
    name: "Intern",
    description: "Limited access for trainees and interns",
    priority: 4,
    permissions: [
      { resourceId: "users", actionId: "read", scope: "own" },
      { resourceId: "branches", actionId: "read", scope: "own" },
    ],
  },
  {
    id: "8",
    name: "Viewer",
    description: "Read-only access for observers and auditors",
    priority: 4,
    permissions: [
      { resourceId: "users", actionId: "read", scope: "own" },
      { resourceId: "branches", actionId: "read", scope: "own" },
    ],
  },
];

// Mock user counts for roles
const MOCK_USER_COUNTS: Record<string, number> = {
  "1": 2,
  "2": 3,
  "3": 8,
  "4": 12,
  "5": 15,
  "6": 45,
  "7": 8,
  "8": 6,
};

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

function RoleManagementPage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { matrix, setMatrix, loading, error, fetchMatrix } = useRoleMatrix();
  const { addPermissionToRole, removePermissionFromRole, updatePermissionActionScope } = useRoles();
  
  const [roles, setRoles] = useState<Role[]>(MOCK_ROLES);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "enhanced" | "wizard">(
    "cards"
  );
  const [showGuide, setShowGuide] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["users"])
  );
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());

  // Get current organization ID from user context
  const organizationId = user?.current_organization_id;

  // Load data on mount
  useEffect(() => {
    if (organizationId) {
      fetchMatrix(organizationId);
    }
  }, [organizationId, fetchMatrix]);

  // Transform backend data to frontend format
  const transformBackendData = () => {
    if (!matrix) return { roles: MOCK_ROLES, resources: MOCK_RESOURCES };

    // Map resources with icons
    const resourceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
      user_management: Users,
      role_management: Shield,
      hierarchy_management: Database,
      organization: Settings,
      subscription_management: FileText,
    };

    const resources: PermissionResource[] = matrix.resources.map(res => ({
      id: res.id,
      name: res.name,
      icon: resourceIcons[res.name] || Settings,
      actions: []
    }));

    // Transform roles and permissions - handle action-specific scopes
    const transformedRoles: Role[] = matrix.roles.map(role => ({
      id: role.id,
      name: role.name,
      description: role.description,
      priority: role.priority,
      permissions: role.permissions.flatMap(rp => {
        if (!rp.permission?.actions) return [];
        
        return rp.permission.actions.map(action => ({
          resourceId: rp.permission?.resource_id || '',
          actionId: action,
          scope: (rp.scope) as any
        }));
      })
    }));

    // Build actions from permissions
    matrix.roles.forEach(role => {
      role.permissions.forEach(rp => {
        if (rp.permission) {
          const resource = resources.find(r => r.id === rp.permission?.resource_id);
          if (resource) {
            rp.permission.actions.forEach(action => {
              if (!resource.actions.find(a => a.id === action)) {
                resource.actions.push({
                  id: action,
                  name: action.charAt(0).toUpperCase() + action.slice(1),
                  description: `${action} ${resource.name}`
                });
              }
            });
          }
        }
      });
    });

    return { roles: transformedRoles, resources };
  };

  const { roles: backendRoles, resources } = transformBackendData();
  const displayRoles = matrix ? backendRoles : roles;

  // Get user counts from matrix or mock data
  const userCounts = matrix 
    ? Object.fromEntries(
        displayRoles.map(role => [role.id, matrix.users_by_role[role.id]?.length || 0])
      )
    : MOCK_USER_COUNTS;

  // Filter roles based on search query
  const filteredRoles = displayRoles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.description?.toLowerCase().includes(searchQuery.toLowerCase())
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

  const handleDeleteRole = (roleId: string) => {
    setRoles((prev) => prev.filter((role) => role.id !== roleId));
    setSelectedRoles((prev) => {
      const newSet = new Set(prev);
      newSet.delete(roleId);
      return newSet;
    });
  };

  const handleDuplicateRole = (role: Role) => {
    const newRole: Role = {
      ...role,
      id: Math.random().toString(36).substr(2, 9),
      name: `${role.name} Copy`,
    };
    setRoles((prev) => [...prev, newRole]);
  };

  const handleSaveRole = (roleData: any, permissions: Role["permissions"]) => {
    if (editingRole) {
      setRoles((prev) =>
        prev.map((role) =>
          role.id === editingRole.id
            ? { ...role, ...roleData, permissions }
            : role
        )
      );
    } else {
      const newRole: Role = {
        id: Math.random().toString(36).substr(2, 9),
        ...roleData,
        permissions,
      };
      setRoles((prev) => [...prev, newRole]);
    }
    setEditingRole(null);
    setIsCreating(false);
  };

  const handlePermissionChange = async (
    roleId: string,
    resourceId: string,
    actionId: string,
    enabled: boolean,
    scope?: "own" | "team" | "organization" | "country" | "region" | "area" | "branch" | null
  ) => {
    if (!organizationId || !matrix) return;

    const updateKey = `${roleId}-${resourceId}-${actionId}`;
    const previousMatrix = { ...matrix };
    const normalizedScope = scope ?? "own";

    try {
      setPendingUpdates(prev => new Set([...prev, updateKey]));
      
      // Find permission ID
      let permissionId: string | null = null;
      for (const role of matrix.roles) {
        for (const rp of role.permissions) {
          if (rp.permission?.resource_id === resourceId && 
              rp.permission?.actions.includes(actionId)) {
            permissionId = rp.permission.id;
            break;
          }
        }
        if (permissionId) break;
      }

      if (!permissionId) {
        toast.error(`Could not find permission for ${actionId} on ${resourceId}`);
        return;
      }

      const currentRole = matrix.roles.find(r => r.id === roleId);
      const existingPermission = currentRole?.permissions.find(
        rp => rp.permission?.resource_id === resourceId && 
              rp.permission?.actions.includes(actionId)
      );

      const roleName = currentRole?.name || 'Role';
      const actionName = actionId.charAt(0).toUpperCase() + actionId.slice(1);

      // Optimistic update
      if (!enabled || scope === null) {
        if (existingPermission) {
          const updatedMatrix = {
            ...matrix,
            roles: matrix.roles.map(role => {
              if (role.id === roleId) {
                return {
                  ...role,
                  permissions: role.permissions.filter(rp => rp.id !== existingPermission.id)
                };
              }
              return role;
            })
          };
          setMatrix(updatedMatrix);
        }
      } else {
        const updatedMatrix = {
          ...matrix,
          roles: matrix.roles.map(role => {
            if (role.id === roleId) {
              if (existingPermission) {
                return {
                  ...role,
                  permissions: role.permissions.map(rp => {
                    if (rp.id === existingPermission.id) {
                      return { ...rp, scope: normalizedScope };
                    }
                    return rp;
                  })
                };
              }
            }
            return role;
          })
        };
        setMatrix(updatedMatrix);
      }

      // API calls (stubbed for now)
      if (!enabled || scope === null) {
        if (existingPermission) {
          await removePermissionFromRole(roleId, permissionId);
          toast.success(`Removed ${actionName} permission from ${roleName}`);
        }
      } else if (existingPermission) {
        await updatePermissionActionScope(
          roleId,
          permissionId,
          actionId,
          normalizedScope,
        );
        toast.success(
          `Updated ${actionName} permission scope to ${normalizedScope} for ${roleName}`,
        );
      } else {
        await addPermissionToRole(roleId, permissionId, normalizedScope);
        toast.success(
          `Added ${actionName} permission with ${normalizedScope} scope to ${roleName}`,
        );
      }

      await fetchMatrix(organizationId);
      
    } catch (err) {
      console.error('Failed to update permission:', err);
      setMatrix(previousMatrix);
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to update permission';
      toast.error(`${errorMessage}. Changes have been reverted.`);
    } finally {
      setPendingUpdates(prev => {
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
          <h1 className="text-2xl font-bold">Role Management</h1>
          <p className="text-muted-foreground">
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
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle help guide</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Sheet
            open={isCreating || !!editingRole}
            onOpenChange={(open) => {
              if (!open) {
                setIsCreating(false);
                setEditingRole(null);
              }
            }}
          >
            <SheetTrigger asChild>
              <Button onClick={handleCreateRole}>
                <Plus className="w-4 h-4 mr-2" />
                Create Role
              </Button>
            </SheetTrigger>
            <SheetContent
              side={isMobile ? "bottom" : "right"}
              className={cn(
                "sm:max-w-2xl flex flex-col",
                isMobile && "h-[85vh]"
              )}
            >
              <SheetHeader className="flex-shrink-0">
                <SheetTitle>
                  {editingRole ? "Edit Role" : "Create New Role"}
                </SheetTitle>
                {!editingRole && (
                  <SheetDescription>
                    Create a new role to define what users can access and do in
                    your system
                  </SheetDescription>
                )}
              </SheetHeader>
              <div className="flex-1 overflow-y-auto min-h-0 mt-6">
                <RoleEditor
                  role={editingRole || undefined}
                  resources={resources}
                  onSave={handleSaveRole}
                  onCancel={() => {
                    setIsCreating(false);
                    setEditingRole(null);
                  }}
                  className="pb-safe"
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
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
              <X className="w-12 h-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Failed to load roles</h3>
              <p className="text-muted-foreground mb-4">
                {error || "An error occurred while loading role data."}
              </p>
              <Button
                variant="outline"
                onClick={() => organizationId && fetchMatrix(organizationId)}
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
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold">1</span>
                    </div>
                    <h3 className="font-medium">Start with a Template</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Choose a pre-configured role template to get started quickly
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_TEMPLATES.slice(0, 2).map((template) => (
                      <Button
                        key={template.id}
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={() => handleCreateFromTemplate(template.id)}
                      >
                        <template.icon className="w-3 h-3 mr-2" />
                        {template.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold">2</span>
                    </div>
                    <h3 className="font-medium">Customize Permissions</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Easily toggle permissions by resource or individual actions
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 items-center">
                      <Check className="w-3 h-3" /> Enabled
                    </Badge>
                    <Badge variant="outline" className="gap-1 items-center">
                      <X className="w-3 h-3" /> Disabled
                    </Badge>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="font-bold">3</span>
                    </div>
                    <h3 className="font-medium">Assign to Users</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Once created, assign roles to users in the User Assignment
                    section
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <a href="/dashboard/access-control/user-assignment">
                      <Users className="w-3 h-3 mr-2" />
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
                  <X className="w-3 h-3 mr-2" />
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
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
                onValueChange={(value: any) => setViewMode(value as any)}
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
              : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
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
                <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
                {pendingUpdates.size} update{pendingUpdates.size > 1 ? 's' : ''} in progress
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
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        wizardStep === step
                          ? "bg-primary text-primary-foreground"
                          : wizardStep > step
                          ? "bg-primary/20"
                          : "bg-muted"
                      )}
                    >
                      {wizardStep > step ? <Check className="w-5 h-5" /> : step}
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
                      Start with a pre-configured template or create a custom
                      role
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {ROLE_TEMPLATES.map((template) => (
                        <Card
                          key={template.id}
                          className={cn(
                            "cursor-pointer hover:border-primary transition-colors",
                            selectedTemplate === template.id &&
                              "border-primary bg-primary/5"
                          )}
                          onClick={() => setSelectedTemplate(template.id)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                <template.icon className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h4 className="font-medium">{template.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {template.description}
                                </p>
                              </div>
                              {selectedTemplate === template.id && (
                                <Check className="w-5 h-5 text-primary ml-auto" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}

                      <Card
                        className={cn(
                          "cursor-pointer hover:border-primary transition-colors border-dashed",
                          selectedTemplate === "custom" &&
                            "border-primary bg-primary/5"
                        )}
                        onClick={() => setSelectedTemplate("custom")}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <Plus className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium">Custom Role</h4>
                              <p className="text-sm text-muted-foreground">
                                Create a role from scratch
                              </p>
                            </div>
                            {selectedTemplate === "custom" && (
                              <Check className="w-5 h-5 text-primary ml-auto" />
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
                                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                        <Icon className="w-5 h-5 text-primary" />
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
                                      >
                                        <Check className="w-3 h-3" /> All
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1"
                                      >
                                        <X className="w-3 h-3" /> None
                                      </Button>
                                      {isExpanded ? (
                                        <ChevronDown className="w-5 h-5" />
                                      ) : (
                                        <ChevronRight className="w-5 h-5" />
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
                                            <Checkbox />
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
                    <h3 className="text-lg font-medium">Review and Save</h3>
                    <p className="text-muted-foreground">
                      Review your role configuration before saving
                    </p>

                    <Card>
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium">Role Name</h4>
                            <p>New Custom Role</p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium">Description</h4>
                            <p className="text-sm text-muted-foreground">
                              Custom role with selected permissions
                            </p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium">Permissions</h4>
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
                      const newRole: Role = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: "New Custom Role",
                        description: "Custom role with selected permissions",
                        priority: 3,
                        permissions: [],
                      };
                      setRoles((prev) => [...prev, newRole]);
                      setWizardStep(1);
                      setSelectedTemplate("");
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
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No roles found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No roles match your search criteria."
                  : "Get started by creating your first role."}
              </p>
              {!searchQuery && (
                <Button onClick={handleCreateRole}>
                  <Plus className="w-4 h-4 mr-2" />
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
