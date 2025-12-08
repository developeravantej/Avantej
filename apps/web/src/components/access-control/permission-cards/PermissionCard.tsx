import React, { useState } from 'react';
import { Check, X, Minus, ChevronDown, ChevronRight, Edit, Trash2, Shield, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { Role, PermissionResource } from '../permission-matrix/PermissionMatrix';

interface PermissionCardProps {
  role: Role;
  resources: PermissionResource[];
  onPermissionChange?: (resourceId: string, actionId: string, enabled: boolean) => void;
  onEditRole?: () => void;
  onDeleteRole?: () => void;
  onSelectRole?: () => void;
  isSelected?: boolean;
  className?: string;
}

interface ScopeIndicatorProps {
  scope: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch';
  size?: 'sm' | 'md';
}

function ScopeIndicator({ scope, size = 'sm' }: ScopeIndicatorProps) {
  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  
  const getScopeConfig = () => {
    switch (scope) {
      case 'own':
        return {
          icon: <Minus className={cn(iconClass, 'text-yellow-600')} />,
          label: 'Own',
          className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        };
      case 'team':
        return {
          icon: <Check className={cn(iconClass, 'text-blue-600')} />,
          label: 'Team',
          className: 'bg-blue-100 text-blue-800 border-blue-300',
        };
      case 'organization':
        return {
          icon: <Check className={cn(iconClass, 'text-green-600')} />,
          label: 'Organization',
          className: 'bg-green-100 text-green-800 border-green-300',
        };
      case 'country':
        return {
          icon: <Check className={cn(iconClass, 'text-purple-600')} />,
          label: 'Country',
          className: 'bg-purple-100 text-purple-800 border-purple-300',
        };
      case 'region':
        return {
          icon: <Check className={cn(iconClass, 'text-indigo-600')} />,
          label: 'Region',
          className: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        };
      case 'area':
        return {
          icon: <Check className={cn(iconClass, 'text-pink-600')} />,
          label: 'Area',
          className: 'bg-pink-100 text-pink-800 border-pink-300',
        };
      case 'branch':
        return {
          icon: <Check className={cn(iconClass, 'text-orange-600')} />,
          label: 'Branch',
          className: 'bg-orange-100 text-orange-800 border-orange-300',
        };
    }
  };

  const config = getScopeConfig();

  return (
    <Badge variant="outline" className={cn('flex items-center gap-1 text-xs', config.className)}>
      {config.icon}
      <span>{config.label}</span>
    </Badge>
  );
}

export function PermissionCard({
  role,
  resources,
  onPermissionChange,
  onEditRole,
  onDeleteRole,
  onSelectRole,
  isSelected = false,
  className,
}: PermissionCardProps) {
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set());

  const toggleResourceExpansion = (resourceId: string) => {
    const newExpanded = new Set(expandedResources);
    if (newExpanded.has(resourceId)) {
      newExpanded.delete(resourceId);
    } else {
      newExpanded.add(resourceId);
    }
    setExpandedResources(newExpanded);
  };

  const hasPermission = (resourceId: string, actionId: string) => {
    return role.permissions.some(p => p.resourceId === resourceId && p.actionId === actionId);
  };

  const getPermissionScope = (resourceId: string, actionId: string) => {
    const permission = role.permissions.find(p => p.resourceId === resourceId && p.actionId === actionId);
    return permission?.scope;
  };

  const getResourcePermissionCount = (resourceId: string) => {
    return role.permissions.filter(p => p.resourceId === resourceId).length;
  };

  const getTotalPermissions = () => {
    return role.permissions.length;
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
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const handlePermissionToggle = (resourceId: string, actionId: string) => {
    const enabled = !hasPermission(resourceId, actionId);
    onPermissionChange?.(resourceId, actionId, enabled);
  };

  return (
    <Card className={cn('w-full', isSelected && 'ring-2 ring-primary', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {onSelectRole && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelectRole}
                className="mt-1"
              />
            )}
            <div className="flex items-center gap-2 flex-1">
              <Shield className="w-5 h-5 text-primary" />
              <div className="space-y-1 flex-1">
                <CardTitle className="text-base">{role.name}</CardTitle>
                {role.description && (
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {onEditRole && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditRole}
                className="h-8 w-8 p-0"
              >
                <Edit className="w-3 h-3" />
              </Button>
            )}
            {onDeleteRole && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeleteRole}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn('text-xs', getPriorityColor(role.priority))}
          >
            Priority {role.priority}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            {getTotalPermissions()} permissions
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          {resources.map((resource) => {
            const Icon = resource.icon;
            const resourcePermissionCount = getResourcePermissionCount(resource.id);
            const isExpanded = expandedResources.has(resource.id);
            
            if (resourcePermissionCount === 0) return null;

            return (
              <Collapsible
                key={resource.id}
                open={isExpanded}
                onOpenChange={() => toggleResourceExpansion(resource.id)}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      {Icon && <Icon className="w-4 h-4 text-primary" />}
                      <span className="font-medium text-sm">{resource.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {resourcePermissionCount}
                      </Badge>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="pt-2 space-y-2">
                    {resource.actions.map((action) => {
                      const hasAccess = hasPermission(resource.id, action.id);
                      const scope = getPermissionScope(resource.id, action.id);
                      
                      if (!hasAccess) return null;

                      return (
                        <div
                          key={action.id}
                          className="flex items-center justify-between p-2 bg-background border rounded ml-4"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{action.name}</span>
                              {scope && <ScopeIndicator scope={scope} />}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {action.description}
                            </p>
                          </div>
                          <Checkbox
                            checked={hasAccess}
                            onCheckedChange={() => handlePermissionToggle(resource.id, action.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          
          {getTotalPermissions() === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No permissions assigned</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}