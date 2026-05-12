import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getServerUrl } from "@/lib/config";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";

interface TokenInfo {
  email: string;
  full_name: string;
  is_expired: boolean;
  expires_at: string;
  already_has_password: boolean;
}

const formSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const Route = createFileRoute("/(auth)/setup-password")({
  component: SetupPasswordPage,
  validateSearch: z.object({
    token: z.string().optional(),
  }),
});

function SetupPasswordPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { token?: string };
  const token = search.token;
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [isValidatingToken, setIsValidatingToken] = useState(true);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Validate token on mount
  // react-doctor-disable-next-line react-doctor/no-fetch-in-effect -- one-shot token validation on mount; no caller can provide pre-fetched data
  // react-doctor-disable-next-line react-doctor/no-cascading-set-state -- 3 setState calls form a single mount-time validation state machine
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        toast.error("No setup token provided");
        navigate({ to: "/login" });
        return;
      }

      try {
        setIsValidatingToken(true);

        // Call the actual API to validate the token
        const backendUrl = getServerUrl();
        const response = await fetch(
          `${backendUrl}/api/v1/auth-setup/setup-token-info/${token}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const tokenData = (await response.json()) as TokenInfo;
        setTokenInfo(tokenData);

        if (tokenData.is_expired) {
          toast.error("Password setup link has expired");
          navigate({ to: "/login" });
          return;
        }

        if (tokenData.already_has_password) {
          toast.info("Password already set for this account");
          navigate({ to: "/login" });
          return;
        }
      } catch (error) {
        console.error("Token validation error:", error);
        toast.error("Invalid or expired password setup link");
        navigate({ to: "/login" });
      } finally {
        setIsValidatingToken(false);
      }
    };

    validateToken();
  }, [token, navigate]);

  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- terminal auth flow: navigates to /login on success, no cached queries to invalidate
  const setupPasswordMutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const backendUrl = getServerUrl();
      const response = await fetch(
        `${backendUrl}/api/v1/auth-setup/setup-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            password: data.password,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Invalid response from server");
      }
      return (await response.json()) as {
        access_token: string;
        user_id: string;
        email: string;
        full_name: string;
      };
    },
    onSuccess: (response) => {
      toast.success(
        "Password set up successfully! Redirecting to onboarding..."
      );

      // Store the access token
      localStorage.setItem("authToken", response.access_token);

      // Redirect to onboarding to create organization
      navigate({ to: "/onboarding" });
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      console.error("Password setup error:", error);

      const errorMessage =
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to set up password";

      if (errorMessage.includes("already set")) {
        toast.error("Password already set for this account");
        navigate({ to: "/login" });
      } else if (errorMessage.includes("expired")) {
        toast.error("Password setup link has expired");
        navigate({ to: "/login" });
      } else {
        toast.error(errorMessage);
      }
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setupPasswordMutation.mutate(values);
  };

  if (isValidatingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="flex items-center space-x-2">
          <Loader2 className="size-6 animate-spin" />
          <span>Validating setup link…</span>
        </div>
      </div>
    );
  }

  if (!tokenInfo) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              Set Up Your Password
            </CardTitle>
            <p className="text-gray-600 mt-2">
              Welcome, {tokenInfo.full_name}! Please set up your password to
              complete your account.
            </p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                    <strong>Account:</strong> {tokenInfo.email}
                  </div>

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter your password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Confirm your password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={setupPasswordMutation.isPending}
                >
                  {setupPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Setting up password…
                    </>
                  ) : (
                    "Set Up Password"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>
                After setting up your password, you'll be taken to create your
                organization.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
