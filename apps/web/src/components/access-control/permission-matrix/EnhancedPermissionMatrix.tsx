import React, { useState, useMemo } from "react";
import {
  Check,
  X,
  Minus,
  ChevronDown,
  ChevronRight,
  Search,
  Grid,
  List,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Role, PermissionResource } from "./PermissionMatrix";

interface EnhancedPermissionMatrixProps {
  roles: Role[];
  resources: PermissionResource[];
  onPermissionChange?: (
    roleId: string,
    resourceId: string,
    actionId: string,
    enabled: boolean,
    scope?:
      | "own"
      | "team"
      | "organization"
      | "country"
      | "region"
      | "area"
      | "branch"
      | null
  ) => void;
  onRoleSelect?: (roleId: string) => void;
  selectedRoles?: string[];
  maxVisibleRoles?: number;
  hideControls?: boolean; // Allow hiding duplicate controls
}

type ViewMode = "matrix" | "roles" | "compact";
type RoleGroup = "all" | "admin" | "manager" | "user";

interface RoleGroupConfig {
  label: string;
  color: string;
  priorities: number[];
}

const ROLE_GROUPS: Record<RoleGroup, RoleGroupConfig> = {
  all: { label: "All Roles", color: "bg-gray-100", priorities: [] },
  admin: { label: "Admin", color: "bg-red-100 text-red-800", priorities: [1] },
  manager: {
    label: "Manager",
    color: "bg-orange-100 text-orange-800",
    priorities: [2],
  },
  user: {
    label: "Basic User",
    color: "bg-blue-100 text-blue-800",
    priorities: [3, 4, 5],
  },
};

