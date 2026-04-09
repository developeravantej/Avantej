import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState, useEffect } from 'react';

interface StaffWeightage {
  id: number;
  position: number;
  title: string;
  percentage: number;
}

interface Role {
  id: number;
  name: string;
}

interface StaffRateStructure {
  [key: string]: number; // This allows dynamic role IDs as keys
}

interface ServiceFormData {
  name: string;
  description: string;
  commission: number;
  duration: number;
  category: string;
  status: 'active' | 'inactive';
  incentive: {
    type: 'fixed' | 'variable';
    isConditional: boolean;
    maxStaff: number;
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
}

interface ServiceFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ServiceFormData, serviceId?: number) => Promise<void>;
  initialData?: ServiceFormData & { id: number };
  mode?: 'create' | 'edit';
}

export function ServiceFormDialog({ isOpen, onClose, onSubmit, initialData, mode = 'create' }: ServiceFormDialogProps) {
  // Move roles to the top level - in the future, this could be fetched from an API
  const roles: Role[] = [
    { id: 1, name: 'Role 1' },
    { id: 2, name: 'Role 2' },
    { id: 3, name: 'Role 3' },
    // { id: 4, name: 'Role 4' }
  ];

  // Helper function to create an empty rate structure
  const createEmptyRateStructure = (): StaffRateStructure => {
    return roles.reduce((acc, role) => {
      acc[`role_${role.id}`] = 0;
      return acc;
    }, {} as StaffRateStructure);
  };

  const [formData, setFormData] = useState<ServiceFormData>({
    name: '',
    description: '',
    commission: 0,
    duration: 0,
    category: '',
    status: 'active',
    incentive: {
      type: 'fixed',
      isConditional: false,
      maxStaff: 1,
      paymentStructure: {
        nonConditional: createEmptyRateStructure()
      },
      staffWeightage: [{ id: 1, position: 1, title: 'Head Staff', percentage: 100 }]
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        description: initialData.description,
        commission: initialData.commission,
        duration: initialData.duration,
        category: initialData.category,
        status: initialData.status,
        incentive: initialData.incentive,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        commission: 0,
        duration: 0,
        category: '',
        status: 'active',
        incentive: {
          type: 'fixed',
          isConditional: false,
          maxStaff: 1,
          paymentStructure: {
            nonConditional: createEmptyRateStructure()
          },
          staffWeightage: [{ id: 1, position: 1, title: 'Head Staff', percentage: 100 }]
        },
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(formData, initialData?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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
        return formData.incentive.paymentStructure.nonConditional || createEmptyRateStructure();
      } else if (formData.incentive.paymentStructure.conditional) {
        return formData.incentive.paymentStructure.conditional[section] || createEmptyRateStructure();
      }
      return createEmptyRateStructure();
    };

    const structure = getStructure();

    return (
      <div className="grid grid-cols-2 gap-4">
        {roles.map((role) => {
          const fieldName = `role_${role.id}`;
          return (
            <div key={role.id}>
              <label htmlFor={`${section}-${fieldName}`} className="block text-sm font-medium text-brand-primary-1">
                {role.name} {formData.incentive.type === 'fixed' ? '(RM)' : '(%)'}
              </label>
              <input
                type="number"
                id={`${section}-${fieldName}`}
                name={`incentive.paymentStructure.${section}.${fieldName}`}
                min="0"
                step={formData.incentive.type === 'fixed' ? "0.01" : "0.1"}
                value={structure[fieldName] || 0}
                onChange={handleChange}
                className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
              />
            </div>
          );
        })}
      </div>
    );
  };

  // Add function to handle adding new staff weightage
  const addStaffWeightage = () => {
    setFormData(prev => {
      const newData = { ...prev };
      const staffWeightage = newData.incentive.staffWeightage;
      const newId = Math.max(0, ...staffWeightage.map(s => s.id)) + 1;
      
      // Define fixed staff titles
      const staffTitles = ['Head Staff', 'Staff 2', 'Staff 3', 'Staff 4'];
      
      // Adjust percentages
      const newPercentage = Math.floor(100 / (staffWeightage.length + 1));
      staffWeightage.forEach(staff => {
        staff.percentage = newPercentage;
      });
      
      staffWeightage.push({
        id: newId,
        position: staffWeightage.length + 1,
        title: staffTitles[staffWeightage.length], // Use the predefined title based on current length
        percentage: newPercentage
      });

      return newData;
    });
  };

  // Add function to handle removing staff weightage
  const removeStaffWeightage = (staffId: number) => {
    setFormData(prev => {
      const newData = { ...prev };
      const staffWeightage = newData.incentive.staffWeightage.filter(s => s.id !== staffId);
      
      // Define fixed staff titles
      const staffTitles = ['Staff 1', 'Staff 2', 'Staff 3', 'Staff 4'];
      
      // Update titles and positions based on new order
      staffWeightage.forEach((staff, index) => {
        staff.position = index + 1;
        staff.title = staffTitles[index];
      });
      
      // Redistribute percentages
      const newPercentage = Math.floor(100 / staffWeightage.length);
      staffWeightage.forEach(staff => {
        staff.percentage = newPercentage;
      });
      
      // Add remaining percentage to the first staff
      const remainingPercentage = 100 - (newPercentage * staffWeightage.length);
      if (remainingPercentage > 0 && staffWeightage.length > 0) {
        staffWeightage[0].percentage += remainingPercentage;
      }

      newData.incentive.staffWeightage = staffWeightage;
      return newData;
    });
  };

  // Add function to handle staff weightage percentage change
  const handleStaffWeightageChange = (staffId: number, value: number) => {
    setFormData(prev => {
      const newData = { ...prev };
      const staffWeightage = newData.incentive.staffWeightage;
      const staffIndex = staffWeightage.findIndex(s => s.id === staffId);
      
      if (staffIndex !== -1) {
        const oldValue = staffWeightage[staffIndex].percentage;
        const difference = value - oldValue;
        
        // Adjust other percentages proportionally
        const otherStaff = staffWeightage.filter((_, index) => index !== staffIndex);
        const totalOtherPercentage = otherStaff.reduce((sum, staff) => sum + staff.percentage, 0);
        
        if (totalOtherPercentage > 0) {
          otherStaff.forEach(staff => {
            const ratio = staff.percentage / totalOtherPercentage;
            staff.percentage = Math.max(0, staff.percentage - (difference * ratio));
          });
        }
        
        staffWeightage[staffIndex].percentage = value;
      }

      return newData;
    });
  };

  return (
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
          <div className="fixed inset-0 bg-brand-primary-1/50" />
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
                  className="text-lg font-medium leading-6 text-brand-primary-1 mb-4"
                >
                  {mode === 'create' ? 'Add New Service' : 'Edit Service'}
                </Dialog.Title>

                {error && (
                  <div className="mb-4 p-2 text-red-700 bg-red-100 rounded">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-brand-primary-1">
                      Service Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      id="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-brand-primary-1">
                      Description
                    </label>
                    <textarea
                      name="description"
                      id="description"
                      rows={3}
                      value={formData.description}
                      onChange={handleChange}
                      className="mt-1 block w-full rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="commission" className="block text-sm font-medium text-brand-primary-1">
                        Commission ( % ) *
                      </label>
                      <input
                        type="number"
                        name="commission"
                        id="commission"
                        required
                        min="0"
                        step="0.01"
                        value={formData.commission}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="duration" className="block text-sm font-medium text-brand-primary-1">
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
                        className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="category" className="block text-sm font-medium text-brand-primary-1">
                        Category *
                      </label>
                      <input
                        type="text"
                        name="category"
                        id="category"
                        required
                        value={formData.category}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="status" className="block text-sm font-medium text-brand-primary-1">
                        Status *
                      </label>
                      <select
                        name="status"
                        id="status"
                        required
                        value={formData.status}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-brand-secondary-3 pt-4 mt-4">
                    <h3 className="text-lg font-medium text-brand-primary-1 mb-4">Staff Payment Incentive Structure</h3>
                    
                    <div className="space-y-6">
                      {/* Step 1: Payment Type */}
                      <div className="bg-brand-secondary-3/50 p-4 rounded-lg">
                        <h4 className="text-md font-medium text-brand-primary-1 mb-2">Step 1: Choose Payment Type</h4>
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
                                className="h-4 w-4 text-black focus:ring-black border-brand-secondary-3"
                              />
                              <label htmlFor="fixedPayment" className="ml-2 block text-sm text-brand-primary-1">
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
                                className="h-4 w-4 text-black focus:ring-black border-brand-secondary-3"
                              />
                              <label htmlFor="variablePayment" className="ml-2 block text-sm text-brand-primary-1">
                                Variable (% of appointment commission)
                              </label>
                            </div>
                          </div>
                          <p className="text-sm text-brand-secondary-1 mt-1">
                            {formData.incentive.type === 'fixed' 
                              ? 'Set a fixed amount in RM for each appointment'
                              : 'Set a percentage of the appointment commission'}
                          </p>
                        </div>
                      </div>

                      {/* Step 2: Payment Rules */}
                      <div className="bg-brand-secondary-3/50 p-4 rounded-lg">
                        <h4 className="text-md font-medium text-brand-primary-1 mb-2">Step 2: Define Payment Rules</h4>
                        
                        {/* Conditional Toggle */}
                        <div className="mb-4">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="isConditional"
                              name="incentive.isConditional"
                              checked={formData.incentive.isConditional}
                              onChange={(e) => handleConditionalToggle(e.target.checked)}
                              className="h-4 w-4 text-black focus:ring-black border-brand-secondary-3 rounded"
                            />
                            <label htmlFor="isConditional" className="ml-2 block text-sm text-brand-primary-1">
                              Enable conditional payment based on attendee count
                            </label>
                          </div>
                          <p className="text-sm text-brand-secondary-1 mt-1">
                            Set different rates based on the number of attendees
                          </p>
                        </div>

                        {/* Non-conditional Payment Structure */}
                        {!formData.incentive.isConditional && (
                          <div className="space-y-4">
                            <p className="text-sm text-brand-primary-1">Set {formData.incentive.type === 'fixed' ? 'fixed amount' : 'percentage'} for each staff level:</p>
                            {renderStaffRates('nonConditional')}
                          </div>
                        )}

                        {/* Conditional Payment Structure */}
                        {formData.incentive.isConditional && (
                          <div className="space-y-6">
                            <div>
                              <label htmlFor="threshold" className="block text-sm font-medium text-brand-primary-1">
                                Attendee Threshold
                              </label>
                              <div className="mt-1">
                                <input
                                  type="number"
                                  name="incentive.paymentStructure.conditional.threshold"
                                  id="threshold"
                                  min="1"
                                  value={formData.incentive.paymentStructure.conditional?.threshold || 10}
                                  onChange={handleChange}
                                  className="block w-32 p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                                />
                                <p className="text-sm text-brand-secondary-1 mt-1">
                                  Different rates will apply above and below this number of attendees
                                </p>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <h5 className="text-sm font-medium text-brand-primary-1">Below {formData.incentive.paymentStructure.conditional?.threshold || 10} Attendees</h5>
                                {renderStaffRates('belowThreshold')}
                              </div>

                              <div>
                                <h5 className="text-sm font-medium text-brand-primary-1">{formData.incentive.paymentStructure.conditional?.threshold || 10} or More Attendees</h5>
                                {renderStaffRates('aboveThreshold')}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Step 3: Staff Allocation & Weightage */}
                      <div className="bg-brand-secondary-3/50 p-4 rounded-lg">
                        <h4 className="text-md font-medium text-brand-primary-1 mb-2">Step 3: Staff Allocation & Weightage</h4>
                        <div className="space-y-4">
                          <div>
                            <h5 className="text-sm font-medium text-brand-primary-1 mb-2">Staff Weightage Distribution</h5>
                            <p className="text-sm text-brand-secondary-1 mb-4">
                              Total weightage must equal 100%. Percentages will be automatically adjusted when adding or removing staff.
                            </p>
                            <div className="space-y-4">
                              {formData.incentive.staffWeightage.map((staff) => (
                                <div key={staff.id} className="flex items-center gap-4">
                                  <div className="flex-1">
                                    <label htmlFor={`staff-weight-${staff.id}`} className="block text-sm font-medium text-brand-primary-1">
                                      {staff.title} (%)
                                    </label>
                                    <input
                                      type="number"
                                      id={`staff-weight-${staff.id}`}
                                      min="0"
                                      max="100"
                                      value={staff.percentage}
                                      onChange={(e) => handleStaffWeightageChange(staff.id, parseFloat(e.target.value) || 0)}
                                      className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeStaffWeightage(staff.id)}
                                    className="mt-6 p-2 text-brand-secondary-1 hover:text-brand-primary-1"
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
                                disabled={formData.incentive.staffWeightage.length >= 4}
                                className="mt-2 inline-flex items-center px-3 py-2 border border-brand-secondary-3 shadow-sm text-sm leading-4 font-medium rounded-md text-brand-primary-1 bg-white hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                Add Staff
                              </button>
                              <p className="text-sm text-brand-secondary-1 mt-2">
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
                      className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                    >
                      {isSubmitting ? (mode === 'create' ? 'Adding...' : 'Saving...') : (mode === 'create' ? 'Add Service' : 'Save Changes')}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
