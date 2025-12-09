import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import type { ColumnDef } from "@tanstack/react-table";

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
    return new Date(dateString).toLocaleDateString();
  } catch {
    return "N/A";
  }
};

// Helper function to get short day name
const getShortDayName = (dayName: string): string => {
  const dayMap: Record<string, string> = {
    'Monday': 'Mon',
    'Tuesday': 'Tue',
    'Wednesday': 'Wed',
    'Thursday': 'Thu',
    'Friday': 'Fri',
    'Saturday': 'Sat',
    'Sunday': 'Sun'
  };
  return dayMap[dayName] || dayName.slice(0, 3);
};

export const columns: ColumnDef<any>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ getValue }) => getValue<string>() || "N/A",
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "service_category_name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Service Category" />
    ),
    cell: ({ getValue, row }) => {
      const categoryName = getValue<string>();
      const categoryId = row.original.service_category_id;
      
      if (categoryName) {
        return categoryName;
      }
      
      // Fallback to ID if name not available
      return categoryId ? (
        <span className="text-muted-foreground text-sm">{categoryId}</span>
      ) : (
        "N/A"
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "sessions",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sessions" />
    ),
    cell: ({ getValue }) => {
      const sessions = getValue<number>();
      return sessions !== undefined && sessions !== null ? sessions.toString() : "N/A";
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "price",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Price" />
    ),
    cell: ({ getValue }) => {
      const price = getValue<number>();
      return price !== undefined ? formatPrice(price) : "N/A";
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "expirable",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Expirable" />
    ),
    cell: ({ getValue, row }) => {
      const expirable = getValue<boolean>();
      const sellableEnd = row.original.sellable_end;
      
      if (expirable && sellableEnd) {
        return formatDate(sellableEnd);
      }
      
      if (expirable && !sellableEnd) {
        return <span className="text-muted-foreground">N/A</span>;
      }
      
      return (
        <Badge variant="secondary">No</Badge>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "scheduling_type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Scheduling Type" />
    ),
    cell: ({ getValue, row }) => {
      const schedulingType = getValue<string>();
      const isTimePreset = schedulingType === 'time-preset';
      const timePresetConfig = row.original.time_preset_config;
      const recurringDays = timePresetConfig?.recurring_days || [];
      
      if (isTimePreset && recurringDays.length > 0) {
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className="w-fit">
              Time Preset
            </Badge>
            <div className="flex flex-wrap gap-1 mt-1">
              {recurringDays.map((day: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {getShortDayName(day)}
                </Badge>
              ))}
            </div>
          </div>
        );
      }
      
      if (isTimePreset && recurringDays.length === 0) {
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className="w-fit">
              Time Preset
            </Badge>
            <span className="text-xs text-muted-foreground">No recurring days configured</span>
          </div>
        );
      }
      
      return (
        <Badge variant="outline">
          Appointment Based
        </Badge>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "sellable_start",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ getValue }) => formatDate(getValue<string>()),
    enableSorting: true,
    enableHiding: false,
  },
];




