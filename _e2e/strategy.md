# Test Strategy

_Generated from a per-feature coverage analysis. Each area lists the procedures under test, current coverage, the gaps, and the proposed specs that close them. Implemented specs (Phase 3) are a prioritized subset; the rest are documented backlog._

## Access Control  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | User assignment (Staff Access) loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Roles tab loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Permissions tab loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Invitations loads | read-only | none | ready |

## Announcements  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Announcements list loads | read-only | none | ready |

## Appointment  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Appointments calendar/list loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Class slots loads | read-only | none | ready |

## Attendance  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Attendance loads | read-only | none | ready |

## Audit  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Audit log loads | read-only | none | ready |

## Branch  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Branch list loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Create-branch form loads | read-only | none | ready |

## Brands  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Brands list loads | read-only | none | ready |

## Cancelled Sales  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Cancelled sales loads | read-only | none | ready |

## Categories  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Categories loads | read-only | none | ready |

## Commissions  _(web)_

**Coverage:** `partial` — Page-load smoke for every page in this module + a core interaction journey.

**Uncovered behaviors:** full create/edit/delete CRUD journeys (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | My commissions loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | All commissions loads | read-only | none | ready |
| `commissions-journey.spec.ts` ⭐ | Commissions journey — switch from My to All Commissions tab | e2e-ui | none | ready |

## Customers  _(web)_

**Coverage:** `partial` — Page-load smoke for every page in this module + a core interaction journey.

**Uncovered behaviors:** full create/edit/delete CRUD journeys (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Customers list loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Walk-in customers loads | read-only | none | ready |
| `customers-journey.spec.ts` ⭐ | Customers journey — search directory and open a profile | e2e-ui | none | ready |

## Expenses  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Expenses loads | read-only | none | ready |

## Home  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Dashboard home loads with KPIs/widgets | read-only | none | ready |

## Inventory Options  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Inventory options loads | read-only | none | ready |

## Memberships  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Memberships loads | read-only | none | ready |

## My Services  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | My services loads | read-only | none | ready |

## Notifications  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Notifications loads | read-only | none | ready |

## Onboarding  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Onboarding loads | read-only | none | ready |

## Operations  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Operations approvals loads | read-only | none | ready |

## Packages  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Packages list loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Package instances loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Installments loads | read-only | none | ready |

## Payment  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Payments loads | read-only | none | ready |

## Products  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Products loads | read-only | none | ready |

## Promotions  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Promotions loads | read-only | none | ready |

## Purchase Orders  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Purchase orders loads | read-only | none | ready |

## Refunds  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Refunds loads | read-only | none | ready |

## Reports  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Reports loads | read-only | none | ready |

## Role  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Legacy role route redirects + loads | read-only | none | ready |

## Rooms  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Legacy rooms route redirects + loads | read-only | none | ready |

## Sales  _(web)_

**Coverage:** `partial` — Page-load smoke for every page in this module + a core interaction journey.

**Uncovered behaviors:** full create/edit/delete CRUD journeys (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Sales list loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | POS create page loads | read-only | none | ready |
| `pos-journey.spec.ts` ⭐ | POS journey — open New Sale and search a member (no submit) | e2e-ui | none | ready |

## Service  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Services loads | read-only | none | ready |

## Service Category  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Service categories loads | read-only | none | ready |

## Settings  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Organization settings loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Commission cycles settings loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Installment plans settings loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Notification settings loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Google Calendar settings loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Tax rates settings loads | read-only | none | ready |

## Stock Requests  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Stock requests loads | read-only | none | ready |

## Suppliers  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Suppliers loads | read-only | none | ready |

## Trainers  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Trainers list loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Trainer availability loads | read-only | none | ready |
| `smoke.spec.ts` ⭐ | Trainer tiers loads | read-only | none | ready |

## Transfer Orders  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Transfer orders loads | read-only | none | ready |

## Uom  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | Units of measure loads | read-only | none | ready |

## Uom Conversions  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | UOM conversions loads | read-only | none | ready |

## User  _(web)_

**Coverage:** `partial` — Page-load smoke implemented for every page in this module.

**Uncovered behaviors:** interaction journeys: create/edit/delete, filters, dialogs (backlog).

| Spec | Title | Type | Data-mutation | Authorability |
|---|---|---|---|---|
| `smoke.spec.ts` ⭐ | User profile loads | read-only | none | ready |

## Summary

- **59** candidate specs across **39** feature areas (59 ready to author).
- Data-mutation mix: none=59.
- ⭐ = implemented in the first wave (42).

## Product findings

_Add any behaviors discovered while authoring that are app bugs/limitations (not test issues) here, so they're surfaced rather than papered over._
