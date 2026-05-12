import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { client } from "@/utils/orpc";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
  validateSearch: (search: Record<string, unknown>) => {
    const rawCallbackURL = (search.callbackURL as string) || "";
    const isRelativePath =
      rawCallbackURL.startsWith("/") && !rawCallbackURL.startsWith("//");
    return {
      token: (search.token as string) || "",
      callbackURL: isRelativePath ? rawCallbackURL : "/login",
    };
  },
});

function VerifyEmailPage() {
  const { token, callbackURL } = useSearch({ from: "/verify-email" });
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus("error");
        setErrorMessage("Missing verification token.");
        return;
      }

      try {
        // Use oRPC client for type-safe API calls
        await client.auth.verifyEmail({ token });

        if (cancelled) return;
        setStatus("success");

        // Redirect after short delay (to login by default)
        setTimeout(() => {
          navigate({ to: callbackURL });
        }, 1200);
      } catch (e) {
        if (cancelled) return;
        console.error("Email verification error:", e);
        setStatus("error");
        setErrorMessage(
          "Email verification failed. The link may be expired or invalid."
        );
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, callbackURL, navigate]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            We’re verifying your email address. You’ll be redirected
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Verifying…
            </div>
          )}
          {status === "success" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="size-4" />
              Email verified. Redirecting…
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <XCircle className="mt-0.5 size-4" />
              <div>
                <div className="font-medium">Verification failed</div>
                <div className="text-red-600/90">{errorMessage}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
