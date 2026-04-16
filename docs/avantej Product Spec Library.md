Feature Specification

**Installment-Based Credit Unlocking System**

Prepared for: Wilfred, Jay & Bryan

# **1\. Overview**

When a client purchases a service package, they may select from the payment plans enabled for that specific service. Each payment plan determines how package credits are progressively unlocked based on payment completion. This document covers the full logic, edge cases, admin controls, notifications, and audit requirements.

# **2\. Payment Plans**

## **2.1 Available Plans**

| Plan | Installments | Credits Unlocked Per Payment |
| :---- | :---- | :---- |
| Full (One-time) | 1 | 100% upfront |
| Half (2x) | 2 | 50% per installment |
| Quarterly (4x) | 4 | 25% per installment |

## **2.2 Admin Assignment of Plans per Service**

* Each service package must have its available payment plans explicitly configured by an Admin.

* Not all plans need to be offered for every service. For example, a small package may only offer the Full (one-time) plan.

* Clients can only select from plans enabled for that specific service at the point of purchase.

* This configuration should be accessible from the service management section in Admin Settings.

# **3\. Pricing and Tax Calculation**

* All internal calculations (credit allocation, installment amounts, outstanding balances) must be computed using pre-tax figures.

* Tax is applied only at the final step, when presenting the payable amount to the client or generating an invoice.

* This ensures consistency in business logic and avoids rounding or compounding errors from applying tax mid-calculation.

* Developers must ensure no part of the installment logic references post-tax figures as a base for further calculations.

# **4\. Credit Unlocking Logic**

* Upon each successful payment, the corresponding proportion of the total package credits is unlocked and made immediately available for use.

* Credits are unlocked cumulatively. A client who completes installments 1 and 2 of a 2x plan has access to 100% of their credits.

* A client cannot use credits beyond what has been unlocked, regardless of how few credits they have consumed.

* Each package must be tracked independently. If a client holds multiple active packages, credit and payment logic is isolated per package.

# **5\. Installment Schedule and Triggers**

* The next installment is due 30 days after the previous payment date.

* If the client exhausts their unlocked credits before the 30-day mark, they may trigger early payment to immediately unlock the next batch. The 30-day clock resets from the date of that early payment.

* A configurable grace period (set in Admin Settings) begins after the due date. During this window, the package remains accessible.

* If payment is not received within the grace period, the entire package is locked.

# **6\. Package Locking Behaviour**

* When a package locks due to non-payment, all remaining unlocked credits become inaccessible.

* Credits already consumed are unaffected and remain recorded as used.

* The client cannot book or use any sessions until the overdue payment is made.

* Upon receipt of the overdue payment, the package automatically unlocks and access is restored based on proportional credit allocation.

# **7\. Payment Methods**

The system supports two payment methods:

## **7.1 Manual Transfer**

* Client makes payment via bank transfer.

* Admin reviews and verifies the payment manually within the system.

* Credit unlock and installment schedule trigger upon Admin confirmation.

## **7.2 Stripe (Online Payment)**

* Client pays directly via Stripe within the platform.

* Credit unlock and installment schedule trigger automatically upon successful Stripe payment confirmation.

## **7.3 Failed Payment Handling (Stripe)**

* If a Stripe charge fails, the system should retry using industry-standard retry logic.

*Industry standard: Retry up to 4 times over 8 days (e.g. Day 1, Day 3, Day 5, Day 8). After all retries are exhausted, the system should treat the payment as overdue and apply grace period logic as normal.*

* Admin should be notified upon final failed retry so they can follow up with the client.

# **8\. Notification Schedule**

Notifications are sent to both the client and their assigned coach at the following trigger points:

| Trigger | Recipients |
| :---- | :---- |
| 14 days before payment due | Client \+ Assigned Coach |
| 3 days before payment due | Client \+ Assigned Coach |
| 1 day before payment due | Client \+ Assigned Coach |
| Payment overdue and unpaid (every 7 days during grace period) | Client \+ Assigned Coach |
| Package locked due to non-payment | Client \+ Assigned Coach |
| Package unlocked (payment received or manual override) | Client \+ Assigned Coach |

* Notification channels to be confirmed with the team (e.g. in-app, email, push).

* All notification triggers are driven by the installment due date, which resets upon each payment.

# **9\. Coach Visibility**

* Coaches can view the payment status of their assigned clients within the platform.

