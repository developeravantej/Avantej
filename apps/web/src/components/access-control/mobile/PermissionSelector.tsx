import React, { useState } from 'react';
import { Shield, Check, X, Search, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { PermissionResource } from '../permission-matrix/PermissionMatrix';

interface Permission {
  resourceId: string;
  actionId: string;
  scope: 'own' | 'team' | 'organization';
}

interface PermissionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  resources: PermissionResource[];
  selectedPermissions: Permission[];
  onSelectionChange: (permissions: Permission[]) => void;
  title?: string;
  description?: string;
  maxSelections?: number;
}

type FilterMode = 'all' | 'selected' | 'unselected';
type ScopeFilter = 'all' | 'own' | 'team' | 'organization';

export function PermissionSelector({
  isOpen,
  onClose,
  resources,
  selectedPermissions,
  onSelectionChange,
  title = 'Select Permissions',
  description = 'Choose the permissions to assign',
  maxSelections,
}: PermissionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set(resources.slice(0, 2).map(r => r.id)));
  const [localPermissions, setLocalPermissions] = useState<Permission[]>(selectedPermissions);

  React.useEffect(() => {
    setLocalPermissions(selectedPermissions);
  }, [selectedPermissions]);

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
    return localPermissions.some(p => p.resourceId === resourceId && p.actionId === actionId);
  };

  const getPermissionScope = (resourceId: string, actionId: string) => {
    const permission = localPermissions.find(p => p.resourceId === resourceId && p.actionId === actionId);
    return permission?.scope || 'own';
  };

  const handlePermissionToggle = (resourceId: string, actionId: string) => {
    const enabled = !hasPermission(resourceId, actionId);
    
    if (enabled && maxSelections && localPermissions.length >= maxSelections) {
      return; // Don't allow more selections if max reached
    }

    setLocalPermissions(prev => {
      if (enabled) {
        const filtered = prev.filter(p => !(p.resourceId === resourceId && p.actionId === actionId));
        return [...filtered, { resourceId, actionId, scope: 'own' }];
      } else {
        return prev.filter(p => !(p.resourceId === resourceId && p.actionId === actionId));
      }
    });
  };

  const handleScopeChange = (resourceId: string, actionId: string, newScope: 'own' | 'team' | 'organization') => {
    setLocalPermissions(prev => prev.map(p => 
      p.resourceId === resourceId && p.actionId === actionId
        ? { ...p, scope: newScope }
        : p
    ));
  };

  const handleBulkToggleResource = (resourceId: string, enabled: boolean) => {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    setLocalPermissions(prev => {
      if (enabled) {
        // Add all actions for this resource
        const filtered = prev.filter(p => p.resourceId !== resourceId);
        const newPermissions = resource.actions.map(action => ({
          resourceId,
          actionId: action.id,
          scope: 'own' as const,
        }));
        
        // Check max selections
        if (maxSelections && filtered.length + newPermissions.length > maxSelections) {
          return prev; // Don't allow if it exceeds max
        }
        
        return [...filtered, ...newPermissions];
      } else {
        // Remove all actions for this resource
        return prev.filter(p => p.resourceId !== resourceId);
      }
    });
  };

  const handleSelectAll = (enabled: boolean) => {
    if (enabled) {
      const allPermissions: Permission[] = [];
      resources.forEach(resource => {
        resource.actions.forEach(action => {
          allPermissions.push({
            resourceId: resource.id,
            actionId: action.id,
            scope: 'own',
          });
        });
      });
      
      // Respect max selections
      const permissionsToAdd = maxSelections 
        ? allPermissions.slice(0, maxSelections)
        : allPermissions;
      
      setLocalPermissions(permissionsToAdd);
    } else {
      setLocalPermissions([]);
    }
  };

  const handleSave = () => {
    onSelectionChange(localPermissions);
    onClose();
  };

  const handleCancel = () => {
    setLocalPermissions(selectedPermissions);
    onClose();
  };

  const getScopeIcon = (scope: 'own' | 'team' | 'organization') => {
    switch (scope) {
      case 'own':
        return <Minus className="w-3 h-3 text-yellow-600" />;
      case 'team':
        return <Check className="w-3 h-3 text-blue-600" />;
      case 'organization':
        return <Check className="w-3 h-3 text-green-600" />;
    }
  };


  const filteredResources = resources.filter(resource => {
    const matchesSearch = resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         resource.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         resource.actions.some(action => 
                           action.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           action.description?.toLowerCase().includes(searchQuery.toLowerCase())
                         );

    if (!matchesSearch) return false;

    const resourcePermissions = localPermissions.filter(p => p.resourceId === resource.id);
    
    switch (filterMode) {
      case 'selected':
        return resourcePermissions.length > 0;
      case 'unselected':
        return resourcePermissions.length === 0;
      default:
        return true;
    }
  });

  const getResourcePermissionCount = (resourceId: string) => {
    return localPermissions.filter(p => p.resourceId === resourceId).length;
  };

  const getResourceActionCount = (resourceId: string) => {
    const resource = resources.find(r => r.id === resourceId);
    return resource?.actions.length || 0;
  };

  const isResourceFullySelected = (resourceId: string) => {
    return getResourcePermissionCount(resourceId) === getResourceActionCount(resourceId);
  };

  const isResourcePartiallySelected = (resourceId: string): boolean => {
    const count = getResourcePermissionCount(resourceId);
    return count > 0 && count < getResourceActionCount(resourceId);
  };

  const totalSelected = localPermissions.length;
  const hasChanges = JSON.stringify(localPermissions.sort()) !== JSON.stringify(selectedPermissions.sort());

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {title}
          </SheetTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Stats and Actions */}
          <div className="flex-shrink-0 mb-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-primary">{totalSelected}</div>
                      <div className="text-xs text-muted-foreground">Selected</div>
                    </div>
                    {maxSelections && (
                      <div className="text-center">
                        <div className="text-lg font-semibold text-muted-foreground">
                          {maxSelections - totalSelected}
                        </div>
                        <div className="text-xs text-muted-foreground">Remaining</div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAll(false)}
                      disabled={totalSelected === 0}
                    >
                      Clear All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAll(true)}
                      disabled={maxSelections ? totalSelected >= maxSelections : false}
                    >
                      Select All
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex-shrink-0 mb-4">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search permissions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={filterMode} onValueChange={(value) => setFilterMode(value as FilterMode)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Permissions</SelectItem>
                    <SelectItem value="selected">Selected Only</SelectItem>
                    <SelectItem value="unselected">Unselected Only</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scopes</SelectItem>
                    <SelectItem value="own">Own Only</SelectItem>
                    <SelectItem value="team">Team Only</SelectItem>
                    <SelectItem value="organization">Organization Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-3">
              {filteredResources.map((resource) => {
                const Icon = resource.icon;
                const isExpanded = expandedResources.has(resource.id);
                const resourcePermissionCount = getResourcePermissionCount(resource.id);
                const isFullySelected = isResourceFullySelected(resource.id);
                const isPartiallySelected = isResourcePartiallySelected(resource.id);
                
                return (
                  <Card key={resource.id}>
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={() => toggleResourceExpansion(resource.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 pb-3">
                          <CardTitle className="flex items-center justify-between text-base">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={!!(isFullySelected || isPartiallySelected)}
                                onCheckedChange={(checked) => handleBulkToggleResource(resource.id, !!checked)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              {Icon && <Icon className="w-4 h-4 text-primary" />}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span>{resource.name}</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {resourcePermissionCount}/{resource.actions.length}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground text-left">
                                  {resource.description}
                                </div>
                              </div>
                            </div>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {resource.actions.map((action) => {
                              const hasAccess: boolean = hasPermission(resource.id, action.id);
                              const scope = getPermissionScope(resource.id, action.id);
                              const isDisabled = !hasAccess && maxSelections && totalSelected >= maxSelections;
                              
                              return (
                                <div
                                  key={action.id}
                                  className={cn(
                                    "flex items-center justify-between p-3 border rounded-lg",
                                    isDisabled && "opacity-50"
                                  )}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Checkbox
                                      checked={!!hasAccess}
                                      disabled={!!isDisabled}
                                      onCheckedChange={() => handlePermissionToggle(resource.id, action.id)}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">{action.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {action.description}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {hasAccess && (
                                    <Select
                                      value={scope}
                                      onValueChange={(value) => handleScopeChange(
                                        resource.id, 
                                        action.id, 
                                        value as 'own' | 'team' | 'organization'
                                      )}
                                    >
                                      <SelectTrigger className="w-24 h-6 text-xs">
                                        <div className="flex items-center gap-1">
                                          {getScopeIcon(scope)}
                                          <span className="capitalize">{scope}</span>
                                        </div>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="own">Own</SelectItem>
                                        <SelectItem value="team">Team</SelectItem>
                                        <SelectItem value="organization">Organization</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
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

          {/* Actions */}
          <div className="flex-shrink-0 pt-4 border-t">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {totalSelected} permission{totalSelected !== 1 ? 's' : ''} selected
                {maxSelections && ` (${maxSelections - totalSelected} remaining)`}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!hasChanges}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Apply Selection
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}