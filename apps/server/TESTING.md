# Testing Guide: Neon Service

This guide explains how to test the Neon project provisioning service.

## Test Types

### 1. Unit Tests (Mocked API Calls)

**File**: `src/services/neon.service.test.ts`

**Run**:
```bash
cd apps/server
bun test src/services/neon.service.test.ts
```

**Or use npm script**:
```bash
cd apps/server
bun run test:neon
```

**What it tests**:
- ✅ Function logic and error handling
- ✅ API request formatting
- ✅ Response parsing
- ✅ Edge cases (missing API key, invalid responses, network errors)
- ⚠️ Uses mocked `fetch` - no real API calls

**Coverage**: 10 tests, all passing

---

### 2. Integration Tests (Real Neon API)

**File**: `src/services/neon.service.integration.test.ts`

**Prerequisites**:
1. Get Neon API key from: https://console.neon.tech/app/settings/api-keys
2. Set environment variable: `export NEON_API_KEY="your-api-key"`

**Run**:
```bash
cd apps/server
NEON_API_KEY="your-api-key" bun test src/services/neon.service.integration.test.ts
```

**Or use npm script**:
```bash
cd apps/server
export NEON_API_KEY="your-api-key"
bun run test:neon:integration
```

**What it tests**:
- ✅ Real Neon project creation
- ✅ Valid project ID and connection string returned
- ✅ Project name format
- ✅ Default region handling
- ✅ Error handling with invalid API key
- ✅ Automatic cleanup (deletes test projects)

**⚠️ Warning**: Creates real Neon projects (automatically cleaned up)

**Skip integration tests**:
```bash
SKIP_INTEGRATION_TESTS=true bun test src/services/neon.service.integration.test.ts
```

---

## Test Scripts

All test scripts are available in `apps/server/package.json`:

```bash
# Run all tests (unit + integration)
bun run test

# Run only unit tests (excludes integration tests)
bun run test:unit

# Run only integration tests
bun run test:integration

# Run Neon service unit tests only
bun run test:neon

# Run Neon service integration tests only
bun run test:neon:integration
```

---

## Manual Testing

### Test via Organization Creation Endpoint

1. **Start the server**:
   ```bash
   cd apps/server
   bun run dev
   ```

2. **Create organization** (requires authentication):
   ```bash
   curl -X POST http://localhost:3000/orgs \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{
       "name": "Test Organization",
       "slug": "test-org-manual"
     }'
   ```

   This will:
   - Call `createTenantProject()`
   - Create organization record
   - Run tenant migrations
   - Create default hierarchy node

3. **Verify in Neon Console**:
   - Go to https://console.neon.tech
   - Check for project named `tenant-test-org-manual`

---

## Test Coverage

### Unit Tests (10 tests)
- ✅ Successfully creates project
- ✅ Uses default region
- ✅ Throws error when API key missing
- ✅ Throws error on API error response
- ✅ Throws error when project ID missing
- ✅ Throws error when connection URI missing
- ✅ Handles network errors
- ✅ Handles invalid JSON response
- ✅ Generates correct project name from slug

### Integration Tests (4 tests)
- ✅ Creates real Neon project
- ✅ Validates project ID and connection string
- ✅ Tests project name format
- ✅ Tests default region
- ✅ Tests invalid API key error
- ✅ Automatic cleanup

---

## Troubleshooting

### Integration tests fail with "NEON_API_KEY not set"
- Set the environment variable: `export NEON_API_KEY="your-key"`
- Or skip integration tests: `SKIP_INTEGRATION_TESTS=true bun test`

### Integration tests create projects but don't clean up
- Check console output for cleanup errors
- Manually delete test projects from Neon console
- Projects are named: `tenant-test-integration-{timestamp}`

### Unit tests fail
- Ensure you're in `apps/server` directory
- Run `bun install` to ensure dependencies are installed
- Check that `fetch` is available (should be in Bun runtime)

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Neon Service

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: cd apps/server && bun run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: |
          cd apps/server
          NEON_API_KEY=${{ secrets.NEON_API_KEY }} bun run test:integration
```

---

## Next Steps

- [x] Add integration test for organization creation flow (T102) ✅
- [ ] Add E2E test for onboarding flow (T104)
- [ ] Add performance benchmarks for project creation
- [ ] Add retry logic tests for transient API failures

---

## Organization Creation Integration Test (T102)

**File**: `src/tests/integration/org.test.ts`

**Prerequisites**:
1. `DATABASE_URL` - Control panel database connection
2. `NEON_API_KEY` - Neon API key for project creation
3. `ENCRYPTION_KEY` - For encrypting connection strings

**Run**:
```bash
cd apps/server
bun test src/tests/integration/org.test.ts
```

**Or use npm script**:
```bash
cd apps/server
bun run test:org:integration
```

**What it tests**:
- ✅ Creates test user and subscription
- ✅ Creates organization via service layer
- ✅ Provisions Neon project
- ✅ Encrypts and stores connection string
- ✅ Runs tenant migrations
- ✅ Creates default hierarchy node
- ✅ Adds user as admin in tenant DB
- ✅ Adds user to organization_members registry
- ✅ Validates dual-write sync consistency
- ✅ Verifies Neon project exists
- ✅ Automatic cleanup of all test resources

**⚠️ Warning**: Creates real Neon projects (automatically cleaned up)

**Skip integration tests**:
```bash
SKIP_INTEGRATION_TESTS=true bun test src/tests/integration/org.test.ts
```


