# AI Coding Rules for Avantej Core - Native App

You are my expert React Native coding assistant for the Avantej Core native mobile app.

## Project Structure

- **Monorepo**: Bun workspaces with Turborepo for build orchestration
- **Package Manager**: Bun (v1.2.22) - always use `bun` commands, never npm/yarn
- **App Location**: `apps/native/` - Expo + React Native mobile app
- **Shared Packages** (used by native app):
  - `packages/api/` - oRPC contracts and shared API types
  - `packages/auth/` - Better-Auth configuration
  - `packages/types/` - Shared TypeScript types

## Technology Stack

### Native App (apps/native)

- **Framework**: Expo SDK 54+ with Expo Router
- **React Version**: React 19.1.0
- **React Native**: 0.81.4
- **Routing**: Expo Router with file-based routing in `app/`
- **State Management**: TanStack Query (React Query) for server state
- **Forms**: TanStack Form for form management
- **Styling**: NativeWind v4+ (Tailwind CSS for React Native)
- **Authentication**: Better-Auth with `@better-auth/expo` plugin
- **API Client**: oRPC client from `@avantej-core/api/client`
- **Storage**: Expo SecureStore for sensitive data
- **Icons**: `@expo/vector-icons`
- **Navigation**: React Navigation (drawer, tabs, stack)

## Code Generation Guidelines

### TypeScript & Type Safety

- Always use TypeScript with strict mode enabled
- Leverage oRPC for end-to-end type safety between client and server
- Use Zod schemas for runtime validation (shared via oRPC)
- Prefer type inference over explicit types when possible
- Use `workspace:*` for internal package dependencies

### File Structure Conventions

**Native App (apps/native/)**:

- `app/` - Expo Router route files (file-based routing)
  - `_layout.tsx` - Root layout with providers
  - `(drawer)/` - Drawer navigation group
  - `(tabs)/` - Tab navigation group
  - `modal.tsx` - Modal screens
  - `+not-found.tsx` - 404 screen
- `components/` - React Native components
  - Organize by feature (e.g., `sign-in.tsx`, `sign-up.tsx`)
- `lib/` - Utilities and configuration
  - `auth-client.ts` - Better-Auth client setup
  - `constants.ts` - App constants
  - `use-color-scheme.ts` - Color scheme hook
  - `android-navigation-bar.tsx` - Android navigation bar styling
- `utils/` - Helper functions
  - `orpc.ts` - oRPC API client setup
- `assets/` - Images, fonts, and static assets
- `global.css` - NativeWind global styles

**Shared Packages** (reference only - don't modify directly):

- `packages/api/src/routers/` - oRPC router definitions (type definitions)
- `packages/auth/src/` - Better-Auth configuration

### API Communication Pattern

**Always use oRPC for API calls** - never REST endpoints directly:

```typescript
// ✅ CORRECT: Use oRPC client
import { orpc } from "@/utils/orpc";
const data = await orpc.hierarchy.list.query({ organizationId: orgId });

// ❌ WRONG: Direct fetch or REST calls
const response = await fetch("/api/hierarchy");
```

**Using oRPC with TanStack Query**:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

// Query example
const { data, isLoading } = useQuery({
  queryKey: ["hierarchy", orgId],
  queryFn: () => orpc.hierarchy.list.query({ organizationId: orgId }),
});

// Mutation example
const mutation = useMutation({
  mutationFn: (data) => orpc.services.create.mutate(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["services"] });
  },
});
```

### Authentication Pattern

**Native App Authentication**:

```typescript
import { authClient } from "@/lib/auth-client";

// Get current session
const session = await authClient.getSession();

// Sign in
await authClient.signIn.email({
  email: "user@example.com",
  password: "password",
});

// Sign up
await authClient.signUp.email({
  email: "user@example.com",
  password: "password",
  name: "User Name",
});

// Sign out
await authClient.signOut();
```

**Auth Client Setup** (already configured in `lib/auth-client.ts`):

- Uses `@better-auth/expo` plugin
- Stores tokens in Expo SecureStore
- Configured with app scheme from `app.json`

### Routing Pattern

**Expo Router File-Based Routing**:

- Routes are defined by file structure in `app/` directory
- `(drawer)` and `(tabs)` are route groups (don't appear in URL)
- Use `_layout.tsx` for nested layouts
- Use `+not-found.tsx` for 404 pages

**Navigation Examples**:

```typescript
import { router } from "expo-router";

// Navigate to a route
router.push("/dashboard");
router.replace("/login");

// Navigate back
router.back();
```

**Route Protection**:

- Use layout-based protection in `_layout.tsx` files
- Check auth status and redirect if needed

### Form Handling

**Use TanStack Form** (not React Hook Form):

```typescript
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { z } from "zod";
import { orpc } from "@/utils/orpc";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

const form = useForm({
  defaultValues: { name: "", email: "" },
  validatorAdapter: zodValidator(),
  onSubmit: async ({ value }) => {
    await orpc.services.create.mutate(value);
  },
});

// In your component
<form.Field name="name">
  {(field) => (
    <TextInput
      value={field.state.value}
      onChangeText={field.handleChange}
      onBlur={field.handleBlur}
    />
  )}
</form.Field>
```

### Styling with NativeWind

**NativeWind (Tailwind CSS for React Native)**:

```typescript
import { View, Text } from "react-native";

// Use Tailwind classes
<View className="flex-1 bg-white p-4">
  <Text className="text-xl font-bold text-gray-900">
    Hello World
  </Text>
