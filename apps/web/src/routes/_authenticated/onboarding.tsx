import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";

const onboardingSearchSchema = z.object({
  user_id: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: onboardingSearchSchema,
  component: RouteComponent,
});

const formSchema = z.object({
  name: z
    .string()
    .min(1, "Organization name is required")
    .max(255, "Organization name is too long"),
});

function RouteComponent() {
  const { isLoading: authLoading, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [nameToCheck, setNameToCheck] = useState("");
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const debouncedName = useDebounce(nameToCheck, 500);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  // TODO: Replace with actual API call when backend endpoint is ready
  // Should call: client.organizations.checkNameAvailability({ name })
  useEffect(() => {
    if (!debouncedName || debouncedName.length < 2) {
      setIsCheckingAvailability(false);
      setIsAvailable(null);
      form.clearErrors("name");
      return;
    }

    let cancelled = false;
    setIsCheckingAvailability(true);

    // Mock availability check — replace with real API
    const timer = setTimeout(() => {
      if (cancelled) return;
      const available = !debouncedName.toLowerCase().startsWith("test");
      setIsAvailable(available);
      setIsCheckingAvailability(false);

      if (!available) {
        form.setError("name", {
          type: "availability",
          message: "This organization name is already taken",
        });
      } else {
        form.clearErrors("name");
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [debouncedName, form]);

  // TODO: Replace with actual API call when backend endpoint is ready
  // Should call: client.organizations.create({ name, slug })
  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (isAvailable === false) {
      form.setError("name", {
        type: "availability",
        message: "This organization name is not available",
      });
      return;
    }

    setIsCreating(true);
    try {
      // Mock organization creation — replace with real API
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast.success("Organization created successfully!");
      await checkAuth();
      navigate({ to: "/dashboard" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create organization. Please try again.";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }

  // Watch the name field to check availability
  const watchedName = form.watch("name");

  // Update the name to check when form value changes
  useEffect(() => {
    if (watchedName !== nameToCheck) {
      setNameToCheck(watchedName);
    }
  }, [watchedName, nameToCheck]);

  // Show loading while auth is checking
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  // Get availability status for display
  const getNameAvailabilityStatus = () => {
    if (!watchedName || watchedName.length === 0) return null;
    if (isCheckingAvailability) return "checking";
    if (isAvailable === true) return "available";
    if (isAvailable === false) return "unavailable";
    return null;
  };

  const availabilityStatus = getNameAvailabilityStatus();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              Welcome to Avantej!
            </CardTitle>
            <p className="text-gray-600 mt-2">
              Let's set up your organization to get started.
            </p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Enter your organization name"
                            {...field}
                          />
                          {availabilityStatus === "checking" && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                              <div className="animate-spin h-4 w-4 border-2 border-current border-r-transparent rounded-full" />
                            </div>
                          )}
                          {availabilityStatus === "available" &&
                            !form.formState.errors.name && (
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500">
                                ✓
                              </div>
                            )}
                          {(availabilityStatus === "unavailable" ||
                            form.formState.errors.name) && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500">
                              ✗
                            </div>
                          )}
                        </div>
                      </FormControl>
                      {availabilityStatus === "available" && (
                        <div className="text-green-700 text-sm font-light">
                          This organization name is available
                        </div>
                      )}
                      {form.formState.errors.name && (
                        <div className="text-red-500 text-sm font-light">
                          {form.formState.errors.name.message}
                        </div>
                      )}
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    isCreating ||
                    availabilityStatus === "unavailable" ||
                    availabilityStatus === "checking" ||
                    !!form.formState.errors.name
                  }
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-current border-r-transparent rounded-full mr-2" />
                      Creating Organization...
                    </>
                  ) : (
                    "Create Organization"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>
                This will complete your account setup and take you to your
                dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
