# Stripe Configuration

**Feature**: 001-implement-multi-tenant
**Date**: 2025-10-13
**Status**: Active

## Platform Account

- **Account ID**: `acct_1RIqiVB9q4OqnXS0`
- **Account Name**: Avantej Core
- **Mode**: Test Mode (for development)
- **Dashboard**: https://dashboard.stripe.com/test/dashboard

## Configuration Status

✅ **Completed Manual Steps**:
- Product metadata added for all 3 subscription plans (organization limits, tiers, features)
- OAuth enabled for Stripe Connect
- Redirect URI added: `http://localhost:5173/connect/callback`
- API keys configured in `.env` files (not committed to git)
- Connect Client ID: `ca_TE36aYnPKeeuKSLc060GzPritzbuMtEf`

⏸️ **Pending (Can Do Later)**:
- Webhook signing secret (requires Stripe CLI: `stripe listen --forward-to http://localhost:8787/webhooks/stripe`)
- Price IDs for subscription plans (to be retrieved from Stripe MCP or Dashboard)
- Production redirect URI: `https://app.avantej.com/connect/callback`

---

## Subscription Products (Platform Revenue)

These products are for franchises paying Avantej Core subscription fees.

### Basic Plan

**Product ID**: `prod_SFG8QIuqDDtLoc`

**Pricing**:
- Monthly: TBD
- Yearly: TBD

**Features**:
- 1 franchise organization
- Basic support
- Core features

**Metadata** (to add manually in Stripe Dashboard):
```json
{
  "organizationLimit": "1",
  "features": "1 franchise, basic support",
  "tier": "basic"
}
```

### Pro Plan

**Product ID**: `prod_SFG92maNuB4jAZ`

**Pricing**:
- Monthly: TBD
- Yearly: TBD

**Features**:
- 5 franchise organizations
- Priority support
- Advanced analytics
- Custom branding

**Metadata** (to add manually in Stripe Dashboard):
```json
{
  "organizationLimit": "5",
  "features": "5 franchises, priority support, analytics, custom branding",
  "tier": "pro"
}
```

### Premium/Enterprise Plan

**Product ID**: `prod_SFGCflemCzF0My`

**Pricing**:
- Monthly: TBD
- Yearly: TBD

**Features**:
- Unlimited franchise organizations
- Dedicated support
- Custom integrations
- SLA guarantees
- Priority feature requests

**Metadata** (to add manually in Stripe Dashboard):
```json
{
  "organizationLimit": "unlimited",
  "features": "Unlimited franchises, dedicated support, custom integrations, SLA",
  "tier": "enterprise"
}
```

---

## Stripe Connect (Franchise Payment Processing)

Stripe Connect enables franchises to accept payments from their end customers (gym members) and pay out trainers.

### Configuration

**Account Type**: Express Connected Accounts (Account V2 API)

**Why Express?**
- Faster onboarding for franchises
- Stripe handles compliance (KYC, tax reporting)
- Built-in dashboard for franchises
- Simplified payout system

### Enabled Capabilities

Franchises will have these capabilities enabled:

- **`card_payments`**: Accept credit/debit card payments from gym members
- **`transfers`**: Send payouts to trainers and staff
- **`tax_reporting_us_1099_k`**: Automatic tax reporting (US-based franchises)

### OAuth Flow

**Client ID**: `ca_TE36aYnPKeeuKSLc060GzPritzbuMtEf` ✅ Configured

**Redirect URIs**:
- Development: `http://localhost:5173/connect/callback` ✅ Added
- Production: `https://app.avantej.com/connect/callback` (add before deployment)

**Scopes**:
- `read_write`: Full access to franchise account data

**OAuth URL**:
```
https://connect.stripe.com/express/oauth/authorize?client_id=ca_TE36aYnPKeeuKSLc060GzPritzbuMtEf&state={STATE}&suggested_capabilities[]=card_payments&suggested_capabilities[]=transfers
```

### Application Fee Strategy

