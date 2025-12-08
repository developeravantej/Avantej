import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, X, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { PermissionResource, PermissionAction } from '../permission-matrix/PermissionMatrix';

interface PermissionGroupCollapsibleProps {
  resource: PermissionResource;
  rolePermissions: {
    resourceId: string;
    actionId: string;
    scope: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch';
  }[];
  onPermissionChange?: (actionId: string, enabled: boolean, scope?: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch' | null) => void;
  onBulkChange?: (actionIds: string[], enabled: boolean) => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  showBulkActions?: boolean;
  className?: string;
}

interface PermissionActionItemProps {
  action: PermissionAction;
  hasPermission: boolean;
  scope?: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch';
  onCycle: () => void;
  onScopeChange?: (scope: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch') => void;
  showScopeSelector?: boolean;
}

function PermissionActionItem({
  action,
  hasPermission,
  scope,
  onCycle,
  onScopeChange,
  showScopeSelector = false,
}: PermissionActionItemProps) {
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);

  const getScopeIcon = (scope?: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch') => {
    switch (scope) {
      case 'own':
        return <Minus className="w-3 h-3 text-yellow-700" />;
      case 'team':
        return <Check className="w-3 h-3 text-orange-700" />;
      case 'organization':
        return <Check className="w-3 h-3 text-green-700" />;
      case 'country':
        return <Check className="w-3 h-3 text-blue-700" />;
      case 'region':
        return <Check className="w-3 h-3 text-purple-700" />;
      case 'area':
        return <Check className="w-3 h-3 text-teal-700" />;
      case 'branch':
        return <Check className="w-3 h-3 text-indigo-700" />;
      default:
        return <X className="w-3 h-3 text-gray-500" />;
    }
  };

  const getScopeButtonStyle = (scope?: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch') => {
    switch (scope) {
      case 'own':
        return "bg-yellow-100 hover:bg-yellow-200 border-yellow-300";
      case 'team':
        return "bg-orange-100 hover:bg-orange-200 border-orange-300";
      case 'organization':
        return "bg-green-100 hover:bg-green-200 border-green-300";
      case 'country':
        return "bg-blue-100 hover:bg-blue-200 border-blue-300";
      case 'region':
        return "bg-purple-100 hover:bg-purple-200 border-purple-300";
      case 'area':
        return "bg-teal-100 hover:bg-teal-200 border-teal-300";
      case 'branch':
        return "bg-indigo-100 hover:bg-indigo-200 border-indigo-300";
      default:
        return "bg-gray-100 hover:bg-gray-200 border-gray-300";
    }
  };

  const getScopeBadgeColor = (scope?: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch') => {
    switch (scope) {
      case 'own':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'team':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'organization':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'country':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'region':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'area':
        return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'branch':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      default:
        return 'bg-gray-100 text-gray-500 border-gray-300';
    }
  };

