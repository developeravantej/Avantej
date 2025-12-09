import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState, useEffect } from 'react';
// TODO: Replace with actual oRPC client when backend is ready
// import apiClient from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface StaffWeightage {
  id: number;
  position: number;
  title: string;
  percentage: number;
}

interface Role {
  id: string | number; // Can be UUID string or number
  name: string;
}

interface StaffRateStructure {
  [key: string]: number; // This allows dynamic role IDs as keys
}

interface ServiceFormData {
  name: string;
  duration: number;
  maxAttendees?: number;
  incentive: {
    type: 'fixed' | 'variable';
    isConditional: boolean;
    maxStaff: number;
    // Percentage of sale/commission allocated to staff to split (pool)
    staffPoolPercentage?: number;
    paymentStructure: {
      nonConditional?: StaffRateStructure;
      conditional?: {
        threshold: number;
        belowThreshold: StaffRateStructure;
        aboveThreshold: StaffRateStructure;
      };
    };
    staffWeightage: StaffWeightage[];
  };
  rules?: {
    requireAdvanceBooking: boolean;
    minAdvanceHours: number; // hours before start to allow booking
    enableCancellationWindow: boolean;
    cancellationCutoffHours: number; // hours before start to allow cancel
  };
}

interface ServiceFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ServiceFormData, serviceId?: number) => Promise<void>;
  initialData?: ServiceFormData & { id: number };
  mode?: 'create' | 'edit';
}

