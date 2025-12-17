import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { client, queryClient } from "@/utils/orpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Users, Plus, Loader2, UserCheck, Shield } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";

interface Member {
  id: string;
  userId: string;
  role: string;
  status: string;
  hierarchyScopeId: string;
  joinedAt: Date | string;
  name?: string;
  email?: string;
}

interface MemberWithDetails {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  hierarchyScopeId: string;
  joinedAt: Date | string;
}

interface HierarchyNode {
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId?: string | null;
  code?: string | null;
}

interface MemberReassignmentProps {
  branchId: string;
  organizationId: string;
  allBranches?: HierarchyNode[]; // Optional - component uses its own hierarchyNodes query
  picUserId?: string | null;
  onReassigned?: () => void;
}

export function MemberReassignment({
  branchId,
  organizationId,
  allBranches,
  picUserId,
  onReassigned,
}: MemberReassignmentProps) {
  const [reassigningMemberId, setReassigningMemberId] = useState<string | null>(null);
  const [assigningMemberId, setAssigningMemberId] = useState<string | null>(null);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);

  // Fetch members assigned to this branch
  const { data: membersData, isLoading, refetch } = useQuery({
    queryKey: ["branch-members", organizationId, branchId],
    queryFn: async () => {
      return await client.hierarchy.listMembers({
        organizationId,
        hierarchyScopeId: branchId,
      });
    },
    enabled: !!branchId && !!organizationId,
  });

  // Fetch all organization members with user details
  const { data: allMembersData, isLoading: isLoadingAllMembers } = useQuery({
    queryKey: ["organization-members", organizationId],
    queryFn: async () => {
      return await client.hierarchy.listAllMembers({
        organizationId,
        includeInactive: false,
      });
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch hierarchy nodes to determine scope levels
  const { data: hierarchyNodesData } = useQuery({
    queryKey: ["hierarchy-nodes", organizationId],
    queryFn: async () => {
      return await client.hierarchy.listNodes({ organizationId });
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const assignedMembers = membersData?.members || [];
  const allMembers = allMembersData?.members || [];
  const hierarchyNodes = hierarchyNodesData?.nodes || [];

  // Create a map of hierarchyScopeId -> node info for quick lookup
  const hierarchyScopeMap = useMemo(() => {
    const map = new Map<string, { name: string; type: string; depth: number }>();
    hierarchyNodes.forEach((node) => {
      map.set(node.id, {
        name: node.name,
        type: node.type,
        depth: node.depth,
      });
    });
    return map;
  }, [hierarchyNodes]);

  // Get Person In Charge member details if picUserId is set
  const picMember = picUserId
    ? allMembers.find((m: MemberWithDetails) => m.userId === picUserId)
    : null;

  // Combine assigned members with PIC (if PIC is not already assigned)
  const displayMembers: Array<Member & { name?: string; email?: string; isPic?: boolean }> = [
    ...assignedMembers.map((m: Member) => {
      const memberWithDetails = allMembers.find(
        (am: MemberWithDetails) => am.userId === m.userId
      );
      return {
        ...m,
        name: memberWithDetails?.name,
        email: memberWithDetails?.email,
        isPic: m.userId === picUserId,
      };
    }),
    // Add PIC if not already in assigned members
    ...(picMember && !assignedMembers.find((m: Member) => m.userId === picUserId)
      ? [
          {
            id: picMember.id,
            userId: picMember.userId,
            name: picMember.name,
            email: picMember.email,
            role: picMember.role,
            status: picMember.status,
            hierarchyScopeId: picMember.hierarchyScopeId,
            joinedAt: picMember.joinedAt,
            isPic: true,
          },
        ]
      : []),
  ];

  // Get members not assigned to this branch (for assignment dropdown)
  const unassignedMembers = allMembers.filter(
    (m: MemberWithDetails) =>
      m.hierarchyScopeId !== branchId && m.status === "active"
  );

  // Reassign member mutation
  const reassignMutation = useMutation({
    mutationFn: async ({
      memberId,
      newHierarchyScopeId,
    }: {
      memberId: string;
      newHierarchyScopeId: string;
    }) => {
      return await client.hierarchy.reassignMember({
        organizationId,
        memberId,
        newHierarchyScopeId,
      });
    },
    onSuccess: () => {
      toast.success("Member reassigned successfully");
      refetch();
      onReassigned?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to reassign member: ${error.message}`);
    },
  });

  // Assign member to branch mutation
  const assignMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return await client.hierarchy.reassignMember({
        organizationId,
        memberId,
        newHierarchyScopeId: branchId,
      });
    },
    onSuccess: () => {
      toast.success("Member assigned to branch successfully");
      refetch();
      setShowAssignDropdown(false);
      onReassigned?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign member: ${error.message}`);
    },
  });

  const handleReassign = async (memberId: string, newBranchId: string) => {
    if (!newBranchId || newBranchId === branchId) {
      toast.error("Please select a different branch");
      return;
    }

    setReassigningMemberId(memberId);
    try {
      await reassignMutation.mutateAsync({
        memberId,
        newHierarchyScopeId: newBranchId,
      });
    } finally {
      setReassigningMemberId(null);
    }
  };

  const handleAssign = async (memberId: string) => {
    setAssigningMemberId(memberId);
    try {
      await assignMutation.mutateAsync(memberId);
    } finally {
      setAssigningMemberId(null);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "destructive";
      case "trainer":
        return "default";
      case "staff":
        return "secondary";
      case "client":
        return "outline";
      default:
        return "outline";
    }
  };

  // Get hierarchy scope info for a member
  const getHierarchyScopeInfo = (hierarchyScopeId: string) => {
    const scopeNode = hierarchyScopeMap.get(hierarchyScopeId);
    if (!scopeNode) return null;

    const scopeLabels: Record<string, string> = {
      organization: "Organization-wide",
      country: "Country-wide",
      region: "Region-wide",
      area: "Area-wide",
      branch: "Branch",
    };

    return {
      label: scopeLabels[scopeNode.type] || scopeNode.type,
      type: scopeNode.type,
      depth: scopeNode.depth,
      name: scopeNode.name,
    };
  };

  // Check if member has access to this branch (via hierarchy scope)
  const hasAccessToBranch = (member: Member | MemberWithDetails) => {
    const scopeInfo = getHierarchyScopeInfo(member.hierarchyScopeId);
    if (!scopeInfo) return false;

    // If assigned to this branch, has access
    if (member.hierarchyScopeId === branchId) return true;

    // If assigned to organization/country/region/area, they have access to all descendants
    // Check if this branch is under their scope by traversing up the hierarchy
    if (scopeInfo.depth < 4) {
      // Find the branch node in hierarchy
      const branchNode = hierarchyNodes.find((n) => n.id === branchId);
      if (!branchNode) return false;

      // Traverse up from branch to see if we reach the member's scope
      let currentNode: typeof branchNode | undefined = branchNode;
      while (currentNode) {
        if (currentNode.id === member.hierarchyScopeId) {
          return true; // Branch is under member's scope
        }
        // Move up to parent
        currentNode = currentNode.parentId
          ? hierarchyNodes.find((n) => n.id === currentNode!.parentId)
          : undefined;
      }
    }

    return false;
  };

  if (isLoading || isLoadingAllMembers) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">
            Assigned Members ({displayMembers.length})
            {picMember && (
              <span className="ml-2 text-xs text-muted-foreground">
                (including Person In Charge)
              </span>
            )}
          </h3>
        </div>
        {unassignedMembers.length > 0 && (
          <div className="relative">
            {showAssignDropdown ? (
              <Select
                onValueChange={(memberId) => {
                  handleAssign(memberId);
                }}
                onOpenChange={setShowAssignDropdown}
                disabled={assigningMemberId !== null}
              >
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Select member to assign..." />
                </SelectTrigger>
                <SelectContent>
                  {unassignedMembers.map((member: MemberWithDetails) => (
                    <SelectItem key={member.userId} value={member.id}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <span className="font-medium truncate">{member.name}</span>
                          <span className="text-muted-foreground truncate">
                            ({member.email})
                          </span>
                        </div>
                        <Badge
                          variant={getRoleBadgeVariant(member.role)}
                          className="text-xs ml-2 shrink-0"
                        >
                          {member.role}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button
                onClick={() => setShowAssignDropdown(true)}
                size="sm"
                variant="outline"
                disabled={assigningMemberId !== null}
              >
                <Plus className="h-4 w-4 mr-2" />
                Assign Member
              </Button>
            )}
            {assigningMemberId && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {displayMembers.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>No members assigned to this branch</p>
          {unassignedMembers.length > 0 && (
            <p className="mt-2 text-xs">
              Click "Assign Member" to add members to this branch
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayMembers.map((member) => {
            const isPic = member.isPic || member.userId === picUserId;
            const isActuallyAssigned = assignedMembers.some(
              (m: Member) => m.id === member.id
            );
            const isAdmin = member.role.toLowerCase() === "admin";
            const scopeInfo = getHierarchyScopeInfo(member.hierarchyScopeId);
            const hasAccess = hasAccessToBranch(member);
            const isOrgLevel = scopeInfo?.depth === 0;
            const isHigherLevel = scopeInfo && scopeInfo.depth < 4;

            return (
              <div
                key={member.id}
                className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                  isPic
                    ? "bg-blue-50/50 border-blue-200"
                    : "bg-card hover:bg-accent/50"
                }`}
              >
                <div className="flex-1 min-w-0 grid gap-1.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {member.name || `User ID: ${member.userId}`}
                    </span>
                    {member.email && (
                      <span className="text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isPic && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200"
                      >
                        <UserCheck className="h-3 w-3 mr-1" />
                        Person In Charge
                      </Badge>
                    )}
                    {isAdmin && (
                      <Badge
                        variant="destructive"
                        className="h-5 px-1.5 text-[10px] font-medium"
                      >
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    )}
                    {!isAdmin && (
                      <Badge
                        variant={getRoleBadgeVariant(member.role)}
                        className="h-5 px-1.5 text-[10px] capitalize"
                      >
                        {member.role}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`h-5 px-1.5 text-[10px] capitalize ${
                        member.status === "active"
                          ? "text-green-600 border-green-200 bg-green-50"
                          : "text-gray-500"
                      }`}
                    >
                      {member.status}
                    </Badge>
                    {scopeInfo && (
                      <Badge
                        variant="outline"
                        className={`h-5 px-1.5 text-[10px] ${
                          isOrgLevel
                            ? "text-purple-600 border-purple-200 bg-purple-50"
                            : isHigherLevel
                            ? "text-blue-600 border-blue-200 bg-blue-50"
                            : "text-gray-600"
                        }`}
                      >
                        {scopeInfo.label}
                      </Badge>
                    )}
                    {!isActuallyAssigned && !hasAccess && !isAdmin && (
                      <Badge
                        variant="destructive"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        Not Assigned
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-1">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {!isActuallyAssigned && isPic && !isAdmin && !hasAccess && (
                    <p className="text-[11px] font-medium text-destructive flex items-center">
                      <span className="w-1 h-1 rounded-full bg-destructive mr-1.5" />
                      Assign to branch to grant access
                    </p>
                  )}
                  {isAdmin && isOrgLevel && (
                    <p className="text-[11px] font-medium text-purple-600 flex items-center">
                      <Shield className="h-3 w-3 mr-1.5" />
                      Organization-wide access (all branches)
                    </p>
                  )}
                  {isAdmin && !isOrgLevel && scopeInfo && (
                    <p className="text-[11px] font-medium text-blue-600 flex items-center">
                      <Shield className="h-3 w-3 mr-1.5" />
                      Admin access to {scopeInfo.name} and all below
                    </p>
                  )}
                  {!isAdmin && hasAccess && !isActuallyAssigned && scopeInfo && (
                    <p className="text-[11px] font-medium text-blue-600 flex items-center">
                      <span className="w-1 h-1 rounded-full bg-blue-600 mr-1.5" />
                      Has access via {scopeInfo.name} scope
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {isActuallyAssigned ? (
                    <>
                      <Select
                        onValueChange={(newBranchId) =>
                          handleReassign(member.id, newBranchId)
                        }
                        disabled={reassigningMemberId === member.id}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Reassign to..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            // Use hierarchyNodes from component's own query instead of allBranches prop
                            const availableBranches = hierarchyNodes.filter(
                              (node) => node.type === "branch" && node.id !== branchId
                            );
                            
                            if (availableBranches.length === 0) {
                              return (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                  No other branches available
                                </div>
                              );
                            }
                            
                            return availableBranches.map((branch) => (
                              <SelectItem key={branch.id} value={branch.id}>
                                {branch.name}
                                {branch.code ? ` (${branch.code})` : ""}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                      {reassigningMemberId === member.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </>
                  ) : isAdmin && isOrgLevel ? (
                    <span className="text-xs text-muted-foreground italic">
                      Full access
                    </span>
                  ) : hasAccess && !isAdmin ? (
                    <span className="text-xs text-muted-foreground italic">
                      Has access
                    </span>
                  ) : (
                    <Button
                      onClick={() => handleAssign(member.id)}
                      size="sm"
                      variant="default"
                      disabled={assigningMemberId === member.id}
                    >
                      {assigningMemberId === member.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          Assigning...
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-2" />
                          Assign to Branch
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

