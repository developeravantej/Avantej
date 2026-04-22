import { columns } from "@/components/tables/branch/view/columns";
import DataTable from "@/components/tables/branch/view/data-table";
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
import { useAuth } from "@/hooks/useAuth";
import { useUserContext } from "@/hooks/useUserContext";
import { client, queryClient } from "@/utils/orpc";
import { Dialog, Transition } from "@headlessui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  Fragment,
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

function RouteComponent() {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: userContext, isLoading: isLoadingContext, error: userContextError } = useUserContext();
  const navigate = useNavigate();
  const orgErrorShown = useRef(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<{
    id: string;
    name: string;
    address: string | null;
    picUserId: string | null;
    areaId: string | null;
  } | null>(null);
  const [editBranchName, setEditBranchName] = useState("");
  const [editBranchAddress, setEditBranchAddress] = useState("");
  const [editBranchPicUserId, setEditBranchPicUserId] = useState("");
  const [editBranchCountryId, setEditBranchCountryId] = useState<string>("");
  const [editBranchRegionId, setEditBranchRegionId] = useState<string>("");
  const [editBranchAreaId, setEditBranchAreaId] = useState<string>("");
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

  const regions = useMemo(
    () =>
      allHierarchyNodes.filter(
        (n) =>
          n.type === "region" &&
          n.depth === 2 &&
          n.parentId === editBranchCountryId
      ),
    [allHierarchyNodes, editBranchCountryId]
  );

  const areas = useMemo(
    () =>
      allHierarchyNodes.filter(
        (n) =>
          n.type === "area" &&
          n.depth === 3 &&
          n.parentId === editBranchRegionId
      ),
    [allHierarchyNodes, editBranchRegionId]
  );

  // Use React Query to load all hierarchy nodes (for cascading dropdowns)
  const { data: hierarchyNodesData, error: hierarchyNodesError } = useQuery({
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
        let areaNode = branch.parentId ? nodeMap.get(branch.parentId) : null;
        let regionNode = areaNode?.parentId
          ? nodeMap.get(areaNode.parentId)
          : null;
        let countryNode = regionNode?.parentId
          ? nodeMap.get(regionNode.parentId)
          : null;

        // Get PIC info - resolve picUserId to name/email via the members list
        const picUserId = (branch as any).picUserId;
        const picInfo = picUserId
          ? memberByUserId.get(picUserId) ?? { name: "Unknown", email: "N/A" }
          : {
              name: currentUser?.name || "N/A",
              email: currentUser?.email || "N/A",
            };

        return {
          id: branch.id,
          name: branch.name,
          code: (branch as any).code || "", // Code may not be in schema yet
          area_id: branch.parentId,
          organization_id: orgId,
          branch_type: "standard",
          is_active: true,
          created_at: branch.createdAt,
          updated_at: branch.updatedAt,
          // Store raw data for editing
          address: (branch as any).address || null,
          picUserId: picUserId || null,
          // Map to expected column structure
          person_in_charge: picInfo,
          area: {
            name: areaNode?.name || "N/A",
            region: {
              name: regionNode?.name || "N/A",
              country: {
                name: countryNode?.name || "N/A",
              },
            },
          },
          location: {
            address: (branch as any).address || "N/A",
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
          } catch (_e) {
            localStorage.removeItem(`org_${organizationId}_hierarchy`);
            localStorage.removeItem(`org_${organizationId}_hierarchy_timestamp`);
          }
        } else {
          localStorage.removeItem(`org_${organizationId}_hierarchy`);
          localStorage.removeItem(`org_${organizationId}_hierarchy_timestamp`);
        }
      }

      // Fallback to API
      try {
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
      } catch (apiError: any) {
        throw apiError; // Re-throw so React Query can handle it
      }
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
  const updateMutation = useMutation({
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
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["branches", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["user-context"] });
      localStorage.removeItem(`org_${organizationId}_hierarchy`);
    },
    onError: (error: Error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("already exists")) {
        toast.error(`Failed to update branch: ${errorMessage}`);
      } else if (errorMessage.includes("not found")) {
        toast.error("Branch not found");
      } else if (
        errorMessage.includes("Permission denied") ||
        errorMessage.includes("FORBIDDEN")
      ) {
        toast.error("You don't have permission to update this branch");
      } else {
        toast.error(`Failed to update branch: ${errorMessage}`);
      }
    },
  });

  // Move mutation
  const moveMutation = useMutation({
    mutationFn: async ({
      branchId,
      newAreaId,
    }: {
      branchId: string;
      newAreaId: string;
    }) => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      return await client.hierarchy.moveNode({
        organizationId,
        nodeId: branchId,
        newParentId: newAreaId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["user-context"] });
      localStorage.removeItem(`org_${organizationId}_hierarchy`);
    },
    onError: (error: Error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("circular reference")) {
        toast.error("Cannot move branch: would create circular reference");
      } else if (errorMessage.includes("already exists")) {
        toast.error(
          "A branch with this name already exists in the selected area"
        );
      } else if (
        errorMessage.includes("Invalid parent type") ||
        errorMessage.includes("depth mismatch")
      ) {
        toast.error("Invalid move: parent type mismatch");
      } else if (errorMessage.includes("not found")) {
        toast.error("Branch or area not found");
      } else if (
        errorMessage.includes("Permission denied") ||
        errorMessage.includes("FORBIDDEN")
      ) {
        toast.error("You don't have permission to move this branch");
      } else {
        toast.error(`Failed to move branch: ${errorMessage}`);
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (branchId: string) => {
      if (!organizationId) {
        throw new Error("Organization ID is required");
      }

      return await client.hierarchy.deleteNode({
        organizationId,
        nodeId: branchId,
      });
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["branches", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["user-context"] });
      localStorage.removeItem(`org_${organizationId}_hierarchy`);
      toast.success("Branch deleted successfully");
    },
    onError: (error: Error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("child node")) {
        toast.error(
          "Cannot delete branch: It has child nodes. Please delete or move them first."
        );
      } else if (errorMessage.includes("assigned member")) {
        toast.error(
          "Cannot delete branch: It has assigned members. Please reassign them first."
        );
      } else if (errorMessage.includes("not found")) {
        toast.error("Branch not found");
      } else if (
        errorMessage.includes("Permission denied") ||
        errorMessage.includes("FORBIDDEN")
      ) {
        toast.error("You don't have permission to delete this branch");
      } else {
        toast.error(`Failed to delete branch: ${errorMessage}`);
      }
    },
  });

  // Edit handler - open dialog
  const handleEdit = useCallback(
    (branch: any) => {
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
        // Fallback: try to use branch's area_id if available
        if (branch.area_id) {
          const currentArea = hierarchyNodes.find((n) => n.id === branch.area_id);
          if (currentArea) {
            const currentRegion = currentArea.parentId
              ? hierarchyNodes.find((n) => n.id === currentArea.parentId)
              : null;
            const currentCountry = currentRegion?.parentId
              ? hierarchyNodes.find((n) => n.id === currentRegion.parentId)
              : null;

            setEditingBranch({
              id: branch.id,
              name: branch.name,
              address: branch.address || null,
              picUserId: branch.picUserId || null,
              areaId: branch.area_id || null,
            });
            setEditBranchName(branch.name);
            setEditBranchAddress(branch.address || "");
            setEditBranchPicUserId(branch.picUserId || "");
            setEditBranchCountryId(currentCountry?.id || "");
            setEditBranchRegionId(currentRegion?.id || "");
            setEditBranchAreaId(currentArea?.id || "");
            setIsEditDialogOpen(true);
            return;
          }
        }
        toast.error("Branch node not found in hierarchy");
        return;
      }

      // Find current area, region, country by traversing up the hierarchy
      const currentArea = branchNode.parentId
        ? hierarchyNodes.find((n) => n.id === branchNode.parentId)
        : null;
      const currentRegion = currentArea?.parentId
        ? hierarchyNodes.find((n) => n.id === currentArea.parentId)
        : null;
      const currentCountry = currentRegion?.parentId
        ? hierarchyNodes.find((n) => n.id === currentRegion.parentId)
        : null;

      setEditingBranch({
        id: branch.id,
        name: branch.name,
        address: branch.address || null,
        picUserId: branch.picUserId || null,
        areaId: branchNode.parentId || null,
      });
      setEditBranchName(branch.name);
      setEditBranchAddress(branch.address || "");
      setEditBranchPicUserId(branch.picUserId || "");
      setEditBranchCountryId(currentCountry?.id || "");
      setEditBranchRegionId(currentRegion?.id || "");
      setEditBranchAreaId(currentArea?.id || "");
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

    if (!editBranchAreaId) {
      toast.error("Please select an area");
      return;
    }

    // Check what changed
    const nameChanged = trimmedName !== editingBranch.name;
    const addressChanged = trimmedAddress !== (editingBranch.address || "");
    const picUserIdChanged =
      trimmedPicUserId !== (editingBranch.picUserId || "");
    const areaChanged = editBranchAreaId !== (editingBranch.areaId || "");

    if (!nameChanged && !addressChanged && !picUserIdChanged && !areaChanged) {
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

      // Move branch if area changed
      if (areaChanged) {
        await moveMutation.mutateAsync({
          branchId: editingBranch.id,
          newAreaId: editBranchAreaId,
        });
      }

      // Success - close dialog and reset state
      setIsEditDialogOpen(false);
      setEditingBranch(null);
      setEditBranchName("");
      setEditBranchAddress("");
      setEditBranchPicUserId("");
      setEditBranchCountryId("");
      setEditBranchRegionId("");
      setEditBranchAreaId("");
      toast.success("Branch updated successfully");
    } catch (error: any) {
      // Error handling is done in mutation onError callbacks
      // Just log here for debugging
      console.error("Failed to update branch:", error);
    }
  }, [
    editingBranch,
    editBranchName,
    editBranchAddress,
    editBranchPicUserId,
    editBranchAreaId,
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
      <div className="flex items-center justify-center min-h-96">
        <div className="w-8 h-8 border-2 border-current rounded-full animate-spin border-r-transparent">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (useAuth will handle redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Branches</h1>
          <p className="text-brand-secondary-1">Manage your organization's branches</p>
        </div>
        <Link to="/dashboard/branch/create">
          <Button className="flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Branch</span>
          </Button>
        </Link>
      </div>

      
      {/* Empty State */}
      {!isLoadingBranches && branchData?.items?.length === 0 && (
        <div className="py-12 text-center border border-brand-secondary-3 rounded-lg bg-brand-secondary-3/50">
          <p className="text-lg font-medium text-brand-primary-1 mb-2">
            No branches found
          </p>
          <p className="text-sm text-brand-secondary-1 mb-4">
            {organizationId
              ? "Create your first branch to get started."
              : "Please ensure you're logged in and have an organization selected."}
          </p>
          {organizationId && (
            <Link to="/dashboard/branch/create">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Branch
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Data Table */}
      {!isLoadingBranches && branchData?.items && branchData.items.length > 0 && (
        <DataTable
          columns={columns}
          data={branchData.items}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Edit Branch Dialog */}
      <Transition appear show={isEditDialogOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setIsEditDialogOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-brand-primary-1/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-full p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all max-h-[90vh] overflow-y-auto">
                  <Dialog.Title
                    as="h3"
                    className="mb-4 text-lg font-medium leading-6 text-brand-primary-1"
                  >
                    Edit Branch
                  </Dialog.Title>
                  <div className="space-y-4">
                    {/* Branch Name */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-name">Branch Name *</Label>
                      <Input
                        id="branch-name"
                        value={editBranchName}
                        onChange={(e) => setEditBranchName(e.target.value)}
                        placeholder="Enter branch name"
                        autoFocus
                      />
                    </div>

                    {/* Country Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-country">Country *</Label>
                      <Select
                        value={editBranchCountryId}
                        onValueChange={(value) => {
                          setEditBranchCountryId(value);
                          setEditBranchRegionId(""); // Reset region when country changes
                          setEditBranchAreaId(""); // Reset area when country changes
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

                    {/* Region Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-region">Region *</Label>
                      <Select
                        value={editBranchRegionId}
                        onValueChange={(value) => {
                          setEditBranchRegionId(value);
                          setEditBranchAreaId(""); // Reset area when region changes
                        }}
                        disabled={!editBranchCountryId}
                      >
                        <SelectTrigger id="branch-region">
                          <SelectValue
                            placeholder={
                              editBranchCountryId
                                ? "Select region"
                                : "Select country first"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {regions.map((region) => (
                            <SelectItem key={region.id} value={region.id}>
                              {region.name}
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

                    {/* Area Selection */}
                    <div className="space-y-2">
                      <Label htmlFor="branch-area">Area *</Label>
                      <Select
                        value={editBranchAreaId}
                        onValueChange={(value) => setEditBranchAreaId(value)}
                        disabled={!editBranchRegionId}
                      >
                        <SelectTrigger id="branch-area">
                          <SelectValue
                            placeholder={
                              editBranchRegionId
                                ? "Select area"
                                : "Select region first"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {areas.map((area) => (
                            <SelectItem key={area.id} value={area.id}>
                              {area.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!editBranchRegionId && (
                        <p className="text-xs text-muted-foreground">
                          Please select a region first
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
                  <div className="flex justify-end gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditDialogOpen(false);
                        setEditingBranch(null);
                        setEditBranchName("");
                        setEditBranchAddress("");
                        setEditBranchPicUserId("");
                        setEditBranchCountryId("");
                        setEditBranchRegionId("");
                        setEditBranchAreaId("");
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
                        !editBranchAreaId ||
                        updateMutation.isPending ||
                        moveMutation.isPending
                      }
                    >
                      {updateMutation.isPending || moveMutation.isPending
                        ? "Saving..."
                        : "Save Changes"}
                    </Button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