export function ServiceFormDialog({ isOpen, onClose, onSubmit, initialData, mode = 'create' }: ServiceFormDialogProps) {
  // State for roles fetched from API
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);

  // State to track which roles are currently selected (using string IDs for UUIDs)
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  
  // Get currently selected roles based on selectedRoleIds
  const getSelectedRoles = (): Role[] => {
    return allRoles.filter(role => selectedRoleIds.has(String(role.id)));
  };

  // Helper function to create an empty rate structure
  const createEmptyRateStructure = (roleIds: (string | number)[] = []): StaffRateStructure => {
    const structure: StaffRateStructure = {};
    roleIds.forEach(roleId => {
      structure[`role_${roleId}`] = 0;
    });
    return structure;
  };

  // Add a new role to the selected roles
  const addRole = (roleId: string | number) => {
    const roleIdStr = String(roleId);
    setSelectedRoleIds(prev => new Set([...prev, roleIdStr]));
    
    // Initialize rates for the new role in all payment structures
    setFormData(prev => {
      const newData = { ...prev };
      
      // Initialize in nonConditional if it exists
      if (newData.incentive.paymentStructure.nonConditional) {
        newData.incentive.paymentStructure.nonConditional[`role_${roleId}`] = 0;
      }
      
      // Initialize in conditional structures if they exist
      if (newData.incentive.paymentStructure.conditional) {
        newData.incentive.paymentStructure.conditional.belowThreshold[`role_${roleId}`] = 0;
        newData.incentive.paymentStructure.conditional.aboveThreshold[`role_${roleId}`] = 0;
      }
      
      return newData;
    });
  };

  // Remove a role from the selected roles
  const removeRole = (roleId: string | number) => {
    if (selectedRoleIds.size <= 1) return; // Prevent removing the last role
    
    const roleIdStr = String(roleId);
    setSelectedRoleIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(roleIdStr);
      return newSet;
    });
    
    // Remove rates for the removed role
    setFormData(prev => {
      const newData = { ...prev };
      const roleKey = `role_${roleIdStr}`;
      
      // Remove from nonConditional
      if (newData.incentive.paymentStructure.nonConditional) {
        delete newData.incentive.paymentStructure.nonConditional[roleKey];
      }
      
      // Remove from conditional structures
      if (newData.incentive.paymentStructure.conditional) {
        delete newData.incentive.paymentStructure.conditional.belowThreshold[roleKey];
        delete newData.incentive.paymentStructure.conditional.aboveThreshold[roleKey];
      }
      
      return newData;
    });
  };

  // Get available roles (roles that haven't been added yet)
  const getAvailableRoles = (): Role[] => {
    return allRoles.filter(role => !selectedRoleIds.has(String(role.id)));
  };

  const [formData, setFormData] = useState<ServiceFormData>({
    name: '',
    duration: 0,
    maxAttendees: undefined,
    incentive: {
      type: 'fixed',
      isConditional: false,
      maxStaff: 1,
    staffPoolPercentage: 100,
      paymentStructure: {
        nonConditional: createEmptyRateStructure([1])
      },
      staffWeightage: [{ id: 1, position: 1, title: 'Head Staff', percentage: 100 }]
    },
    rules: {
      requireAdvanceBooking: false,
      minAdvanceHours: 0,
      enableCancellationWindow: false,
      cancellationCutoffHours: 0
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const { user } = useAuth();

  // Fetch roles from API
  useEffect(() => {
    const fetchRoles = async () => {
      if (!isOpen) return; // Don't fetch if dialog is closed
      
      setIsLoadingRoles(true);
      try {
        // TODO: Replace with actual oRPC client call
        // Get organization_id from user
        // const organizationId = (user as any)?.current_organization_id || (user as any)?.organization_id;
        // const response = await apiClient.getListRoles({
        //   organization_id: organizationId,
        //   limit: 100
        // });
        // if (response.data) {
        //   const rolesData = Array.isArray(response.data) 
        //     ? response.data 
        //     : ((response.data as any).items || []);
        //   const roles: Role[] = rolesData.map((role: any) => ({
        //     id: role.id,
        //     name: role.name
        //   }));
        //   setAllRoles(roles);
        //   if (mode === 'create' && selectedRoleIds.size === 0 && roles.length > 0) {
        //     const firstRoleId = String(roles[0].id);
        //     setSelectedRoleIds(new Set([firstRoleId]));
        //     setFormData(prev => {
        //       if (prev.name === '' && prev.duration === 0) {
        //         return {
        //           ...prev,
        //           incentive: {
        //             ...prev.incentive,
        //             paymentStructure: {
        //               nonConditional: createEmptyRateStructure([firstRoleId])
        //             }
        //           }
        //         };
        //       }
        //       return prev;
        //     });
        //   }
        // }
        console.warn("API call to fetchRoles is mocked.");
        setAllRoles([]); // Mock data
      } catch (err: any) {
        console.error('Error fetching roles:', err);
        toast.error('Failed to load roles. Please try again.');
      } finally {
        setIsLoadingRoles(false);
      }
    };

    fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  // Set selected roles from initialData when in edit mode and roles are loaded
  useEffect(() => {
    if (mode === 'edit' && initialData?.incentive?.paymentStructure && allRoles.length > 0) {
      const roleIds = new Set<string>();
      
      // Extract role IDs from payment structures
      if (initialData.incentive.paymentStructure.nonConditional) {
        Object.keys(initialData.incentive.paymentStructure.nonConditional).forEach(key => {
          if (key.startsWith('role_')) {
            const roleId = key.replace('role_', '');
            roleIds.add(roleId);
          }
        });
      }
      
      if (initialData.incentive.paymentStructure.conditional) {
        const { belowThreshold, aboveThreshold } = initialData.incentive.paymentStructure.conditional;
        [belowThreshold, aboveThreshold].forEach(structure => {
          if (structure) {
            Object.keys(structure).forEach(key => {
              if (key.startsWith('role_')) {
                const roleId = key.replace('role_', '');
                roleIds.add(roleId);
              }
            });
          }
        });
      }
      
      // Set selected roles if we found any
      if (roleIds.size > 0) {
        setSelectedRoleIds(roleIds);
      }
    }
  }, [mode, initialData, allRoles]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        duration: initialData.duration,
        maxAttendees: initialData.maxAttendees,
        incentive: initialData.incentive,
        rules: initialData.rules ?? {
          requireAdvanceBooking: false,
          minAdvanceHours: 0,
          enableCancellationWindow: false,
          cancellationCutoffHours: 0
        }
      });
      
    } else {
      // Reset form data and selected roles when no initial data (create mode or dialog closed)
      setFormData({
        name: '',
        duration: 0,
        maxAttendees: 1,
        incentive: {
          type: 'fixed',
          isConditional: false,
          maxStaff: 1,
          staffPoolPercentage: 100,
          paymentStructure: {
            nonConditional: createEmptyRateStructure()
          },
          staffWeightage: [{ id: 1, position: 1, title: 'Head Staff', percentage: 100 }]
        },
        rules: {
          requireAdvanceBooking: false,
          minAdvanceHours: 0,
          enableCancellationWindow: false,
          cancellationCutoffHours: 0
        }
      });
      // Reset selected roles when switching to create mode
      if (mode === 'create') {
        setSelectedRoleIds(new Set());
      }
    }
  }, [initialData, mode]);

  // Transform form data to API format
  const transformFormDataToAPI = (data: ServiceFormData): any => {
    // Get organization_id from user (only needed for create, not update)
    const organizationId = (user as any)?.current_organization_id || (user as any)?.organization_id;
    if (mode === 'create' && !organizationId) {
      throw new Error('User must be part of an organization to create service categories');
    }

    // Transform payment structures
    const paymentStructures: any[] = [];
    const selectedRoles = getSelectedRoles();

    if (data.incentive.isConditional && data.incentive.paymentStructure.conditional) {
      const { threshold, belowThreshold, aboveThreshold } = data.incentive.paymentStructure.conditional;
      
      // Below threshold
      selectedRoles.forEach(role => {
        const roleIdStr = String(role.id);
        const roleKey = `role_${roleIdStr}`;
        if (belowThreshold[roleKey] !== undefined && belowThreshold[roleKey] !== null) {
          paymentStructures.push({
            role_id: roleIdStr, // UUID string
            payment_type: 'below_threshold',
            value: parseFloat(belowThreshold[roleKey]?.toString() || '0')
          });
        }
      });

      // Above threshold
      selectedRoles.forEach(role => {
        const roleIdStr = String(role.id);
        const roleKey = `role_${roleIdStr}`;
        if (aboveThreshold[roleKey] !== undefined && aboveThreshold[roleKey] !== null) {
          paymentStructures.push({
            role_id: roleIdStr, // UUID string
            payment_type: 'above_threshold',
            value: parseFloat(aboveThreshold[roleKey]?.toString() || '0')
          });
        }
      });

      const result: any = {
        name: data.name,
        duration: data.duration,
        max_attendees: data.maxAttendees || null,
        incentive_type: data.incentive.type,
        is_conditional: true,
        max_staff: data.incentive.staffWeightage.length,
        staff_pool_percentage: data.incentive.staffPoolPercentage || 100,
        threshold: threshold,
        require_advance_booking: data.rules?.requireAdvanceBooking || false,
        min_advance_hours: data.rules?.minAdvanceHours || 0,
        enable_cancellation_window: data.rules?.enableCancellationWindow || false,
        cancellation_cutoff_hours: data.rules?.cancellationCutoffHours || 0,
        payment_structures: paymentStructures,
        staff_weightage: data.incentive.staffWeightage.map(sw => ({
          position: sw.position,
          title: sw.title,
          percentage: sw.percentage
        }))
      };
      
      // Only include organization_id for create mode
      if (mode === 'create' && organizationId) {
        result.organization_id = organizationId;
      }
      
      return result;
    } else {
      // Non-conditional
      selectedRoles.forEach(role => {
        const roleIdStr = String(role.id);
        const roleKey = `role_${roleIdStr}`;
        const structure = data.incentive.paymentStructure.nonConditional || {};
        if (structure[roleKey] !== undefined && structure[roleKey] !== null) {
          paymentStructures.push({
            role_id: roleIdStr, // UUID string
            payment_type: 'non_conditional',
            value: parseFloat(structure[roleKey]?.toString() || '0')
          });
        }
      });

      const result: any = {
        name: data.name,
        duration: data.duration,
        max_attendees: data.maxAttendees || null,
        incentive_type: data.incentive.type,
        is_conditional: false,
        max_staff: data.incentive.staffWeightage.length,
        staff_pool_percentage: data.incentive.staffPoolPercentage || 100,
        require_advance_booking: data.rules?.requireAdvanceBooking || false,
        min_advance_hours: data.rules?.minAdvanceHours || 0,
        enable_cancellation_window: data.rules?.enableCancellationWindow || false,
        cancellation_cutoff_hours: data.rules?.cancellationCutoffHours || 0,
        payment_structures: paymentStructures,
        staff_weightage: data.incentive.staffWeightage.map(sw => ({
          position: sw.position,
          title: sw.title,
          percentage: sw.percentage
        }))
      };
      
      // Only include organization_id for create mode
      if (mode === 'create' && organizationId) {
        result.organization_id = organizationId;
      }
      
      return result;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate percentages before submission
    const total = getTotalPercentage();
    if (Math.abs(total - 100) >= 0.01) {
      setError(`Total weightage must equal 100%. Current total: ${total.toFixed(1)}%`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Transform and submit to API
      const apiData = transformFormDataToAPI(formData);
      
      // TODO: Replace with actual oRPC client call
      // if (mode === 'edit' && initialData && (initialData.id || (initialData as any)?.categoryId)) {
      //   const categoryId = (initialData as any)?.categoryId || initialData.id.toString();
      //   await apiClient.putUpdateServiceCategory({
      //     category_id: categoryId,
      //     body: apiData
      //   });
      //   toast.success('Service category updated successfully');
      // } else {
      //   await apiClient.postCreateServiceCategory({ body: apiData });
      //   toast.success('Service category created successfully');
      // }
      console.warn("API call to create/update service category is mocked.", apiData);
      toast.success(`Service category ${mode === 'create' ? 'created' : 'updated'} successfully (simulated)`);

      // Call the onSubmit callback for parent component to refresh data
      await onSubmit(formData, initialData?.id);
      onClose();
    } catch (err: any) {
      const errorMessage = err?.message || err?.detail || 'An error occurred while saving';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => {
      // Handle nested object paths (e.g., 'incentive.type', 'incentive.paymentStructure.nonConditional.juniorStaff')
      const path = name.split('.');
      const newData = { ...prev };
      
      // Handle top-level fields that don't have dots
      if (path.length === 1) {
        const fieldName = path[0];
        if (fieldName === 'maxAttendees') {
          newData.maxAttendees = value === '' ? undefined : (type === 'number' ? parseFloat(value) || undefined : undefined);
          return newData;
        }
      }
      
      let current: any = newData;
      for (let i = 0; i < path.length - 1; i++) {
        if (!(path[i] in current)) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      
      const lastKey = path[path.length - 1];
      current[lastKey] = type === 'number' ? parseFloat(value) || 0 : value;
      
      return newData;
    });
  };

  // Update the handleConditionalToggle function
  const handleConditionalToggle = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      incentive: {
        ...prev.incentive,
        isConditional: checked,
        paymentStructure: checked 
          ? { 
              conditional: { 
                threshold: 10, 
                belowThreshold: createEmptyRateStructure(),
                aboveThreshold: createEmptyRateStructure()
              } 
            }
          : { 
              nonConditional: createEmptyRateStructure()
            }
      }
    }));
  };

  // Replace the renderStaffRates function with a new implementation
  const renderStaffRates = (section: 'nonConditional' | 'belowThreshold' | 'aboveThreshold') => {
    const getStructure = (): StaffRateStructure => {
      if (section === 'nonConditional') {
        return formData.incentive.paymentStructure.nonConditional || {};
      } else if (formData.incentive.paymentStructure.conditional) {
        return formData.incentive.paymentStructure.conditional[section] || {};
      }
      return {};
    };

    const structure = getStructure();
    const selectedRoles = getSelectedRoles();

    return (
      <div className="space-y-4">
        {selectedRoles.map((role) => {
          const roleIdStr = String(role.id);
          const fieldName = `role_${roleIdStr}`;
          const inputName =
            section === 'nonConditional'
              ? `incentive.paymentStructure.nonConditional.${fieldName}`
              : `incentive.paymentStructure.conditional.${section}.${fieldName}`;
          return (
            <div key={roleIdStr} className="flex items-center gap-3">
              <div className="flex-1">
                <label htmlFor={`${section}-${fieldName}`} className="block text-sm font-medium text-gray-700">
                  {role.name} {formData.incentive.type === 'fixed' ? '(RM)' : '(%)'}
                </label>
                <input
                  type="number"
                  id={`${section}-${fieldName}`}
                  name={inputName}
                  min="0"
                  step={formData.incentive.type === 'fixed' ? "0.01" : "0.1"}
                  value={structure[fieldName] || 0}
                  onChange={handleChange}
                  className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRole(role.id)}
                className="mt-6 p-2 text-gray-400 hover:text-gray-600"
                disabled={selectedRoles.length <= 1}
                title="Remove role"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // Add function to handle adding new staff weightage
  const addStaffWeightage = () => {
    if (isAddingStaff || formData.incentive.staffWeightage.length >= 4) return;
    
    setIsAddingStaff(true);
    
    const currentStaff = formData.incentive.staffWeightage;
    const newId = Math.max(0, ...currentStaff.map(s => s.id)) + 1;
    const staffTitles = ['Head Staff', 'Staff 2', 'Staff 3', 'Staff 4'];
    const newPosition = currentStaff.length + 1;
    
    // Create new staff member with 0% by default (user will enter manually)
    const newStaff = {
      id: newId,
      position: newPosition,
      title: staffTitles[currentStaff.length] || `Staff ${newPosition}`,
      percentage: 0
    };
    
    setFormData(prev => ({
      ...prev,
      incentive: {
        ...prev.incentive,
        staffWeightage: [...currentStaff, newStaff]
      }
    }));
    
    // Reset flag after state update
    setTimeout(() => setIsAddingStaff(false), 100);
  };

  // Add function to handle removing staff weightage
  const removeStaffWeightage = (staffId: number) => {
    if (formData.incentive.staffWeightage.length <= 1) return; // Prevent removing the last staff
    
    const remainingStaff = formData.incentive.staffWeightage.filter(s => s.id !== staffId);
    const staffTitles = ['Head Staff', 'Staff 2', 'Staff 3', 'Staff 4'];
    
    // Update remaining staff with new positions and titles only (keep percentages as-is)
    const updatedStaff = remainingStaff.map((staff, index) => ({
      ...staff,
      position: index + 1,
      title: staffTitles[index] || `Staff ${index + 1}`
      // Keep existing percentage - don't auto-adjust
    }));
    
    setFormData(prev => ({
      ...prev,
      incentive: {
        ...prev.incentive,
        staffWeightage: updatedStaff
      }
    }));
  };

  // Add function to handle staff weightage percentage change - manual entry only
  const handleStaffWeightageChange = (staffId: number, value: number) => {
    setFormData(prev => {
      const newData = { ...prev };
      const staffWeightage = newData.incentive.staffWeightage;
      const staffIndex = staffWeightage.findIndex(s => s.id === staffId);
      
      if (staffIndex !== -1) {
        // Just update the value without adjusting others
        staffWeightage[staffIndex].percentage = Math.max(0, Math.min(100, value));
      }

      return newData;
    });
  };

  // Validate that total percentages equal 100%
  const getTotalPercentage = () => {
    return formData.incentive.staffWeightage.reduce((sum, staff) => sum + staff.percentage, 0);
  };

  const isPercentageValid = () => {
    return Math.abs(getTotalPercentage() - 100) < 0.01; // Allow small floating point errors
  };


  return (
    <Fragment>
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
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
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h1"
                  className="text-lg font-medium leading-6 text-gray-900 mb-4"
                >
                  {mode === 'create' ? 'Add New Service Category' : 'Edit Service Category'}
                </Dialog.Title>

                {error && (
                  <div className="mb-4 p-2 text-red-700 bg-red-100 rounded">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Service Category Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      id="name"
                      required
                      placeholder="e.g., Personal Training (1-on-1)"
                      value={formData.name}
                      onChange={handleChange}
                      className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                    />
                  </div>

                  

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                        Duration (minutes) *
                      </label>
                      <input
                        type="number"
                        name="duration"
                        id="duration"
                        required
                        min="0"
                        value={formData.duration}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="maxAttendees" className="block text-sm font-medium text-gray-700">
                        Maximum Attendees/Customers
                      </label>
                      <input
                        type="number"
                        name="maxAttendees"
                        id="maxAttendees"
                        min="1"
                        placeholder="No limit"
                        value={formData.maxAttendees || ''}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty for unlimited attendees
                      </p>
                    </div>
                  </div>

                  {/* Booking & Cancellation Rules (moved under Duration) */}
                  <div className="bg-white border border-gray-200 rounded-md p-4">
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Booking & Cancellation Rules</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="requireAdvanceBooking"
                          name="rules.requireAdvanceBooking"
                          checked={formData.rules?.requireAdvanceBooking || false}
                          onChange={(e) => handleChange({
                            ...e,
                            target: { ...e.target, name: 'rules.requireAdvanceBooking', value: (e.target as HTMLInputElement).checked, type: 'checkbox' }
                          } as any)}
                          className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                        />
                        <label htmlFor="requireAdvanceBooking" className="text-sm text-gray-700">Require advance booking</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="enableCancellationWindow"
                          name="rules.enableCancellationWindow"
                          checked={formData.rules?.enableCancellationWindow || false}
                          onChange={(e) => handleChange({
                            ...e,
                            target: { ...e.target, name: 'rules.enableCancellationWindow', value: (e.target as HTMLInputElement).checked, type: 'checkbox' }
                          } as any)}
                          className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                        />
                        <label htmlFor="enableCancellationWindow" className="text-sm text-gray-700">Enable cancellation window</label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <label htmlFor="minAdvanceHours" className="block text-sm font-medium text-gray-700">
                          Min advance booking (hours)
                        </label>
                        <input
                          type="number"
                          id="minAdvanceHours"
                          name="rules.minAdvanceHours"
                          min="0"
                          value={formData.rules?.minAdvanceHours ?? 0}
                          onChange={handleChange}
                          className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          disabled={!formData.rules?.requireAdvanceBooking}
                          placeholder={formData.rules?.requireAdvanceBooking ? undefined : "Not required"}
                        />
                      </div>
                      <div>
                        <label htmlFor="cancellationCutoffHours" className="block text-sm font-medium text-gray-700">
                          Cancellation cutoff (hours)
                        </label>
                        <input
                          type="number"
                          id="cancellationCutoffHours"
                          name="rules.cancellationCutoffHours"
                          min="0"
                          value={formData.rules?.cancellationCutoffHours ?? 0}
                          onChange={handleChange}
                          className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                          disabled={!formData.rules?.enableCancellationWindow}
                          placeholder={formData.rules?.enableCancellationWindow ? undefined : "Not required"}
                        />
                      </div>
                    </div>
                  </div>

                  

                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Staff Payment Incentive Structure</h3>
                    
                    <div className="space-y-6">
                      {/* Step 1: Payment Type */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-md font-medium text-gray-900 mb-2">Step 1: Choose Payment Type</h4>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id="fixedPayment"
                                name="incentive.type"
                                value="fixed"
                                checked={formData.incentive.type === 'fixed'}
                                onChange={handleChange}
                                className="h-4 w-4 text-black focus:ring-black border-gray-300"
                              />
                              <label htmlFor="fixedPayment" className="ml-2 block text-sm text-gray-700">
                                Fixed Amount (RM per appointment)
                              </label>
                            </div>
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id="variablePayment"
                                name="incentive.type"
                                value="variable"
                                checked={formData.incentive.type === 'variable'}
                                onChange={handleChange}
                                className="h-4 w-4 text-black focus:ring-black border-gray-300"
                              />
                              <label htmlFor="variablePayment" className="ml-2 block text-sm text-gray-700">
                                Variable (% of appointment commission)
                              </label>
                            </div>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {formData.incentive.type === 'fixed' 
                              ? 'Set a fixed amount in RM for each appointment'
                              : 'Set a percentage of the appointment commission'}
                          </p>
                        </div>
                      </div>

                      {/* Step 2: Payment Rules */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-md font-medium text-gray-900 mb-2">Step 2: Define Payment Rules</h4>
                        
                        {/* Conditional Toggle */}
                        <div className="mb-4">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="isConditional"
                              name="incentive.isConditional"
                              checked={formData.incentive.isConditional}
                              onChange={(e) => handleConditionalToggle(e.target.checked)}
                              className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                            />
                            <label htmlFor="isConditional" className="ml-2 block text-sm text-gray-700">
                              Enable conditional payment based on attendee count
                            </label>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Set different rates based on the number of attendees
                          </p>
                        </div>

                        {/* Add Role Dropdown */}
                        <div className="mb-4">
                          <div className="flex items-center gap-3">
                            <select
                              onChange={(e) => {
                                const roleId = e.target.value;
                                if (roleId && !selectedRoleIds.has(roleId)) {
                                  addRole(roleId);
                                  e.target.value = '';
                                }
                              }}
                              className="flex-1 p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                              defaultValue=""
                              disabled={isLoadingRoles}
                            >
                              <option value="">
                                {isLoadingRoles ? 'Loading roles...' : 'Select a role to add...'}
                              </option>
                              {getAvailableRoles().map((role) => (
                                <option key={String(role.id)} value={String(role.id)}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {!isLoadingRoles && getAvailableRoles().length === 0 && allRoles.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">All roles have been added</p>
                          )}
                          {!isLoadingRoles && allRoles.length === 0 && (
                            <p className="text-xs text-gray-500 mt-1">No roles available. Please create roles first.</p>
                          )}
                        </div>

                        {/* Non-conditional Payment Structure */}
                        {!formData.incentive.isConditional && (
                          <div className="space-y-4">
                            <p className="text-sm text-gray-700">Set {formData.incentive.type === 'fixed' ? 'fixed amount' : 'percentage'} for each staff level:</p>
                            {renderStaffRates('nonConditional')}
                          </div>
                        )}

                        {/* Conditional Payment Structure */}
                        {formData.incentive.isConditional && (
                          <div className="space-y-6">
                            <div>
                              <label htmlFor="threshold" className="block text-sm font-medium text-gray-700">
                                Attendee Threshold
                              </label>
                              <div className="mt-1">
                                <input
                                  type="number"
                                  name="incentive.paymentStructure.conditional.threshold"
                                  id="threshold"
                                  min="1"
                                  value={formData.incentive.paymentStructure.conditional?.threshold ?? 10}
                                  onChange={handleChange}
                                  className="block w-32 p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                                />
                                <p className="text-sm text-gray-500 mt-1">
                                  Different rates will apply above and below this number of attendees
                                </p>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <h5 className="text-sm font-medium text-gray-900">Below {formData.incentive.paymentStructure.conditional?.threshold ?? 10} Attendees</h5>
                                {renderStaffRates('belowThreshold')}
                              </div>

                              <div>
                                <h5 className="text-sm font-medium text-gray-900">{formData.incentive.paymentStructure.conditional?.threshold ?? 10} or More Attendees</h5>
                                {renderStaffRates('aboveThreshold')}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Step 3: Staff Allocation & Weightage */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-md font-medium text-gray-900 mb-2">Step 3: Staff Allocation & Weightage</h4>
                        <div className="space-y-4">
                          {/* Staff Commission Pool (%) */}
                          <div>
                            <label htmlFor="staffPoolPercentage" className="block text-sm font-medium text-gray-700">
                              Staff Commission Pool (%)
                            </label>
                            <input
                              type="number"
                              id="staffPoolPercentage"
                              name="incentive.staffPoolPercentage"
                              min="0"
                              max="100"
                              step="0.1"
                              value={formData.incentive.staffPoolPercentage ?? 100}
                              onChange={handleChange}
                              className="mt-1 block w-40 p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Percentage of sale/commission allocated to staff, to be split by weightage.
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="text-sm font-medium text-gray-900">Staff Weightage Distribution</h5>
                              <div className={`text-sm font-medium ${
                                isPercentageValid() ? 'text-green-600' : 'text-red-600'
                              }`}>
                                Total: {getTotalPercentage().toFixed(1)}%
                              </div>
                            </div>
                            <p className="text-sm text-gray-500 mb-4">
                              Total weightage must equal 100%. You can manually enter percentages for each staff member.
                            </p>
                            {!isPercentageValid() && (
                              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                                <p className="text-sm text-red-700">
                                  Total weightage must equal 100%. Current total: {getTotalPercentage().toFixed(1)}%
                                </p>
                              </div>
                            )}
                            <div className="space-y-4">
                              {formData.incentive.staffWeightage.map((staff) => (
                                <div key={staff.id} className="flex items-center gap-4">
                                  <div className="flex-1">
                                    <label htmlFor={`staff-weight-${staff.id}`} className="block text-sm font-medium text-gray-700">
                                      {staff.title} (%)
                                    </label>
                                    <input
                                      type="number"
                                      id={`staff-weight-${staff.id}`}
                                      min="0"
                                      max="100"
                                      value={staff.percentage}
                                      onChange={(e) => handleStaffWeightageChange(staff.id, parseFloat(e.target.value) || 0)}
                                      className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeStaffWeightage(staff.id)}
                                    className="mt-6 p-2 text-gray-400 hover:text-gray-600"
                                    disabled={formData.incentive.staffWeightage.length === 1}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={addStaffWeightage}
                                disabled={formData.incentive.staffWeightage.length >= 4 || isAddingStaff}
                                className="mt-2 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                Add Staff
                              </button>
                              <p className="text-sm text-gray-500 mt-2">
                                {formData.incentive.staffWeightage.length}/4 staff members allocated
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-between space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !isPercentageValid()}
                      className="inline-flex justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (mode === 'create' ? 'Creating...' : 'Saving...') : (mode === 'create' ? 'Create Service Category' : 'Save Changes')}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
    </Fragment>
  );
}