**Current Setting**: 0% platform fee

**Rationale**:
- Avantej already earns $199-$799/mo per franchise
- Build trust by letting franchises keep 100% of their revenue
- Can introduce small fee (1-3%) in future if needed

**To enable application fee**:
Set `STRIPE_CONNECT_APPLICATION_FEE_PERCENT=2` in `.env` to take 2% of each transaction

### Account Onboarding Flow

1. **Franchise creates organization** → Triggers Express account creation via API
2. **API creates Connect account**: `POST /v1/accounts` with capabilities
3. **API generates onboarding link**: `POST /v1/account_links`
4. **Franchise completes Stripe onboarding**: KYC, bank details
5. **Stripe activates account**: `account.updated` webhook
6. **Franchise can accept payments**: Ready to charge gym members

---

## Webhook Events

### Platform Webhooks (Subscription Management)

**Endpoint**: `https://api.avantej.com/webhooks/stripe`
**Local Dev**: `http://localhost:8787/webhooks/stripe` (via Stripe CLI)

**Events to Subscribe**:

| Event | Purpose | Handler Action |
|-------|---------|----------------|
| `checkout.session.completed` | Payment succeeded | Create organization + provision Neon tenant DB |
| `customer.subscription.created` | New subscription | Link subscription to user |
| `customer.subscription.updated` | Plan changed | Update organization limits |
| `customer.subscription.deleted` | Canceled | Suspend organization access |
| `invoice.payment_succeeded` | Payment received | Update payment status to "active" |
| `invoice.payment_failed` | Payment failed | Update payment status to "failed", notify user |

### Connect Webhooks (Franchise Payments)

**Endpoint**: Same as platform webhooks
**Filter**: `event.account` will contain connected account ID

**Events to Subscribe**:

| Event | Purpose | Handler Action |
|-------|---------|----------------|
| `account.updated` | Account status changed | Update franchise Connect status |
| `account.application.authorized` | OAuth completed | Save Connect account ID |
| `account.application.deauthorized` | OAuth revoked | Disable franchise payments |
| `payment_intent.succeeded` | Franchise received payment | Log transaction (optional) |
| `payout.created` | Trainer paid | Log payout (optional) |

---

## Local Development Setup

### 1. Add Product Metadata (Manual)

Navigate to Stripe Dashboard → Products:

**For each product (Basic, Pro, Enterprise)**:
1. Click product name
2. Scroll to "Metadata" section
3. Add key-value pairs as specified above
4. Save changes

### 2. Enable Stripe Connect (Manual)

1. Go to: https://dashboard.stripe.com/test/settings/connect
2. Click "Get started" if not already enabled
3. Under "Branding":
   - Name: "Avantej Core"
   - Icon: Upload logo (optional)
   - Support email: Your email
4. Under "Express accounts":
   - Enable "Prefill application data" (faster onboarding)
   - Enable "Require business name"
5. Copy **Client ID** (starts with `ca_`)
6. Save settings

### 3. Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-brew/stripe

# Windows
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe

# Linux
wget -O stripe.tar.gz https://github.com/stripe/stripe-cli/releases/download/v1.21.11/stripe_1.21.11_linux_x86_64.tar.gz
tar -xvf stripe.tar.gz
sudo mv stripe /usr/local/bin
```

### 4. Forward Webhooks to Local API

```bash
# Login to Stripe (opens browser)
stripe login

# Forward webhooks to local dev server
stripe listen --forward-to http://localhost:8787/webhooks/stripe

# Output will include webhook signing secret:
# > Ready! Your webhook signing secret is whsec_... (^C to quit)

# Copy this secret to apps/api/.env
# STRIPE_WEBHOOK_SECRET=whsec_...
```

### 5. Test Webhook Events

In a separate terminal:

```bash
# Trigger successful checkout
stripe trigger checkout.session.completed

# Trigger subscription created
stripe trigger customer.subscription.created

