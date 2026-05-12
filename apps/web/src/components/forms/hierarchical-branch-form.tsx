import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { client, queryClient } from "@/utils/orpc";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Globe, Map as MapIcon, Plus, Target } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

const hierarchicalBranchSchema = z.object({
  // Country selection
  country_id: z.string().optional(),
  country_name: z.string().min(1, "Country name is required").optional(),
  country_code: z.string().min(2, "Country code is required").optional(),

  // Organization selection
  organization_id: z.string().optional(),
  organization_name: z
    .string()
    .min(1, "Organization name is required")
    .optional(),

  // State selection
  state_id: z.string().optional(),
  state_name: z.string().min(1, "State name is required").optional(),
  state_code: z.string().min(1, "State code is required").optional(),

  // Branch details
  branch_name: z.string().min(1, "Branch name is required"),
  branch_code: z.string().min(1, "Branch code is required"),
  branch_type: z.string().optional(),
});

type HierarchicalBranchFormData = z.infer<typeof hierarchicalBranchSchema>;

interface HierarchyNodeResponse {
  id: string;
  name: string;
  type: string;
  depth: number;
  parentId: string | null;
  code?: string | null;
  address?: string | null;
  picUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HierarchicalBranchFormProps {
  onSuccess?: (branch: HierarchyNodeResponse) => void;
}

interface HierarchyItem {
  id: string;
  name: string;
  code?: string;
}

interface StepHeaderProps {
  currentStep: number;
  selectedCountry: HierarchyItem | null;
  selectedState: HierarchyItem | null;
}

function StepHeader({ currentStep, selectedCountry, selectedState }: StepHeaderProps) {
  const steps = [
    {
      number: 1,
      title: "Country",
      icon: Globe,
      completed: !!selectedCountry,
    },
    {
      number: 2,
      title: "State",
      icon: MapIcon,
      completed: !!selectedState,
    },
    { number: 3, title: "Branch", icon: Target, completed: false },
  ];

  return (
    <div className="mb-8 flex items-center justify-between">
      {steps.map((step, index) => (
        <React.Fragment key={step.number}>
          <div className="flex flex-col items-center">
            <div
              className={`flex items-center space-x-2 ${
                currentStep === step.number
                  ? "text-brand-primary-1"
                  : step.completed
                    ? "text-brand-primary-1"
                    : "text-brand-secondary-1"
              }`}
            >
              <div
                className={`flex size-10 items-center justify-center rounded-full ${
                  currentStep === step.number
                    ? "bg-zinc-950 text-white"
                    : step.completed
                      ? "bg-brand-primary-1 text-white"
                      : "bg-brand-secondary-3 text-brand-secondary-1"
                }`}
              >
                <step.icon className="size-5" />
              </div>
            </div>
            <span
              className={`mt-2 font-medium text-sm ${
                currentStep === step.number
                  ? "text-brand-primary-1"
                  : step.completed
                    ? "text-brand-primary-1"
                    : "text-brand-secondary-1"
              }`}
            >
              {step.title}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className="flex-1 mx-4 flex items-center">
              <div
                className={`flex-1 h-0.5 ${
                  step.completed ? "bg-brand-primary-1" : "border-t border-brand-secondary-3"
                }`}
              />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
const HierarchicalBranchForm: React.FC<HierarchicalBranchFormProps> = ({
  onSuccess,
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Get organization ID from user context
  // TODO: Get from user's current organization or route params
  const organizationId =
    user?.current_organization_id || user?.organizations?.[0]?.id;

  // Data states
  const [countries, setCountries] = useState<HierarchyItem[]>([]);
  const [userOrganization, setUserOrganization] =
    useState<HierarchyItem | null>(null);
  const [states, setStates] = useState<HierarchyItem[]>([]);

  // Selection states
  const [selectedCountry, setSelectedCountry] = useState<HierarchyItem | null>(
    null
  );
  const [selectedState, setSelectedState] = useState<HierarchyItem | null>(
    null
  );

  // Creation modes
  const [createCountry, setCreateCountry] = useState(false);
  const [createState, setCreateState] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
  } = useForm<HierarchicalBranchFormData>({
    resolver: zodResolver(hierarchicalBranchSchema),
  });

  // Load countries and user organization on mount or when organizationId changes
  // react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven fetch: loads countries when organizationId changes
  useEffect(() => {
    if (organizationId) {
      loadCountries();
      loadUserOrganization();
    }
  }, [organizationId]);

  // Load states when country is selected
  // react-doctor-disable-next-line react-doctor/no-effect-event-handler -- derived-state-driven fetch: loads states when selectedCountry changes
  useEffect(() => {
    if (selectedCountry) {
      loadStates(selectedCountry.id);
    }
  }, [selectedCountry]);

  const loadCountries = async () => {
    try {
      if (!organizationId) {
        setCountries([]);
        return;
      }

      // Fetch all hierarchy nodes from API
      const result = await client.hierarchy.listNodes({ organizationId });

      // Filter for countries (type === "country", depth === 1)
      const allNodes = (result.nodes || []) as HierarchyNodeResponse[];
      const countryNodes = allNodes.filter(
        (node) => node.type === "country" && node.depth === 1
      );

      // Map to HierarchyItem format
      const countriesList: HierarchyItem[] = countryNodes.map((node) => ({
        id: node.id,
        name: node.name,
        code: node.code || "",
      }));

      setCountries(countriesList);
    } catch (error: unknown) {
      console.error("Error loading countries:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Not authenticated")) {
        toast.error("Please log in to access this feature");
      } else {
        toast.error("Failed to load countries. Please try again.");
      }
      setCountries([]);
    }
  };

  const loadUserOrganization = async () => {
    try {
      // TODO: Replace with actual oRPC client call
      // const response = await apiClient.getMe();
      // if (response.data && response.data.organizations && response.data.organizations.length > 0) {
      //   const organization = response.data.organizations[0];
      //   setUserOrganization({
      //     id: organization.id,
      //     name: organization.name,
      //   });
      // }
      setUserOrganization(null); // Mock data
    } catch (error: unknown) {
      console.error("Error loading user organization:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Not authenticated")) {
        toast.error("Please log in to access this feature");
      } else {
        toast.error("Failed to load your organization. Please try again.");
      }
    }
  };

  const loadStates = async (countryId: string) => {
    try {
      if (!organizationId) {
        setStates([]);
        return;
      }

      // Fetch all hierarchy nodes from API
      const result = await client.hierarchy.listNodes({ organizationId });

      // Filter for states under the selected country
      const allStateNodes = (result.nodes || []) as HierarchyNodeResponse[];
      const stateNodes = allStateNodes.filter(
        (node) => node.type === "state" && node.depth === 2 && node.parentId === countryId
      );

      const statesList: HierarchyItem[] = stateNodes.map((node) => ({
        id: node.id,
        name: node.name,
        code: node.code || "",
      }));

      setStates(statesList);
    } catch (error: unknown) {
      console.error("Error loading states:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Not authenticated")) {
        toast.error("Please log in to access this feature");
      } else {
        toast.error("Failed to load states. Please try again.");
      }
      setStates([]);
    }
  };

  const handleCountrySelect = (countryId: string) => {
    const country = countries.find((c) => c.id === countryId);
    if (country) {
      setSelectedCountry(country);
      setValue("country_id", country.id);
      setSelectedState(null);
      setCurrentStep(2);
    }
  };

  const handleStateSelect = (stateId: string) => {
    const state = states.find((s) => s.id === stateId);
    if (state) {
      setSelectedState(state);
      setValue("state_id", state.id);
      setCurrentStep(3);
    }
  };

  const onSubmit = async (data: HierarchicalBranchFormData) => {
    setIsLoading(true);

    try {
      if (!organizationId) {
        toast.error("Organization ID is required");
        setIsLoading(false);
        return;
      }

      // Get all nodes to find organization node using client directly
      const listResult = await client.hierarchy.listNodes({ organizationId });
      const allNodes = listResult.nodes;

      // Find organization node (depth 0, type "organization")
      const orgNode = allNodes.find(
        (n: { type: string; depth: number }) =>
          n.type === "organization" && n.depth === 0
      );
      if (!orgNode) {
        toast.error("Organization node not found");
        setIsLoading(false);
        return;
      }

      // Create hierarchy nodes sequentially using oRPC client
      let countryNodeId = selectedCountry?.id;
      let stateNodeId = selectedState?.id;

      // Step 1: Create Country if needed
      if (!countryNodeId && data.country_name) {
        const countryNode = await client.hierarchy.createNode({
          organizationId,
          type: "country",
          name: data.country_name,
          code: data.country_code,
          parentId: orgNode.id, // Country is under organization node
        });
        countryNodeId = countryNode.id;
        setSelectedCountry({ id: countryNode.id, name: countryNode.name });
      }

      // Step 2: Create State if needed
      if (!stateNodeId && data.state_name && countryNodeId) {
        const stateNode = await client.hierarchy.createNode({
          organizationId,
          type: "state",
          name: data.state_name,
          code: data.state_code,
          parentId: countryNodeId,
        });
        stateNodeId = stateNode.id;
        setSelectedState({ id: stateNode.id, name: stateNode.name });
      }

      // Step 3: Create Branch
      if (!stateNodeId) {
        toast.error("State is required to create a branch");
        setIsLoading(false);
        return;
      }

      const branchNode = await client.hierarchy.createNode({
        organizationId,
        type: "branch",
        name: data.branch_name,
        code: data.branch_code,
        parentId: stateNodeId,
      });

      // Invalidate React Query caches to refresh data
      await Promise.all([
        // Invalidate branches query for this organization
        queryClient.invalidateQueries({
          queryKey: ["branches", organizationId],
        }),
        // Invalidate user-context query (contains hierarchy data)
        queryClient.invalidateQueries({ queryKey: ["user-context"] }),
      ]);

      // Clear localStorage hierarchy cache to force refresh
      localStorage.removeItem(`org_${organizationId}_hierarchy`);

      toast.success("Branch created successfully!");
      onSuccess?.(branchNode);
      reset();
      setCurrentStep(1);
      setSelectedCountry(null);
      setSelectedState(null);

      // Navigate to branch view
      navigate({ to: "/dashboard/branch/view" });
    } catch (error: unknown) {
      // Handle specific error types
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("Not authenticated") ||
        msg.includes("401")
      ) {
        toast.error(
          "Please log in to create branches. Your session may have expired."
        );
      } else if (
        msg.includes("not found") ||
        msg.includes("404")
      ) {
        toast.error(
          "One or more selected items could not be found. Please refresh and try again."
        );
      } else if (
        msg.includes("already exists") ||
        msg.includes("duplicate")
      ) {
        toast.error(
          "A branch with this code already exists in the selected state"
        );
      } else if (msg.includes("400")) {
        toast.error(
          "Invalid data provided. Please check your input and try again."
        );
      } else if (
        msg.includes("403") ||
        msg.includes("Forbidden") ||
        msg.includes("permission")
      ) {
        toast.error(
          "You don't have permission to create branches. Please contact your administrator."
        );
      } else {
        toast.error(`Failed to create branch: ${msg}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <Card className="bg-white border border-brand-secondary-3 rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-x-2 text-lg font-medium text-brand-primary-1">
          <Globe className="size-5" />
          <span>Step 1: Select or Create Country</span>
        </CardTitle>
        <CardDescription className="text-sm text-brand-secondary-1">
          Choose an existing country or create a new one
        </CardDescription>
      </CardHeader>
      <CardContent>
        {createCountry ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="country_name" className="block text-sm font-medium text-brand-primary-1">Country Name</Label>
              <Input
                id="country_name"
                {...register("country_name")}
                placeholder="Enter country name"
                className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
              />
              {errors.country_name && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.country_name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="country_code" className="block text-sm font-medium text-brand-primary-1">Country Code</Label>
              <Input
                id="country_code"
                {...register("country_code")}
                maxLength={10}
                placeholder="Enter country code (e.g., MY)"
                className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
              />
              {errors.country_code && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.country_code.message}
                </p>
              )}
            </div>
            <div className="flex gap-x-2">
              <Button
                className="flex-1 inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                onClick={() => setCreateCountry(false)}
                type="button"
                variant="outline"
              >
                Back to Select
              </Button>
              <Button
                className="flex-1 inline-flex justify-center rounded-md border border-transparent bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                onClick={() => setCurrentStep(2)}
                type="button"
              >
                Continue to State
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="country-select" className="block text-sm font-medium text-brand-primary-1">Select Country</Label>
              <Select
                onValueChange={handleCountrySelect}
                disabled={countries.length === 0}
              >
                <SelectTrigger className="mt-1 w-full border-brand-secondary-3 focus:border-black focus:ring-black">
                  <SelectValue
                    placeholder={
                      countries.length === 0
                        ? "No countries available"
                        : "Choose a country"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {countries.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-brand-secondary-1">
                      No countries available
                    </div>
                  ) : (
                    countries.map((country) => (
                      <SelectItem key={country.id} value={country.id}>
                        {country.name}{country.code ? ` (${country.code})` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {countries.length === 0 && (
                <p className="mt-1 text-sm text-brand-secondary-1">
                  Please create a new country to continue
                </p>
              )}
            </div>
            <Button
              className="w-full inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
              onClick={() => setCreateCountry(true)}
              type="button"
              variant="outline"
            >
              <Plus className="mr-2 size-4" />
              Create New Country
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card className="bg-white border border-brand-secondary-3 rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-x-2 text-lg font-medium text-brand-primary-1">
          <MapIcon className="size-5" />
          <span>Step 2: Select or Create State</span>
        </CardTitle>
        <CardDescription className="text-sm text-brand-secondary-1">
          Choose an existing state or create a new one
          {userOrganization && (
            <Badge className="ml-2" variant="secondary">
              {userOrganization.name}
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {createState ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="state_name" className="block text-sm font-medium text-brand-primary-1">State Name</Label>
              <Input
                id="state_name"
                {...register("state_name")}
                placeholder="Enter state name"
                className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
              />
              {errors.state_name && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.state_name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="state_code" className="block text-sm font-medium text-brand-primary-1">State Code</Label>
              <Input
                id="state_code"
                {...register("state_code")}
                maxLength={50}
                placeholder="Enter state code (e.g., CA)"
                className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
              />
              {errors.state_code && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.state_code.message}
                </p>
              )}
            </div>
            <div className="flex gap-x-2">
              <Button
                className="flex-1 inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                onClick={() => setCreateState(false)}
                type="button"
                variant="outline"
              >
                Back to Select
              </Button>
              <Button
                className="flex-1 inline-flex justify-center rounded-md border border-transparent bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                onClick={() => setCurrentStep(3)}
                type="button"
              >
                Continue to Branch
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="state-select" className="block text-sm font-medium text-brand-primary-1">Select State</Label>
              <Select
                onValueChange={handleStateSelect}
                disabled={states.length === 0}
              >
                <SelectTrigger className="mt-1 w-full border-brand-secondary-3 focus:border-black focus:ring-black">
                  <SelectValue
                    placeholder={
                      states.length === 0
                        ? "No states available"
                        : "Choose a state"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {states.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-brand-secondary-1">
                      No states available
                    </div>
                  ) : (
                    states.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name}{state.code ? ` (${state.code})` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {states.length === 0 && (
                <p className="mt-1 text-sm text-brand-secondary-1">
                  Please create a new state to continue
                </p>
              )}
            </div>
            <Button
              className="w-full inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
              onClick={() => setCreateState(true)}
              type="button"
              variant="outline"
            >
              <Plus className="mr-2 size-4" />
              Create New State
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card className="bg-white border border-brand-secondary-3 rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-x-2 text-lg font-medium text-brand-primary-1">
          <Target className="size-5" />
          <span>Step 3: Create Branch</span>
        </CardTitle>
        <CardDescription className="text-sm text-brand-secondary-1">
          Enter branch details to complete the creation
          {selectedState && (
            <Badge className="ml-2" variant="secondary">
              {selectedState.name}
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="branch_name" className="block text-sm font-medium text-brand-primary-1">Branch Name</Label>
            <Input
              id="branch_name"
              {...register("branch_name")}
              placeholder="Enter branch name"
              className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
            />
            {errors.branch_name && (
              <p className="mt-1 text-red-500 text-sm">
                {errors.branch_name.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="branch_code" className="block text-sm font-medium text-brand-primary-1">Branch Code</Label>
            <Input
              id="branch_code"
              {...register("branch_code")}
              maxLength={50}
              placeholder="Enter branch code"
              className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
            />
            {errors.branch_code && (
              <p className="mt-1 text-red-500 text-sm">
                {errors.branch_code.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="branch_type" className="block text-sm font-medium text-brand-primary-1">Branch Type</Label>
            <Select onValueChange={(value) => setValue("branch_type", value)}>
              <SelectTrigger className="mt-1 w-full border-brand-secondary-3 focus:border-black focus:ring-black">
                <SelectValue placeholder="Select branch type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="headquarters">Headquarters</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-primary-1">Create Branch</h1>
        <p className="text-sm text-brand-secondary-1 mt-1">Set up a new branch by selecting its location in the hierarchy.</p>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <StepHeader
          currentStep={currentStep}
          selectedCountry={selectedCountry}
          selectedState={selectedState}
        />

        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}

        {currentStep === 3 && (
          <div className="flex justify-between mt-6">
            <Button
              onClick={() => setCurrentStep(2)}
              type="button"
              variant="outline"
              className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
            >
              Back
            </Button>
            <Button
              disabled={isLoading}
              type="submit"
              className="inline-flex justify-center rounded-md border border-transparent bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating..." : "Create Branch"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};

export default HierarchicalBranchForm;
