import { DataTableColumnHeader } from "@/components/tables/data-column-header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// TODO: Replace with actual API types when backend is ready
// import type apiClient from "@/lib/api";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import React from "react";

// Helper component for copyable cells
interface CopyableCellProps {
  value: string | null | undefined;
  displayText?: React.ReactNode; // For cases like Badge
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

// Define the User type to match your data structure
type User = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  onboarding_completed: boolean | null;
  image: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
};

export const columns: ColumnDef<User>[] = [
  {
    accessorKey: "image",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="" />
    ),
    cell: ({ row }) => {
      const user = row.original;
      const initials = user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase();
      
      return (
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.image || undefined} alt={user.name} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ getValue }) => {
      const id = getValue<string>();
      return <CopyableCell value={id} displayText={id} />;
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ getValue }) => {
      const name = getValue<string>();
      return (
        <span className="font-medium">
          {name}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ getValue }) => {
      const email = getValue<string>();
      return <CopyableCell value={email} displayText={email} />;
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "email_verified",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email Status" />
    ),
    cell: ({ getValue }) => {
      const isVerified = getValue<boolean>();
      return (
        <Badge 
          variant={isVerified ? "default" : "secondary"}
          className="flex items-center gap-x-1"
        >
          {isVerified ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {isVerified ? "Verified" : "Unverified"}
        </Badge>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "onboarding_completed",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Onboarding" />
    ),
    cell: ({ getValue }) => {
      const status = getValue<boolean | null>();
      
      if (status === null) {
        return (
          <Badge variant="outline" className="flex items-center gap-x-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      }
      
      return (
        <Badge 
          variant={status ? "default" : "destructive"}
          className="flex items-center gap-x-1"
        >
          {status ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {status ? "Completed" : "Incomplete"}
        </Badge>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "organization_id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Organization" />
    ),
    cell: ({ getValue }) => {
      const orgId = getValue<string | null>();
      if (!orgId) {
        return (
          <Badge variant="outline" className="text-muted-foreground">
            No Organization
          </Badge>
        );
      }
      return <CopyableCell value={orgId} displayText="Has Organization" />;
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    cell: ({ getValue }) => {
      const createdAt = getValue<string>();
      return (
        <span className="text-sm text-muted-foreground">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      );
    },
    enableSorting: true,
    enableHiding: true,
  },
];





