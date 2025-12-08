import { zodResolver } from '@hookform/resolvers/zod';
import { Building, Globe, Map, MapPin, Plus, Target } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import apiClient from '@/lib/api';
import { logAuthStatus, isAuthenticated } from '@/lib/auth-debug';

const hierarchicalBranchSchema = z.object({
  // Country selection
  country_id: z.string().optional(),
  country_name: z.string().min(1, 'Country name is required').optional(),
  country_code: z.string().min(2, 'Country code is required').optional(),

  // Organization selection
  organization_id: z.string().optional(),
  organization_name: z
    .string()
    .min(1, 'Organization name is required')
    .optional(),

  // Region selection
  region_id: z.string().optional(),
  region_name: z.string().min(1, 'Region name is required').optional(),
  region_code: z.string().min(1, 'Region code is required').optional(),

  // Area selection
  area_id: z.string().optional(),
  area_name: z.string().min(1, 'Area name is required').optional(),
  area_code: z.string().min(1, 'Area code is required').optional(),

  // Branch details
  branch_name: z.string().min(1, 'Branch name is required'),
  branch_code: z.string().min(1, 'Branch code is required'),
  branch_type: z.string().optional(),
});

type HierarchicalBranchFormData = z.infer<typeof hierarchicalBranchSchema>;

interface HierarchicalBranchFormProps {
  onSuccess?: (branch: any) => void;
}

interface HierarchyItem {
  id: string;
  name: string;
  code?: string;
}

