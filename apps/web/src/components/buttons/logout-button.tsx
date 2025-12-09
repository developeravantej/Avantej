import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import React from "react";
import { cn } from "@/lib/utils";

export function LogoutButton({
  variant = "outline",
  className,
  ...props
}: React.ComponentProps<"button"> & {
  variant?:
    | "outline"
    | "ghost"
    | "default"
    | "destructive"
    | "secondary"
    | "link";
}) {
  const { logout } = useAuth();
  const [loading, setLoading] = React.useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      toast.success("Logged out successfully");
    } catch (err) {
      console.error("Logout error:", err);
      toast.error("Logout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      className={cn("cursor-pointer", className)}
      onClick={handleLogout}
      disabled={loading}
      {...props}
    >
      {loading ? "Logging out..." : "Logout"}
    </Button>
  );
}




