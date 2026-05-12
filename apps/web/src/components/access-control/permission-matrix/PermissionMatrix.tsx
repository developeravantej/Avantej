import React, { useState } from 'react';
import { Check, X, Minus, ChevronDown, ChevronRight, Users, Settings, Database, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export interface PermissionAction {
  id: string;
  name: string;
  description?: string;
}

export interface PermissionResource {
  id: string;
  name: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions: PermissionAction[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  priority: number;
  permissions: {
    resourceId: string;
    actionId: string;
    scope: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch';
  }[];
}

interface PermissionMatrixProps {
  roles: Role[];
  resources: PermissionResource[];
  onPermissionChange?: (roleId: string, resourceId: string, actionId: string, enabled: boolean) => void;
  onRoleSelect?: (roleId: string) => void;
  selectedRoles?: string[];
}

// Mock data for UI development
const MOCK_RESOURCES: PermissionResource[] = [
  {
    id: 'users',
    name: 'Users',
    description: 'User management and access control',
    icon: Users,
    actions: [
      { id: 'create', name: 'Create', description: 'Create new users' },
      { id: 'read', name: 'View', description: 'View user profiles' },
      { id: 'update', name: 'Edit', description: 'Edit user information' },
      { id: 'delete', name: 'Delete', description: 'Delete users' },
    ],
  },
  {
    id: 'roles',
    name: 'Roles',
    description: 'Role and permission management',
    icon: Settings,
    actions: [
      { id: 'create', name: 'Create', description: 'Create new roles' },
      { id: 'read', name: 'View', description: 'View roles' },
      { id: 'update', name: 'Edit', description: 'Edit roles' },
      { id: 'delete', name: 'Delete', description: 'Delete roles' },
    ],
  },
  {
    id: 'branches',
    name: 'Branches',
    description: 'Branch management',
    icon: Database,
    actions: [
      { id: 'create', name: 'Create', description: 'Create new branches' },
      { id: 'read', name: 'View', description: 'View branch data' },
      { id: 'update', name: 'Edit', description: 'Edit branch information' },
    ],
  },
  {
    id: 'reports',
    name: 'Reports',
    description: 'Analytics and reporting',
    icon: FileText,
    actions: [
      { id: 'read', name: 'View', description: 'View reports' },
      { id: 'export', name: 'Export', description: 'Export report data' },
    ],
  },
];

const MOCK_ROLES: Role[] = [
  {
    id: '1',
    name: 'System Admin',
    description: 'Full system access',
    priority: 1,
    permissions: [
      { resourceId: 'users', actionId: 'create', scope: 'organization' },
      { resourceId: 'users', actionId: 'read', scope: 'organization' },
      { resourceId: 'users', actionId: 'update', scope: 'organization' },
      { resourceId: 'users', actionId: 'delete', scope: 'organization' },
      { resourceId: 'roles', actionId: 'create', scope: 'organization' },
      { resourceId: 'roles', actionId: 'read', scope: 'organization' },
      { resourceId: 'roles', actionId: 'update', scope: 'organization' },
      { resourceId: 'roles', actionId: 'delete', scope: 'organization' },
    ],
  },
  {
    id: '2',
    name: 'Manager',
    description: 'Management level access',
    priority: 2,
    permissions: [
      { resourceId: 'users', actionId: 'read', scope: 'team' },
      { resourceId: 'users', actionId: 'update', scope: 'team' },
      { resourceId: 'branches', actionId: 'read', scope: 'team' },
      { resourceId: 'branches', actionId: 'update', scope: 'team' },
      { resourceId: 'reports', actionId: 'read', scope: 'team' },
    ],
  },
  {
    id: '3',
    name: 'Employee',
    description: 'Basic access',
    priority: 3,
    permissions: [
      { resourceId: 'users', actionId: 'read', scope: 'own' },
      { resourceId: 'users', actionId: 'update', scope: 'own' },
      { resourceId: 'branches', actionId: 'read', scope: 'own' },
    ],
  },
];

export function PermissionMatrix({
  roles = MOCK_ROLES,
  resources = MOCK_RESOURCES,
  onPermissionChange,
  onRoleSelect: _onRoleSelect,
  selectedRoles: _selectedRoles = [],
}: PermissionMatrixProps) {
  const isMobile = useIsMobile();
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set(['users']));

  const toggleResourceExpansion = (resourceId: string) => {
    const newExpanded = new Set(expandedResources);
    if (newExpanded.has(resourceId)) {
      newExpanded.delete(resourceId);
    } else {
      newExpanded.add(resourceId);
    }
    setExpandedResources(newExpanded);
  };

  const hasPermission = (roleId: string, resourceId: string, actionId: string) => {
    const role = roles.find(r => r.id === roleId);
    return role?.permissions.some(p => p.resourceId === resourceId && p.actionId === actionId) || false;
  };

  const getPermissionScope = (roleId: string, resourceId: string, actionId: string) => {
    const role = roles.find(r => r.id === roleId);
    const permission = role?.permissions.find(p => p.resourceId === resourceId && p.actionId === actionId);
    return permission?.scope;
  };

  const handlePermissionToggle = (roleId: string, resourceId: string, actionId: string) => {
    const enabled = !hasPermission(roleId, resourceId, actionId);
    onPermissionChange?.(roleId, resourceId, actionId, enabled);
  };

  const getScopeIcon = (scope?: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch') => {
    switch (scope) {
      case 'own':
        return <Minus className="size-3 text-yellow-600" />;
      case 'team':
        return <Check className="size-3 text-orange-600" />;
      case 'organization':
        return <Check className="size-3 text-green-600" />;
      case 'country':
        return <Check className="size-3 text-green-600" />;
      case 'region':
        return <Check className="size-3 text-green-600" />;
      case 'area':
        return <Check className="size-3 text-green-600" />;
      case 'branch':
        return <Check className="size-3 text-green-600" />;
      default:
        return <X className="size-3 text-brand-secondary-2" />;
    }
  };

  // Mobile Card View
  if (isMobile) {
    return (
      <div className="space-y-4">
        {resources.map((resource) => {
          const Icon = resource.icon || Database;
          const isExpanded = expandedResources.has(resource.id);

          return (
            <Card key={resource.id} className="w-full">
              <Collapsible
                open={isExpanded}
                onOpenChange={() => toggleResourceExpansion(resource.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="size-5" />
                        <span>{resource.name}</span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {resource.actions.map((action) => (
                        <div key={action.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{action.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {action.description}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {roles.map((role) => {
                              const hasAccess = hasPermission(role.id, resource.id, action.id);
                              const scope = getPermissionScope(role.id, resource.id, action.id);
                              
                              return (
                                <div
                                  key={role.id}
                                  className="flex items-center justify-between p-3 border rounded-lg"
                                >
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">{role.name}</Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {scope && (
                                      <Badge variant="secondary" className="text-xs">
                                        {scope}
                                      </Badge>
                                    )}
                                    <Checkbox
                                      checked={hasAccess}
                                      onCheckedChange={() =>
                                        handlePermissionToggle(role.id, resource.id, action.id)
                                      }
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    );
  }

  // Desktop Matrix View
  return (
    <div className="w-full">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Permission Matrix</span>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Check className="size-3 text-green-600" />
                <span>Organization</span>
              </div>
              <div className="flex items-center gap-1">
                <Check className="size-3 text-orange-600" />
                <span>Team</span>
              </div>
              <div className="flex items-center gap-1">
                <Minus className="size-3 text-yellow-600" />
                <span>Own</span>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-3 border-b font-medium sticky left-0 bg-background z-10">
                    Resource / Action
                  </th>
                  {roles.map((role) => (
                    <th key={role.id} className="text-center p-3 border-b font-medium min-w-[120px]">
                      <div className="space-y-1">
                        <div className="font-medium">{role.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {role.description}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => {
                  const Icon = resource.icon || Database;
                  
                  return (
                    <React.Fragment key={resource.id}>
                      <tr className="border-b bg-muted/50">
                        <td className="p-3 font-medium sticky left-0 bg-muted/50 z-10">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4" />
                            <span>{resource.name}</span>
                          </div>
                        </td>
                        <td colSpan={roles.length} className="p-3 text-sm text-muted-foreground">
                          {resource.description}
                        </td>
                      </tr>
                      {resource.actions.map((action) => (
                        <tr key={`${resource.id}-${action.id}`} className="border-b hover:bg-muted/30">
                          <td className="p-3 sticky left-0 bg-background z-10">
                            <div className="pl-6">
                              <div className="font-medium text-sm">{action.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {action.description}
                              </div>
                            </div>
                          </td>
                          {roles.map((role) => {
                            const hasAccess = hasPermission(role.id, resource.id, action.id);
                            const scope = getPermissionScope(role.id, resource.id, action.id);
                            
                            return (
                              <td key={role.id} className="p-3 text-center">
                                <div className="flex items-center justify-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "size-8 p-0 rounded-full",
                                      hasAccess && "bg-green-100 hover:bg-green-200"
                                    )}
                                    onClick={() =>
                                      handlePermissionToggle(role.id, resource.id, action.id)
                                    }
                                  >
                                    {getScopeIcon(scope)}
                                  </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}