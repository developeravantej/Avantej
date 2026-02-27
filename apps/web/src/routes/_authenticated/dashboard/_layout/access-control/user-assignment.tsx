import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

type MemberApiItem = Awaited<ReturnType<typeof client.members.list>>[number];
type RoleApiItem = Awaited<ReturnType<typeof client.roles.list>>[number];
import {
  Search,
  Users,
  Shield,
  UserPlus,
  MoreVertical,
  Edit,
  Trash2,
  Mail,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useUserAssignment } from "@/hooks/useUserAssignment";
import type { UserForAssignment, RoleResponse } from "@/types/user-assignment";
import { toast } from "sonner";
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/access-control/user-assignment"
)({
  beforeLoad: async () => {
    await requirePermission(
      { resource: "user_management", action: "read" },
      "/dashboard"
    );
    await requirePermission(
      { resource: "role_management", action: "read" },
      "/dashboard"
    );
  },
  component: UserAssignmentPage,
});

interface UserCardProps {
  user: UserForAssignment;
  roles: RoleResponse[];
  onEditRoles: () => void;
  onDeactivate: () => void;
  onSelect?: (selected: boolean) => void;
  isSelected?: boolean;
  isLoading?: boolean;
}

function UserCard({
  user,
  roles,
  onEditRoles,
  onDeactivate,
  onSelect,
  isSelected,
  isLoading,
}: UserCardProps) {
  const userRoles = roles.filter((role) => user.roles.includes(role.id));
  const highestRole = userRoles.reduce(
    (highest, current) =>
      current.priority < highest.priority ? current : highest,
    userRoles[0]
  );

  const formatLastLogin = (dateString?: string) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return "bg-red-100 text-red-800 border-red-300";
      case 2:
        return "bg-orange-100 text-orange-800 border-orange-300";
      case 3:
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:shadow-md",
        !user.isActive && "opacity-60",
        isSelected && "ring-2 ring-primary ring-offset-2"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {onSelect && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                className="mt-1"
              />
            )}
            <Avatar className="w-10 h-10">
              <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{user.name}</CardTitle>
                {!user.isActive && (
                  <Badge variant="secondary" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Mail className="w-3 h-3" />
                <span>{user.email}</span>
              </div>
              {user.department && (
                <div className="text-xs text-muted-foreground">
                  {user.department} Department
                </div>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={onEditRoles}
                className="cursor-pointer"
              >
                <Shield className="w-4 h-4 mr-2" />
                Edit Roles
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Edit className="w-4 h-4 mr-2" />
                Edit User
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDeactivate}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {user.isActive ? "Deactivate" : "Activate"} User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {highestRole && (
            <Badge
              variant="outline"
              className={cn("text-xs", getPriorityColor(highestRole.priority))}
            >
              {highestRole.name}
            </Badge>
          )}
          {userRoles.length > 1 && (
            <Badge variant="secondary" className="text-xs">
              +{userRoles.length - 1} more
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last Login</span>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span>{formatLastLogin(user.lastLogin)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-medium text-muted-foreground">
              Assigned Roles
            </span>
            <div className="flex flex-wrap gap-1">
              {userRoles.map((role) => (
                <Badge key={role.id} variant="outline" className="text-xs">
                  {role.name}
                </Badge>
              ))}
              {userRoles.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No roles assigned
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface RoleAssignmentSheetProps {
  user: UserForAssignment | null;
  roles: RoleResponse[];
  onSave: (userRoles: string[]) => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
  isLoading?: boolean;
}

function RoleAssignmentSheet({
  user,
  roles,
  onSave,
  onClose,
  isOpen,
  isLoading,
}: RoleAssignmentSheetProps) {
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(user?.roles || [])
  );

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    try {
      await onSave(Array.from(selectedRoles));
      onClose();
    } catch (error) {
      console.error('Failed to save roles:', error);
    }
  };

  useEffect(() => {
    setSelectedRoles(new Set(user?.roles || []));
  }, [user]);

  const isMobile = useIsMobile();

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Assign Roles to {user?.name}</SheetTitle>
        </SheetHeader>

        <div className="p-4 mt-6 space-y-4">
          <div className="space-y-3">
            {roles.map((role) => (
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
                  <Badge variant="outline" className="text-xs">
                    Priority {role.priority}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface InviteUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  roles: RoleResponse[];
  onInvite: (email: string, name: string, selectedRoles: string[]) => Promise<void>;
  isLoading?: boolean;
}

function InviteUserDialog({
  isOpen,
  onClose,
  roles,
  onInvite,
  isLoading,
}: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();

  const handleRoleToggle = (roleId: string) => {
    setSelectedRoles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
  };

  const handleSubmit = async () => {
    if (!email || !name) {
      toast.error("Please fill in all required fields");
      return;
    }

    await onInvite(email, name, Array.from(selectedRoles));
    
    // Reset form
    setEmail("");
    setName("");
    setSelectedRoles(new Set());
  };

  const handleClose = () => {
    setEmail("");
    setName("");
    setSelectedRoles(new Set());
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Invite User</SheetTitle>
        </SheetHeader>

        <div className="p-4 mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="Enter user name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              placeholder="Enter user email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Assign Roles (Optional)</label>
            <div className="space-y-3">
              {roles.map((role) => (
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
                    <Badge variant="outline" className="text-xs">
                      Priority {role.priority}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Invitation"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UserAssignmentPage() {
  const isMobile = useIsMobile();
  const { data: userContext } = useUserContext();
  const organizationId = userContext?.currentOrganizationId ?? null;

  const { data: membersApiData = [], isLoading: membersLoading } = useQuery({
    queryKey: ["members", organizationId],
    queryFn: (): Promise<Awaited<ReturnType<typeof client.members.list>>> => {
      if (!organizationId) return Promise.resolve([]);
      return client.members.list({ organizationId });
    },
    enabled: !!organizationId,
  });

  const { data: rolesApiData = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles", organizationId],
    queryFn: (): Promise<Awaited<ReturnType<typeof client.roles.list>>> => {
      if (!organizationId) return Promise.resolve([]);
      return client.roles.list({ organizationId });
    },
    enabled: !!organizationId,
  });

  const isLoading = membersLoading || rolesLoading;

  const roles: RoleResponse[] = (rolesApiData as RoleApiItem[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    priority: r.priority,
  }));

  const initialUsers: UserForAssignment[] = (membersApiData as MemberApiItem[]).map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    roles: [],
    isActive: m.status === "active",
  }));

  const [users, setUsers] = useState<UserForAssignment[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setUsers(initialUsers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersApiData]);
  
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<UserForAssignment | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.department?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole =
      roleFilter === "all" ||
      user.roles.includes(roleFilter) ||
      (roleFilter === "none" && user.roles.length === 0);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && user.isActive) ||
      (statusFilter === "inactive" && !user.isActive);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleUserSelect = (userId: string, selected: boolean) => {
    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(userId);
      } else {
        newSet.delete(userId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedUsers(new Set(filteredUsers.map((user) => user.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const handleEditUserRoles = (user: UserForAssignment) => {
    setEditingUser(user);
  };

  const handleSaveUserRoles = async (userRoles: string[]) => {
    if (editingUser) {
      setIsSaving(true);
      try {
        // TODO: Replace with actual API call
        // const result = await assignRolesToUser(editingUser.id, userRoles);
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Update local state
        setUsers(prev => prev.map(u => 
          u.id === editingUser.id ? { ...u, roles: userRoles } : u
        ));
        
        toast.success(`Successfully updated roles for ${editingUser.name}`);
        setEditingUser(null);
      } catch (error) {
        toast.error('Failed to update user roles');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    setIsSaving(true);
    try {
      // TODO: Replace with actual API call
      // const result = await toggleUserStatus(userId);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, isActive: !u.isActive } : u
      ));
      
      const user = users.find(u => u.id === userId);
      toast.success(`Successfully ${user?.isActive ? 'deactivated' : 'activated'} user`);
    } catch (error) {
      toast.error('Failed to update user status');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInviteUser = async (email: string, name: string, selectedRoles: string[]) => {
    setIsSaving(true);
    try {
      // TODO: Replace with actual API call
      // await inviteUser(email, name, selectedRoles);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast.success(`Invitation sent to ${email}`);
      setShowInviteDialog(false);
    } catch (error) {
      toast.error('Failed to send invitation');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = selectedUsers.size;
  const allSelected =
    selectedCount === filteredUsers.length && filteredUsers.length > 0;
  const someSelected =
    selectedCount > 0 && selectedCount < filteredUsers.length;

  const getActiveUserCount = () => users.filter((user) => user.isActive).length;
  const getUsersWithoutRoles = () =>
    users.filter((user) => user.roles.length === 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Role Assignment</h1>
          <p className="text-muted-foreground">
            Assign roles and permissions to users
          </p>
        </div>

        <Button onClick={() => setShowInviteDialog(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{users.length}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{getActiveUserCount()}</div>
              <div className="text-sm text-muted-foreground">Active Users</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{getUsersWithoutRoles()}</div>
              <div className="text-sm text-muted-foreground">No Roles</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{roles.length}</div>
              <div className="text-sm text-muted-foreground">
                Available Roles
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="none">No Roles</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedCount} selected</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Bulk Assign Role</DropdownMenuItem>
                    <DropdownMenuItem>Bulk Remove Role</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      Deactivate Selected
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Bulk Selection */}
          {filteredUsers.length > 0 && (
            <div className="flex items-center gap-2 mt-4">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                {allSelected
                  ? "Deselect all"
                  : someSelected
                  ? `${selectedCount} selected`
                  : "Select all"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Grid */}
      <div
        className={cn(
          "grid gap-4",
          isMobile ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
        )}
      >
        {filteredUsers.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            roles={roles}
            isSelected={selectedUsers.has(user.id)}
            onSelect={(selected) => handleUserSelect(user.id, selected)}
            onEditRoles={() => handleEditUserRoles(user)}
            onDeactivate={() => handleDeactivateUser(user.id)}
            isLoading={isSaving}
          />
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No users found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || roleFilter !== "all" || statusFilter !== "all"
                  ? "No users match your current filters."
                  : "Get started by inviting your first user."}
              </p>
              {!searchQuery &&
                roleFilter === "all" &&
                statusFilter === "all" && (
                  <Button>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite User
                  </Button>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Assignment Sheet */}
      <RoleAssignmentSheet
        user={editingUser}
        roles={roles}
        onSave={handleSaveUserRoles}
        onClose={() => setEditingUser(null)}
        isOpen={!!editingUser}
        isLoading={isSaving}
      />

      {/* Invite User Dialog */}
      <InviteUserDialog
        isOpen={showInviteDialog}
        onClose={() => setShowInviteDialog(false)}
        roles={roles}
        onInvite={handleInviteUser}
        isLoading={isSaving}
      />
      
      {isLoading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
}
