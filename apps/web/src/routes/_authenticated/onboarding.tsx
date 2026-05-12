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
import { useState } from "react";
import { LoadingSpinner, PageLoader } from "@/components/ui/loading-spinner";

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
  const { isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    sessionStorage.setItem("pendingOrgName", values.name);
    navigate({ to: "/subscribe" as string });
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <PageLoader />
      </div>
    );
  }

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
                        <Input
                          placeholder="Enter your organization name"
                          {...field}
                        />
                      </FormControl>
                      <div className="text-sm text-gray-500 font-light">
                        Your organization name will be confirmed when you
                        complete your subscription.
                      </div>
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
                  disabled={isSubmitting || !!form.formState.errors.name}
                >
                  {isSubmitting ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Redirecting...
                    </>
                  ) : (
                    "Proceed to Subscription"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>
                Next, you'll choose a subscription plan to activate your
                organization.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
