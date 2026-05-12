import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Edit, Trash2, Users, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { Role, PermissionResource, PermissionAction } from './PermissionMatrix';

interface PermissionMatrixRowProps {
  role: Role;
  resources: PermissionResource[];
  onPermissionChange?: (resourceId: string, actionId: string, enabled: boolean) => void;
  onEditRole?: () => void;
  onDeleteRole?: () => void;
  isSelected?: boolean;
  onSelectRole?: (selected: boolean) => void;
  className?: string;
}

interface PermissionCellProps {
  role: Role;
  resource: PermissionResource;
  action: PermissionAction;
  onPermissionChange?: (resourceId: string, actionId: string, enabled: boolean) => void;
}

function PermissionCell({ role, resource, action, onPermissionChange }: PermissionCellProps) {
  const hasPermission = role.permissions.some(
    p => p.resourceId === resource.id && p.actionId === action.id
  );
  
  const permission = role.permissions.find(
    p => p.resourceId === resource.id && p.actionId === action.id
  );
  
  const scope = permission?.scope;

  const handleToggle = () => {
    onPermissionChange?.(resource.id, action.id, !hasPermission);
  };

  const getScopeColor = (scope?: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch') => {
    switch (scope) {
      case 'own':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'team':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'organization':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'country':
        return 'bg-purple-100 border-purple-300 text-purple-800';
      case 'region':
        return 'bg-indigo-100 border-indigo-300 text-indigo-800';
      case 'area':
        return 'bg-pink-100 border-pink-300 text-pink-800';
      case 'branch':
        return 'bg-orange-100 border-orange-300 text-orange-800';
      default:
        return 'bg-brand-secondary-3 border-brand-secondary-3 text-brand-secondary-1';
    }
  };

  return (
    <div className="flex items-center justify-center">
      <div className="flex flex-col items-center gap-1">
        <Checkbox
          checked={hasPermission}
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
        {hasPermission && scope && (
          <Badge
            variant="outline"
            className={cn(
              "text-xs px-1 py-0 h-4",
              getScopeColor(scope)
            )}
          >
            {scope}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function PermissionMatrixRow({
  role,
  resources,
  onPermissionChange,
  onEditRole,
  onDeleteRole,
  isSelected = false,
  onSelectRole,
  className,
}: PermissionMatrixRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getTotalPermissions = () => {
    return role.permissions.length;
  };

  const getPermissionsByResource = (resourceId: string) => {
    return role.permissions.filter(p => p.resourceId === resourceId);
  };

  const handlePermissionChange = (resourceId: string, actionId: string, enabled: boolean) => {
    onPermissionChange?.(resourceId, actionId, enabled);
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'bg-red-100 text-red-800 border-red-300';
      case 2:
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 3:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-brand-secondary-3 text-brand-primary-1 border-brand-secondary-3';
    }
  };

  return (
    <div className={cn("border rounded-lg", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between p-4 hover:bg-muted/50">
          <div className="flex items-center gap-3">
            {onSelectRole && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelectRole}
              />
            )}
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{role.name}</span>
                  <Badge
                    variant="outline"
                    className={cn("text-xs", getPriorityColor(role.priority))}
                  >
                    Priority {role.priority}
                  </Badge>
                </div>
                {role.description && (
                  <div className="text-sm text-muted-foreground">
                    {role.description}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Users className="size-3 mr-1" />
              {getTotalPermissions()} permissions
            </Badge>
            
            <div className="flex items-center gap-1">
              {onEditRole && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEditRole}
                  className="size-8 p-0"
                >
                  <Edit className="size-3" />
                </Button>
              )}
              {onDeleteRole && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDeleteRole}
                  className="size-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>

            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="grid gap-4">
                {resources.map((resource) => {
                  const Icon = resource.icon;
                  const resourcePermissions = getPermissionsByResource(resource.id);
                  
                  if (resourcePermissions.length === 0) return null;

                  return (
                    <div key={resource.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {Icon && <Icon className="size-4" />}
                        <span>{resource.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {resourcePermissions.length} permissions
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pl-6">
                        {resource.actions.map((action) => (
                          <div
                            key={action.id}
                            className="flex items-center justify-between p-2 bg-background rounded border"
                          >
                            <div>
                              <div className="text-sm font-medium">{action.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {action.description}
                              </div>
                            </div>
                            <PermissionCell
                              role={role}
                              resource={resource}
                              action={action}
                              onPermissionChange={handlePermissionChange}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}