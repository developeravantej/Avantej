import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Shield, Save, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { PermissionGroupCollapsible } from '../permission-cards/PermissionGroupCollapsible';
import type { Role, PermissionResource } from '../permission-matrix/PermissionMatrix';

const roleFormSchema = z.object({
  name: z.string().min(2, 'Role name must be at least 2 characters').max(50, 'Role name must be less than 50 characters'),
  description: z.string().max(200, 'Description must be less than 200 characters').optional(),
  priority: z.number().min(1, 'Priority must be at least 1').max(10, 'Priority must be at most 10'),
});

type RoleFormData = z.infer<typeof roleFormSchema>;

interface RoleEditorProps {
  role?: Role;
  resources: PermissionResource[];
  initialPermissions?: Role['permissions'];
  onSave?: (roleData: RoleFormData, permissions: Role['permissions']) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  className?: string;
}

// Mock resources for UI development
const MOCK_RESOURCES: PermissionResource[] = [
  {
    id: 'users',
    name: 'Users',
    description: 'User management and access control',
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
    actions: [
      { id: 'create', name: 'Create', description: 'Create new branches' },
      { id: 'read', name: 'View', description: 'View branch data' },
      { id: 'update', name: 'Edit', description: 'Edit branch information' },
    ],
  },
];

