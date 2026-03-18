import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2,
  Check,
  Star,
  Zap,
  Shield,
  Users,
  Mail,
  User
} from "lucide-react";
import apiClient from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { getServerUrl } from "@/lib/config";
import getStripe from "@/lib/stripe";
import { useAuth } from "@/hooks/useAuth";

// Use the API type
type SubscriptionPlan = {
  id: string;
  name: string;
  price_amount: number;
  currency: string;
  interval: string;
  interval_count: number;
  description?: string;
  features: string[];
  metadata: Record<string, string>;
};

export const Route = createFileRoute("/subscribe")({
  component: SubscribePage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      session_id: search.session_id as string | undefined,
      canceled: search.canceled as string | undefined,
    };
  },
});

function SubscribePage() {
  const navigate = useNavigate();
  const { session_id, canceled } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Guest checkout form state
  const [isGuestSheetOpen, setIsGuestSheetOpen] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [guestForm, setGuestForm] = useState({
    email: "",
    fullName: "",
  });
  const [guestFormErrors, setGuestFormErrors] = useState({
    email: "",
    fullName: "",
  });

  // Track if we've already processed this session to prevent infinite loops
  const processedSessionRef = useRef<string | null>(null);
  const [hasNavigated, setHasNavigated] = useState(false);

  // Mutation to process successful payment
  const processPaymentMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      try {
        // Try authenticated session first, then fallback to guest session
        let response;
        try {
          response = await apiClient.getStripeRetrieveSession(sessionId);
        } catch (authError: any) {
          // Check if it's a 403/401 error (authentication issue)
          if (
            authError?.message?.includes("403") ||
            authError?.message?.includes("401") ||
            authError?.message?.includes("Not authenticated")
          ) {
            // This might be a guest checkout, try the guest endpoint
            console.log(
              "Auth failed, trying guest endpoint for session:",
              sessionId
            );
            const backendUrl = getServerUrl();
            const guestResponse = await fetch(
              `${backendUrl}/api/v1/stripe/guest-session/${sessionId}`
            );
            if (guestResponse.ok) {
              response = { data: await guestResponse.json() };
              console.log(
                "Successfully retrieved guest session:",
                response.data
              );
            } else {
              const errorText = await guestResponse.text();
              console.error("Guest session failed:", errorText);
              throw new Error(`Failed to retrieve guest session: ${errorText}`);
            }
          } else {
            throw authError;
          }
        }

        // Return payment processing result
        return {
          success: true,
          requires_password_setup:
            response.data.metadata?.requires_password_setup === "true",
          requires_onboarding:
            response.data.metadata?.requires_onboarding === "true",
          user_id: response.data.metadata?.user_id,
          guest_email: response.data.metadata?.guest_email,
        };
      } catch (error) {
        console.error("Error processing payment:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("Payment processed successfully data:", data);
      // Prevent multiple navigations
      if (hasNavigated) return;
      setHasNavigated(true);

      // Check if user needs password setup first
      if (data?.requires_password_setup && data?.guest_email) {
        console.log("User needs password setup - getting setup token");

        // Get the password setup token for this user
        const backendUrl = getServerUrl();
        fetch(
          `${backendUrl}/api/v1/auth-setup/get-setup-token/${encodeURIComponent(
            data.guest_email
          )}`
        )
          .then((response) => response.json())
          .then((tokenData: any) => {
            console.log("Got setup token:", tokenData);
            // Redirect to password setup page with token
            navigate({
              to: "/setup-password",
              search: { token: tokenData.token },
            });
          })
          .catch((error) => {
            console.error("Failed to get setup token:", error);
            alert(
              `Please check the backend console logs for your password setup token for ${data.guest_email}, then navigate to /setup-password?token=YOUR_TOKEN`
            );
            navigate({ to: "/login" });
          });
        return;
      }

      // Check if user needs onboarding
      if (data?.requires_onboarding) {
        console.log(
          "User needs onboarding - redirect to organization creation"
        );
        navigate({
          to: "/onboarding",
        });
      } else {
        // User already has organization, go to dashboard
        navigate({ to: "/dashboard", search: { session_id: undefined } });
      }
    },
    onError: (error) => {
      console.error("Failed to process payment:", error);
      setError("Failed to process your payment. Please contact support.");
    },
  });

  // Handle payment success when session_id is present
  useEffect(() => {
    if (
      session_id &&
      processedSessionRef.current !== session_id &&
      !processPaymentMutation.isPending &&
      !hasNavigated
    ) {
      processedSessionRef.current = session_id;
      processPaymentMutation.mutate(session_id);
    }
  }, [session_id, processPaymentMutation.isPending, hasNavigated]);

  // Handle canceled payment
  useEffect(() => {
    if (canceled === "true" && !error) {
      setError(
        "Payment was canceled. Please try again or contact support if you need assistance."
      );
    }
  }, [canceled, error]);

  // Reset navigation state when session_id changes or component unmounts
  useEffect(() => {
    return () => {
      setHasNavigated(false);
      processedSessionRef.current = null;
    };
  }, [session_id]);

  // Fetch subscription plans
  const {
    data: plans,
    isLoading: isLoadingPlans,
    isError: isErrorPlans,
    error: errorPlans,
  } = useQuery<SubscriptionPlan[], Error>({
    queryKey: ["subscription", "plans"],
    queryFn: async () => {
      try {
        const response = await apiClient.getGetsubscriptionplans();
        return response.data;
      } catch (error) {
        console.error("Error fetching subscription plans:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  console.log("stripe plans: ", plans)

  // Create checkout session mutation
  const { mutate: createCheckout, isPending: isCreatingCheckout } = useMutation(
    {
      mutationFn: async (priceId: string) => {
        try {
          const currentUrl = window.location.origin;
          const response = await apiClient.postCreatecheckoutsession({
            body: {
              price_id: priceId,
              success_url: `${currentUrl}/subscribe?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${currentUrl}/subscribe?canceled=true`,
              metadata: {
                source: "web_app",
              },
            },
          });

          return response.data;
        } catch (error) {
          console.error("Error creating checkout session:", error);
          throw error;
        }
      },
      onSuccess: async (data) => {
        setError(null);

        // Redirect to Stripe checkout
        const stripe = await getStripe();
        if (stripe && data.url) {
          // Direct redirect to Stripe checkout URL
          window.location.href = data.url;
        } else {
          throw new Error("Failed to initialize Stripe checkout");
        }
      },
      onError: (err) => {
        console.error("Create checkout error:", err);
        const message =
          err instanceof Error ? err.message : "An unknown error occurred.";
        setError(message);
      },
    }
  );

  // Create guest checkout session mutation
  const { mutate: createGuestCheckout, isPending: isCreatingGuestCheckout } =
    useMutation({
      mutationFn: async ({
        priceId,
        email,
        fullName,
      }: {
        priceId: string;
        email: string;
        fullName: string;
      }) => {
        try {
          const currentUrl = window.location.origin;
          const response = await apiClient.postCreateguestcheckoutsession({
            body: {
              price_id: priceId,
              customer_email: email,
              full_name: fullName,
              success_url: `${currentUrl}/subscribe?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${currentUrl}/subscribe?canceled=true`,
              metadata: {
                source: "web_app_guest",
              },
            },
          });

          return response.data;
        } catch (error) {
          console.error("Error creating guest checkout session:", error);
          throw error;
        }
      },
      onSuccess: async (data) => {
        setError(null);
        setIsGuestSheetOpen(false);

        // Redirect to Stripe checkout
        const stripe = await getStripe();
        if (stripe && data.url) {
          // Direct redirect to Stripe checkout URL
          window.location.href = data.url;
        } else {
          throw new Error("Failed to initialize Stripe checkout");
        }
      },
      onError: (err) => {
        console.error("Create guest checkout error:", err);
        const message =
          err instanceof Error ? err.message : "An unknown error occurred.";
        setError(message);
      },
    });

  const handleSelectPlan = useCallback(
    (priceId: string) => {
      setError(null);

      if (isAuthenticated) {
        // User is logged in, proceed with normal checkout
        createCheckout(priceId);
      } else {
        // User is not logged in, show guest checkout form
        setSelectedPriceId(priceId);
        setIsGuestSheetOpen(true);
      }
    },
    [isAuthenticated, createCheckout]
  );

  const validateGuestForm = useCallback(() => {
    const errors = { email: "", fullName: "" };
    let isValid = true;

    if (!guestForm.email.trim()) {
      errors.email = "Email is required";
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestForm.email)) {
      errors.email = "Please enter a valid email address";
      isValid = false;
    }

    if (!guestForm.fullName.trim()) {
      errors.fullName = "Full name is required";
      isValid = false;
    } else if (guestForm.fullName.trim().length < 2) {
      errors.fullName = "Full name must be at least 2 characters";
      isValid = false;
    }

    setGuestFormErrors(errors);
    return isValid;
  }, [guestForm.email, guestForm.fullName]);

  const handleGuestCheckout = useCallback(() => {
    if (!selectedPriceId) return;

    if (validateGuestForm()) {
      createGuestCheckout({
        priceId: selectedPriceId,
        email: guestForm.email.trim(),
        fullName: guestForm.fullName.trim(),
      });
    }
  }, [
    selectedPriceId,
    validateGuestForm,
    createGuestCheckout,
    guestForm.email,
    guestForm.fullName,
  ]);

  const handleGuestFormChange = useCallback(
    (field: string, value: string) => {
      setGuestForm((prev) => ({ ...prev, [field]: value }));
      // Clear error when user starts typing
      if (guestFormErrors[field as keyof typeof guestFormErrors]) {
        setGuestFormErrors((prev) => ({ ...prev, [field]: "" }));
      }
    },
    [guestFormErrors]
  );

  // Helper function to get plan features
  const getPlanFeatures = (plan: SubscriptionPlan) => {
    // Use features from the plan if available
    if (plan.features && plan.features.length > 0) {
      return plan.features;
    }
    return [];
  };

  // Helper function to get plan icon
  const getPlanIcon = (plan: SubscriptionPlan) => {
    const planName = plan.name.toLowerCase();
    if (planName.includes("enterprise")) return <Shield className="h-6 w-6" />;
    if (planName.includes("pro")) return <Zap className="h-6 w-6" />;
    return <Users className="h-6 w-6" />;
  };

  // Helper function to check if plan is popular
  const isPopularPlan = (plan: SubscriptionPlan) => {
    return plan.name.toLowerCase().includes("pro");
  };

  return (
    <div className="container mx-auto max-w-6xl py-12 px-4">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Flexible Business Software, Designed to Fit You
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Say goodbye to one-size-fits-all systems. avantej adapts to your workflows — not the other way around.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-8">
          <div>
            <h4 className="font-medium">Error</h4>
            <p className="text-sm">{error}</p>
          </div>
        </Alert>
      )}

      {/* Payment Processing State */}
      {session_id && processPaymentMutation.isPending && (
        <div className="flex justify-center items-center py-16">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-lg font-medium">Processing your payment...</p>
            <p className="text-muted-foreground">
              Please wait while we set up your subscription.
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoadingPlans && !session_id && (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-lg text-muted-foreground">
            Loading plans...
          </span>
        </div>
      )}

      {/* Error State */}
      {isErrorPlans && !isLoadingPlans && (
        <Alert variant="destructive" className="mb-8">
          <div>
            <h4 className="font-medium">Failed to Load Plans</h4>
            <p className="text-sm">
              {errorPlans?.message ||
                "Unable to fetch subscription plans. Please try again later."}
            </p>
          </div>
        </Alert>
      )}

      {/* Plans Grid */}
      {plans &&
        !isLoadingPlans &&
        !isErrorPlans &&
        plans.length > 0 &&
        !session_id && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {plans.map((plan) => {
              const features = getPlanFeatures(plan);
              const icon = getPlanIcon(plan);
              const popular = isPopularPlan(plan);

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col transition-all duration-200 hover:shadow-lg ${popular ? "border-primary shadow-md scale-105" : ""
                    } ${isCreatingCheckout || isCreatingGuestCheckout
                      ? "opacity-70 pointer-events-none"
                      : ""
                    }`}
                >
                  {/* Popular Badge */}
                  {popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Most Popular
                      </div>
                    </div>
                  )}

                  <CardHeader className="text-center pb-4">
                    <div className="flex justify-center mb-3 text-primary">
                      {icon}
                    </div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    {plan.description && (
                      <CardDescription className="text-base">
                        {plan.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="flex-grow">
                    {/* Pricing */}
                    <div className="text-center mb-6">
                      <div className="text-4xl font-bold">
                        {formatPrice(plan.price_amount, plan.currency)}
                      </div>
                      <div className="text-muted-foreground">
                        per {plan.interval}
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3">
                      {features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="pt-6">
                    <Button
                      className={`w-full ${popular ? "bg-primary hover:bg-primary/90" : ""
                        }`}
                      variant={popular ? "default" : "outline"}
                      onClick={() => handleSelectPlan(plan.id)}
                      disabled={isCreatingCheckout || isCreatingGuestCheckout}
                    >
                      {isCreatingCheckout || isCreatingGuestCheckout ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : isAuthenticated ? (
                        "Get Started"
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Subscribe Now
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

      <div className="mt-16 py-8 border-t border-b border-border/50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center space-y-3">
              <div className="text-xs font-medium text-primary tracking-wider uppercase">
                Backend
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Flexible Backend with <br />
                <span className="text-foreground font-semibold"><em>avantej</em> Core</span>
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="text-xs font-medium text-primary tracking-wider uppercase">
                Frontend
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Custom Frontend with <br />
                <span className="text-foreground font-semibold"><em>avantej</em> Flow</span>
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="text-xs font-medium text-primary tracking-wider uppercase">
                Extensions
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Low-code Extensions <br />
                via Google Sheets
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="text-xs font-medium text-primary tracking-wider uppercase">
                Architecture
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Scalable, Modular, <br />
                Future-Ready
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* No Plans Available */}
      {plans?.length === 0 && !isLoadingPlans && !isErrorPlans && (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-medium mb-2">No Plans Available</h3>
            <p className="text-muted-foreground mb-6">
              No subscription plans are currently available. Please contact
              support or check back later.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      )}

      {/* Guest Checkout Sheet */}
      <Sheet open={isGuestSheetOpen} onOpenChange={setIsGuestSheetOpen}>
        <SheetContent className="sm:max-w-md p-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Complete Your Subscription
            </SheetTitle>
            <SheetDescription>
              Enter your details to proceed with checkout. You'll receive an
              email to complete your account setup after payment.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="guest-email">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="guest-email"
                type="email"
                placeholder="Enter your email address"
                value={guestForm.email}
                onChange={(e) => handleGuestFormChange("email", e.target.value)}
                className={guestFormErrors.email ? "border-red-500" : ""}
                disabled={isCreatingGuestCheckout}
              />
              {guestFormErrors.email && (
                <p className="text-sm text-red-500">{guestFormErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-name">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="guest-name"
                type="text"
                placeholder="Enter your full name"
                value={guestForm.fullName}
                onChange={(e) =>
                  handleGuestFormChange("fullName", e.target.value)
                }
                className={guestFormErrors.fullName ? "border-red-500" : ""}
                disabled={isCreatingGuestCheckout}
              />
              {guestFormErrors.fullName && (
                <p className="text-sm text-red-500">
                  {guestFormErrors.fullName}
                </p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">What happens next?</p>
                  <ul className="space-y-1 text-blue-700">
                    <li>• Your payment will be processed securely</li>
                    <li>
                      • You'll receive a welcome email with account setup
                      instructions
                    </li>
                    <li>• Set your password to access your dashboard</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsGuestSheetOpen(false)}
                disabled={isCreatingGuestCheckout}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGuestCheckout}
                disabled={isCreatingGuestCheckout}
                className="flex-1"
              >
                {isCreatingGuestCheckout ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Continue to Payment
                  </>
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Footer */}
      <div className="text-center mt-16 pt-8 border-t">
        <p className="text-muted-foreground">
          Need help choosing a plan?{" "}
          <a
            href="mailto:support@example.com"
            className="text-primary hover:underline"
          >
            Contact our sales team
          </a>
        </p>
      </div>
    </div>
  );
}
