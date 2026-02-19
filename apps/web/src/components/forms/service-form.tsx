import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orpc, client } from '@/utils/orpc';
import { useUserContext } from '@/hooks/useUserContext';
import { toast } from 'sonner';


interface ServiceFormData {
  name: string;
  duration: number;
  duration_unit: string;
  expirable: boolean;
  price: number;
  sessions: number;
  taxable: boolean;
  tax_percentage: number;
  category_id: string;
  schedulingType: 'appointment-based' | 'time-preset';
  sessionDurationMinutes: number;
  maxAttendees: number;
  timePresetConfig?: {
    recurringDays: string[];
    timeSlotsPerDay: { [day: string]: string[] };
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
  const { data: userCtx } = useUserContext();
  const organizationId = userCtx?.currentOrganizationId ?? "";
  const qc = useQueryClient();

  const { data: serviceCategories = [], isLoading: isLoadingCategories } = useQuery({
    ...orpc.serviceCategories.list.queryOptions({ organizationId, isActive: true }),
    enabled: isOpen && !!organizationId,
  });

  // NOTE: sessions/expirable/expiry fields are package concepts, not service fields. Phase A (Option A): submit only valid service fields.
  const createMutation = useMutation({
    mutationFn: (data: ServiceFormData) =>
      client.services.create({
        organizationId,
        name: data.name,
        categoryId: data.category_id || null,
        duration: data.sessionDurationMinutes * 60, // minutes → seconds
        durationUnitType: "minutes",
        maxAttendees: data.maxAttendees ?? 1,
        attendanceThreshold: null,
        branchId: null,
        isActive: true,
        price: data.price ? Math.round(data.price * 100) : null, // dollars → cents
        taxable: data.taxable,
        taxPercentage: data.taxable ? Math.round(data.tax_percentage) : 0,
        schedulingType: data.schedulingType === "appointment-based" ? "appointment" : "class_slot",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orpc.services.list.queryKey() });
      toast.success("Service created successfully");
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to create service"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: ServiceFormData) =>
      client.services.update({
        organizationId,
        id: initialData!.id.toString(),
        name: data.name,
        categoryId: data.category_id || null,
        duration: data.sessionDurationMinutes * 60, // minutes → seconds
        durationUnitType: "minutes",
        maxAttendees: data.maxAttendees ?? 1,
        price: data.price ? Math.round(data.price * 100) : null, // dollars → cents
        taxable: data.taxable,
        taxPercentage: data.taxable ? Math.round(data.tax_percentage) : 0,
        schedulingType: data.schedulingType === "appointment-based" ? "appointment" : "class_slot",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orpc.services.list.queryKey() });
      toast.success("Service updated successfully");
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update service"),
  });

  const [formData, setFormData] = useState<ServiceFormData>({
    name: '',
    duration: 1,
    duration_unit: 'day',
    expirable: false,
    price: 0,
    sessions: 1,
    taxable: false,
    tax_percentage: 6,
    category_id: '',
    schedulingType: 'appointment-based',
    sessionDurationMinutes: 60,
    maxAttendees: 1,
    timePresetConfig: {
      recurringDays: [],
      timeSlotsPerDay: {}
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        duration: initialData.duration,
        duration_unit: initialData.duration_unit,
        expirable: initialData.expirable,
        price: initialData.price,
        sessions: initialData.sessions,
        taxable: initialData.taxable,
        tax_percentage: initialData.tax_percentage,
        category_id: initialData.category_id,
        schedulingType: initialData.schedulingType || 'appointment-based',
        sessionDurationMinutes: initialData.sessionDurationMinutes ?? 60,
        maxAttendees: initialData.maxAttendees ?? 1,
        timePresetConfig: initialData.timePresetConfig || {
          recurringDays: [],
          timeSlotsPerDay: {}
        },
      });
    } else {
      setFormData({
        name: '',
        duration: 1,
        duration_unit: 'day',
        expirable: false,
        price: 0,
        sessions: 1,
        taxable: false,
        tax_percentage: 6,
        category_id: '',
        schedulingType: 'appointment-based',
        sessionDurationMinutes: 60,
        maxAttendees: 1,
        timePresetConfig: {
          recurringDays: [],
          timeSlotsPerDay: {}
        },
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!organizationId) {
        throw new Error('User must be part of an organization to create services');
      }

      if (mode === 'edit' && initialData?.id) {
        await updateMutation.mutateAsync(formData);
      } else {
        await createMutation.mutateAsync(formData);
      }

      // Call the onSubmit callback for parent component to refresh data
      await onSubmit(formData, initialData?.id);
    } catch (err: any) {
      const errorMessage = err?.message || err?.detail || 'An error occurred';
      setError(errorMessage);
      // Mutation onError already toasts, so only set local error state here
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  // Calculate tax amount
  const calculateTaxAmount = () => {
    return (formData.price * formData.tax_percentage) / 100;
  };

  // Calculate total with tax
  const calculateTotalWithTax = () => {
    return formData.price + calculateTaxAmount();
  };

  // Calculate credit per session (price / sessions)
  const calculateCreditPerSession = () => {
    if (formData.sessions === 0) return 0;
    return formData.price / formData.sessions;
  };

  // Helper functions for scheduling type configuration
  const handleSchedulingTypeChange = (type: 'appointment-based' | 'time-preset') => {
    setFormData(prev => ({
      ...prev,
      schedulingType: type,
      timePresetConfig: type === 'time-preset' ? {
        recurringDays: [],
        timeSlotsPerDay: {}
      } : undefined
    }));
  };

  const handleRecurringDayToggle = (day: string) => {
    setFormData(prev => {
      if (!prev.timePresetConfig) return prev;
      
      const newDays = prev.timePresetConfig.recurringDays.includes(day)
        ? prev.timePresetConfig.recurringDays.filter(d => d !== day)
        : [...prev.timePresetConfig.recurringDays, day];
      
      // Initialize time slots for new day or remove time slots for removed day
      const newTimeSlotsPerDay = { ...prev.timePresetConfig.timeSlotsPerDay };
      if (newDays.includes(day) && !newTimeSlotsPerDay[day]) {
        newTimeSlotsPerDay[day] = ['09:00'];
      } else if (!newDays.includes(day)) {
        delete newTimeSlotsPerDay[day];
      }
      
      return {
        ...prev,
        timePresetConfig: {
          ...prev.timePresetConfig,
          recurringDays: newDays,
          timeSlotsPerDay: newTimeSlotsPerDay
        }
      };
    });
  };

  const addTimeSlot = (day: string) => {
    setFormData(prev => {
      if (!prev.timePresetConfig) return prev;
      
      const newTimeSlotsPerDay = { ...prev.timePresetConfig.timeSlotsPerDay };
      if (!newTimeSlotsPerDay[day]) {
        newTimeSlotsPerDay[day] = [];
      }
      newTimeSlotsPerDay[day] = [...newTimeSlotsPerDay[day], '09:00'];
      
      return {
        ...prev,
        timePresetConfig: {
          ...prev.timePresetConfig,
          timeSlotsPerDay: newTimeSlotsPerDay
        }
      };
    });
  };

  const removeTimeSlot = (day: string, index: number) => {
    setFormData(prev => {
      if (!prev.timePresetConfig) return prev;
      
      const newTimeSlotsPerDay = { ...prev.timePresetConfig.timeSlotsPerDay };
      if (newTimeSlotsPerDay[day]) {
        newTimeSlotsPerDay[day] = newTimeSlotsPerDay[day].filter((_, i) => i !== index);
      }
      
      return {
        ...prev,
        timePresetConfig: {
          ...prev.timePresetConfig,
          timeSlotsPerDay: newTimeSlotsPerDay
        }
      };
    });
  };

  const updateTimeSlot = (day: string, index: number, time: string) => {
    setFormData(prev => {
      if (!prev.timePresetConfig) return prev;
      
      const newTimeSlotsPerDay = { ...prev.timePresetConfig.timeSlotsPerDay };
      if (newTimeSlotsPerDay[day]) {
        const newTimeSlots = [...newTimeSlotsPerDay[day]];
        newTimeSlots[index] = time;
        newTimeSlotsPerDay[day] = newTimeSlots;
      }
      
      return {
        ...prev,
        timePresetConfig: {
          ...prev.timePresetConfig,
          timeSlotsPerDay: newTimeSlotsPerDay
        }
      };
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
                  {mode === 'create' ? 'Add New Service' : 'Edit Service'}
                </Dialog.Title>

                {error && (
                  <div className="mb-4 p-2 text-red-700 bg-red-100 rounded">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Service Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      id="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="category_id" className="block text-sm font-medium text-gray-700">
                      Service Category *
                    </label>
                    <select
                      name="category_id"
                      id="category_id"
                      required
                      value={formData.category_id}
                      onChange={handleChange}
                      disabled={isLoadingCategories}
                      className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">
                        {isLoadingCategories ? 'Loading categories...' : 'Select a category'}
                      </option>
                      {serviceCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="sessionDurationMinutes" className="block text-sm font-medium text-gray-700">
                        Session Duration (minutes) *
                      </label>
                      <input
                        type="number"
                        name="sessionDurationMinutes"
                        id="sessionDurationMinutes"
                        required
                        min="1"
                        value={formData.sessionDurationMinutes}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </div>
                    <div>
                      <label htmlFor="maxAttendees" className="block text-sm font-medium text-gray-700">
                        Max Attendees *
                      </label>
                      <input
                        type="number"
                        name="maxAttendees"
                        id="maxAttendees"
                        required
                        min="1"
                        value={formData.maxAttendees}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="expirable"
                        id="expirable"
                        checked={formData.expirable}
                        onChange={handleChange}
                        className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                      />
                      <label htmlFor="expirable" className="ml-2 text-sm font-medium text-gray-700">
                        Expirable
                      </label>
                    </div>

                    {formData.expirable && (
                      <div>
                        <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                          Duration *
                        </label>
                        <div className="mt-1 flex gap-2">
                      <input
                        type="number"
                        name="duration"
                        id="duration"
                        required
                        min="1"
                        value={formData.duration}
                        onChange={handleChange}
                        className="block flex-1 p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="1"
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                          <select
                            name="duration_unit"
                            id="duration_unit"
                            required
                            value={formData.duration_unit}
                            onChange={handleChange}
                            className="block flex-1 p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                          >
                            <option value="day">Day(s)</option>
                            <option value="week">Week(s)</option>
                            <option value="month">Month(s)</option>
                            <option value="year">Year(s)</option>
                          </select>
                        </div>
                      </div>
                    )}

                  </div>

                   <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                        Price *
                      </label>
                      <input
                        type="number"
                        name="price"
                        id="price"
                        required
                        min="0"
                        step="0.01"
                        value={formData.price}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </div>
                    <div>
                      <label htmlFor="sessions" className="block text-sm font-medium text-gray-700">
                        Sessions *
                      </label>
                      <input
                        type="number"
                        name="sessions"
                        id="sessions"
                        required
                        min="1"
                        step="1"
                        value={formData.sessions}
                        onChange={handleChange}
                        className="mt-1 block w-full p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    </div>
                  </div>
                  
                  <div>
                     <div className="mt-2 flex items-center">
                       <span className="text-sm font-medium text-gray-700">
                         Credit per Session: ${formData.sessions > 0 ? calculateCreditPerSession().toFixed(2) : '0.00'}
                       </span>
                     </div>
                     
                     {formData.sessions > 0 && formData.price > 0 && (
                       <div className="mt-3 p-3 bg-gray-50 rounded-md">
                         <div className="text-sm text-gray-600">
                           <div className="flex justify-between">
                             <span>Total Price:</span>
                             <span>${formData.price.toFixed(2)}</span>
                           </div>
                           <div className="flex justify-between">
                             <span>Number of Sessions:</span>
                             <span>{formData.sessions}</span>
                           </div>
                           <div className="flex justify-between font-medium border-t pt-1 mt-1">
                             <span>Credit per Session:</span>
                             <span>${calculateCreditPerSession().toFixed(2)}</span>
                           </div>
                         </div>
                       </div>
                     )}
                  </div>
                   
                  <div>
                     <div className="mt-2 flex items-center">
                         <input
                           type="checkbox"
                           name="taxable"
                           id="taxable"
                           checked={formData.taxable}
                           onChange={handleChange}
                           className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                         />
                         <label htmlFor="taxable" className="ml-2 text-sm font-medium text-gray-700">
                           Taxable
                         </label>
                       </div>
                       
                       {formData.taxable && (
                         <div className="mt-3 p-3 bg-gray-50 rounded-md">
                           <div className="text-sm text-gray-600">
                             <div className="flex justify-between">
                               <span>Base Price:</span>
                               <span>${formData.price.toFixed(2)}</span>
                             </div>
                             <div className="flex justify-between">
                               <span>Tax ({formData.tax_percentage}%):</span>
                               <span>${calculateTaxAmount().toFixed(2)}</span>
                             </div>
                             <div className="flex justify-between font-medium border-t pt-1 mt-1">
                               <span>Total:</span>
                               <span>${calculateTotalWithTax().toFixed(2)}</span>
                             </div>
                           </div>
                         </div>
                       )}
                  </div>

                  {/* Scheduling Type Configuration */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Scheduling Configuration</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Scheduling Type *
                        </label>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id="appointment-based"
                                name="schedulingType"
                                value="appointment-based"
                                checked={formData.schedulingType === 'appointment-based'}
                                onChange={(e) => handleSchedulingTypeChange(e.target.value as 'appointment-based' | 'time-preset')}
                                className="h-4 w-4 text-black focus:ring-black border-gray-300"
                              />
                              <label htmlFor="appointment-based" className="ml-2 block text-sm text-gray-700">
                                Appointment-Based
                              </label>
                            </div>
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id="time-preset"
                                name="schedulingType"
                                value="time-preset"
                                checked={formData.schedulingType === 'time-preset'}
                                onChange={(e) => handleSchedulingTypeChange(e.target.value as 'appointment-based' | 'time-preset')}
                                className="h-4 w-4 text-black focus:ring-black border-gray-300"
                              />
                              <label htmlFor="time-preset" className="ml-2 block text-sm text-gray-700">
                                Time-Preset (Fixed Schedule)
                              </label>
                            </div>
                          </div>
                          <p className="text-sm text-gray-500">
                            {formData.schedulingType === 'appointment-based' 
                              ? 'Sessions are booked flexibly based on coach and client availability'
                              : 'Sessions occur on predefined recurring time slots (e.g., every Monday 7 PM for classes)'
                            }
                          </p>
                        </div>
                      </div>

                      {/* Time-Preset Configuration */}
                      {formData.schedulingType === 'time-preset' && formData.timePresetConfig && (
                        <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                          <h4 className="text-md font-medium text-gray-900">Time-Preset Configuration</h4>
                          
                          {/* Recurring Days */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Recurring Days *
                            </label>
                            <div className="grid grid-cols-7 gap-2">
                              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                                <div key={day} className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`day-${day}`}
                                    checked={formData.timePresetConfig?.recurringDays.includes(day) || false}
                                    onChange={() => handleRecurringDayToggle(day)}
                                    className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                                  />
                                  <label htmlFor={`day-${day}`} className="ml-1 text-xs text-gray-700">
                                    {day.slice(0, 3)}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Time Slots per Day */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Time Slots per Day *
                            </label>
                            <div className="space-y-4">
                              {formData.timePresetConfig.recurringDays
                                .sort((a, b) => {
                                  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                                  return dayOrder.indexOf(a) - dayOrder.indexOf(b);
                                })
                                .map((day) => (
                                <div key={day} className="border border-gray-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="text-sm font-medium text-gray-900">{day}</h5>
                                    <button
                                      type="button"
                                      onClick={() => addTimeSlot(day)}
                                      className="inline-flex items-center px-2 py-1 border border-gray-300 shadow-sm text-xs leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                      </svg>
                                      Add Time
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {(formData.timePresetConfig?.timeSlotsPerDay[day] || []).map((time, index) => (
                                      <div key={index} className="flex items-center gap-2">
                                        <input
                                          type="time"
                                          value={time}
                                          onChange={(e) => updateTimeSlot(day, index, e.target.value)}
                                          className="p-2 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removeTimeSlot(day, index)}
                                          className="p-2 text-gray-400 hover:text-gray-600"
                                          disabled={(formData.timePresetConfig?.timeSlotsPerDay[day] || []).length === 1}
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                          </svg>
                                        </button>
                                      </div>
                                    ))}
                                    {(!formData.timePresetConfig?.timeSlotsPerDay[day] || formData.timePresetConfig?.timeSlotsPerDay[day]?.length === 0) && (
                                      <p className="text-sm text-gray-500 italic">No time slots configured for {day}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {formData.timePresetConfig.recurringDays.length === 0 && (
                                <p className="text-sm text-gray-500 italic">Select recurring days above to configure time slots</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
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