// Utility function to format resource names from snake_case to Title Case
const formatResourceName = (name: string): string => {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// Utility function to format action names to Title Case
const formatActionName = (name: string): string => {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
};

export function EnhancedPermissionMatrix({
  roles,
  resources,
  onPermissionChange,
  onRoleSelect,
  selectedRoles = [],
  maxVisibleRoles = 6,
  hideControls = false,
}: EnhancedPermissionMatrixProps) {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>(
    isMobile ? "roles" : "matrix"
  );
  const [roleFilter, setRoleFilter] = useState<RoleGroup>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedResources, setExpandedResources] = useState<Set<string>>(
    new Set(["users"])
  );
  const [visibleRoleStart, setVisibleRoleStart] = useState(0);
  const [selectedBatchRoles, setSelectedBatchRoles] = useState<Set<string>>(
    new Set()
  );

  // Filter and search roles (only apply local filters if controls are shown)
  const filteredRoles = useMemo(() => {
    let filtered = roles;

    // Apply role group filter only if controls are not hidden
    if (!hideControls && roleFilter !== "all") {
      const groupConfig = ROLE_GROUPS[roleFilter];
      filtered = filtered.filter((role) =>
        groupConfig.priorities.includes(role.priority)
      );
    }

    // Apply search filter only if controls are not hidden
    if (!hideControls && searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (role) =>
          role.name.toLowerCase().includes(query) ||
          role.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [roles, roleFilter, searchQuery, hideControls]);

  // Get visible roles for matrix view
  const visibleRoles = useMemo(() => {
    if (viewMode === "matrix" && filteredRoles.length > maxVisibleRoles) {
      return filteredRoles.slice(
        visibleRoleStart,
        visibleRoleStart + maxVisibleRoles
      );
    }
    return filteredRoles;
  }, [filteredRoles, viewMode, visibleRoleStart, maxVisibleRoles]);

  const toggleResourceExpansion = (resourceId: string) => {
    const newExpanded = new Set(expandedResources);
    if (newExpanded.has(resourceId)) {
      newExpanded.delete(resourceId);
    } else {
      newExpanded.add(resourceId);
    }
    setExpandedResources(newExpanded);
  };

  const hasPermission = (
    roleId: string,
    resourceId: string,
    actionId: string
  ) => {
    const role = roles.find((r) => r.id === roleId);
    return (
      role?.permissions.some(
        (p) => p.resourceId === resourceId && p.actionId === actionId
      ) || false
    );
  };

  const getPermissionScope = (
    roleId: string,
    resourceId: string,
    actionId: string
  ) => {
    const role = roles.find((r) => r.id === roleId);
    const permission = role?.permissions.find(
      (p) => p.resourceId === resourceId && p.actionId === actionId
    );
    return permission?.scope;
  };

  const handlePermissionToggle = (
    roleId: string,
    resourceId: string,
    actionId: string
  ) => {
    const currentScope = getPermissionScope(roleId, resourceId, actionId);
    const hasAccess = hasPermission(roleId, resourceId, actionId);

    let newScope:
      | "own"
      | "team"
      | "organization"
      | "country"
      | "region"
      | "area"
      | "branch"
      | null = null;
    let enabled = false;

    // Cycle through: No Access → Own → Team → Organization → No Access
    if (!hasAccess) {
      // No access, grant 'own' scope
      newScope = "own";
      enabled = true;
    } else if (currentScope === "own") {
      // Has 'own' scope, upgrade to 'team' scope
      newScope = "team";
      enabled = true;
    } else if (currentScope === "team") {
      // Has 'team' scope, upgrade to 'organization' scope
      newScope = "organization";
      enabled = true;
    } else if (currentScope === "organization") {
      // Has 'organization' scope, remove access
      newScope = null;
      enabled = false;
    }

    onPermissionChange?.(roleId, resourceId, actionId, enabled, newScope);
  };

  const handleScopeChange = (
    roleId: string,
    resourceId: string,
    actionId: string,
    newScope: string
  ) => {
    // Convert the string value to the appropriate type
    const scope =
      newScope === "null"
        ? null
        : (newScope as
            | "own"
            | "team"
            | "organization"
            | "country"
            | "region"
            | "area"
            | "branch");
    const enabled = scope !== null;

    onPermissionChange?.(roleId, resourceId, actionId, enabled, scope);
  };

  const handleBatchRoleToggle = (roleId: string) => {
    setSelectedBatchRoles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
  };

  const handleBatchPermissionToggle = (
    resourceId: string,
    actionId: string,
    enabled: boolean
  ) => {
    selectedBatchRoles.forEach((roleId) => {
      onPermissionChange?.(
        roleId,
        resourceId,
        actionId,
        enabled,
        enabled ? "own" : null
      );
    });
  };

  const getScopeIcon = (
    scope?:
      | "own"
      | "team"
      | "organization"
      | "country"
      | "region"
      | "area"
      | "branch"
  ) => {
    switch (scope) {
      case "own":
        return <Minus className="w-3 h-3 text-yellow-700" />;
      case "team":
        return <Check className="w-3 h-3 text-orange-700" />;
      case "organization":
        return <Check className="w-3 h-3 text-green-700" />;
      case "country":
        return <Check className="w-3 h-3 text-green-700" />;
      case "region":
        return <Check className="w-3 h-3 text-green-700" />;
      case "area":
        return <Check className="w-3 h-3 text-green-700" />;
      case "branch":
        return <Check className="w-3 h-3 text-green-700" />;
      default:
        return <X className="w-3 h-3 text-gray-500" />;
    }
  };

  const getScopeButtonStyle = (
    scope?:
      | "own"
      | "team"
      | "organization"
      | "country"
      | "region"
      | "area"
      | "branch"
  ) => {
    switch (scope) {
      case "own":
        return "bg-yellow-100 hover:bg-yellow-200 border-yellow-300";
      case "team":
        return "bg-orange-100 hover:bg-orange-200 border-orange-300";
      case "organization":
        return "bg-green-100 hover:bg-green-200 border-green-300";
      case "country":
        return "bg-blue-100 hover:bg-blue-200 border-blue-300";
      case "region":
        return "bg-purple-100 hover:bg-purple-200 border-purple-300";
      case "area":
        return "bg-teal-100 hover:bg-teal-200 border-teal-300";
      case "branch":
        return "bg-indigo-100 hover:bg-indigo-200 border-indigo-300";
      default:
        return "bg-gray-100 hover:bg-gray-200 border-gray-300";
    }
  };

  const getRoleGroupBadge = (role: Role) => {
    const group = Object.entries(ROLE_GROUPS).find(
      ([key, config]) =>
        key !== "all" && config.priorities.includes(role.priority)
    );
    return group ? { key: group[0], config: group[1] } : null;
  };

  const canShowPrevious = visibleRoleStart > 0;
  const canShowNext = visibleRoleStart + maxVisibleRoles < filteredRoles.length;

  // Force Mobile-Optimized View on Small Screens
  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Controls - Only show if not hidden */}
        {!hideControls && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search roles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={roleFilter}
                  onValueChange={(value) => setRoleFilter(value as RoleGroup)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_GROUPS).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={viewMode === "roles" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("roles")}
                  className="flex-1"
                >
                  <Users className="w-4 h-4 mr-2" />
                  By Roles
                </Button>
                <Button
                  variant={viewMode === "matrix" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("matrix")}
                  className="flex-1"
                >
                  <Grid className="w-4 h-4 mr-2" />
                  Matrix
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile-Optimized Content */}
        <div className="space-y-3 max-w-full overflow-hidden">
          {viewMode === "compact"
            ? // Compact Mobile View - Simple list with permission counts
              filteredRoles.map((role) => {
                const groupBadge = getRoleGroupBadge(role);
                const rolePermissions = role.permissions.length;
                const totalPossible = resources.reduce(
                  (sum, r) => sum + r.actions.length,
                  0
                );
                const permissionPercentage = Math.round(
                  (rolePermissions / totalPossible) * 100
                );

                return (
                  <Card key={role.id} className="w-full">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Checkbox
                            checked={selectedBatchRoles.has(role.id)}
                            onCheckedChange={() =>
                              handleBatchRoleToggle(role.id)
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">
                                {role.name}
                              </span>
                              {groupBadge && (
                                <Badge
                                  className={cn(
                                    "text-xs",
                                    groupBadge.config.color
                                  )}
                                >
                                  {groupBadge.config.label}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {role.description}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-medium">
                            {rolePermissions}/{totalPossible}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {permissionPercentage}%
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            : // Detailed Mobile View - Role-first with collapsible details
              filteredRoles.map((role) => {
                const groupBadge = getRoleGroupBadge(role);
                const isExpanded = expandedResources.has(role.id);

                return (
                  <Card key={role.id} className="w-full">
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={() => toggleResourceExpansion(role.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 pb-3">
                          <CardTitle className="flex items-center justify-between text-base">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Users className="w-4 h-4 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">
                                    {role.name}
                                  </span>
                                  {groupBadge && (
                                    <Badge
                                      className={cn(
                                        "text-xs",
                                        groupBadge.config.color
                                      )}
                                    >
                                      {groupBadge.config.label}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground text-left">
                                  {role.description}
                                </div>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </div>
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="space-y-4">
                            {resources.map((resource) => {
                              const Icon = resource.icon;
                              const resourcePermissions =
                                role.permissions.filter(
                                  (p) => p.resourceId === resource.id
                                );

                              return (
                                <div key={resource.id} className="space-y-2">
                                  <div className="flex items-center gap-2 text-sm font-medium">
                                    {Icon && (
                                      <Icon className="w-4 h-4 text-primary" />
                                    )}
                                    <span>
                                      {formatResourceName(resource.name)}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {resourcePermissions.length}/
                                      {resource.actions.length}
                                    </Badge>
                                  </div>

                                  <div className="space-y-2 pl-6">
                                    {resource.actions.map((action) => {
                                      const hasAccess = hasPermission(
                                        role.id,
                                        resource.id,
                                        action.id
                                      );
                                      const scope = getPermissionScope(
                                        role.id,
                                        resource.id,
                                        action.id
                                      );

                                      return (
                                        <div
                                          key={action.id}
                                          className="flex items-center justify-between p-2 bg-muted/30 rounded border min-w-0"
                                        >
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className={cn(
                                                "w-6 h-6 p-0 rounded-full flex-shrink-0",
                                                hasAccess
                                                  ? getScopeButtonStyle(scope)
                                                  : "bg-gray-100 hover:bg-gray-200"
                                              )}
                                              onClick={() =>
                                                handlePermissionToggle(
                                                  role.id,
                                                  resource.id,
                                                  action.id
                                                )
                                              }
                                            >
                                              {getScopeIcon(scope)}
                                            </Button>
                                            <div className="min-w-0 flex-1">
                                              <div className="font-medium text-sm">
                                                {formatActionName(action.name)}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {action.description}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {hasAccess && scope && (
                                              <Badge
                                                className="text-xs"
                                                variant="outline"
                                              >
                                                {scope}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })}
        </div>
      </div>
    );
  }

  // Enhanced Desktop Matrix View
  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      {/* Controls - Only show if not hidden */}
      {!hideControls && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search roles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value as RoleGroup)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_GROUPS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button
                  variant={viewMode === "matrix" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("matrix")}
                >
                  <Grid className="w-4 h-4 mr-2" />
                  Matrix
                </Button>
                <Button
                  variant={viewMode === "compact" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("compact")}
                >
                  <List className="w-4 h-4 mr-2" />
                  Compact
                </Button>
              </div>
            </div>

            {/* Batch Operations */}
            {selectedBatchRoles.size > 0 && (
              <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                <Badge variant="secondary">
                  {selectedBatchRoles.size} roles selected for batch operations
                </Badge>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedBatchRoles(new Set())}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Grant all permissions for selected roles
                      resources.forEach((resource) => {
                        resource.actions.forEach((action) => {
                          handleBatchPermissionToggle(
                            resource.id,
                            action.id,
                            true
                          );
                        });
                      });
                    }}
                  >
                    Grant All Permissions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Revoke all permissions for selected roles
                      resources.forEach((resource) => {
                        resource.actions.forEach((action) => {
                          handleBatchPermissionToggle(
                            resource.id,
                            action.id,
                            false
                          );
                        });
                      });
                    }}
                  >
                    Revoke All Permissions
                  </Button>
                </div>
              </div>
            )}

            {/* Role Navigation for Many Roles */}
            {filteredRoles.length > maxVisibleRoles && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {visibleRoleStart + 1}-
                  {Math.min(
                    visibleRoleStart + maxVisibleRoles,
                    filteredRoles.length
                  )}{" "}
                  of {filteredRoles.length} roles
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleRoleStart(
                        Math.max(0, visibleRoleStart - maxVisibleRoles)
                      )
                    }
                    disabled={!canShowPrevious}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setVisibleRoleStart(visibleRoleStart + maxVisibleRoles)
                    }
                    disabled={!canShowNext}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Matrix or Compact View */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {viewMode === "compact"
                ? "Compact Permission Overview"
                : "Permission Matrix"}
            </span>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-indigo-700" />
                </div>
                <span>Branch</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-teal-700" />
                </div>
                <span>Area</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-purple-700" />
                </div>
                <span>Region</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-blue-700" />
                </div>
                <span>Country</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-700" />
                </div>
                <span>Organization</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-orange-700" />
                </div>
                <span>Team</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Minus className="w-3 h-3 text-yellow-700" />
                </div>
                <span>Own</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-3 h-3 text-gray-500" />
                </div>
                <span>No Access</span>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {viewMode === "compact" ? (
            <div className="space-y-4">
              {visibleRoles.map((role) => {
                const groupBadge = getRoleGroupBadge(role);
                const rolePermissions = role.permissions.length;
                const totalPossible = resources.reduce(
                  (sum, r) => sum + r.actions.length,
                  0
                );
                const permissionPercentage = Math.round(
                  (rolePermissions / totalPossible) * 100
                );

                return (
                  <div key={role.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedBatchRoles.has(role.id)}
                          onCheckedChange={() => handleBatchRoleToggle(role.id)}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{role.name}</span>
                            {groupBadge && (
                              <Badge
                                className={cn(
                                  "text-xs",
                                  groupBadge.config.color
                                )}
                              >
                                {groupBadge.config.label}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {role.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {rolePermissions}/{totalPossible} permissions
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {permissionPercentage}% access
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {resources.map((resource) => {
                        const Icon = resource.icon;
                        const resourcePermissions = role.permissions.filter(
                          (p) => p.resourceId === resource.id
                        );
                        const resourcePercentage = Math.round(
                          (resourcePermissions.length /
                            resource.actions.length) *
                            100
                        );

                        return (
                          <div
                            key={resource.id}
                            className="bg-muted/30 rounded p-3"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {Icon && <Icon className="w-4 h-4" />}
                              <span className="font-medium text-sm">
                                {formatResourceName(resource.name)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {resourcePermissions.length}/
                                {resource.actions.length}
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              {resource.actions.map((action) => {
                                const hasAccess = hasPermission(
                                  role.id,
                                  resource.id,
                                  action.id
                                );
                                const scope = getPermissionScope(
                                  role.id,
                                  resource.id,
                                  action.id
                                );

                                return (
                                  <div
                                    key={action.id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span
                                      className={cn(
                                        hasAccess
                                          ? "text-foreground"
                                          : "text-muted-foreground"
                                      )}
                                    >
                                      {formatActionName(action.name)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {hasAccess && scope && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1 py-0"
                                        >
                                          {scope}
                                        </Badge>
                                      )}
                                      {getScopeIcon(scope)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto max-w-full">
              <div className="min-w-max">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-3 border-b font-medium sticky left-0 bg-background z-10 min-w-[80px]">
                        Resource / Action
                      </th>
                      {visibleRoles.map((role) => {
                        const groupBadge = getRoleGroupBadge(role);
                        return (
                          <th
                            key={role.id}
                            className="text-center p-3 border-b font-medium min-w-[80px]"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                <Checkbox
                                  checked={selectedBatchRoles.has(role.id)}
                                  onCheckedChange={() =>
                                    handleBatchRoleToggle(role.id)
                                  }
                                  className="w-3 h-3"
                                />
                                <span className="font-medium text-xs leading-tight">
                                  {role.name}
                                </span>
                              </div>
                              {groupBadge && (
                                <Badge
                                  className={cn(
                                    "text-xs",
                                    groupBadge.config.color
                                  )}
                                >
                                  {groupBadge.config.label}
                                </Badge>
                              )}
                              <div className="text-xs text-muted-foreground leading-tight line-clamp-2">
                                {role.description}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((resource) => {
                      const Icon = resource.icon;

                      return (
                        <React.Fragment key={resource.id}>
                          <tr className="border-b bg-muted/50">
                            <td className="p-3 font-medium sticky left-0 bg-muted/50 z-10">
                              <div className="flex items-center gap-2">
                                {Icon && (
                                  <Icon className="w-4 h-4 flex-shrink-0" />
                                )}
                                <span className="text-sm font-medium">
                                  {formatResourceName(resource.name)}
                                </span>
                              </div>
                            </td>
                            <td
                              colSpan={visibleRoles.length}
                              className="p-3 text-sm text-muted-foreground"
                            >
                              {resource.description}
                            </td>
                          </tr>
                          {resource.actions.map((action) => (
                            <tr
                              key={`${resource.id}-${action.id}`}
                              className="border-b hover:bg-muted/30"
                            >
                              <td className="p-3 sticky left-0 bg-background z-10">
                                <div className="pl-6">
                                  <div className="font-medium text-sm">
                                    {formatActionName(action.name)}
                                  </div>
                                  <div className="text-xs text-muted-foreground line-clamp-2">
                                    {action.description}
                                  </div>
                                </div>
                              </td>
                              {visibleRoles.map((role) => {
                                const hasAccess = hasPermission(
                                  role.id,
                                  resource.id,
                                  action.id
                                );
                                const scope = getPermissionScope(
                                  role.id,
                                  resource.id,
                                  action.id
                                );

                                return (
                                  <td key={role.id} className="p-3 text-center">
                                    <div className="flex items-center justify-center">
                                      <Select
                                        value={
                                          hasAccess ? scope || "null" : "null"
                                        }
                                        onValueChange={(value) =>
                                          handleScopeChange(
                                            role.id,
                                            resource.id,
                                            action.id,
                                            value
                                          )
                                        }
                                      >
                                        <SelectTrigger
                                          className={cn(
                                            "h-8 px-2 py-0 flex items-center justify-between",
                                            "w-fit text-xs rounded-full",
                                            hasAccess
                                              ? getScopeButtonStyle(scope)
                                              : "bg-gray-100 hover:bg-gray-200",
                                            "focus:ring-0 focus:ring-offset-0"
                                          )}
                                          aria-label="Select permission scope"
                                          showIcon={false}
                                        >
                                          <div className="flex items-center gap-1">
                                            <div
                                              className={cn(
                                                "w-5 h-5 rounded-full flex items-center justify-center",
                                                hasAccess
                                                  ? getScopeButtonStyle(
                                                      scope
                                                    ).split(" ")[0]
                                                  : "bg-gray-100"
                                              )}
                                            >
                                              {getScopeIcon(scope)}
                                            </div>
                                          </div>
                                        </SelectTrigger>
                                        <SelectContent
                                          align="center"
                                          className="w-52 p-1"
                                          sideOffset={5}
                                        >
                                          <SelectItem
                                            value="null"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                                                <X className="w-3 h-3 text-gray-500" />
                                              </div>
                                              <span>No Access</span>
                                            </div>
                                          </SelectItem>
                                          <SelectItem
                                            value="own"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center">
                                                <Minus className="w-3 h-3 text-yellow-700" />
                                              </div>
                                              <span>Own</span>
                                            </div>
                                          </SelectItem>
                                          <SelectItem
                                            value="team"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-orange-700" />
                                              </div>
                                              <span>Team</span>
                                            </div>
                                          </SelectItem>
                                          <SelectItem
                                            value="organization"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-green-700" />
                                              </div>
                                              <span>Organization</span>
                                            </div>
                                          </SelectItem>
                                          <SelectItem
                                            value="country"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-blue-700" />
                                              </div>
                                              <span>Country</span>
                                            </div>
                                          </SelectItem>
                                          <SelectItem
                                            value="region"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-purple-700" />
                                              </div>
                                              <span>Region</span>
                                            </div>
                                          </SelectItem>
                                          <SelectItem
                                            value="area"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-teal-700" />
                                              </div>
                                              <span>Area</span>
                                            </div>
                                          </SelectItem>
                                          <SelectItem
                                            value="branch"
                                            className="flex items-center py-1 px-2"
                                          >
                                            <div className="flex items-center gap-2 w-full">
                                              <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-indigo-700" />
                                              </div>
                                              <span>Branch</span>
                                            </div>
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