# Trigger payment failure
stripe trigger invoice.payment_failed
```

---

## Test Cards

Use these test cards in Stripe Checkout:

| Card Number | Purpose | Expected Result |
|-------------|---------|-----------------|
| `4242 4242 4242 4242` | Success | Payment succeeds |
| `4000 0000 0000 0002` | Decline | Card declined |
| `4000 0027 6000 3184` | 3D Secure | Requires authentication |
| `4000 0000 0000 9995` | Insufficient funds | Payment fails |

**Expiry**: Any future date (e.g., `12/34`)
**CVC**: Any 3 digits (e.g., `123`)
**ZIP**: Any 5 digits (e.g., `12345`)

---

## Production Deployment

### Before Going Live

- [ ] Switch to **live mode** in Stripe Dashboard
- [ ] Create live mode products (same as test mode)
- [ ] Enable Stripe Connect in live mode
- [ ] Configure live webhook endpoint: `https://api.avantej.com/webhooks/stripe`
- [ ] Update environment variables with live API keys
- [ ] Test full checkout flow with real card
- [ ] Verify webhook delivery to production endpoint
- [ ] Enable webhook signature verification in API
- [ ] Set up monitoring for failed webhooks

### Live Mode Keys

```env
# Replace test keys with live keys (sk_live_..., pk_live_...)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...  # From live mode webhook settings
STRIPE_CONNECT_CLIENT_ID=ca_...  # From live mode Connect settings
```

---

## API Integration Examples

### Creating a Subscription Checkout Session

```typescript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// User selects Pro Plan (monthly)
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer_email: user.email,
  line_items: [{
    price: 'price_1SAj7MB9q4OqnXS0IepaDW4m', // Pro monthly
    quantity: 1,
  }],
  success_url: 'https://app.avantej.com/onboarding?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://app.avantej.com/pricing',
  metadata: {
    userId: user.id,
  },
});

// Redirect user to: session.url
```

### Creating a Connected Account (Express)

```typescript
// Franchise completes organization setup → create Connect account
const account = await stripe.accounts.create({
  type: 'express',
  country: 'US',
  email: franchise.email,
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
  business_type: 'company',
  metadata: {
    organizationId: organization.id,
  },
});

// Generate onboarding link
const accountLink = await stripe.accountLinks.create({
  account: account.id,
  refresh_url: 'https://app.avantej.com/settings/payments',
  return_url: 'https://app.avantej.com/dashboard',
  type: 'account_onboarding',
});

// Redirect franchise to: accountLink.url
```

### Charging a Customer on Behalf of Franchise

```typescript
// Gym member books a training session ($50)
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000, // $50.00 in cents
  currency: 'usd',
  customer: gymMember.stripeCustomerId,
  application_fee_amount: 0, // No platform fee (100% to franchise)
  transfer_data: {
    destination: franchise.stripeConnectAccountId,
  },
  metadata: {
    sessionId: session.id,
    trainerId: trainer.id,
  },
});
```

---

## Troubleshooting

### Webhook Not Receiving Events

```bash
# Check Stripe CLI is running
stripe listen --forward-to http://localhost:8787/webhooks/stripe

# Check API server is running
curl http://localhost:8787/health

# Check webhook signature verification is correct
# Verify STRIPE_WEBHOOK_SECRET matches CLI output
```

### Connect Account Onboarding Fails

- Verify capabilities are supported in account's country
- Check `account.requirements.errors` in webhook payload
- Review Stripe Dashboard → Connect → Accounts for details

### Payment Intent Fails with "No Such Destination"

- Ensure Connect account is fully activated
- Check `account.charges_enabled` is `true`
- Verify `stripeConnectAccountId` is correct

---

## References

- [Stripe API Documentation](https://docs.stripe.com/api)
- [Stripe Connect - Express Accounts](https://docs.stripe.com/connect/express-accounts)
- [Stripe Webhooks Guide](https://docs.stripe.com/webhooks)
- [Stripe Testing](https://docs.stripe.com/testing)
- [Account V2 API](https://docs.stripe.com/api/accounts)
