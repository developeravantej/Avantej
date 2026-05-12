import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Shield, Plus, Save, X, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { PermissionResource, PermissionAction } from '../permission-matrix/PermissionMatrix';

const permissionFormSchema = z.object({
  name: z.string().min(2, 'Resource name must be at least 2 characters').max(50, 'Resource name must be less than 50 characters'),
  description: z.string().max(200, 'Description must be less than 200 characters').optional(),
  actions: z.array(z.object({
    id: z.string().min(1, 'Action ID is required'),
    name: z.string().min(1, 'Action name is required'),
    description: z.string().optional(),
  })).min(1, 'At least one action is required'),
});

type PermissionFormData = z.infer<typeof permissionFormSchema>;

interface PermissionEditorProps {
  resource?: PermissionResource;
  onSave?: (resourceData: PermissionFormData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  className?: string;
}

interface ActionEditorProps {
  action: PermissionAction;
  onUpdate: (updatedAction: PermissionAction) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ActionEditor({ action, onUpdate, onRemove, canRemove }: ActionEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localAction, setLocalAction] = useState(action);

  const handleSave = () => {
    onUpdate(localAction);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalAction(action);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Action ID</label>
              <Input
                value={localAction.id}
                onChange={(e) => setLocalAction(prev => ({ ...prev, id: e.target.value }))}
                placeholder="e.g., create, read, update"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <Input
                value={localAction.name}
                onChange={(e) => setLocalAction(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Create, View, Edit"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={localAction.description || ''}
              onChange={(e) => setLocalAction(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this action allows users to do"
              className="mt-1 resize-none"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!localAction.id.trim() || !localAction.name.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {action.id}
            </Badge>
            <span className="font-medium">{action.name}</span>
          </div>
          {action.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {action.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="size-8 p-0"
          >
            <Settings className="size-3" />
          </Button>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="size-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// Common action templates
const ACTION_TEMPLATES = [
  { id: 'create', name: 'Create', description: 'Create new items' },
  { id: 'read', name: 'View', description: 'View existing items' },
  { id: 'update', name: 'Edit', description: 'Modify existing items' },
  { id: 'delete', name: 'Delete', description: 'Remove items' },
  { id: 'export', name: 'Export', description: 'Export data' },
  { id: 'import', name: 'Import', description: 'Import data' },
  { id: 'approve', name: 'Approve', description: 'Approve requests' },
  { id: 'reject', name: 'Reject', description: 'Reject requests' },
];

export function PermissionEditor({
  resource,
  onSave,
  onCancel,
  isLoading = false,
  className,
}: PermissionEditorProps) {
  const isMobile = useIsMobile();
  const [actions, setActions] = useState<PermissionAction[]>(
    resource?.actions || [
      { id: 'read', name: 'View', description: 'View items' }
    ]
  );
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());

  const form = useForm<PermissionFormData>({
    resolver: zodResolver(permissionFormSchema),
    defaultValues: {
      name: resource?.name || '',
      description: resource?.description || '',
      actions: actions,
    },
  });

  const addNewAction = () => {
    const newAction: PermissionAction = {
      id: '',
      name: '',
      description: '',
    };
    setActions(prev => [...prev, newAction]);
  };

  const addTemplateActions = () => {
    const templatesToAdd = ACTION_TEMPLATES.filter(template => 
      selectedTemplates.has(template.id) && 
      !actions.some(action => action.id === template.id)
    );
    
    setActions(prev => [...prev, ...templatesToAdd]);
    setSelectedTemplates(new Set());
  };

  const updateAction = (index: number, updatedAction: PermissionAction) => {
    setActions(prev => {
      const newActions = [...prev];
      newActions[index] = updatedAction;
      return newActions;
    });
  };

  const removeAction = (index: number) => {
    setActions(prev => prev.filter((_, i) => i !== index));
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
      }
      return newSet;
    });
  };

  const onSubmit = (data: PermissionFormData) => {
    onSave?.({
      ...data,
      actions: actions.filter(action => action.id.trim() && action.name.trim()),
    });
  };

  const validActions = actions.filter(action => action.id.trim() && action.name.trim());
  const isFormValid = form.formState.isValid && validActions.length > 0;

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5" />
            {resource ? 'Edit Permission Resource' : 'Create New Permission Resource'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className={cn('grid gap-6', isMobile ? 'grid-cols-1' : 'grid-cols-1')}>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Users, Orders, Products" {...field} />
                      </FormControl>
                      <FormDescription>
                        A unique name for this resource (e.g., Users, Orders)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe what this resource represents..."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Help users understand what this resource controls
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">Actions</h3>
                    <p className="text-sm text-muted-foreground">
                      Define what operations can be performed on this resource
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-sm">
                    {validActions.length} actions
                  </Badge>
                </div>

                {/* Template Actions */}
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Quick Add from Templates</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTemplateActions}
                        disabled={selectedTemplates.size === 0}
                      >
                        Add Selected ({selectedTemplates.size})
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {ACTION_TEMPLATES.map((template) => {
                        const isExisting = actions.some(action => action.id === template.id);
                        const isSelected = selectedTemplates.has(template.id);
                        
                        return (
                          <div
                            key={template.id}
                            className={cn(
                              'flex items-center space-x-2 p-2 border rounded cursor-pointer',
                              isExisting && 'opacity-50 cursor-not-allowed',
                              isSelected && !isExisting && 'bg-primary/10 border-primary'
                            )}
                            onClick={() => !isExisting && toggleTemplate(template.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              disabled={isExisting}
                              onChange={() => !isExisting && toggleTemplate(template.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {template.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {template.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                {/* Current Actions */}
                <div className="space-y-3">
                  {actions.map((action, index) => (
                    <ActionEditor
                      key={`${action.id}-${index}`}
                      action={action}
                      onUpdate={(updatedAction) => updateAction(index, updatedAction)}
                      onRemove={() => removeAction(index)}
                      canRemove={actions.length > 1}
                    />
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={addNewAction}
                  className="w-full"
                >
                  <Plus className="size-4 mr-2" />
                  Add Custom Action
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  {isFormValid ? (
                    `Ready to ${resource ? 'update' : 'create'} resource with ${validActions.length} actions`
                  ) : (
                    'Complete the form and define at least one action to continue'
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {onCancel && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      disabled={isLoading}
                    >
                      <X className="size-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={!isFormValid || isLoading}
                    className="min-w-[140px]"
                  >
                    <Save className="size-4 mr-2" />
                    {isLoading ? 'Saving...' : resource ? 'Update Resource' : 'Create Resource'}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}