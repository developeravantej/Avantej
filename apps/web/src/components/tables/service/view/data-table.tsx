import type { ColumnDef } from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useCallback } from "react";
import { Search, Plus, X, Filter } from "lucide-react";
import { ServiceFormDialog } from "@/components/forms/service-form";
import { ServiceDetailDialog } from "@/components/forms/service-detail-dialog";
import { Button } from "@/components/ui/button";
// TODO: Replace with actual oRPC client when backend is ready
// import apiClient from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onServiceAdd?: (data: any) => Promise<void>;
  onServiceDelete?: (serviceId: string) => Promise<void>;
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
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [editServiceData, setEditServiceData] = useState<any>(null);
  const [schedulingTypeFilter, setSchedulingTypeFilter] = useState<string>("all");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  // Memoize the data array to prevent unnecessary re-renders
  const stableData = useMemo(() => {
    return data || [];
  }, [data]);

  // Filter data based on scheduling type and recurring days
  const filteredData = useMemo(() => {
    if (!stableData || stableData.length === 0) {
      return [];
    }

    let filtered = [...stableData]; // Create a copy to avoid mutating the original

    // Filter by scheduling type
    if (schedulingTypeFilter !== "all") {
      filtered = filtered.filter((item: any) => {
        return item.scheduling_type === schedulingTypeFilter;
      });
    }

    // Filter by recurring days (only for time-preset services)
    if (schedulingTypeFilter === "time-preset" && selectedDays.length > 0) {
      filtered = filtered.filter((item: any) => {
        const recurringDays = item.time_preset_config?.recurring_days || [];
        // Check if any of the selected days are in the service's recurring days
        return selectedDays.some((day) => recurringDays.includes(day));
      });
    }

    return filtered;
  }, [stableData, schedulingTypeFilter, selectedDays]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    enableSorting: true,
    state: {
      globalFilter,
    },
  });

  const handleServiceSubmit = async (serviceData: any) => {
    try {
      if (onServiceAdd) {
        await onServiceAdd(serviceData);
        setIsAddDialogOpen(false);
        setIsEditDialogOpen(false);
        setEditServiceData(null);
      }
    } catch (error) {
      console.error("Error submitting service:", error);
      // Don't close dialog on error
    }
  };

  const handleEditService = useCallback(async (serviceId: string) => {
    try {
      // TODO: Replace with actual oRPC client call
      // Fetch service data for editing
      // const response = await apiClient.getService({
      //   service_id: serviceId,
      // });
      // const service = response.data;
      console.warn("API call to getService is mocked.", serviceId);
      const service = {
        id: serviceId,
        name: "Mock Service",
        duration: 1,
        duration_unit: 'day',
        expirable: false,
        price: "0",
        sessions: 1,
        taxable: false,
        tax_percentage: "6",
        service_category_id: "",
        scheduling_type: 'appointment-based',
        time_preset_config: null,
      }; // Mock data
      
      // Transform API data to form data format
      // Note: Using a numeric ID placeholder since form expects number, but we'll use serviceId string for API calls
      const formData = {
        id: 0, // Placeholder - actual UUID is stored in serviceId
        name: service.name,
        duration: service.duration || 1,
        duration_unit: service.duration_unit || 'day',
        expirable: service.expirable || false,
        price: parseFloat(service.price),
        sessions: service.sessions,
        taxable: service.taxable || false,
        tax_percentage: parseFloat(String(service.tax_percentage || 6)),
        category_id: service.service_category_id,
        schedulingType: service.scheduling_type || 'appointment-based',
        timePresetConfig: service.time_preset_config ? {
          recurringDays: (service.time_preset_config as any)?.recurring_days || [],
          timeSlotsPerDay: (service.time_preset_config as any)?.time_slots_per_day || {},
        } : undefined,
      };
      
      // Store the actual UUID separately
      (formData as any).serviceId = serviceId;
      
      setEditServiceData(formData);
      setIsEditDialogOpen(true);
    } catch (error) {
      console.error("Error fetching service for edit:", error);
    }
  }, []);

  const handleDayToggle = useCallback((day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  }, []);

  const clearDayFilters = useCallback(() => {
    setSelectedDays([]);
  }, []);

  const daysOfWeek = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const getShortDayName = (dayName: string): string => {
    const dayMap: Record<string, string> = {
      Monday: "Mon",
      Tuesday: "Tue",
      Wednesday: "Wed",
      Thursday: "Thu",
      Friday: "Fri",
      Saturday: "Sat",
      Sunday: "Sun",
    };
    return dayMap[dayName] || dayName.slice(0, 3);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button
          onClick={() => setIsAddDialogOpen(true)}
          className="bg-black text-white hover:bg-black/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scheduling Type Filter */}
          <Select
            value={schedulingTypeFilter}
            onValueChange={(value) => {
              setSchedulingTypeFilter(value);
              // Clear day filters when switching away from time-preset
              if (value !== "time-preset") {
                setSelectedDays([]);
              }
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="appointment-based">Appointment Based</SelectItem>
              <SelectItem value="time-preset">Time Preset</SelectItem>
            </SelectContent>
          </Select>

          {/* Recurring Days Filter - Multi-select with Dropdown */}
          {schedulingTypeFilter === "time-preset" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-56 justify-start">
                  <Filter className="mr-2 h-4 w-4" />
                  {selectedDays.length === 0
                    ? "Filter by days"
                    : `${selectedDays.length} day${selectedDays.length > 1 ? "s" : ""} selected`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <div className="px-2 py-1.5 text-sm font-semibold">Select Days</div>
                <DropdownMenuSeparator />
                {selectedDays.length > 0 && (
                  <>
                    <DropdownMenuItem
                      onClick={clearDayFilters}
                      className="text-xs text-muted-foreground"
                    >
                      Clear all
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {daysOfWeek.map((day) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <DropdownMenuCheckboxItem
                      key={day}
                      checked={isSelected}
                      onCheckedChange={() => {
                        handleDayToggle(day);
                      }}
                    >
                      {day}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Show selected days as badges */}
          {schedulingTypeFilter === "time-preset" && selectedDays.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              {selectedDays.map((day) => (
                <Badge
                  key={day}
                  variant="secondary"
                  className="text-xs py-1 px-2 flex items-center gap-1"
                >
                  {getShortDayName(day)}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDayToggle(day);
                    }}
                    className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

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
                    const serviceId = (row.original as any).id;
                    if (serviceId) {
                      setSelectedServiceId(serviceId);
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
          setEditServiceData(null);
        }}
        onSubmit={handleServiceSubmit}
        initialData={editServiceData}
        mode="edit"
      />

      <ServiceDetailDialog
        isOpen={isDetailDialogOpen}
        onClose={() => {
          setIsDetailDialogOpen(false);
          setSelectedServiceId(null);
        }}
        serviceId={selectedServiceId}
        onEdit={handleEditService}
        onDelete={onServiceDelete}
      />
    </div>
  );
}