</View>
```

**Key Points**:

- Use `className` prop (not `style` for Tailwind classes)
- Global styles in `global.css`
- Supports dark mode via `useColorScheme` hook
- Use responsive utilities: `sm:`, `md:`, `lg:`, etc.

**Color Scheme**:

```typescript
import { useColorScheme } from "@/lib/use-color-scheme";

const { colorScheme, isDarkColorScheme } = useColorScheme();
```

### State Management

**Server State**: Always use TanStack Query:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

const { data, isLoading, error } = useQuery({
  queryKey: ["hierarchy", orgId],
  queryFn: () => orpc.hierarchy.list.query({ organizationId: orgId }),
});

// Access loading/error states
if (isLoading) return <ActivityIndicator />;
if (error) return <Text>Error: {error.message}</Text>;
```

**Client State**: Use React hooks (useState, useReducer) for simple state:

```typescript
const [count, setCount] = useState(0);
```

### UI Components

**React Native Components**:

- Use standard React Native components: `View`, `Text`, `TextInput`, `Button`, `ScrollView`, etc.
- Use `@expo/vector-icons` for icons
- Use React Navigation components for navigation UI
- Style with NativeWind (Tailwind classes)

**Component Structure**:

```typescript
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function MyComponent() {
  return (
    <View className="flex-1 p-4">
      <Ionicons name="home" size={24} color="black" />
      <Text className="text-lg">Hello</Text>
    </View>
  );
}
```

### Environment Variables

**Native App**: `apps/native/.env` with `EXPO_PUBLIC_` prefix

```bash
EXPO_PUBLIC_SERVER_URL=http://localhost:3000
```

Access in code:

```typescript
const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL;
```

### Platform-Specific Code

**Handle iOS/Android Differences**:

```typescript
import { Platform } from "react-native";

if (Platform.OS === "ios") {
  // iOS-specific code
} else if (Platform.OS === "android") {
  // Android-specific code
}

// Platform-specific styles
const styles = {
  container: {
    paddingTop: Platform.OS === "ios" ? 20 : 0,
  },
};
```

### Error Handling

**Error Handling Patterns**:

- Use oRPC error handling in `onError` interceptors (configured in `utils/orpc.ts`)
- Show user-friendly errors via Alert or custom error components
- Log errors for debugging

```typescript
import { Alert } from "react-native";

try {
  await orpc.services.create.mutate(data);
} catch (error) {
  Alert.alert("Error", error.message);
}
```

### Loading States

**Loading UI**:

- Use TanStack Query's `isLoading`, `isFetching` states
- Show loading UI with `ActivityIndicator` or skeleton components

```typescript
import { ActivityIndicator, View } from "react-native";

if (isLoading) {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" />
    </View>
  );
}
```

### Route Protection

**Protect Routes with Layouts**:

```typescript
// app/_authenticated/_layout.tsx
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export default function AuthenticatedLayout() {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const checkAuth = async () => {
      const session = await authClient.getSession();
      if (!session) {
        router.replace("/login");
      }
    };
    checkAuth();
  }, []);

  return <Stack />;
}
```

### Package Dependencies

- Use `catalog:` references for shared dependencies (see root package.json)
- Use `workspace:*` for internal packages (`@avantej-core/api`, `@avantej-core/auth`)
- Always add to `apps/native/package.json`
- Run `bun install` at root after adding dependencies

### Development Commands

```bash
# Start development server
bun dev:native
# or
cd apps/native && bun dev

# Run on iOS
bun ios
# or
cd apps/native && bun ios

# Run on Android
bun android
# or
cd apps/native && bun android

# Run on web (for testing)
bun web
# or
cd apps/native && bun web

# Type checking
bun check-types
```

### Examples

**Adding a new route**:

1. Create file in `apps/native/app/` directory
2. Example: `app/profile.tsx` creates `/profile` route
3. Use route groups for organization: `app/(tabs)/settings.tsx`

**Creating a new component**:

1. Create file in `apps/native/components/`
2. Example: `components/user-profile.tsx`
3. Export and use in routes or other components

**Using oRPC API**:

1. API procedures are defined in `packages/api/src/routers/`
2. Use in native app: `orpc.[router].[procedure].query/mutate()`
3. Types are automatically inferred from oRPC contracts

**Adding a new screen with form**:

```typescript
// app/create-item.tsx
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { View, TextInput, Button } from "react-native";
import { orpc } from "@/utils/orpc";

export default function CreateItemScreen() {
  const form = useForm({
    defaultValues: { name: "" },
    validatorAdapter: zodValidator(),
    onSubmit: async ({ value }) => {
      await orpc.items.create.mutate(value);
      router.back();
    },
  });

  return (
    <View className="flex-1 p-4">
      <form.Field name="name">
        {(field) => (
          <TextInput
            value={field.state.value}
            onChangeText={field.handleChange}
            className="border p-2 rounded"
          />
        )}
      </form.Field>
      <Button title="Submit" onPress={form.handleSubmit} />
    </View>
  );
}
```

## Important Notes

- **DO NOT** use Next.js patterns (this is Expo Router)
- **DO NOT** use Clerk (use Better-Auth)
- **DO NOT** use REST APIs directly (use oRPC)
- **DO NOT** use npm/yarn (use Bun)
- **DO NOT** use React Hook Form (use TanStack Form)
- **DO NOT** use web-only libraries (check React Native compatibility)
- Always use React Native components, not web HTML elements
- Use NativeWind for styling (Tailwind CSS classes)
- All components are client-side (React Native)
- Maintain type safety via oRPC between client and server
- Follow Expo Router file-based routing conventions
- Use Expo SecureStore for sensitive data storage

If something is unclear, clarify assumptions and offer multiple solutions.
