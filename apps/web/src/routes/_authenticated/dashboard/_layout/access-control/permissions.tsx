import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Search, Shield, Settings, Users, Database, FileText, Edit, Trash2, MoreVertical, Loader2 } from 'lucide-react';
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
import { client } from '@/utils/orpc';
import { useQuery } from '@tanstack/react-query';
import { useUserContext } from '@/hooks/useUserContext';

export const Route = createFileRoute('/_authenticated/dashboard/_layout/access-control/permissions')({
  beforeLoad: async () => {
    await requirePermission(
      { resource: 'role_management', action: 'read' },
      '/dashboard'
    );
  },
  component: PermissionManagementPage,
});

/** Map resource identifiers to display-friendly names */
function formatResourceName(resource: string): string {
	return resource
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** Map action identifiers to display-friendly names */
function formatActionName(action: string): string {
	const map: Record<string, string> = {
		create: 'Create',
		read: 'View',
		update: 'Edit',
		delete: 'Delete',
		export: 'Export',
		import: 'Import',
		approve: 'Approve',
		reject: 'Reject',
		transfer: 'Transfer',
	};
	return map[action] || action.charAt(0).toUpperCase() + action.slice(1);
}

/** Map resource identifiers to icons */
const RESOURCE_ICON_MAP: Record<string, typeof Shield> = {
	user_management: Users,
	role_management: Shield,
	hierarchy_management: Database,
	reports: FileText,
	inventory_management: Settings,
};

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
  const { data: userContext } = useUserContext();
  const organizationId = userContext?.currentOrganizationId ?? null;

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ['permissions', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      return client.permissions.list({ organizationId });
    },
    enabled: !!organizationId,
  });

  // Group flat permission records into PermissionResource objects
  const resources = useMemo<PermissionResource[]>(() => {
    const grouped = new Map<string, PermissionResource>();

    for (const perm of permissions) {
      let resource = grouped.get(perm.resource);
      if (!resource) {
        resource = {
          id: perm.resource,
          name: formatResourceName(perm.resource),
          description: `${formatResourceName(perm.resource)} permissions`,
          icon: RESOURCE_ICON_MAP[perm.resource] || Shield,
          actions: [],
        };
        grouped.set(perm.resource, resource);
      }
      resource.actions.push({
        id: perm.action,
        name: formatActionName(perm.action),
        description: perm.description ?? undefined,
      });
    }

    return Array.from(grouped.values());
  }, [permissions]);

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

  const handleDeleteResource = (_resourceId: string) => {
    // TODO: Wire to API when delete endpoint is available
  };

  const handleDuplicateResource = (_resource: PermissionResource) => {
    // TODO: Wire to API when create endpoint is available
  };

  const handleSaveResource = (_resourceData: any) => {
    // TODO: Wire to API when create/update endpoint is available
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
      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 mx-auto text-muted-foreground mb-4 animate-spin" />
              <p className="text-muted-foreground">Loading permissions...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
