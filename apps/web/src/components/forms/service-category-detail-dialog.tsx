import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState, useEffect } from 'react';
// TODO: Replace with actual oRPC client when backend is ready
// import apiClient from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ServiceCategoryDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string | null;
  onEdit?: (categoryId: string) => void;
  onDelete?: (categoryId: string) => Promise<void>;
}

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

export function ServiceCategoryDetailDialog({ isOpen, onClose, categoryId, onEdit, onDelete }: ServiceCategoryDetailDialogProps) {
  const [category, setCategory] = useState<any>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && categoryId) {
      const fetchCategoryDetails = async () => {
        try {
          setIsLoading(true);
          setError(null);
          
          // TODO: Replace with actual oRPC client calls
          // Fetch category details and roles in parallel
          // const [categoryResponse, rolesResponse] = await Promise.all([
          //   apiClient.getServiceCategory({
          //     category_id: categoryId,
          //   }),
          //   apiClient.getListRoles({
          //     limit: 1000,
          //   }),
          // ]);
          // setCategory(categoryResponse.data);
          // const rolesMap: Record<string, string> = {};
          // if (rolesResponse.data) {
          //   const rolesData = Array.isArray(rolesResponse.data) 
          //     ? rolesResponse.data 
          //     : ((rolesResponse.data as any).items || []);
          //   rolesData.forEach((role: any) => {
          //     rolesMap[role.id] = role.name;
          //   });
          // }
          // setRoles(rolesMap);
          console.warn("API calls to fetch category details and roles are mocked.", categoryId);
          setCategory(null); // Mock data
          setRoles({}); // Mock data
        } catch (err: any) {
          console.error('Failed to fetch service category details:', err);
          setError(err?.message || 'Failed to load service category details');
        } finally {
          setIsLoading(false);
        }
      };

      fetchCategoryDetails();
    } else {
      setCategory(null);
      setRoles({});
      setError(null);
    }
  }, [isOpen, categoryId]);

  const handleDelete = async () => {
    if (!categoryId || !onDelete) return;

    try {
      setIsDeleting(true);
      // Call the onDelete callback which handles the API call and refresh
      await onDelete(categoryId);
      // Success toast is shown in handleServiceDelete, close dialog on success
      setShowDeleteConfirm(false);
      onClose();
    } catch (err: any) {
      console.error('Failed to delete service category:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to delete service category';
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  // Group payment structures by payment type
  const groupPaymentStructures = () => {
    if (!category?.payment_structures) return { nonConditional: [], belowThreshold: [], aboveThreshold: [] };
    
    const grouped = {
      nonConditional: [] as any[],
      belowThreshold: [] as any[],
      aboveThreshold: [] as any[]
    };
    
    category.payment_structures.forEach((ps: any) => {
      if (ps.payment_type === 'non_conditional') {
        grouped.nonConditional.push(ps);
      } else if (ps.payment_type === 'below_threshold') {
        grouped.belowThreshold.push(ps);
      } else if (ps.payment_type === 'above_threshold') {
        grouped.aboveThreshold.push(ps);
      }
    });
    
    return grouped;
  };

  const formatPaymentValue = (value: number | string): string => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (category?.incentive_type === 'fixed') {
      return `RM ${numValue.toFixed(2)}`;
    }
    return `${numValue.toFixed(1)}%`;
  };

  const paymentStructures = groupPaymentStructures();

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
                    Service Category Details
                  </Dialog.Title>
                  {category && (
                    <div className="flex items-center gap-2">
                      {onEdit && (
                        <Button
                          type="button"
                          onClick={() => {
                            onClose();
                            onEdit(categoryId!);
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
                    <span className="ml-3 text-gray-600">Loading service category details...</span>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-lg">
                    {error}
                  </div>
                )}

                {category && !isLoading && (
                  <div className="space-y-6">
                    {/* Basic Information */}
                    <div className="border-b border-gray-200 pb-4">
                      <h2 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Category Name</label>
                          <p className="mt-1 text-sm text-gray-900">{category.name}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Duration</label>
                          <p className="mt-1 text-sm text-gray-900">{category.duration} minutes</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Maximum Attendees</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {category.max_attendees ? category.max_attendees : 'Unlimited'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Incentive Type</label>
                          <div className="mt-1">
                            <Badge variant={category.incentive_type === 'fixed' ? 'outline' : 'secondary'}>
                              {category.incentive_type === 'fixed' ? 'Fixed Amount (RM)' : 'Variable (%)'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Booking & Cancellation Rules */}
                    <div className="border-b border-gray-200 pb-4">
                      <h2 className="text-lg font-medium text-gray-900 mb-4">Booking & Cancellation Rules</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Require Advance Booking</label>
                          <div className="mt-1">
                            {category.require_advance_booking ? (
                              <Badge variant="default">Yes ({category.min_advance_hours} hours)</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Cancellation Window</label>
                          <div className="mt-1">
                            {category.enable_cancellation_window ? (
                              <Badge variant="default">Enabled ({category.cancellation_cutoff_hours} hours)</Badge>
                            ) : (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Staff Payment Incentive Structure */}
                    <div className="border-b border-gray-200 pb-4">
                      <h2 className="text-lg font-medium text-gray-900 mb-4">Staff Payment Incentive Structure</h2>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Payment Type</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {category.incentive_type === 'fixed' ? 'Fixed Amount (RM per appointment)' : 'Variable (% of appointment commission)'}
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-500">Conditional Payment</label>
                          <div className="mt-1">
                            {category.is_conditional ? (
                              <Badge variant="default">Yes (Threshold: {category.threshold} attendees)</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-500">Staff Commission Pool</label>
                          <p className="mt-1 text-sm text-gray-900">{category.staff_pool_percentage}%</p>
                        </div>

                        {/* Non-Conditional Payment Structure */}
                        {!category.is_conditional && paymentStructures.nonConditional.length > 0 && (
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <h3 className="text-sm font-medium text-gray-900 mb-3">Payment Rates</h3>
                            <div className="space-y-2">
                              {paymentStructures.nonConditional.map((ps: any) => (
                                <div key={ps.id} className="flex justify-between items-center">
                                  <span className="text-sm text-gray-700">
                                    {roles[ps.role_id] || ps.role_id}
                                  </span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {formatPaymentValue(ps.value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Conditional Payment Structure */}
                        {category.is_conditional && (
                          <div className="space-y-4">
                            {paymentStructures.belowThreshold.length > 0 && (
                              <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="text-sm font-medium text-gray-900 mb-3">
                                  Below {category.threshold} Attendees
                                </h3>
                                <div className="space-y-2">
                                  {paymentStructures.belowThreshold.map((ps: any) => (
                                    <div key={ps.id} className="flex justify-between items-center">
                                      <span className="text-sm text-gray-700">
                                        {roles[ps.role_id] || ps.role_id}
                                      </span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {formatPaymentValue(ps.value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {paymentStructures.aboveThreshold.length > 0 && (
                              <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="text-sm font-medium text-gray-900 mb-3">
                                  {category.threshold} or More Attendees
                                </h3>
                                <div className="space-y-2">
                                  {paymentStructures.aboveThreshold.map((ps: any) => (
                                    <div key={ps.id} className="flex justify-between items-center">
                                      <span className="text-sm text-gray-700">
                                        {roles[ps.role_id] || ps.role_id}
                                      </span>
                                      <span className="text-sm font-medium text-gray-900">
                                        {formatPaymentValue(ps.value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Staff Weightage */}
                        {category.staff_weightage && category.staff_weightage.length > 0 && (
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <h3 className="text-sm font-medium text-gray-900 mb-3">Staff Weightage Distribution</h3>
                            <div className="space-y-2">
                              {category.staff_weightage
                                .sort((a: any, b: any) => a.position - b.position)
                                .map((sw: any) => (
                                  <div key={sw.id} className="flex justify-between items-center">
                                    <span className="text-sm text-gray-700">
                                      {sw.title} (Position {sw.position})
                                    </span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {parseFloat(sw.percentage.toString()).toFixed(1)}%
                                    </span>
                                  </div>
                                ))}
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-900">Total</span>
                                <span className="text-sm font-semibold text-gray-900">
                                  {category.staff_weightage
                                    .reduce((sum: number, sw: any) => sum + parseFloat(sw.percentage.toString()), 0)
                                    .toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 mb-4">Metadata</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Created At</label>
                          <p className="mt-1 text-sm text-gray-900">{formatDate(category.created_at)}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">Updated At</label>
                          <p className="mt-1 text-sm text-gray-900">{formatDate(category.updated_at)}</p>
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
                              Delete Service Category
                            </Dialog.Title>
                            <div className="mb-6">
                              <p className="text-sm text-gray-500">
                                Are you sure you want to delete "{category?.name}"? This action cannot be undone.
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