* This includes current installment progress, next due date, credit unlock status, and package lock status.

* Coaches cannot view payment details for clients not assigned to them. Access is governed by existing access level controls.

# **10\. Manual Override**

* Staff with access level above Coach (e.g. Admin, Manager) can manually unlock a locked package on a case-by-case basis.

* Manual unlock does not bypass credit allocation rules. A client who has completed only one installment of a 2x plan can never access more than 50% of their credits, even with a manual override.

* Admins and above can also process manual refunds on a case-by-case basis. No automatic refund mechanism is required. The system should provide a manual refund action with a mandatory reason field.

* All manual overrides (unlocks and refunds) must be logged with the staff member's identity, timestamp, and reason entered.

# **11\. Admin Settings**

The following should be configurable from Admin Settings:

| Setting | Description |
| :---- | :---- |
| Grace period duration | Number of days after due date before a package locks. Configurable globally or per organisation. |
| Payment plan availability per service | Which payment plans (Full, Half, Quarterly) are enabled for each service package. |

# **12\. Business Rules and Restrictions**

* Plan switching is not permitted. Once a client has selected a payment plan and made the first payment, they cannot switch to a different plan for that package.

* Refunds are not automatically offered. Any refund must be processed manually by Admin or above.

* Credit allocation hard cap: a client can never access credits beyond what their completed payments entitle them to, regardless of manual overrides or other actions.

# **13\. Audit Trail**

All of the following events should be logged in a transaction or activity history, visible to Admins:

* Installment payment received (method, amount, timestamp, staff if manual)

* Package unlocked (automatic or manual)

* Package locked

* Manual override applied (staff identity, reason, timestamp)

* Manual refund processed (staff identity, amount, reason, timestamp)

* Notification sent (type, recipient, timestamp)

* Failed payment attempt (Stripe, attempt number, timestamp)

# **14\. Edge Cases to Handle**

| Scenario | Expected Behaviour |
| :---- | :---- |
| Client pays early before 30 days | Accept payment, immediately unlock next credit batch, reset 30-day clock from new payment date. |
| Client pays overdue installment after lock | Package automatically unlocks upon payment confirmation, restoring proportional credit access. |
| Partial usage at time of lock | Only unused unlocked credits are frozen. Consumed credits remain recorded as used. |
| Client holds multiple active packages | Each package is tracked independently with its own installment schedule and credit pool. |
| All Stripe retry attempts fail | Treat as overdue, apply grace period logic, notify Admin for manual follow-up. |

# **15\. Client-Facing Dashboard**

Clients should be able to view the following information for each of their active packages from their dashboard:

* Current installment progress (e.g. Installment 1 of 2 paid).

* Credits unlocked vs. total credits in package.

* Credits consumed to date.

* Next installment due date and amount (pre-tax and post-tax).

* Package status (Active, Locked, Completed).

* Full installment payment history for the package.

# **16\. Admin Installment Dashboard**

Admins should have a dedicated view to monitor and manage installment statuses across all clients. This view should include:

## **16.1 Bulk Overview**

* A list or table of all active packages with installment plans, showing client name, package name, installment progress, next due date, and current status (Active, Overdue, Locked).

* Ability to filter by status (e.g. show all Overdue or Locked packages).

* Ability to sort by due date to prioritise follow-ups.

## **16.2 Admin Notifications**

* Admin should receive a notification when any client package enters Overdue status.

* Admin should receive a notification when any package is locked due to non-payment.

* Admin should receive a notification when all Stripe retry attempts fail for a client.

* Notification channel for Admin to be confirmed (in-app, email, or both).

## **16.3 Actions Available from Admin Dashboard**

* Manually confirm a manual transfer payment.

* Manually unlock a locked package (with mandatory reason field).

* Process a manual refund (with mandatory reason field).

* View full payment and event history for any individual package.

# **17\. Open Questions for Wilfred, Jay & Bryan**

* What notification channels will be used for clients and coaches (in-app, email, push)? To be confirmed before implementation.

* For Admin alerts and the installment dashboard: how should this be surfaced to Admins? This covers both how Admins are notified of overdue or locked packages, and where they go to view and act on installment statuses. To be decided by the team.

* Admin module architecture: this spec assumes admin-level access is embedded within each respective module, where Admins see additional controls and views that are not visible to lower access levels (e.g. Admin sees installment management options within the Payments module, not in a separate admin panel). Please flag if this assumption is incorrect.