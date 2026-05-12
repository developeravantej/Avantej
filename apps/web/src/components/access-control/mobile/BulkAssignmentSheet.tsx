import React, { useState } from 'react';
import { Users, Shield, Save, X, Check, AlertTriangle, UserPlus, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, IconAvatar } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { Role } from '../permission-matrix/PermissionMatrix';

interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  department?: string;
  isActive: boolean;
}

interface BulkAssignmentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedUsers: User[];
  availableRoles: Role[];
  onSave: (assignments: BulkAssignment[]) => void;
  isLoading?: boolean;
}

interface BulkAssignment {
  userId: string;
  action: 'add' | 'remove' | 'replace';
  roleIds: string[];
}

type AssignmentMode = 'add' | 'remove' | 'replace';

export function BulkAssignmentSheet({
  isOpen,
  onClose,
  selectedUsers,
  availableRoles,
  onSave,
  isLoading = false,
}: BulkAssignmentSheetProps) {
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('add');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [previewMode, setPreviewMode] = useState(false);

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
  };

  const handleSelectAllRoles = (selected: boolean) => {
    if (selected) {
      setSelectedRoles(new Set(availableRoles.map(role => role.id)));
    } else {
      setSelectedRoles(new Set());
    }
  };

  const getPreviewForUser = (user: User): string[] => {
    const currentRoles = new Set(user.roles);
    const rolesToModify = selectedRoles;

    switch (assignmentMode) {
      case 'add':
        return Array.from(new Set([...currentRoles, ...rolesToModify]));
      case 'remove':
        return user.roles.filter(roleId => !rolesToModify.has(roleId));
      case 'replace':
        return Array.from(rolesToModify);
      default:
        return user.roles;
    }
  };

  const getUsersWithChanges = () => {
    return selectedUsers.filter(user => {
      const currentRoles = user.roles.sort();
      const newRoles = getPreviewForUser(user).sort();
      return JSON.stringify(currentRoles) !== JSON.stringify(newRoles);
    });
  };

  const handleSave = () => {
    const assignments: BulkAssignment[] = selectedUsers.map(user => ({
      userId: user.id,
      action: assignmentMode,
      roleIds: Array.from(selectedRoles),
    }));
    
    onSave(assignments);
  };

  const getRoleName = (roleId: string) => {
    return availableRoles.find(role => role.id === roleId)?.name || roleId;
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-red-100 text-red-800 border-red-300';
      case 2: return 'bg-orange-100 text-orange-800 border-orange-300';
      case 3: return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-brand-secondary-3 text-brand-primary-1 border-brand-secondary-3';
    }
  };

  const getModeConfig = (mode: AssignmentMode) => {
    switch (mode) {
      case 'add':
        return {
          icon: <UserPlus className="w-4 h-4" />,
          title: 'Add Roles',
          description: 'Add selected roles to users (keeps existing roles)',
          variant: 'default' as const,
        };
      case 'remove':
        return {
          icon: <UserMinus className="w-4 h-4" />,
          title: 'Remove Roles',
          description: 'Remove selected roles from users',
          variant: 'destructive' as const,
        };
      case 'replace':
        return {
          icon: <Shield className="w-4 h-4" />,
          title: 'Replace Roles',
          description: 'Replace all user roles with selected roles',
          variant: 'secondary' as const,
        };
    }
  };

  const usersWithChanges = getUsersWithChanges();
  const isFormValid = selectedRoles.size > 0;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Bulk Role Assignment ({selectedUsers.length} users)
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Mode Selection */}
          <div className="flex-shrink-0 mb-4">
            <div className="text-sm font-medium mb-2">Assignment Mode</div>
            <div className="grid grid-cols-1 gap-2">
              {(['add', 'remove', 'replace'] as AssignmentMode[]).map((mode) => {
                const config = getModeConfig(mode);
                return (
                  <Button
                    key={mode}
                    variant={assignmentMode === mode ? config.variant : 'outline'}
                    size="sm"
                    onClick={() => setAssignmentMode(mode)}
                    className="justify-start h-auto p-3"
                  >
                    <div className="flex items-center gap-3">
                      {config.icon}
                      <div className="text-left">
                        <div className="font-medium">{config.title}</div>
                        <div className="text-xs opacity-70">{config.description}</div>
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Content Tabs */}
          <div className="flex gap-2 mb-4 flex-shrink-0">
            <Button
              variant={!previewMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewMode(false)}
              className="flex-1"
            >
              Select Roles ({selectedRoles.size})
            </Button>
            <Button
              variant={previewMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewMode(true)}
              className="flex-1"
              disabled={selectedRoles.size === 0}
            >
              Preview Changes ({usersWithChanges.length})
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {!previewMode ? (
              <div className="space-y-4">
                {/* Role Selection Header */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Select roles to {assignmentMode}
                      </span>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedRoles.size === availableRoles.length}
                          onCheckedChange={handleSelectAllRoles}
                        />
                        <span className="text-sm text-muted-foreground">
                          Select All
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Role List */}
                <div className="space-y-2">
                  {availableRoles.map(role => (
                    <Card key={role.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedRoles.has(role.id)}
                            onCheckedChange={() => handleRoleToggle(role.id)}
                          />
                          <div>
                            <div className="font-medium text-sm">{role.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {role.description}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', getPriorityColor(role.priority))}
                        >
                          Priority {role.priority}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Preview Summary */}
                {usersWithChanges.length === 0 ? (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      No changes will be made with the current selection.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <Check className="h-4 w-4" />
                    <AlertDescription>
                      {usersWithChanges.length} user(s) will have their roles modified.
                    </AlertDescription>
                  </Alert>
                )}

                {/* User Changes */}
                <div className="space-y-3">
                  {selectedUsers.map(user => {
                    const currentRoles = user.roles;
                    const newRoles = getPreviewForUser(user);
                    const hasChanges = JSON.stringify(currentRoles.sort()) !== JSON.stringify(newRoles.sort());

                    return (
                      <Card key={user.id} className={cn(!hasChanges && 'opacity-60')}>
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <IconAvatar fallback={user.name.slice(0, 2)} />
                              </Avatar>
                              <div className="flex-1">
                                <div className="font-medium text-sm">{user.name}</div>
                                <div className="text-xs text-muted-foreground">{user.email}</div>
                              </div>
                              {hasChanges && (
                                <Badge variant="secondary" className="text-xs">
                                  Modified
                                </Badge>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div>
                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                  Current Roles
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {currentRoles.length > 0 ? (
                                    currentRoles.map(roleId => (
                                      <Badge key={roleId} variant="outline" className="text-xs">
                                        {getRoleName(roleId)}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No roles</span>
                                  )}
                                </div>
                              </div>

                              {hasChanges && (
                                <div>
                                  <div className="text-xs font-medium text-muted-foreground mb-1">
                                    New Roles
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {newRoles.length > 0 ? (
                                      newRoles.map(roleId => (
                                        <Badge
                                          key={roleId}
                                          variant={currentRoles.includes(roleId) ? 'outline' : 'default'}
                                          className="text-xs"
                                        >
                                          {getRoleName(roleId)}
                                        </Badge>
                                      ))
                                    ) : (
                                      <span className="text-xs text-muted-foreground">No roles</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 pt-4 border-t">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {isFormValid ? (
                  `${usersWithChanges.length} user(s) will be modified`
                ) : (
                  'Select at least one role to continue'
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
                  disabled={!isFormValid || usersWithChanges.length === 0 || isLoading}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isLoading ? 'Saving...' : `Apply Changes (${usersWithChanges.length})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}