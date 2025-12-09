import type { ColumnDef } from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // Standard Shadcn table components

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { useState, useCallback } from "react";
import { Search, Plus } from "lucide-react";
import { ServiceFormDialog } from "@/components/forms/service-category-form";
import { ServiceCategoryDetailDialog } from "@/components/forms/service-category-detail-dialog";
import { Button } from "@/components/ui/button";
// TODO: Replace with actual oRPC client when backend is ready
// import apiClient from "@/lib/api";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onServiceAdd?: (data: any) => Promise<void>;
  onServiceDelete?: (categoryId: string) => Promise<void>;
}

export default function DataTable<TData, TValue>({
  columns,
  data,
  onServiceAdd,
  onServiceDelete,
}: DataTableProps<TData, TValue>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [editCategoryData, setEditCategoryData] = useState<any>(null);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    state: {
      globalFilter,
    },
    meta: {
      onDelete: async (categoryId: string) => {
        if (onServiceDelete) {
          await onServiceDelete(categoryId);
        }
      },
    },
  });

  const handleServiceSubmit = async (serviceData: any) => {
    // The form now handles API submission internally
    // This callback can be used to refresh the data table if needed
    if (onServiceAdd) {
      await onServiceAdd(serviceData);
    } else {
      // Reload the page or refresh data
      window.location.reload();
    }
  };

  const handleEditCategory = useCallback(async (categoryId: string) => {
    try {
      // TODO: Replace with actual oRPC client call
      // Fetch category data for editing
      // const response = await apiClient.getServiceCategory({
      //   category_id: categoryId,
      // });
      // const category = response.data;
      console.warn("API call to getServiceCategory is mocked.", categoryId);
      const category = {
        id: categoryId,
        name: "Mock Category",
        duration: 60,
        max_attendees: null,
        incentive_type: "fixed",
        is_conditional: false,
        max_staff: 1,
        staff_pool_percentage: "100",
        require_advance_booking: false,
        min_advance_hours: 0,
        enable_cancellation_window: false,
        cancellation_cutoff_hours: 0,
        payment_structures: [],
        staff_weightage: [],
        threshold: null,
      }; // Mock data
      
      // Transform API data to form data format
      const formData: any = {
        id: parseInt(category.id.replace(/-/g, '').substring(0, 15), 16) || 0, // Convert UUID to number for form compatibility
        name: category.name,
        duration: category.duration,
        maxAttendees: category.max_attendees || undefined,
        incentive: {
          type: category.incentive_type,
          isConditional: category.is_conditional || false,
          maxStaff: category.max_staff,
          staffPoolPercentage: parseFloat(category.staff_pool_percentage?.toString() || '100'),
          paymentStructure: {} as any,
          staffWeightage: (category.staff_weightage || []).map((sw: any, index: number) => ({
            id: index + 1,
            position: sw.position,
            title: sw.title,
            percentage: parseFloat(sw.percentage?.toString() || '0')
          }))
        },
        rules: {
          requireAdvanceBooking: category.require_advance_booking || false,
          minAdvanceHours: category.min_advance_hours || 0,
          enableCancellationWindow: category.enable_cancellation_window || false,
          cancellationCutoffHours: category.cancellation_cutoff_hours || 0
        }
      };
      
      // Transform payment structures
      if (category.is_conditional && category.payment_structures) {
        const belowThreshold: any = {};
        const aboveThreshold: any = {};
        
        category.payment_structures.forEach((ps: any) => {
          const roleKey = `role_${ps.role_id}`;
          if (ps.payment_type === 'below_threshold') {
            belowThreshold[roleKey] = parseFloat(ps.value?.toString() || '0');
          } else if (ps.payment_type === 'above_threshold') {
            aboveThreshold[roleKey] = parseFloat(ps.value?.toString() || '0');
          }
        });
        
        formData.incentive.paymentStructure = {
          conditional: {
            threshold: category.threshold || 10,
            belowThreshold,
            aboveThreshold
          }
        };
      } else if (category.payment_structures) {
        const nonConditional: any = {};
        
        category.payment_structures.forEach((ps: any) => {
          if (ps.payment_type === 'non_conditional') {
            const roleKey = `role_${ps.role_id}`;
            nonConditional[roleKey] = parseFloat(ps.value?.toString() || '0');
          }
        });
        
        formData.incentive.paymentStructure = {
          nonConditional
        };
      } else {
        formData.incentive.paymentStructure = {
          nonConditional: {}
        };
      }
      
      // Store the actual UUID separately
      formData.categoryId = categoryId;
      
      setEditCategoryData(formData);
      setIsDetailDialogOpen(false);
      setIsEditDialogOpen(true);
    } catch (error) {
      console.error("Error fetching service category for edit:", error);
    }
  }, []);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    // This callback is called from the detail dialog after successful deletion
    // Just refresh the data by calling onServiceDelete which handles the refresh
    if (onServiceDelete) {
      await onServiceDelete(categoryId);
    }
  }, [onServiceDelete]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          onClick={() => setIsAddDialogOpen(true)}
          className="bg-black text-white hover:bg-black/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Service Category
        </Button>
        <div className="relative w-72">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search all columns..."
            value={globalFilter ?? ""}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="pl-8"
          />
        </div>
      </div>
      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b bg-muted/50 hover:bg-muted/60"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="px-4 py-3 text-sm font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => {
                    const categoryId = (row.original as any).id;
                    if (categoryId) {
                      setSelectedCategoryId(categoryId);
                      setIsDetailDialogOpen(true);
                    }
                  }}
                  className={`border-b transition-colors hover:bg-muted/50 cursor-pointer data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-4 py-3 text-sm whitespace-nowrap"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ServiceFormDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSubmit={handleServiceSubmit}
        mode="create"
      />

      <ServiceFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditCategoryData(null);
        }}
        onSubmit={handleServiceSubmit}
        initialData={editCategoryData}
        mode="edit"
      />

      <ServiceCategoryDetailDialog
        isOpen={isDetailDialogOpen}
        onClose={() => {
          setIsDetailDialogOpen(false);
          setSelectedCategoryId(null);
        }}
        categoryId={selectedCategoryId}
        onEdit={handleEditCategory}
        onDelete={handleDeleteCategory}
      />
    </div>
  );
}





