import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

function DemoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Request a Demo</h1>
        <p className="mt-4 text-muted-foreground">Coming soon.</p>
      </div>
    </div>
  );
}