  const scopes: ('own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch')[] = ['own', 'team', 'organization', 'country', 'region', 'area', 'branch'];

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
      <div className="flex items-center gap-3 flex-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-6 h-6 p-0 rounded-full",
            hasPermission ? getScopeButtonStyle(scope) : "bg-gray-100 hover:bg-gray-200"
          )}
          onClick={onCycle}
        >
          {getScopeIcon(scope)}
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{action.name}</span>
            {hasPermission && scope && (
              <Badge
                variant="outline"
                className={cn('text-xs', getScopeBadgeColor(scope))}
              >
                {scope}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {action.description}
          </p>
        </div>
      </div>

      {hasPermission && showScopeSelector && onScopeChange && (
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowScopeDropdown(!showScopeDropdown)}
            className="h-6 w-6 p-0"
          >
            {getScopeIcon(scope)}
          </Button>
          
          {showScopeDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 z-10 min-w-[120px]">
              {scopes.map((scopeOption) => (
                <Button
                  key={scopeOption}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onScopeChange(scopeOption);
                    setShowScopeDropdown(false);
                  }}
                  className={cn(
                    'w-full justify-start text-xs h-7',
                    scope === scopeOption && 'bg-muted'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {getScopeIcon(scopeOption)}
                    <span className="capitalize">{scopeOption}</span>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PermissionGroupCollapsible({
  resource,
  rolePermissions,
  onPermissionChange,
  onBulkChange,
  isExpanded = false,
  onToggleExpanded,
  showBulkActions = false,
  className,
}: PermissionGroupCollapsibleProps) {
  const Icon = resource.icon;

  const getPermissionForAction = (actionId: string) => {
    return rolePermissions.find(p => p.resourceId === resource.id && p.actionId === actionId);
  };

  const hasPermission = (actionId: string) => {
    return !!getPermissionForAction(actionId);
  };

  const getPermissionScope = (actionId: string) => {
    return getPermissionForAction(actionId)?.scope;
  };

  const getEnabledActionsCount = () => {
    return resource.actions.filter(action => hasPermission(action.id)).length;
  };

  const getAllActionIds = () => {
    return resource.actions.map(action => action.id);
  };

  const areAllActionsEnabled = () => {
    return resource.actions.every(action => hasPermission(action.id));
  };

  const areAnyActionsEnabled = () => {
    return resource.actions.some(action => hasPermission(action.id));
  };

  const handleBulkToggle = () => {
    const allActionIds = getAllActionIds();
    const shouldEnable = !areAllActionsEnabled();
    onBulkChange?.(allActionIds, shouldEnable);
  };

  const handlePermissionToggle = (actionId: string) => {
    const currentScope = getPermissionScope(actionId);
    const hasAccess = hasPermission(actionId);
    
    let newScope: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch' | null = null;
    let enabled = false;
    
    // Cycle through: No Access → Own → Team → Organization → Country → Region → Area → Branch → No Access
    if (!hasAccess) {
      // No access, grant 'own' scope
      newScope = 'own';
      enabled = true;
    } else if (currentScope === 'own') {
      // Has 'own' scope, upgrade to 'team' scope
      newScope = 'team';
      enabled = true;
    } else if (currentScope === 'team') {
      // Has 'team' scope, upgrade to 'organization' scope
      newScope = 'organization';
      enabled = true;
    } else if (currentScope === 'organization') {
      // Has 'organization' scope, upgrade to 'country' scope
      newScope = 'country';
      enabled = true;
    } else if (currentScope === 'country') {
      // Has 'country' scope, upgrade to 'region' scope
      newScope = 'region';
      enabled = true;
    } else if (currentScope === 'region') {
      // Has 'region' scope, upgrade to 'area' scope
      newScope = 'area';
      enabled = true;
    } else if (currentScope === 'area') {
      // Has 'area' scope, upgrade to 'branch' scope
      newScope = 'branch';
      enabled = true;
    } else if (currentScope === 'branch') {
      // Has 'branch' scope, remove access
      newScope = null;
      enabled = false;
    }
    
    onPermissionChange?.(actionId, enabled, newScope);
  };

  const handleScopeChange = (actionId: string, newScope: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch') => {
    onPermissionChange?.(actionId, true, newScope);
  };

  const enabledCount = getEnabledActionsCount();
  const totalCount = resource.actions.length;

  return (
    <Card className={className}>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {Icon && <Icon className="w-5 h-5 text-primary" />}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{resource.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {enabledCount}/{totalCount}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground text-left">
                    {resource.description}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {showBulkActions && onBulkChange && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBulkToggle();
                    }}
                    className="h-7 text-xs"
                  >
                    {areAllActionsEnabled() ? 'Disable All' : 'Enable All'}
                  </Button>
                )}
                
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
            <div className="space-y-2">
              {resource.actions.map((action) => (
                <PermissionActionItem
                  key={action.id}
                  action={action}
                  hasPermission={hasPermission(action.id)}
                  scope={getPermissionScope(action.id)}
                  onCycle={() => handlePermissionToggle(action.id)}
                  onScopeChange={(scope) => handleScopeChange(action.id, scope)}
                  showScopeSelector={true}
                />
              ))}
              
              {resource.actions.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">No actions available for this resource</p>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}