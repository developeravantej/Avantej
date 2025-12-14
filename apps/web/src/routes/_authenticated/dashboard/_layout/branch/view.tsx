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

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/branch/view"
)({
  component: RouteComponent,
});

function RouteComponent() {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: userContext, isLoading: isLoadingContext } = useUserContext();
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
  const [allHierarchyNodes, setAllHierarchyNodes] = useState<
    Array<{
      id: string;
      name: string;
      type: string;
      depth: number;
      parentId: string | null;
    }>
  >([]);

  // Get organizationId from React Query data (single source of truth)
  const organizationId =
    userContext?.currentOrganizationId ||
    user?.current_organization_id ||
    user?.organizations?.[0]?.id ||
    null;

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
    queryFn: async () => {
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
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
  });

  // Update allHierarchyNodes state when hierarchyNodesData changes
  useEffect(() => {
    if (hierarchyNodesData?.nodes) {
      console.log(
        "Setting allHierarchyNodes:",
        hierarchyNodesData.nodes.length
      );
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
      const branches = allNodes.filter((node) => {
        const isBranch = node.type === "branch" && node.depth === 4;
        if (node.type === "branch" && node.depth !== 4) {
          console.warn(
            `[mapBranchesWithHierarchy] Branch node ${node.id} (${node.name}) has unexpected depth: ${node.depth} (expected 4)`
          );
        }
        if (node.id === "7cce143b-627c-472c-a6b6-57696e2b2a75") {
          console.log("[mapBranchesWithHierarchy] Found target branch:", node);
        }
        return isBranch;
      });

      console.log(
        "[mapBranchesWithHierarchy] Found ${branches.length} branches out of ${allNodes.length} total nodes"
      );
      console.log("[mapBranchesWithHierarchy] All node types:", [
        ...new Set(allNodes.map((n) => n.type)),
      ]);
      console.log("[mapBranchesWithHierarchy] All depths:", [
        ...new Set(allNodes.map((n) => n.depth)),
      ]);
      if (branches.length === 0 && allNodes.length > 0) {
        const branchNodes = allNodes.filter((n) => n.type === "branch");
        console.warn(
          `[mapBranchesWithHierarchy] Found ${branchNodes.length} nodes with type="branch" but none have depth=4`
        );
        branchNodes.forEach((b) => {
          console.warn(
            `  - Branch ${b.id} (${b.name}): depth=${b.depth}, type=${b.type}`
          );
        });
      }

      return branches.map((branch) => {
        // Find parent nodes by traversing up the hierarchy
        let areaNode = branch.parentId ? nodeMap.get(branch.parentId) : null;
        let regionNode = areaNode?.parentId
          ? nodeMap.get(areaNode.parentId)
          : null;
        let countryNode = regionNode?.parentId
          ? nodeMap.get(regionNode.parentId)
          : null;

        // Get PIC info - if picUserId exists, use it; otherwise fallback to current user
        // Note: In a real implementation, we'd fetch user details from control panel DB
        // For now, if picUserId exists, we'll show it; otherwise use current user
        const picUserId = (branch as any).picUserId;
        const picInfo = picUserId
          ? {
              // TODO: Fetch actual user details from control panel DB by picUserId
              // For now, show the userId
              name: picUserId || "N/A",
              email: picUserId || "N/A",
            }
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
    [organizationId]
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
        console.log("No organizationId, returning empty items");
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

      // Try cached hierarchy first
      const cachedHierarchy = localStorage.getItem(
        `org_${organizationId}_hierarchy`
      );
      if (cachedHierarchy) {
        try {
          const hierarchy = JSON.parse(cachedHierarchy);
          const allNodes = hierarchy.nodes || [];
          console.log("Using cached hierarchy, nodes count:", allNodes.length);
          const mappedBranches = mapBranchesWithHierarchy(
            allNodes,
            currentUser,
            organizationId
          );
          console.log("Mapped branches from cache:", mappedBranches.length);
          return { items: mappedBranches };
        } catch (e) {
          console.warn(
            "Failed to parse cached hierarchy, fetching from API:",
            e
          );
        }
      }

      // Fallback to API
      console.log(
        "[branches query] Fetching hierarchy nodes from API for org:",
        organizationId
      );
      try {
        const result = await client.hierarchy.listNodes({ organizationId });
        console.log(
          "[branches query] API returned nodes count:",
          result.nodes?.length || 0
        );
        console.log(
          "[branches query] API nodes sample:",
          result.nodes?.slice(0, 3)
        );

        // Check for the specific branch ID
        const targetBranch = result.nodes?.find(
          (n: any) => n.id === "7cce143b-627c-472c-a6b6-57696e2b2a75"
        );
        if (targetBranch) {
          console.log(
            "[branches query] Found target branch in API response:",
            targetBranch
          );
        } else {
          console.warn(
            "[branches query] Target branch NOT found in API response"
          );
          console.warn(
            "[branches query] All node IDs:",
            result.nodes?.map((n: any) => ({
              id: n.id,
              name: n.name,
              type: n.type,
              depth: n.depth,
            }))
          );
        }

        if (!result.nodes || result.nodes.length === 0) {
          console.warn(
            "[branches query] API returned no nodes. This might mean:"
          );
          console.warn("1. No hierarchy nodes exist in the database");
          console.warn("2. User doesn't have access to any nodes");
          console.warn("3. Organization context is not set up correctly");
          console.warn(
            "4. User needs to create branches first via /dashboard/branch/create"
          );
          return { items: [] };
        }

        const mappedBranches = mapBranchesWithHierarchy(
          result.nodes,
          currentUser,
          organizationId
        );
        console.log(
          "[branches query] Mapped branches from API:",
          mappedBranches.length
        );

        // Cache the hierarchy data for future use
        localStorage.setItem(
          `org_${organizationId}_hierarchy`,
          JSON.stringify({
            nodes: result.nodes,
          })
        );

        return { items: mappedBranches };
      } catch (apiError: any) {
        console.error(
          "[branches query] Error fetching hierarchy nodes from API:",
          apiError
        );
        console.error("[branches query] Error details:", {
          message: apiError?.message,
          stack: apiError?.stack,
          response: apiError?.response,
        });
        throw apiError; // Re-throw so React Query can handle it
      }
    },
    enabled: !!organizationId && isAuthenticated,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
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
        navigate({ to: "/login" });
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
      toast.success("Branch updated successfully");
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

      // Find current hierarchy position from allHierarchyNodes
      const branchNode = allHierarchyNodes.find((n) => n.id === branch.id);
      if (!branchNode) {
        toast.error("Branch node not found in hierarchy");
        return;
      }

      // Find current area, region, country by traversing up the hierarchy
      const currentArea = branchNode.parentId
        ? allHierarchyNodes.find((n) => n.id === branchNode.parentId)
        : null;
      const currentRegion = currentArea?.parentId
        ? allHierarchyNodes.find((n) => n.id === currentArea.parentId)
        : null;
      const currentCountry = currentRegion?.parentId
        ? allHierarchyNodes.find((n) => n.id === currentRegion.parentId)
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
    [allHierarchyNodes]
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
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-gray-600">Manage your organization's branches</p>
        </div>
        <Link to="/dashboard/branch/create">
          <Button className="flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Branch</span>
          </Button>
        </Link>
      </div>

      {process.env.NODE_ENV === "development" && (
        <div className="p-4 mb-4 space-y-2 text-xs bg-gray-100 rounded">
          <div className="flex items-center justify-between">
            <p>
              <strong>Debug Info:</strong>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (organizationId) {
                  localStorage.removeItem(`org_${organizationId}_hierarchy`);
                  queryClient.invalidateQueries({
                    queryKey: ["branches", organizationId],
                  });
                  queryClient.invalidateQueries({
                    queryKey: ["hierarchy-nodes", organizationId],
                  });
                  queryClient.invalidateQueries({ queryKey: ["user-context"] });
                  toast.info("Cache cleared, refreshing...");
                }
              }}
            >
              Clear Cache & Refresh
            </Button>
          </div>
          <p>Organization ID: {organizationId || "None"}</p>
          <p>Is Authenticated: {isAuthenticated ? "Yes" : "No"}</p>
          <p>Branch Data Items: {branchData?.items?.length || 0}</p>
          <p>Is Loading Branches: {isLoadingBranches ? "Yes" : "No"}</p>
          <p>Error: {error ? String(error) : "None"}</p>
          <p>
            Hierarchy Nodes Query Error:{" "}
            {hierarchyNodesError ? String(hierarchyNodesError) : "None"}
          </p>
          <p>All Hierarchy Nodes: {allHierarchyNodes.length}</p>
          <p>
            Hierarchy Nodes Query Data: {hierarchyNodesData?.nodes?.length || 0}
          </p>
          {error && (
            <details className="mt-2">
              <summary>Error Details</summary>
              <pre className="mt-2 overflow-auto text-xs">
                {JSON.stringify(error, null, 2)}
              </pre>
            </details>
          )}
          {branchData?.items && branchData.items.length > 0 && (
            <details className="mt-2">
              <summary>First Branch Data</summary>
              <pre className="mt-2 overflow-auto text-xs">
                {JSON.stringify(branchData.items[0], null, 2)}
              </pre>
            </details>
          )}
          {hierarchyNodesData?.nodes && hierarchyNodesData.nodes.length > 0 && (
            <details className="mt-2">
              <summary>Sample Hierarchy Nodes (first 3)</summary>
              <pre className="mt-2 overflow-auto text-xs">
                {JSON.stringify(hierarchyNodesData.nodes.slice(0, 3), null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
      <DataTable
        columns={columns}
        data={branchData?.items || []}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

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
            <div className="fixed inset-0 bg-gray-500/50" />
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
                    className="mb-4 text-lg font-medium leading-6 text-gray-900"
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
                        Person In Charge (User ID)
                      </Label>
                      <Input
                        id="branch-pic"
                        value={editBranchPicUserId}
                        onChange={(e) => setEditBranchPicUserId(e.target.value)}
                        placeholder="Enter user ID for Person In Charge"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the user ID of the person in charge. Leave empty
                        to clear.
                      </p>
                    </div>
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
