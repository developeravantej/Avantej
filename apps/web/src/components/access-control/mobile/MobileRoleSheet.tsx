import React, { useState } from 'react';
import { Shield, Save, X, ChevronDown, ChevronRight, Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Role, PermissionResource } from '../permission-matrix/PermissionMatrix';

interface MobileRoleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  role?: Role;
  resources: PermissionResource[];
  onSave: (roleData: RoleFormData, permissions: Role['permissions']) => void;
  isLoading?: boolean;
}

interface RoleFormData {
  name: string;
  description: string;
  priority: number;
}

type ScopeType = 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch';

interface ScopeIndicatorProps {
  scope: ScopeType;
  onScopeChange?: (newScope: ScopeType) => void;
  interactive?: boolean;
}

function ScopeIndicator({ scope, onScopeChange, interactive = false }: ScopeIndicatorProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const getScopeConfig = (scope: ScopeType) => {
    switch (scope) {
      case 'own':
        return {
          icon: <Minus className="w-3 h-3 text-yellow-600" />,
          label: 'Own',
          className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        };
      case 'team':
        return {
          icon: <Check className="w-3 h-3 text-blue-600" />,
          label: 'Team',
          className: 'bg-blue-100 text-blue-800 border-blue-300',
        };
      case 'organization':
        return {
          icon: <Check className="w-3 h-3 text-green-600" />,
          label: 'Organization',
          className: 'bg-green-100 text-green-800 border-green-300',
        };
      case 'country':
        return {
          icon: <Check className="w-3 h-3 text-purple-600" />,
          label: 'Country',
          className: 'bg-purple-100 text-purple-800 border-purple-300',
        };
      case 'region':
        return {
          icon: <Check className="w-3 h-3 text-indigo-600" />,
          label: 'Region',
          className: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        };
      case 'area':
        return {
          icon: <Check className="w-3 h-3 text-pink-600" />,
          label: 'Area',
          className: 'bg-pink-100 text-pink-800 border-pink-300',
        };
      case 'branch':
        return {
          icon: <Check className="w-3 h-3 text-orange-600" />,
          label: 'Branch',
          className: 'bg-orange-100 text-orange-800 border-orange-300',
        };
    }
  };

  const config = getScopeConfig(scope);
  const scopes: ScopeType[] = ['own', 'team', 'organization', 'country', 'region', 'area', 'branch'];

  if (!interactive || !onScopeChange) {
    return (
      <Badge variant="outline" className={cn('flex items-center gap-1 text-xs', config.className)}>
        {config.icon}
        <span>{config.label}</span>
      </Badge>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          'h-auto p-1 flex items-center gap-1 text-xs',
          config.className
        )}
      >
        {config.icon}
        <span>{config.label}</span>
        <ChevronDown className="w-3 h-3" />
      </Button>
      
      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 z-20 min-w-[120px]">
          {scopes.map((scopeOption) => {
            const optionConfig = getScopeConfig(scopeOption);
            return (
              <Button
                key={scopeOption}
                variant="ghost"
                size="sm"
                onClick={() => {
                  onScopeChange(scopeOption);
                  setShowDropdown(false);
                }}
                className={cn(
                  'w-full justify-start text-xs h-8',
                  scope === scopeOption && 'bg-muted'
                )}
              >
                <div className="flex items-center gap-2">
                  {optionConfig.icon}
                  <span className="capitalize">{optionConfig.label}</span>
                </div>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MobileRoleSheet({
  isOpen,
  onClose,
  role,
  resources,
  onSave,
  isLoading = false,
}: MobileRoleSheetProps) {
  const [formData, setFormData] = useState<RoleFormData>({
    name: role?.name || '',
    description: role?.description || '',
    priority: role?.priority || 3,
  });
  
  const [permissions, setPermissions] = useState<Role['permissions']>(role?.permissions || []);
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set(['users']));
  const [activeSection, setActiveSection] = useState<'basic' | 'permissions'>('basic');

  React.useEffect(() => {
    if (role) {
      setFormData({
        name: role.name,
        description: role.description || '',
        priority: role.priority,
      });
      setPermissions(role.permissions);
    } else {
      setFormData({
        name: '',
        description: '',
        priority: 3,
      });
      setPermissions([]);
    }
  }, [role]);

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
    return permissions.some(p => p.resourceId === resourceId && p.actionId === actionId);
  };

  const getPermissionScope = (resourceId: string, actionId: string) => {
    const permission = permissions.find(p => p.resourceId === resourceId && p.actionId === actionId);
    return permission?.scope || 'own';
  };

  const handlePermissionToggle = (resourceId: string, actionId: string) => {
    const enabled = !hasPermission(resourceId, actionId);
    setPermissions(prev => {
      if (enabled) {
        const filtered = prev.filter(p => !(p.resourceId === resourceId && p.actionId === actionId));
        return [...filtered, { resourceId, actionId, scope: 'own' }];
      } else {
        return prev.filter(p => !(p.resourceId === resourceId && p.actionId === actionId));
      }
    });
  };

  const handleScopeChange = (resourceId: string, actionId: string, newScope: ScopeType) => {
    setPermissions(prev => prev.map(p => 
      p.resourceId === resourceId && p.actionId === actionId
        ? { ...p, scope: newScope }
        : p
    ));
  };

  const handleSave = () => {
    onSave(formData, permissions);
  };

  const isFormValid = formData.name.trim().length >= 2 && permissions.length > 0;
  const totalPermissions = permissions.length;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {role ? 'Edit Role' : 'Create New Role'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Section Tabs */}
          <div className="flex gap-2 mb-4 flex-shrink-0">
            <Button
              variant={activeSection === 'basic' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSection('basic')}
              className="flex-1"
            >
              Basic Info
            </Button>
            <Button
              variant={activeSection === 'permissions' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSection('permissions')}
              className="flex-1"
            >
              Permissions ({totalPermissions})
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeSection === 'basic' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Role Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Role Name *</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter role name"
                        className="mt-1"
                      />
                      {formData.name.trim().length < 2 && formData.name.length > 0 && (
                        <p className="text-xs text-destructive mt-1">
                          Role name must be at least 2 characters
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium">Priority *</label>
                      <Select
                        value={formData.priority.toString()}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, priority: parseInt(value) }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 - High (Admin level)</SelectItem>
                          <SelectItem value="2">2 - Medium (Manager level)</SelectItem>
                          <SelectItem value="3">3 - Low (User level)</SelectItem>
                          <SelectItem value="4">4 - Minimal (Read-only)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Lower numbers have higher priority
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe what this role can do..."
                        className="mt-1 resize-none"
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Optional description to help identify this role's purpose
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Permission Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-4">
                      <div className="text-2xl font-bold text-primary">{totalPermissions}</div>
                      <div className="text-sm text-muted-foreground">Total Permissions</div>
                    </div>
                    
                    {totalPermissions === 0 && (
                      <div className="text-center py-4 border border-dashed rounded-lg">
                        <p className="text-sm text-muted-foreground">
                          No permissions assigned yet
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveSection('permissions')}
                          className="mt-2"
                        >
                          Add Permissions
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === 'permissions' && (
              <div className="space-y-3">
                {resources.map((resource) => {
                  const Icon = resource.icon;
                  const isExpanded = expandedResources.has(resource.id);
                  const resourcePermissions = permissions.filter(p => p.resourceId === resource.id);
                  
                  return (
                    <Card key={resource.id}>
                      <Collapsible
                        open={isExpanded}
                        onOpenChange={() => toggleResourceExpansion(resource.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 pb-3">
                            <CardTitle className="flex items-center justify-between text-base">
                              <div className="flex items-center gap-2">
                                {Icon && <Icon className="w-4 h-4 text-primary" />}
                                <span>{resource.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {resourcePermissions.length}/{resource.actions.length}
                                </Badge>
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
                            <div className="space-y-3">
                              {resource.actions.map((action) => {
                                const hasAccess = hasPermission(resource.id, action.id);
                                const scope = getPermissionScope(resource.id, action.id);
                                
                                return (
                                  <div
                                    key={action.id}
                                    className="flex items-center justify-between p-3 border rounded-lg"
                                  >
                                    <div className="flex items-center gap-3 flex-1">
                                      <Checkbox
                                        checked={hasAccess}
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
                                      <ScopeIndicator
                                        scope={scope}
                                        onScopeChange={(newScope) => handleScopeChange(resource.id, action.id, newScope)}
                                        interactive={true}
                                      />
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
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 pt-4 border-t">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {isFormValid ? (
                  `Ready to ${role ? 'update' : 'create'} role`
                ) : (
                  'Complete the form and assign permissions'
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!isFormValid || isLoading}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isLoading ? 'Saving...' : role ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}