import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
// TODO: Replace with actual API types when backend is ready
// import type apiClient from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, User, Trash2 } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";


// Helper component for copyable cells
interface CopyableCellProps {
  value: string | null | undefined;
  displayText?: React.ReactNode;
}

const CopyableCell: React.FC<CopyableCellProps> = ({ value, displayText }) => {
  const onCopy = (textToCopy: string) => {
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        toast.success("Copied to clipboard!");
      })
      .catch((err) => {
        toast.error("Failed to copy: " + err);
      });
  };

  const displayContent = displayText || value || "N/A";

  return (
    <div
      className="cursor-pointer flex items-center group"
      onClick={() => onCopy(value!)}
    >
      <Badge
        variant="outline"
        className="flex items-center gap-x-2 truncate"
        title={value || undefined}
      >
        {displayContent}
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      </Badge>
    </div>
  );
};

// Helper function to format duration from minutes
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins > 0 ? mins + "m" : ""}`;
  }
  return `${minutes}m`;
};

// // Helper function to format price
// const formatPrice = (price: number): string => {
//   return new Intl.NumberFormat('en-US', {
//     style: 'currency',
//     currency: 'USD'
//   }).format(price);
// };

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
    accessorKey: "duration",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Duration" />
    ),
    cell: ({ getValue }) => {
      const minutes = getValue<number>();
      return minutes ? formatDuration(minutes) : "N/A";
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "advance_booking",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Advance Booking" />
    ),
    cell: ({ row }) => {
      const requireAdvance = row.original.require_advance_booking;
      const minHours = row.original.min_advance_hours;
      
      if (!requireAdvance || minHours === 0) {
        return (
          <Badge variant="secondary">
            Not Required
          </Badge>
        );
      }
      
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="default">Required</Badge>
          <span className="text-xs text-muted-foreground">
            {minHours}h advance
          </span>
        </div>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    id: "cancellation_window",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Cancellation Window" />
    ),
    cell: ({ row }) => {
      const enableCancel = row.original.enable_cancellation_window;
      const cutoffHours = row.original.cancellation_cutoff_hours;
      
      if (!enableCancel || cutoffHours === 0) {
        return (
          <Badge variant="secondary">
            Disabled
          </Badge>
        );
      }
      
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="default">Enabled</Badge>
          <span className="text-xs text-muted-foreground">
            {cutoffHours}h cutoff
          </span>
        </div>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "incentive_type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Payment Type" />
    ),
    cell: ({ getValue }) => {
      const type = getValue<string>();
      return (
        <Badge variant="outline" className="capitalize">
          {type || "N/A"}
        </Badge>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "max_attendees",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Max Attendees" />
    ),
    cell: ({ getValue }) => {
      const maxAttendees = getValue<number>();
      return maxAttendees ? maxAttendees.toString() : "Unlimited";
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "threshold",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Attdn Threshold" />
    ),
    cell: ({ row }) => {
      const threshold = row.original.threshold;
      const isConditional = row.original.is_conditional;
      
      if (!isConditional || threshold === null || threshold === undefined) {
        return <span className="text-muted-foreground">-</span>;
      }
      
      return threshold.toString();
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "staff_pool_percentage",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Staff Commission" />
    ),
    cell: ({ getValue }) => {
      const percentage = getValue<number | string>();
      if (percentage === null || percentage === undefined) return "N/A";
      const num = typeof percentage === "string" ? parseFloat(percentage) : percentage;
      return `${num.toFixed(0)}%`;
    },
    enableSorting: true,
    enableHiding: false,
  },
  
];