const HierarchicalBranchForm: React.FC<HierarchicalBranchFormProps> = ({
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Data states
  const [countries, setCountries] = useState<HierarchyItem[]>([]);
  const [userOrganization, setUserOrganization] = useState<HierarchyItem | null>(null);
  const [regions, setRegions] = useState<HierarchyItem[]>([]);
  const [areas, setAreas] = useState<HierarchyItem[]>([]);

  // Selection states
  const [selectedCountry, setSelectedCountry] = useState<HierarchyItem | null>(
    null
  );
  const [selectedRegion, setSelectedRegion] = useState<HierarchyItem | null>(
    null
  );
  const [selectedArea, setSelectedArea] = useState<HierarchyItem | null>(null);

  // Creation modes
  const [createCountry, setCreateCountry] = useState(false);
  const [createRegion, setCreateRegion] = useState(false);
  const [createArea, setCreateArea] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<HierarchicalBranchFormData>({
    resolver: zodResolver(hierarchicalBranchSchema),
  });

  // Load countries and user organization on mount
  useEffect(() => {
    console.log('📋 Hierarchical Branch Form mounted');
    logAuthStatus();
    loadCountries();
    loadUserOrganization();
  }, []);

  // Load regions when country is selected
  useEffect(() => {
    if (selectedCountry) {
      loadRegions(selectedCountry.id);
    }
  }, [selectedCountry]);

  // Load areas when region changes
  useEffect(() => {
    if (selectedRegion) {
      loadAreas(selectedRegion.id);
    }
  }, [selectedRegion]);

  const loadCountries = async () => {
    try {
      // TODO: Replace with actual oRPC client call
      // const response = await apiClient.getListcountries();
      // setCountries(response.data || []);
      console.warn("API call to loadCountries is mocked.");
      setCountries([]); // Mock data
    } catch (error: any) {
      console.error('Error loading countries:', error);
      if (error.message.includes('Not authenticated')) {
        toast.error('Please log in to access this feature');
      } else {
        toast.error('Failed to load countries. Please try again.');
      }
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
      console.warn("API call to loadUserOrganization is mocked.");
      setUserOrganization(null); // Mock data
    } catch (error: any) {
      console.error('Error loading user organization:', error);
      if (error.message.includes('Not authenticated')) {
        toast.error('Please log in to access this feature');
      } else {
        toast.error('Failed to load your organization. Please try again.');
      }
    }
  };

  const loadRegions = async (countryId: string) => {
    try {
      // TODO: Replace with actual oRPC client call
      // const response = await apiClient.getListregions({
      //   country_id: countryId,
      // });
      // setRegions(response.data || []);
      console.warn("API call to loadRegions is mocked.", countryId);
      setRegions([]); // Mock data
    } catch (error: any) {
      console.error('Error loading regions:', error);
      if (error.message.includes('Not authenticated')) {
        toast.error('Please log in to access this feature');
      } else {
        toast.error('Failed to load regions. Please try again.');
      }
    }
  };

  const loadAreas = async (regionId: string) => {
    try {
      // TODO: Replace with actual oRPC client call
      // const response = await apiClient.getListareas({ region_id: regionId });
      // setAreas(response.data || []);
      console.warn("API call to loadAreas is mocked.", regionId);
      setAreas([]); // Mock data
    } catch (error: any) {
      console.error('Error loading areas:', error);
      if (error.message.includes('Not authenticated')) {
        toast.error('Please log in to access this feature');
      } else {
        toast.error('Failed to load areas. Please try again.');
      }
    }
  };

  const handleCountrySelect = (countryId: string) => {
    const country = countries.find((c) => c.id === countryId);
    if (country) {
      setSelectedCountry(country);
      setValue('country_id', country.id);
      setSelectedRegion(null);
      setSelectedArea(null);
      setCurrentStep(2);
    }
  };

  const handleRegionSelect = (regionId: string) => {
    const region = regions.find((r) => r.id === regionId);
    if (region) {
      setSelectedRegion(region);
      setValue('region_id', region.id);
      setSelectedArea(null);
      setCurrentStep(3);
    }
  };

  const handleAreaSelect = (areaId: string) => {
    const area = areas.find((a) => a.id === areaId);
    if (area) {
      setSelectedArea(area);
      setValue('area_id', area.id);
      setCurrentStep(4);
    }
  };

  const onSubmit = async (data: HierarchicalBranchFormData) => {
    setIsLoading(true);
    
    // Debug authentication status before making the request
    console.log('🚀 Starting branch creation...');
    logAuthStatus();
    
    try {
      // Prepare hierarchical data
      const hierarchicalData = {
        country: selectedCountry
          ? { id: selectedCountry.id }
          : {
              name: data.country_name,
              code: data.country_code,
            },
        organization: userOrganization
          ? { id: userOrganization.id }
          : {
              name: data.organization_name || 'Unknown Organization',
            },
        region: selectedRegion
          ? { id: selectedRegion.id }
          : {
              name: data.region_name,
              code: data.region_code,
            },
        area: selectedArea
          ? { id: selectedArea.id }
          : {
              name: data.area_name,
              code: data.area_code,
            },
        branch: {
          name: data.branch_name,
          code: data.branch_code,
          branch_type: data.branch_type || 'standard',
        },
      };

      // TODO: Replace with actual oRPC client call
      // const response = await apiClient.postCreatehierarchicalbranch({
      //   body: hierarchicalData,
      // });
      console.warn("API call to postCreatehierarchicalbranch is mocked.", hierarchicalData);
      const response = { data: { id: 'mock-branch-id', ...hierarchicalData.branch } };

      toast.success('Branch created successfully!');
      onSuccess?.(response.data);
      reset();
      setCurrentStep(1);
      setSelectedCountry(null);
      setSelectedRegion(null);
      setSelectedArea(null);
    } catch (error: any) {
      console.error('Error creating branch:', error);
      console.log('Error message:', error.message);
      console.log('Error stack:', error.stack);

      // Check authentication status
      const token = localStorage.getItem("authToken");
      console.log('Current auth token exists:', !!token);
      if (token) {
        console.log('Token preview:', token.substring(0, 50) + '...');
      }

      // Handle specific error types with more detailed debugging
      if (error.message.includes('Not authenticated') || error.message.includes('401')) {
        console.error('Authentication error - token may be expired or invalid');
        toast.error('Please log in to create branches. Your session may have expired.');
      } else if (error.message.includes('not found') || error.message.includes('404')) {
        console.error('Resource not found error');
        toast.error(
          'One or more selected items could not be found. Please refresh and try again.'
        );
      } else if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.error('Duplicate resource error');
        toast.error(
          'A branch with this code already exists in the selected area'
        );
      } else if (error.message.includes('400')) {
        console.error('Bad request error');
        toast.error(
          'Invalid data provided. Please check your input and try again.'
        );
      } else if (error.message.includes('403') || error.message.includes('Forbidden') || error.message.includes('permission')) {
        console.error('Permission error - user lacks required permissions');
        toast.error("You don't have permission to create branches. Please contact your administrator.");
      } else {
        console.error('Unknown error occurred');
        toast.error(`Failed to create branch: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepHeader = () => {
    const steps = [
      {
        number: 1,
        title: 'Country',
        icon: Globe,
        completed: !!selectedCountry,
      },
      { number: 2, title: 'Region', icon: Map, completed: !!selectedRegion },
      { number: 3, title: 'Area', icon: MapPin, completed: !!selectedArea },
      { number: 4, title: 'Branch', icon: Target, completed: false },
    ];

    return (
      <div className="mb-8 flex items-center justify-between">
        {steps.map((step, index) => (
          <div className="flex items-center" key={step.number}>
            <div
              className={`flex items-center space-x-2 ${
                currentStep === step.number
                  ? 'text-blue-600'
                  : step.completed
                    ? 'text-green-600'
                    : 'text-gray-400'
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  currentStep === step.number
                    ? 'border-blue-600 bg-blue-50'
                    : step.completed
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-300'
                }`}
              >
                <step.icon className="h-4 w-4" />
              </div>
              <span className="font-medium text-sm">{step.title}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`mx-4 h-px w-8 ${
                  step.completed ? 'bg-green-600' : 'bg-gray-300'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderStep1 = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Globe className="h-5 w-5" />
          <span>Step 1: Select or Create Country</span>
        </CardTitle>
        <CardDescription>
          Choose an existing country or create a new one
        </CardDescription>
      </CardHeader>
      <CardContent>
        {createCountry ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="country_name">Country Name</Label>
              <Input
                id="country_name"
                {...register('country_name')}
                placeholder="Enter country name"
              />
              {errors.country_name && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.country_name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="country_code">Country Code</Label>
              <Input
                id="country_code"
                {...register('country_code')}
                maxLength={10}
                placeholder="Enter country code (e.g., MY)"
              />
              {errors.country_code && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.country_code.message}
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              <Button
                className="flex-1"
                onClick={() => setCreateCountry(false)}
                type="button"
                variant="outline"
              >
                Back to Select
              </Button>
              <Button
                className="flex-1"
                onClick={() => setCurrentStep(2)}
                type="button"
              >
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="country-select">Select Country</Label>
              <Select onValueChange={handleCountrySelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((country) => (
                    <SelectItem key={country.id} value={country.id}>
                      {country.name} ({country.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => setCreateCountry(true)}
              type="button"
              variant="outline"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Country
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Map className="h-5 w-5" />
          <span>Step 2: Select or Create Region</span>
        </CardTitle>
        <CardDescription>
          Choose an existing region or create a new one
          {userOrganization && (
            <Badge className="ml-2" variant="secondary">
              {userOrganization.name}
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {createRegion ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="region_name">Region Name</Label>
              <Input
                id="region_name"
                {...register('region_name')}
                placeholder="Enter region name"
              />
              {errors.region_name && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.region_name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="region_code">Region Code</Label>
              <Input
                id="region_code"
                {...register('region_code')}
                maxLength={50}
                placeholder="Enter region code"
              />
              {errors.region_code && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.region_code.message}
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              <Button
                className="flex-1"
                onClick={() => setCreateRegion(false)}
                type="button"
                variant="outline"
              >
                Back to Select
              </Button>
              <Button
                className="flex-1"
                onClick={() => setCurrentStep(3)}
                type="button"
              >
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="region-select">Select Region</Label>
              <Select onValueChange={handleRegionSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name} ({region.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => setCreateRegion(true)}
              type="button"
              variant="outline"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Region
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <MapPin className="h-5 w-5" />
          <span>Step 3: Select or Create Area</span>
        </CardTitle>
        <CardDescription>
          Choose an existing area or create a new one
          {selectedRegion && (
            <Badge className="ml-2" variant="secondary">
              {selectedRegion.name}
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {createArea ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="area_name">Area Name</Label>
              <Input
                id="area_name"
                {...register('area_name')}
                placeholder="Enter area name"
              />
              {errors.area_name && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.area_name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="area_code">Area Code</Label>
              <Input
                id="area_code"
                {...register('area_code')}
                maxLength={50}
                placeholder="Enter area code"
              />
              {errors.area_code && (
                <p className="mt-1 text-red-500 text-sm">
                  {errors.area_code.message}
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              <Button
                className="flex-1"
                onClick={() => setCreateArea(false)}
                type="button"
                variant="outline"
              >
                Back to Select
              </Button>
              <Button
                className="flex-1"
                onClick={() => setCurrentStep(4)}
                type="button"
              >
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="area-select">Select Area</Label>
              <Select onValueChange={handleAreaSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an area" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name} ({area.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => setCreateArea(true)}
              type="button"
              variant="outline"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Area
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderStep4 = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Target className="h-5 w-5" />
          <span>Step 4: Create Branch</span>
        </CardTitle>
        <CardDescription>
          Enter branch details to complete the creation
          {selectedArea && (
            <Badge className="ml-2" variant="secondary">
              {selectedArea.name}
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="branch_name">Branch Name</Label>
            <Input
              id="branch_name"
              {...register('branch_name')}
              placeholder="Enter branch name"
            />
            {errors.branch_name && (
              <p className="mt-1 text-red-500 text-sm">
                {errors.branch_name.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="branch_code">Branch Code</Label>
            <Input
              id="branch_code"
              {...register('branch_code')}
              maxLength={50}
              placeholder="Enter branch code"
            />
            {errors.branch_code && (
              <p className="mt-1 text-red-500 text-sm">
                {errors.branch_code.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="branch_type">Branch Type</Label>
            <Select onValueChange={(value) => setValue('branch_type', value)}>
              <SelectTrigger>
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
    <div className="mx-auto max-w-4xl p-6">
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        {renderStepHeader()}

        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}

        {currentStep === 4 && (
          <div className="flex justify-between">
            <Button
              onClick={() => setCurrentStep(3)}
              type="button"
              variant="outline"
            >
              Back
            </Button>
            <Button disabled={isLoading} type="submit">
              {isLoading ? 'Creating...' : 'Create Branch'}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};

export default HierarchicalBranchForm;

