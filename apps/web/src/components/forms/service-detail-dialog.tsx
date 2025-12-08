import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState, useEffect } from 'react';
// TODO: Replace with actual oRPC client when backend is ready
// import apiClient from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ServiceDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: string | null;
  onEdit?: (serviceId: string) => void;
  onDelete?: (serviceId: string) => Promise<void>;
}

// Helper function to format price
const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price);
};

// Helper function to format date
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return "N/A";
  }
};

// Helper function to get full day name
const getFullDayName = (dayName: string): string => {
  return dayName; // Already full name from backend
};

export function ServiceDetailDialog({ isOpen, onClose, serviceId, onEdit, onDelete }: ServiceDetailDialogProps) {
  const [service, setService] = useState<any>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && serviceId) {
      const fetchServiceDetails = async () => {
        try {
          setIsLoading(true);
          setError(null);
          // TODO: Replace with actual oRPC client calls
          // const [serviceResponse, categoriesResponse] = await Promise.all([
          //   apiClient.getService({
          //     service_id: serviceId,
          //   }),
          //   apiClient.getListServiceCategories({
          //     limit: 1000,
          //   }),
          // ]);
          // setService(serviceResponse.data);
          // const category = categoriesResponse.data.find(
          //   (cat: any) => cat.id === serviceResponse.data.service_category_id
          // );
          // setCategoryName(category?.name || null);
          console.warn("API calls to fetch service details and categories are mocked.", serviceId);
          setService(null); // Mock data
          setCategoryName(null); // Mock data
        } catch (err: any) {
          console.error('Failed to fetch service details:', err);
          setError(err?.message || 'Failed to load service details');
        } finally {
          setIsLoading(false);
        }
      };

      fetchServiceDetails();
    } else {
      setService(null);
      setCategoryName(null);
      setError(null);
    }
  }, [isOpen, serviceId]);

  const calculateExpiryDate = (createdAt: string, duration: number, unit: string): string => {
    const created = new Date(createdAt);
    const expiryDate = new Date(created);
    
    switch (unit) {
      case 'day':
        expiryDate.setDate(created.getDate() + duration);
        break;
      case 'week':
        expiryDate.setDate(created.getDate() + (duration * 7));
        break;
      case 'month':
        expiryDate.setMonth(created.getMonth() + duration);
        break;
      case 'year':
        expiryDate.setFullYear(created.getFullYear() + duration);
        break;
    }
    
    return expiryDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDelete = async () => {
    if (!serviceId || !onDelete) return;

    try {
      setIsDeleting(true);
      // TODO: Replace with actual oRPC client call
      // await apiClient.deleteService({ service_id: serviceId });
      console.warn("API call to deleteService is mocked.", serviceId);
      toast.success('Service deleted successfully (simulated)');
      setShowDeleteConfirm(false);
      onClose();
      await onDelete(serviceId);
    } catch (err: any) {
      console.error('Failed to delete service:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to delete service';
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
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
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h1"
                    className="text-2xl font-semibold leading-6 text-gray-900"
                  >
                    Service Details
                  </Dialog.Title>
                  {service && (
                    <div className="flex items-center gap-2">
                      {onEdit && (
                        <Button
                          type="button"
                          onClick={() => {
                            onClose();
                            onEdit(serviceId!);
                          }}
                          className="inline-flex items-center gap-2"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="inline-flex items-center gap-2"
                          variant="destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {isLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    <span className="ml-3 text-gray-600">Loading service details...</span>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-lg">
                    {error}
                  </div>
                )}

                {service && !isLoading && (
                  <div className="space-y-6">
                    {/* Basic Information */}
                    <div className="border-b border-gray-200 pb-4">
                      <h2 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Service Name</label>
                          <p className="mt-1 text-sm text-gray-900">{service.name}</p>
                        </div>
                        {service.sku && (
                          <div>
                            <label className="block text-sm font-medium text-gray-500">SKU</label>
                            <p className="mt-1 text-sm text-gray-900">{service.sku}</p>
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Service Category</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {categoryName || service.service_category_id || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Scheduling Type</label>
                          <div className="mt-1">
                            <Badge variant={service.scheduling_type === 'time-preset' ? 'outline' : 'secondary'}>
                              {service.scheduling_type === 'time-preset' ? 'Time Preset' : 'Appointment Based'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pricing Information */}
                    <div className="border-b border-gray-200 pb-4">
                      <h2 className="text-lg font-medium text-gray-900 mb-4">Pricing Information</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Price</label>
                          <p className="mt-1 text-sm text-gray-900 font-semibold">{formatPrice(parseFloat(service.price))}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Sessions</label>
                          <p className="mt-1 text-sm text-gray-900">{service.sessions}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Credit per Session</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {service.sessions > 0 
                              ? formatPrice(parseFloat(service.price) / service.sessions)
                              : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Taxable</label>
                          <div className="mt-1">
                            {service.taxable ? (
                              <Badge variant="default">Yes ({service.tax_percentage}%)</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </div>
                        </div>
                        {service.taxable && (
                          <div className="col-span-2">
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600">Base Price:</span>
                                  <span className="ml-2 font-medium">{formatPrice(parseFloat(service.price))}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Tax ({service.tax_percentage}%):</span>
                                  <span className="ml-2 font-medium">
                                    {formatPrice((parseFloat(service.price) * parseFloat(service.tax_percentage)) / 100)}
                                  </span>
                                </div>
                                <div className="col-span-2 border-t pt-2 mt-2">
                                  <span className="text-gray-900 font-semibold">Total:</span>
                                  <span className="ml-2 font-semibold text-lg">
                                    {formatPrice(parseFloat(service.price) + (parseFloat(service.price) * parseFloat(service.tax_percentage)) / 100)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expiration Information */}
                    {service.expirable && (
                      <div className="border-b border-gray-200 pb-4">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">Expiration Information</h2>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-500">Expirable</label>
                            <div className="mt-1">
                              <Badge variant="default">Yes</Badge>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-500">Duration</label>
                            <p className="mt-1 text-sm text-gray-900">
                              {service.duration} {service.duration_unit}(s)
                            </p>
                          </div>
                          {service.created_at && service.duration && service.duration_unit && (
                            <div className="col-span-2">
                              <label className="block text-sm font-medium text-gray-500">Expiry Date</label>
                              <p className="mt-1 text-sm text-gray-900">
                                {calculateExpiryDate(service.created_at, service.duration, service.duration_unit)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Time Preset Configuration */}
                    {service.scheduling_type === 'time-preset' && service.time_preset_config && (
                      <div className="border-b border-gray-200 pb-4">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">Time Preset Configuration</h2>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Recurring Days</label>
                            {service.time_preset_config.recurring_days && service.time_preset_config.recurring_days.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {service.time_preset_config.recurring_days.map((day: string, index: number) => (
                                  <Badge key={index} variant="secondary">
                                    {getFullDayName(day)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">No recurring days configured</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Time Slots per Day</label>
                            {service.time_preset_config.time_slots_per_day && 
                             Object.keys(service.time_preset_config.time_slots_per_day).length > 0 ? (
                              <div className="space-y-3">
                                {Object.entries(service.time_preset_config.time_slots_per_day)
                                  .sort(([dayA], [dayB]) => {
                                    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                                    return dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
                                  })
                                  .map(([day, times]: [string, any]) => (
                                    <div key={day} className="bg-gray-50 p-3 rounded-lg">
                                      <h4 className="text-sm font-medium text-gray-900 mb-2">{day}</h4>
                                      {times && times.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {times.map((time: string, index: number) => (
                                            <Badge key={index} variant="outline">
                                              {time}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-500 italic">No time slots configured</p>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">No time slots configured</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 mb-4">Metadata</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Created At</label>
                          <p className="mt-1 text-sm text-gray-900">{formatDate(service.created_at)}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Updated At</label>
                          <p className="mt-1 text-sm text-gray-900">{formatDate(service.updated_at)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                  >
                    Close
                  </button>
                </div>

                {/* Delete Confirmation Dialog */}
                <Transition appear show={showDeleteConfirm} as={Fragment}>
                  <Dialog as="div" className="relative z-20" onClose={() => setShowDeleteConfirm(false)}>
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
                          <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                            <Dialog.Title
                              as="h3"
                              className="text-lg font-medium leading-6 text-gray-900 mb-4"
                            >
                              Delete Service
                            </Dialog.Title>
                            <div className="mb-6">
                              <p className="text-sm text-gray-500">
                                Are you sure you want to delete "{service?.name}"? This action cannot be undone.
                              </p>
                            </div>
                            <div className="flex justify-end gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                  </>
                                ) : (
                                  'Delete'
                                )}
                              </Button>
                            </div>
                          </Dialog.Panel>
                        </Transition.Child>
                      </div>
                    </div>
                  </Dialog>
                </Transition>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}


