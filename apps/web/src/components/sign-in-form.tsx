import { authClient } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import Loader from "./loader";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignInForm({
  onSwitchToSignUp,
}: {
  onSwitchToSignUp: () => void;
}) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending, refetch } = authClient.useSession();
  const { invitationToken, orgId } = useSearch({ from: "/" });

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      try {
        // Use custom login endpoint to get organizations
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/auth/login`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include", // Important for cookies
            body: JSON.stringify({
              email: value.email,
              password: value.password,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error || "Sign in failed");
          return;
        }

        // Store organizations in localStorage if available
        if (
          data.organizations &&
          Array.isArray(data.organizations) &&
          data.organizations.length > 0
        ) {
          localStorage.setItem(
            "user_organizations",
            JSON.stringify(data.organizations)
          );
          const firstOrgId = data.organizations[0].id;
          localStorage.setItem("current_organization_id", firstOrgId);
        }

        // Refresh session to sync Better-Auth client state
        await refetch();

        // Also fetch user-context to get hierarchy data (useAuth hook will also fetch, but this ensures it's immediate)
        try {
          const contextResponse = await fetch(
            `${import.meta.env.VITE_SERVER_URL}/auth/user-context`,
            {
              method: "GET",
              credentials: "include",
            }
          );

          if (contextResponse.ok) {
            const contextData = await contextResponse.json();

            // Store hierarchy data
            if (contextData.organizations) {
              contextData.organizations.forEach(
                (org: { id: string; hierarchy?: { nodes: unknown[] } }) => {
                  if (org.hierarchy?.nodes) {
                    localStorage.setItem(
                      `org_${org.id}_hierarchy`,
                      JSON.stringify(org.hierarchy)
                    );
                  }
                }
              );
            }
          }
        } catch (error) {
          console.error("Failed to fetch user context after login:", error);
          // Non-critical, useAuth hook will retry
        }

        toast.success("Sign in successful");
        // Redirect to accept invitation if invitation token is present
        if (invitationToken && orgId) {
          navigate({
            to: "/accept-invitation",
            search: { token: invitationToken, orgId },
          });
        } else {
          navigate({
            to: "/dashboard",
          });
        }
      } catch (error) {
        console.error("Sign in error:", error);
        toast.error("Failed to sign in");
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto w-full mt-10 max-w-md p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Welcome Back</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
            >
              {state.isSubmitting ? "Submitting..." : "Sign In"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}
