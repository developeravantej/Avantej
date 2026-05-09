# Web Test Infrastructure

## Mock client

`helpers/mock-client.ts` exports `mockClient` and `mockOrpc` — Proxy-based mocks that auto-handle any oRPC router path.

### Standard test setup

```typescript
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({
  client: mockClient,
  orpc: mockOrpc,
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
}));
```

### Overriding a specific procedure

```typescript
vi.mocked(mockClient.purchaseOrders.list).mockResolvedValueOnce({
  items: [{ id: "po-1", ... }],
  total: 1,
});
```

The Proxy returns a new vi.fn() for any path — you only need to override when the test asserts on the response shape.

## renderWithProviders

`helpers/render-with-providers.tsx` wraps components in `QueryClientProvider`. Tests that use TanStack Router hooks must mock `@tanstack/react-router` in their vi.mock setup.
