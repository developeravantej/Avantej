import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { client } from "@/utils/orpc";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface MemberSelectorProps {
  organizationId: string;
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

export function MemberSelector({
  organizationId,
  value,
  onChange,
  placeholder = "Select Person In Charge",
  allowClear = true,
  disabled = false,
}: MemberSelectorProps) {
  // Fetch all organization members with user details
  const { data: membersData, isLoading, error } = useQuery({
    queryKey: ["organization-members", organizationId],
    queryFn: async () => {
      return await client.hierarchy.listAllMembers({
        organizationId,
        includeInactive: false, // Only show active members
      });
    },
    enabled: !!organizationId && !disabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const members = membersData?.members || [];

  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "destructive";
      case "trainer":
        return "default";
      case "staff":
        return "secondary";
      case "client":
        return "outline";
      default:
        return "outline";
    }
  };

  const selectedMember = members.find((m: Member) => m.userId === value);

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading members...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Failed to load members. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select
        value={value || ""}
        onValueChange={(newValue) => {
          onChange(newValue === "clear" ? "" : newValue);
        }}
        disabled={disabled || isLoading}
        onOpenChange={setIsOpen}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder}>
            {selectedMember ? (
              <div className="flex items-center space-x-2">
                <span>{selectedMember.name}</span>
                <span className="text-muted-foreground">
                  ({selectedMember.email})
                </span>
                <Badge
                  variant={getRoleBadgeVariant(selectedMember.role)}
                  className="text-xs"
                >
                  {selectedMember.role}
                </Badge>
              </div>
            ) : (
              placeholder
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowClear && value && (
            <SelectItem value="clear">
              <span className="text-muted-foreground">Clear selection</span>
            </SelectItem>
          )}
          {members.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No members available
            </div>
          ) : (
            members.map((member: Member) => (
              <SelectItem key={member.userId} value={member.userId}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <span className="font-medium truncate">{member.name}</span>
                    <span className="text-muted-foreground truncate">
                      ({member.email})
                    </span>
                  </div>
                  <Badge
                    variant={getRoleBadgeVariant(member.role)}
                    className="text-xs ml-2 shrink-0"
                  >
                    {member.role}
                  </Badge>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {selectedMember && (
        <p className="text-xs text-muted-foreground">
          Selected: {selectedMember.name} ({selectedMember.email}) -{" "}
          {selectedMember.role}
        </p>
      )}
      {members.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">
          No active members found in this organization
        </p>
      )}
    </div>
  );
}