export function RoleEditor({
  role,
  resources = MOCK_RESOURCES,
  initialPermissions,
  onSave,
  onCancel,
  isLoading = false,
  className,
}: RoleEditorProps) {
  const isMobile = useIsMobile();
  const [permissions, setPermissions] = useState<Role['permissions']>(
    role?.permissions ?? initialPermissions ?? [],
  );
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set(['users']));

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: role?.name || '',
      description: role?.description || '',
      priority: role?.priority || 3,
    },
  });

  const handlePermissionChange = (resourceId: string, actionId: string, enabled: boolean, scope: 'own' | 'team' | 'organization' | 'country' | 'region' | 'area' | 'branch' | null = 'own') => {
    setPermissions(prev => {
      if (enabled && scope) {
        // Remove existing permission for this resource/action combo first
        const filtered = prev.filter(p => !(p.resourceId === resourceId && p.actionId === actionId));
        // Add new permission
        return [...filtered, { resourceId, actionId, scope }];
      } else {
        // Remove permission
        return prev.filter(p => !(p.resourceId === resourceId && p.actionId === actionId));
      }
    });
  };

  const handleBulkPermissionChange = (resourceId: string, actionIds: string[], enabled: boolean) => {
    setPermissions(prev => {
      if (enabled) {
        // Remove existing permissions for these actions first
        const filtered = prev.filter(p => !(p.resourceId === resourceId && actionIds.includes(p.actionId)));
        // Add new permissions with default scope
        const newPermissions = actionIds.map(actionId => ({
          resourceId,
          actionId,
          scope: 'own' as const,
        }));
        return [...filtered, ...newPermissions];
      } else {
        // Remove permissions
        return prev.filter(p => !(p.resourceId === resourceId && actionIds.includes(p.actionId)));
      }
    });
  };

  const toggleResourceExpansion = (resourceId: string) => {
    const newExpanded = new Set(expandedResources);
    if (newExpanded.has(resourceId)) {
      newExpanded.delete(resourceId);
    } else {
      newExpanded.add(resourceId);
    }
    setExpandedResources(newExpanded);
  };

  const onSubmit = (data: RoleFormData) => {
    onSave?.(data, permissions);
  };

  const getTotalPermissions = () => {
    return permissions.length;
  };

  const isFormValid = form.formState.isValid && getTotalPermissions() > 0;

  return (
    <div className={cn('space-y-6', className)}>
      {isMobile ? (
        <div className="space-y-6 px-4">
          <div className="flex items-center gap-2">
            <Shield className="size-5" />
            <h3 className="text-lg font-semibold">
              {role ? 'Edit Role' : 'Create New Role'}
            </h3>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className={cn('grid gap-6', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter role name" {...field} />
                      </FormControl>
                      <FormDescription>
                        A unique name for this role
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 - High (Admin level)</SelectItem>
                          <SelectItem value="2">2 - Medium (Manager level)</SelectItem>
                          <SelectItem value="3">3 - Low (User level)</SelectItem>
                          <SelectItem value="4">4 - Minimal (Read-only)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Lower numbers have higher priority (1 = highest)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what this role can do..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional description to help identify this role's purpose
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">Permissions</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure what this role can access and modify
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-sm">
                    {getTotalPermissions()} total permissions
                  </Badge>
                </div>

                {getTotalPermissions() === 0 && (
                  <Alert>
                    <AlertTriangle className="size-4" />
                    <AlertDescription>
                      This role has no permissions assigned. Users with this role won't be able to access any features.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  {resources.map((resource) => (
                    <PermissionGroupCollapsible
                      key={resource.id}
                      resource={resource}
                      rolePermissions={permissions}
                      onPermissionChange={(actionId, enabled, scope) =>
                        handlePermissionChange(resource.id, actionId, enabled, scope)
                      }
                      onBulkChange={(actionIds, enabled) =>
                        handleBulkPermissionChange(resource.id, actionIds, enabled)
                      }
                      isExpanded={expandedResources.has(resource.id)}
                      onToggleExpanded={() => toggleResourceExpansion(resource.id)}
                      showBulkActions={true}
                    />
                  ))}
                </div>
              </div>

              <Separator />

              <div className={cn(
                "flex gap-4",
                isMobile ? "flex-col space-y-4" : "items-center justify-between"
              )}>
                <div className="text-sm text-muted-foreground">
                  {isFormValid ? (
                    `Ready to ${role ? 'update' : 'create'} role with ${getTotalPermissions()} permissions`
                  ) : (
                    'Complete the form and assign at least one permission to continue'
                  )}
                </div>
                
                <div className={cn(
                  "flex gap-2",
                  isMobile ? "flex-col-reverse" : "items-center"
                )}>
                  {onCancel && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      disabled={isLoading}
                      className={isMobile ? "w-full" : ""}
                    >
                      <X className="size-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={!isFormValid || isLoading}
                    className={cn(
                      "min-w-[120px]",
                      isMobile && "w-full"
                    )}
                  >
                    <Save className="size-4 mr-2" />
                    {isLoading ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5" />
              {role ? 'Edit Role' : 'Create New Role'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className={cn('grid gap-6', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter role name" {...field} />
                        </FormControl>
                        <FormDescription>
                          A unique name for this role
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 - High (Admin level)</SelectItem>
                            <SelectItem value="2">2 - Medium (Manager level)</SelectItem>
                            <SelectItem value="3">3 - Low (User level)</SelectItem>
                            <SelectItem value="4">4 - Minimal (Read-only)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Lower numbers have higher priority (1 = highest)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe what this role can do..."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional description to help identify this role's purpose
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Permissions</h3>
                      <p className="text-sm text-muted-foreground">
                        Configure what this role can access and modify
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {getTotalPermissions()} total permissions
                    </Badge>
                  </div>

                  {!isFormValid && getTotalPermissions() === 0 && (
                    <Alert>
                      <AlertTriangle className="size-4" />
                      <AlertDescription>
                        At least one permission must be assigned to create this role.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-4">
                    {resources.map((resource) => (
                      <PermissionGroupCollapsible
                        key={resource.id}
                        resource={resource}
                        rolePermissions={permissions.filter(p => p.resourceId === resource.id)}
                        onPermissionChange={(actionId, enabled, scope) =>
                          handlePermissionChange(resource.id, actionId, enabled, scope)
                        }
                        onBulkChange={(actionIds, enabled) =>
                          handleBulkPermissionChange(resource.id, actionIds, enabled)
                        }
                        isExpanded={expandedResources.has(resource.id)}
                        onToggleExpanded={() => toggleResourceExpansion(resource.id)}
                        showBulkActions={true}
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                <div className={cn(
                  "flex gap-4",
                  isMobile ? "flex-col space-y-4" : "items-center justify-between"
                )}>
                  <div className="text-sm text-muted-foreground">
                    {isFormValid ? (
                      `Ready to ${role ? 'update' : 'create'} role with ${getTotalPermissions()} permissions`
                    ) : (
                      'Complete the form and assign at least one permission to continue'
                    )}
                  </div>
                  
                  <div className={cn(
                    "flex gap-2",
                    isMobile ? "flex-col-reverse" : "items-center"
                  )}>
                    {onCancel && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={isLoading}
                        className={isMobile ? "w-full" : ""}
                      >
                        <X className="size-4 mr-2" />
                        Cancel
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={!isFormValid || isLoading}
                      className={cn(
                        "min-w-[120px]",
                        isMobile && "w-full"
                      )}
                    >
                      <Save className="size-4 mr-2" />
                      {isLoading ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}