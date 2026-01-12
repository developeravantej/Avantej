import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Search, Shield, Settings, Users, Database, FileText, Edit, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { PermissionEditor } from '@/components/access-control/editors/PermissionEditor';
import type { PermissionResource } from '@/components/access-control/permission-matrix/PermissionMatrix';
import { requirePermission } from '@/lib/route-guards';

export const Route = createFileRoute('/_authenticated/dashboard/_layout/access-control/permissions')({
  beforeLoad: async () => {
    await requirePermission(
      { resource: 'role_management', action: 'read' },
      '/dashboard'
    );
  },
  component: PermissionManagementPage,
});

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
    icon: Shield,
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
      { id: 'delete', name: 'Delete', description: 'Delete branches' },
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
      { id: 'create', name: 'Create', description: 'Create custom reports' },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'Product and stock management',
    icon: Settings,
    actions: [
      { id: 'create', name: 'Create', description: 'Add new products' },
      { id: 'read', name: 'View', description: 'View inventory data' },
      { id: 'update', name: 'Edit', description: 'Update product information' },
      { id: 'delete', name: 'Delete', description: 'Remove products' },
      { id: 'transfer', name: 'Transfer', description: 'Transfer stock between locations' },
    ],
  },
];

interface ResourceCardProps {
  resource: PermissionResource;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function ResourceCard({ resource, onEdit, onDelete, onDuplicate }: ResourceCardProps) {
  const Icon = resource.icon || Shield;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1 flex-1">
              <CardTitle className="text-base">{resource.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {resource.description}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                <Edit className="w-4 h-4 mr-2" />
                Edit Resource
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer">
                <Shield className="w-4 h-4 mr-2" />
                Duplicate Resource
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Resource
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {resource.actions.length} actions
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Available Actions</div>
          <div className="flex flex-wrap gap-1">
            {resource.actions.map((action) => (
              <Badge key={action.id} variant="outline" className="text-xs">
                {action.name}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PermissionManagementPage() {
  const isMobile = useIsMobile();
  const [resources, setResources] = useState<PermissionResource[]>(MOCK_RESOURCES);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingResource, setEditingResource] = useState<PermissionResource | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const filteredResources = resources.filter(resource =>
    resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resource.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    resource.actions.some(action => 
      action.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const handleEditResource = (resource: PermissionResource) => {
    setEditingResource(resource);
    setIsCreating(false);
  };

  const handleCreateResource = () => {
    setEditingResource(null);
    setIsCreating(true);
  };

  const handleDeleteResource = (resourceId: string) => {
    setResources(prev => prev.filter(resource => resource.id !== resourceId));
  };

  const handleDuplicateResource = (resource: PermissionResource) => {
    const newResource: PermissionResource = {
      ...resource,
      id: Math.random().toString(36).substr(2, 9),
      name: `${resource.name} Copy`,
    };
    setResources(prev => [...prev, newResource]);
  };

  const handleSaveResource = (resourceData: any) => {
    if (editingResource) {
      setResources(prev => prev.map(resource =>
        resource.id === editingResource.id
          ? { ...resource, ...resourceData }
          : resource
      ));
    } else {
      const newResource: PermissionResource = {
        id: Math.random().toString(36).substr(2, 9),
        icon: Shield,
        ...resourceData,
      };
      setResources(prev => [...prev, newResource]);
    }
    setEditingResource(null);
    setIsCreating(false);
  };

  const getTotalActions = () => {
    return resources.reduce((total, resource) => total + resource.actions.length, 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Permission Management</h1>
          <p className="text-muted-foreground">
            Define and manage permission resources and actions
          </p>
        </div>
        
        <Sheet open={isCreating || !!editingResource} onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false);
            setEditingResource(null);
          }
        }}>
          <SheetTrigger asChild>
            <Button onClick={handleCreateResource}>
              <Plus className="w-4 h-4 mr-2" />
              Create Resource
            </Button>
          </SheetTrigger>
          <SheetContent side={isMobile ? 'bottom' : 'right'} className="sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>
                {editingResource ? 'Edit Permission Resource' : 'Create New Permission Resource'}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <PermissionEditor
                resource={editingResource || undefined}
                onSave={handleSaveResource}
                onCancel={() => {
                  setIsCreating(false);
                  setEditingResource(null);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{resources.length}</div>
              <div className="text-sm text-muted-foreground">Resources</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{getTotalActions()}</div>
              <div className="text-sm text-muted-foreground">Total Actions</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {resources.length > 0 ? Math.round(getTotalActions() / resources.length) : 0}
              </div>
              <div className="text-sm text-muted-foreground">Avg Actions/Resource</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="py-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search resources or actions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Resource Grid */}
      <div className={cn(
        'grid gap-4',
        isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
      )}>
        {filteredResources.map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            onEdit={() => handleEditResource(resource)}
            onDelete={() => handleDeleteResource(resource.id)}
            onDuplicate={() => handleDuplicateResource(resource)}
          />
        ))}
      </div>

      {filteredResources.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No resources found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? 'No resources match your search criteria.'
                  : 'Get started by creating your first permission resource.'}
              </p>
              {!searchQuery && (
                <Button onClick={handleCreateResource}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Resource
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
