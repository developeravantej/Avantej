import { columns } from "@/components/tables/branch/view/columns";
import DataTable from "@/components/tables/branch/view/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useAuth } from "@/hooks/useAuth";
import { useUserContext } from "@/hooks/useUserContext";
import { client, queryClient } from "@/utils/orpc";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Store } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { MemberReassignment } from "@/components/branch/member-reassignment";
import { MemberSelector } from "@/components/branch/member-selector";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/branch/view"
)({
  component: RouteComponent,
});

type HierarchyNode = {
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId: string | null;
  code?: string | null;
};

/** Shape of items returned by mapBranchesWithHierarchy and stored in branchData.items */
type BranchItem = {
  id: string;
  name: string;
  code: string;
  state_id: string | null;
  organization_id: string | null;
  branch_type: string;
  is_active: boolean;
  created_at: Date | null;
  updated_at: Date | null;
  address: string | null;
  picUserId: string | null;
  person_in_charge: { name: string; email: string };
  state: { name: string; country: { name: string } };
  location: { address: string };
};

function RouteComponent() {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: userContext, isLoading: isLoadingContext, error: _userContextError } = useUserContext();
  const navigate = useNavigate();
  const orgErrorShown = useRef(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<{
    id: string;
    name: string;
    address: string | null;
    picUserId: string | null;
    stateId: string | null;
  } | null>(null);
  const [editBranchName, setEditBranchName] = useState("");
  const [editBranchAddress, setEditBranchAddress] = useState("");
  const [editBranchPicUserId, setEditBranchPicUserId] = useState("");
  const [editBranchCountryId, setEditBranchCountryId] = useState<string>("");
  const [editBranchStateId, setEditBranchStateId] = useState<string>("");
  const [allHierarchyNodes, setAllHierarchyNodes] = useState<HierarchyNode[]>([]);

  // Get organizationId from React Query data (single source of truth).
  // Only use for API calls when it's a valid UUID (server rejects e.g. mock "org-1").
  const rawOrgId =
    userContext?.currentOrganizationId ||
    user?.current_organization_id ||
    user?.organizations?.[0]?.id ||
    null;
  const organizationId =
    rawOrgId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawOrgId)
      ? rawOrgId
      : null;

  // Computed values for cascading dropdowns
  const countries = useMemo(
    () =>
      allHierarchyNodes.filter((n) => n.type === "country" && n.depth === 1),
    [allHierarchyNodes]
  );

  const states = useMemo(
    () =>
      allHierarchyNodes.filter(
        (n) =>
          n.type === "state" &&
          n.depth === 2 &&
          n.parentId === editBranchCountryId
      ),
    [allHierarchyNodes, editBranchCountryId]
  );

  // Use React Query to load all hierarchy nodes (for cascading dropdowns)
  const { data: hierarchyNodesData, error: _hierarchyNodesError } = useQuery({
    queryKey: ["hierarchy-nodes", organizationId],
    queryFn: async (): Promise<{ nodes: HierarchyNode[] }> => {
      if (!organizationId) return { nodes: [] };

      // Try cached first
      const cachedHierarchy = localStorage.getItem(
        `org_${organizationId}_hierarchy`
      );
      if (cachedHierarchy) {
        try {
          const hierarchy = JSON.parse(cachedHierarchy);
          return { nodes: hierarchy.nodes || [] };
        } catch (e) {
          console.warn("Failed to parse cached hierarchy:", e);
        }
      }

      // Fetch from API
      const result = await client.hierarchy.listNodes({ organizationId });

      // Cache the result
      if (result.nodes && result.nodes.length > 0) {
        localStorage.setItem(
          `org_${organizationId}_hierarchy`,
          JSON.stringify({
            nodes: result.nodes,
          })
        );
      }

      return result;
    },
    enabled: !!organizationId && isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
    retry: 2,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Fetch members to resolve PIC user IDs to human-readable names
  const { data: membersData = [] } = useQuery({
    queryKey: ["members", organizationId],
    queryFn: () => client.members.list({ organizationId: organizationId! }),
    enabled: !!organizationId && isAuthenticated,
  });

  // Build a map from userId -> { name, email } for fast PIC lookup
  const memberByUserId = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    membersData.forEach((m: { userId: string; name?: string; email?: string }) => {
      map.set(m.userId, { name: m.name || "Unknown", email: m.email || "N/A" });
    });
    return map;
  }, [membersData]);

  // Update allHierarchyNodes state when hierarchyNodesData changes
  useEffect(() => {
    if (hierarchyNodesData?.nodes) {
      setAllHierarchyNodes(hierarchyNodesData.nodes);
    }
  }, [hierarchyNodesData]);

  // Helper function to build hierarchy lookup and map branches
  const mapBranchesWithHierarchy = useCallback(
    (
      allNodes: Array<{
        id: string;
        name: string;
        type: string;
        depth: number;
        parentId: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
        address?: string | null;
        picUserId?: string | null;
      }>,
      currentUser: { name: string | null; email: string } | null,
      orgId: string | null
    ) => {
      // Build lookup map: nodeId -> node
      const nodeMap = new Map<string, (typeof allNodes)[0]>();
      allNodes.forEach((node) => {
        nodeMap.set(node.id, node);
      });

      // Filter branches and map with hierarchy
      // Get all nodes with type="branch" (include any depth to avoid data loss)
      const branchNodes = allNodes.filter((node) => node.type === "branch");
      const branches = branchNodes;

      return branches.map((branch) => {
        // Find parent nodes by traversing up the hierarchy
        const stateNode = branch.parentId ? nodeMap.get(branch.parentId) : null;
        const countryNode = stateNode?.parentId
          ? nodeMap.get(stateNode.parentId)
          : null;

        // Get PIC info - resolve picUserId to name/email via the members list
        const picUserId = branch.picUserId;
        const picInfo = picUserId
          ? memberByUserId.get(picUserId) ?? { name: "Unknown", email: "N/A" }
          : {
              name: currentUser?.name || "N/A",
              email: currentUser?.email || "N/A",
            };

        return {
          id: branch.id,
          name: branch.name,
          // `code` is not yet returned by listNodes — default to empty string
          code: (branch as { code?: string }).code ?? "",
          state_id: branch.parentId,
          organization_id: orgId,
          branch_type: "standard",
          is_active: true,
          created_at: branch.createdAt,
          updated_at: branch.updatedAt,
          // Store raw data for editing
          address: branch.address ?? null,
          picUserId: picUserId ?? null,
          // Map to expected column structure
          person_in_charge: picInfo,
          state: {
            name: stateNode?.name ?? "N/A",
            country: {
              name: countryNode?.name ?? "N/A",
            },
          },
          location: {
            address: branch.address ?? "N/A",
          },
        };
      });
    },
    [organizationId, memberByUserId]
  );

  // Use React Query for branch data
  const {
    data: branchData,
    isLoading: isLoadingBranches,
    error,
  } = useQuery({
    queryKey: ["branches", organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return { items: [] };
      }

      // Get current user info for PIC (use userContext which has more reliable data)
      const currentUser =
        userContext?.user || user
          ? {
              name:
                userContext?.user?.name ||
                user?.full_name ||
                user?.email ||
                null,
              email: userContext?.user?.email || user?.email || "",
            }
          : null;

      // Try cached hierarchy first (but prefer fresh data on page load)
      // Only use cache if it's recent (less than 30 seconds old)
      const cachedHierarchy = localStorage.getItem(
        `org_${organizationId}_hierarchy`
      );
      const cacheTimestamp = localStorage.getItem(
        `org_${organizationId}_hierarchy_timestamp`
      );
      
      if (cachedHierarchy && cacheTimestamp) {
        const cacheAge = Date.now() - parseInt(cacheTimestamp, 10);
        const maxCacheAge = 30 * 1000; // 30 seconds
        
        if (cacheAge < maxCacheAge) {
          try {
            const hierarchy = JSON.parse(cachedHierarchy);
            const allNodes = hierarchy.nodes || [];
            const mappedBranches = mapBranchesWithHierarchy(
              allNodes,
              currentUser,
              organizationId
            );

            // If cache has no branches, fall through to fetch fresh data
            if (mappedBranches.length > 0) {
              return { items: mappedBranches };
            }
            localStorage.removeItem(`org_${organizationId}_hierarchy`);
            localStorage.removeItem(`org_${organizationId}_hierarchy_timestamp`);
          } catch {
            localStorage.removeItem(`org_${organizationId}_hierarchy`);
            localStorage.removeItem(`org_${organizationId}_hierarchy_timestamp`);
          }
        } else {
          localStorage.removeItem(`org_${organizationId}_hierarchy`);
          localStorage.removeItem(`org_${organizationId}_hierarchy_timestamp`);
        }
      }

      // Fallback to API
      const result = await client.hierarchy.listNodes({ organizationId });

      if (!result.nodes || result.nodes.length === 0) {
        // Clear stale cache
        localStorage.removeItem(`org_${organizationId}_hierarchy`);
        return { items: [] };
      }

      const mappedBranches = mapBranchesWithHierarchy(
        result.nodes,
        currentUser,
        organizationId
      );

      // Cache the hierarchy data for future use
      localStorage.setItem(
        `org_${organizationId}_hierarchy`,
        JSON.stringify({
          nodes: result.nodes,
        })
      );
      localStorage.setItem(
        `org_${organizationId}_hierarchy_timestamp`,
        Date.now().toString()
      );

      return { items: mappedBranches };
    },
    enabled: !!organizationId && isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds - shorter to ensure fresh data
    retry: 2,
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnMount: true, // Always refetch on mount
  });

  // Show error only once when we're sure there's no organization (after loading completes)
  useEffect(() => {
    if (
      !organizationId &&
      !isLoadingContext &&
      !authLoading &&
      !orgErrorShown.current
    ) {
      orgErrorShown.current = true;
      toast.error(
        "No organization selected. Please ensure you have access to an organization."
      );
    } else if (organizationId) {
      // Reset flag if organization becomes available
      orgErrorShown.current = false;
    }
  }, [organizationId, isLoadingContext, authLoading]);

  // Handle API errors
  useEffect(() => {
    if (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (
        errorMessage.includes("UNAUTHORIZED") ||
        errorMessage.includes("Not authenticated")
      ) {
        toast.error("Please log in to access this page");
        navigate({ to: "/login", search: {} });
      } else {
        toast.error(`Failed to load branches: ${errorMessage}`);
      }
    }
  }, [error, navigate]);

  // Update mutation
  const updateMutation = useApiMutation({
    mutationFn: async ({
      branchId,
      name,
      address,
      picUserId,
    }: {
      branchId: string;
      name?: string;
      address?: string | null;
      picUserId?: string | null;
    }) => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      return await client.hierarchy.updateNode({
        organizationId,
        nodeId: branchId,
        name,
        address,
        picUserId,
      });
    },
    successMessage: false,
    errorMessage: (err) => {
      const errorMessage = err.message || "Unknown error";
      if (errorMessage.includes("already exists")) {
        return `Failed to update branch: ${errorMessage}`;
      }
      if (errorMessage.includes("not found")) {
        return "Branch not found";
      }
      if (
        errorMessage.includes("Permission denied") ||
        errorMessage.includes("FORBIDDEN")
      ) {
        return "You don't have permission to update this branch";
      }
      return `Failed to update branch: ${errorMessage}`;
    },
    invalidate: [
      ["branches", organizationId],
      ["user-context"],
    ],
    onSuccess: () => {
      localStorage.removeItem(`org_${organizationId}_hierarchy`);
    },
  });

  // Move mutation
  const moveMutation = useApiMutation({
    mutationFn: async ({
      branchId,
      newStateId,
    }: {
      branchId: string;
      newStateId: string;
    }) => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      return await client.hierarchy.moveNode({
        organizationId,
        nodeId: branchId,
        newParentId: newStateId,
      });
    },
    successMessage: false,
    errorMessage: (err) => {
      const errorMessage = err.message || "Unknown error";
      if (errorMessage.includes("circular reference")) {
        return "Cannot move branch: would create circular reference";
      }
      if (errorMessage.includes("already exists")) {
        return "A branch with this name already exists in the selected state";
      }
      if (
        errorMessage.includes("Invalid parent type") ||
        errorMessage.includes("depth mismatch")
      ) {
        return "Invalid move: parent type mismatch";
      }
      if (errorMessage.includes("not found")) {
        return "Branch or state not found";
      }
      if (
        errorMessage.includes("Permission denied") ||
        errorMessage.includes("FORBIDDEN")
      ) {
        return "You don't have permission to move this branch";
      }
      return `Failed to move branch: ${errorMessage}`;
    },
    invalidate: [
      ["branches", organizationId],
      ["user-context"],
    ],
    onSuccess: () => {
      localStorage.removeItem(`org_${organizationId}_hierarchy`);
    },
  });

  // Delete mutation
  const deleteMutation = useApiMutation({
    mutationFn: async (branchId: string) => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      return await client.hierarchy.deleteNode({
        organizationId,
        nodeId: branchId,
      });
    },
    successMessage: "Branch deleted successfully",
    errorMessage: (err) => {
      const errorMessage = err.message || "Unknown error";
      if (errorMessage.includes("child node")) {
        return "Cannot delete branch: It has child nodes. Please delete or move them first.";
      }
      if (errorMessage.includes("assigned member")) {
        return "Cannot delete branch: It has assigned members. Please reassign them first.";
      }
      if (errorMessage.includes("not found")) {
        return "Branch not found";
      }
      if (
        errorMessage.includes("Permission denied") ||
        errorMessage.includes("FORBIDDEN")
      ) {
        return "You don't have permission to delete this branch";
      }
      return `Failed to delete branch: ${errorMessage}`;
    },
    invalidate: [
      ["branches", organizationId],
      ["user-context"],
    ],
    onSuccess: () => {
      localStorage.removeItem(`org_${organizationId}_hierarchy`);
    },
  });

  // Edit handler - open dialog
  const handleEdit = useCallback(
    (branch: BranchItem) => {
      if (!branch.id || !branch.name) {
        toast.error("Invalid branch data");
        return;
      }

      // Use hierarchyNodesData directly if available, otherwise fallback to allHierarchyNodes state
      const hierarchyNodes: HierarchyNode[] =
        (hierarchyNodesData?.nodes as HierarchyNode[] | undefined) ||
        allHierarchyNodes;
      
      if (!hierarchyNodes || hierarchyNodes.length === 0) {
        toast.error("Branch hierarchy not found. Please wait for data to load.");
        return;
      }

      // Find current hierarchy position from hierarchy nodes
      const branchNode = hierarchyNodes.find((n) => n.id === branch.id);
      if (!branchNode) {
        // Fallback: try to use branch's state_id if available
        if (branch.state_id) {
          const currentState = hierarchyNodes.find((n) => n.id === branch.state_id);
          if (currentState) {
            const currentCountry = currentState.parentId
              ? hierarchyNodes.find((n) => n.id === currentState.parentId)
              : null;

            setEditingBranch({
              id: branch.id,
              name: branch.name,
              address: branch.address || null,
              picUserId: branch.picUserId || null,
              stateId: branch.state_id || null,
            });
            setEditBranchName(branch.name);
            setEditBranchAddress(branch.address || "");
            setEditBranchPicUserId(branch.picUserId || "");
            setEditBranchCountryId(currentCountry?.id || "");
            setEditBranchStateId(currentState?.id || "");
            setIsEditDialogOpen(true);
            return;
          }
        }
        toast.error("Branch node not found in hierarchy");
        return;
      }

      // Find current state, country by traversing up the hierarchy
      const currentState = branchNode.parentId
        ? hierarchyNodes.find((n) => n.id === branchNode.parentId)
        : null;
      const currentCountry = currentState?.parentId
        ? hierarchyNodes.find((n) => n.id === currentState.parentId)
        : null;

      setEditingBranch({
        id: branch.id,
        name: branch.name,
        address: branch.address || null,
        picUserId: branch.picUserId || null,
        stateId: branchNode.parentId || null,
      });
      setEditBranchName(branch.name);
      setEditBranchAddress(branch.address || "");
      setEditBranchPicUserId(branch.picUserId || "");
      setEditBranchCountryId(currentCountry?.id || "");
      setEditBranchStateId(currentState?.id || "");
      setIsEditDialogOpen(true);
    },
    [allHierarchyNodes, hierarchyNodesData]
  );

  // Handle edit dialog submit
  const handleEditSubmit = useCallback(async () => {
    if (!editingBranch) return;

    const trimmedName = editBranchName.trim();
    const trimmedAddress = editBranchAddress.trim();
    const trimmedPicUserId = editBranchPicUserId.trim();

    // Validate required fields
    if (trimmedName === "") {
      toast.error("Branch name cannot be empty");
      return;
    }

    if (!editBranchStateId) {
      toast.error("Please select a state");
      return;
    }

    // Check what changed
    const nameChanged = trimmedName !== editingBranch.name;
    const addressChanged = trimmedAddress !== (editingBranch.address || "");
    const picUserIdChanged =
      trimmedPicUserId !== (editingBranch.picUserId || "");
    const stateChanged = editBranchStateId !== (editingBranch.stateId || "");

    if (!nameChanged && !addressChanged && !picUserIdChanged && !stateChanged) {
      toast.info("No changes made");
      setIsEditDialogOpen(false);
      return;
    }

    try {
      // Update name/address/picUserId if changed
      if (nameChanged || addressChanged || picUserIdChanged) {
        const updateParams: {
          branchId: string;
          name?: string;
          address?: string | null;
          picUserId?: string | null;
        } = {
          branchId: editingBranch.id,
        };

        if (nameChanged) updateParams.name = trimmedName;
        if (addressChanged) updateParams.address = trimmedAddress || null;
        if (picUserIdChanged) updateParams.picUserId = trimmedPicUserId || null;

        await updateMutation.mutateAsync(updateParams);
      }

      // Move branch if state changed
      if (stateChanged) {
        await moveMutation.mutateAsync({
          branchId: editingBranch.id,
          newStateId: editBranchStateId,
        });
      }

      // Success - close dialog and reset state
      setIsEditDialogOpen(false);
      setEditingBranch(null);
      setEditBranchName("");
      setEditBranchAddress("");
      setEditBranchPicUserId("");
      setEditBranchCountryId("");
      setEditBranchStateId("");
      toast.success("Branch updated successfully");
    } catch (err: unknown) {
      // Error handling is done in mutation onError callbacks
      // Just log here for debugging
      console.error("Failed to update branch:", err instanceof Error ? err.message : String(err));
    }
  }, [
    editingBranch,
    editBranchName,
    editBranchAddress,
    editBranchPicUserId,
    editBranchStateId,
    updateMutation,
    moveMutation,
  ]);

  // Delete handler
  const handleDelete = useCallback(
    (branchId: string) => {
      deleteMutation.mutate(branchId);
    },
    [deleteMutation]
  );

  // NOW we can do conditional returns - all hooks have been called
  // Show loading state properly
  if (authLoading || isLoadingContext || isLoadingBranches) {
    return (
      <div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
        <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
          <div className="size-8 border-2 border-current rounded-full animate-spin border-r-transparent">
            <span className="sr-only">Loading…</span>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (useAuth will handle redirect)
  if (!isAuthenticated) {
    return null;
  }

  const items: BranchItem[] = (branchData?.items ?? []) as BranchItem[];
  const totalBranches = items.length;
  const activeBranches = items.filter((b) => b.is_active !== false).length;
  const uniqueStates = new Set(items.flatMap((b) => (b.state?.name ? [b.state.name] : []))).size;
  const assignedPic = items.filter((b) => b.picUserId).length;

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
      {/* Fixed header */}
      <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Store className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Branches</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Hierarchy nodes and branch locations
            </p>
          </div>
        </div>
        <Link to="/dashboard/branch/create">
          <Button className="flex items-center gap-2">
            <Plus className="size-4" />
            Create Branch
          </Button>
        </Link>
      </div>

      {/* Scroll region */}
      <div className="min-h-0 flex-1 overflow-auto p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">Total Branches</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{totalBranches}</div>
            <div className="text-xs text-muted-foreground">in organization</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{activeBranches}</div>
            <div className="text-xs text-muted-foreground">branches</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">States</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{uniqueStates}</div>
            <div className="text-xs text-muted-foreground">top-level states</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">PIC Assigned</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{assignedPic}</div>
            <div className="text-xs text-muted-foreground">branches with PIC</div>
          </div>
        </div>

        {/* Empty State */}
        {items.length === 0 && (
          <EmptyState
            title="No branches found"
            description={
              organizationId
                ? "Create your first branch to get started."
                : "Please ensure you're logged in and have an organization selected."
            }
            action={
              organizationId
                ? { label: "Create Branch", onClick: () => navigate({ to: "/dashboard/branch/create" }) }
                : undefined
            }
          />
        )}

        {/* Data Table */}
        {items.length > 0 && (
          <DataTable
            columns={columns as ColumnDef<BranchItem>[]}
            data={items}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

      {/* Edit Branch Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => !open && setIsEditDialogOpen(false)}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Branch</DialogTitle>
          </DialogHeader>
                  <div className="space-y-4">
                    {/* Branch Name */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-name">Branch Name *</Label>
                      <Input
                        id="branch-name"
                        value={editBranchName}
                        onChange={(e) => setEditBranchName(e.target.value)}
                        placeholder="Enter branch name"
                      />
                    </div>

                    {/* Country Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-country">Country *</Label>
                      <Select
                        value={editBranchCountryId}
                        onValueChange={(value) => {
                          setEditBranchCountryId(value);
                          setEditBranchStateId(""); // Reset state when country changes
                        }}
                      >
                        <SelectTrigger id="branch-country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.id} value={country.id}>
                              {country.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* State Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-state">State *</Label>
                      <Select
                        value={editBranchStateId}
                        onValueChange={(value) => {
                          setEditBranchStateId(value);
                        }}
                        disabled={!editBranchCountryId}
                      >
                        <SelectTrigger id="branch-state">
                          <SelectValue
                            placeholder={
                              editBranchCountryId
                                ? "Select state"
                                : "Select country first"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((state) => (
                            <SelectItem key={state.id} value={state.id}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!editBranchCountryId && (
                        <p className="text-xs text-muted-foreground">
                          Please select a country first
                        </p>
                      )}
                    </div>

                    {/* Address */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-address">Address</Label>
                      <Input
                        id="branch-address"
                        value={editBranchAddress}
                        onChange={(e) => setEditBranchAddress(e.target.value)}
                        placeholder="Enter branch address"
                      />
                    </div>

                    {/* PIC User ID */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-pic">
                        Person In Charge
                      </Label>
                      {organizationId ? (
                        <MemberSelector
                          organizationId={organizationId}
                          value={editBranchPicUserId}
                          onChange={setEditBranchPicUserId}
                          placeholder="Select Person In Charge"
                          allowClear={true}
                          disabled={updateMutation.isPending || moveMutation.isPending}
                        />
                      ) : (
                        <Input
                          id="branch-pic"
                          value={editBranchPicUserId}
                          onChange={(e) => setEditBranchPicUserId(e.target.value)}
                          placeholder="Enter user ID for Person In Charge"
                          disabled
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Select the person in charge for this branch from the organization members.
                      </p>
                    </div>

                    {/* Members Section */}
                    {editingBranch?.id && organizationId && (
                      <div className="pt-4 border-t">
                        <MemberReassignment
                          branchId={editingBranch.id}
                          organizationId={organizationId}
                          allBranches={allHierarchyNodes.filter(
                            (node) => node.type === "branch"
                          )}
                          picUserId={editBranchPicUserId || editingBranch.picUserId || null}
                          onReassigned={() => {
                            // Invalidate queries to refresh data
                            queryClient.invalidateQueries({
                              queryKey: ["branches", organizationId],
                            });
                            queryClient.invalidateQueries({
                              queryKey: ["user-context"],
                            });
                            queryClient.invalidateQueries({
                              queryKey: ["branch-members", organizationId, editingBranch.id],
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingBranch(null);
                setEditBranchName("");
                setEditBranchAddress("");
                setEditBranchPicUserId("");
                setEditBranchCountryId("");
                setEditBranchStateId("");
              }}
              disabled={
                updateMutation.isPending || moveMutation.isPending
              }
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={
                !editBranchName.trim() ||
                !editBranchStateId ||
                updateMutation.isPending ||
                moveMutation.isPending
              }
            >
              {updateMutation.isPending || moveMutation.isPending
                ? "Saving..."
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
