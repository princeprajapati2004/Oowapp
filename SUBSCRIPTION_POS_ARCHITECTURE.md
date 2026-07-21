# OOWAPP — Subscription Management + POS/Barcode Architecture

**Status:** Phase 1 (Subscription foundation) implemented. Phases 2–7 not started.
**Companion doc:** [`SAAS_ARCHITECTURE.md`](./SAAS_ARCHITECTURE.md) — describes the multi-tenant foundation (Super Admin, RBAC, audit log) that this doc builds on. Most of that doc's Phase 1–4 already shipped; this doc audits actual current state, not that doc's original proposal.

## Decisions — confirmed

Decisions A–E below (POS data model, subscription history shape, subscription-level
vs account-level suspend, staff/cashier timing, Super Admin login hardening) are all
confirmed as the **recommended** option in each case. Phase 1 (this section)
implements the recommended path for Decisions A, B, and the SA-login fix; Decisions
C, D, E apply starting Phase 2/4 and are recorded here so they aren't re-litigated.

## Phase 1 — What actually shipped, and two findings made along the way

**Finding 1 — no Subscription row was ever being created.** Auditing
`src/app/api/auth/signup/route.ts` and every service under `src/lib/services/`
turned up zero `db.subscription.create(...)` call sites anywhere in the codebase —
not even at signup. Every existing shop has had zero `Subscription` rows the whole
time; the UI's `subscriptions[0]?.plan ?? "FREE"` fallback was silently papering
over this. Phase 1 fixes this at the source: `createInitialSubscription(shopId)`
(`src/lib/services/subscription.ts`) is now called from the signup route and
creates a `TRIAL` / `FREE`-plan / 15-day Subscription row for every new shop.
Pre-existing shops with no row still work correctly — `getCurrentSubscription`
returns a virtual (non-persisted) `TRIAL` default computed from `Shop.createdAt`
when no row exists, so a read path never mutates data as a side effect.

**Finding 2 — the migration history has a pre-existing gap, unrelated to this
work.** Commit `549358a` ("feat: add login functionality for super admin and
admin users") added the `SuperAdmin`/`Subscription`/`AuditLog`/`PlatformSettings`
models and the `Shop` platform-lifecycle fields directly to `schema.prisma`, but
never generated a matching migration — those changes were applied to the real
dev database via `prisma db push` instead of `prisma migrate dev`, so
`prisma/migrations/` jumps straight from `20260713120000_init` to
`20260717000001_ux_improvements` without ever creating `super_admins`,
`subscriptions`, `audit_logs`, `platform_settings`, or the new `Shop` columns.
Confirmed with the project owner that a real database already has these tables
(applied via the same `db push` drift). Fixed with a retroactive baseline
migration — `prisma/migrations/20260720090000_saas_foundation_baseline/` —
that reconstructs exactly what commit `549358a` should have generated, so a
**fresh** database (CI, a new contributor, a new environment) gets a complete,
correct history via `prisma migrate deploy`.

**Action required on your existing database before deploying this migration
(one-time, do this first):**
```
npx prisma migrate resolve --applied 20260720090000_saas_foundation_baseline
```
This records the baseline migration as already-satisfied without re-running its
SQL (which would fail with "relation already exists" against a DB that already
has these tables). After that, `prisma migrate deploy` applies
`20260720093000_subscription_foundation` (the actual new Phase 1 schema) normally.
A fresh database just runs both migrations in order — no manual step needed there.

**Phase 1 deliverables:**
- Schema: `Plan`, `Feature`, `PlanFeature`, `BusinessFeaturePermission` tables;
  `Subscription` extended with `planId`/`duration`/`action`/`createdBy`/`remarks`;
  `SubscriptionStatus` gains `SUSPENDED`. See migration
  `20260720093000_subscription_foundation`.
- Seed: `src/lib/plans-features-catalog.ts` (canonical Plan/Feature/PlanFeature
  defaults) + `scripts/seed-plans-features.ts` (idempotent, run via
  `npm run db:seed:plans`). Seeds 4 plans (Free/Starter/Pro/Enterprise, `code`
  matching the legacy enum) and 8 features from the spec's example list
  (pos, barcode_scanner, inventory, multi_staff, analytics, custom_branding,
  unlimited_products, advanced_reports).
- `src/lib/services/subscription.ts` — `getCurrentSubscription`,
  `computeDisplayStatus` (lazy expiry derivation, no cron job — see inline
  comment), `getSubscriptionSummaryForBusiness`, `createInitialSubscription`.
- `src/lib/services/feature-permission.ts` — `resolveFeatures`/`isFeatureEnabled`/
  `assertFeatureEnabled` (throws `FeatureNotEnabledError`, a `ForbiddenError`
  subclass → 403 via the existing `handleApiError`, no changes needed there).
  Resolution order: business override → plan default → disabled (fail closed);
  all features disabled outright if the subscription's derived status is
  EXPIRED/SUSPENDED/CANCELLED.
- `GET /api/admin/subscription` — business-owner read-only view (plan, status,
  dates, `daysRemaining`, `enabledFeatures`).
- `src/components/admin/subscription-card.tsx` — dashboard card (always shows
  plan/status/expiry/days-remaining; the amber expiry-warning line only renders
  when `daysRemaining <= 7`), wired into `src/app/admin/(dashboard)/page.tsx`.
- Super Admin login hardened: `src/app/api/super-admin/auth/login/route.ts` and
  `src/app/api/auth/login/route.ts` now check `db.superAdmin.findUnique` +
  `verifyPassword` against `passwordHash` instead of comparing to
  `SUPER_ADMIN_SEED_EMAIL`/`PASSWORD` env vars directly; session/audit-log now
  carry the real `superAdmin.id` instead of the literal string `"platform-owner"`;
  `SuperAdmin.lastLoginAt` is now updated on login. The env vars are unchanged —
  they still bootstrap the first `SuperAdmin` row via `scripts/seed-super-admin.ts`,
  they're just no longer checked at login time.

**Not done in Phase 1** (by design, deferred to later phases per this doc's
phase breakdown): Super Admin subscription management UI (create/renew/extend/
suspend/change-plan), subscription history view, Plan/Feature management UI,
`assertFeatureEnabled` is not yet called from any route (nothing gates on it
yet since POS doesn't exist), Prisma client regenerated but **no migration has
been run against any real database from this environment** — `.env` is empty
here, so `npx prisma migrate deploy` (after the `migrate resolve` step above)
needs to be run wherever the real `DATABASE_URL` is configured.

---

## 1. Existing Architecture Overview

### Stack
Next.js 16.2.10 (App Router, `proxy.ts` is the Next 16 rename of `middleware.ts`), Prisma 7 + `@prisma/adapter-pg` on Postgres, `jose` for JWT, `bcryptjs` for hashing, `zod` for validation, `jspdf` for PDF, `sonner` for toasts, no data-fetching library (plain `fetch` via `src/lib/api-client.ts`).

### Roles that exist today
Exactly two, both structurally 1:1:
- **SuperAdmin** — model exists with `passwordHash`, but login (`src/app/api/super-admin/auth/login/route.ts`, and a duplicate check in `src/app/api/auth/login/route.ts`) actually validates against `SUPER_ADMIN_SEED_EMAIL`/`SUPER_ADMIN_SEED_PASSWORD` env vars, **not** the DB row. Flagged in §12.
- **Admin (Business Owner)** — `Admin.shop Shop?` / `Shop.adminId String @unique`. One admin per shop, no exceptions, no staff concept anywhere (`grep`-confirmed zero hits for staff/cashier/employee/role beyond DOM `role` attrs).

### Session/RBAC (`src/lib/auth.ts`, `src/lib/session.ts`, `src/proxy.ts`)
```ts
SessionPayload          = { adminId, shopId, role: "business_admin" }   // cookie: "session"
SuperAdminSessionPayload = { superAdminId, role: "super_admin" }        // cookie: "sa_session"
```
`requireAdminSession()` / `requireSuperAdminSession()` in `src/lib/session.ts` throw `UnauthorizedError` if the cookie is missing/invalid; every `/api/admin/*` and `/api/super-admin/*` route calls one of these as its first line. `src/proxy.ts` only guards **pages** under `/admin/:path*` (redirects to `/login`) — there is no page-level proxy guard for `/super-admin/:path*` (relies solely on the dashboard layout calling `getSuperAdminSession()` server-side) and **no middleware protection at all for API routes** — each handler is independently responsible. This pattern (defense at the handler, not the edge) is what every new subscription/POS API must follow.

### Route → Service → Prisma pattern (established, consistent across all ~20 existing routes)
```
route.ts:  requireXSession() → schema.parse(body) → service call → NextResponse.json(...)
                                                    ↘ catch → handleApiError(error)
```
`src/lib/api-utils.ts::handleApiError` maps `UnauthorizedError→401`, `ForbiddenError→403`, `NotFoundError→404`, `ZodError→400 {error,issues}`, else `400`/`500`. Services live in `src/lib/services/*.ts` as bare exported async functions (dominant style) importing `db` from `src/lib/db.ts`; `platform-analytics.ts` is the one outlier using an object-literal export. New services should use the bare-function style.

### Data model today
```
Admin ──1:1── Shop ──1:N── Category, Product, Tax, Order, Subscription(!), PushSubscription
                            Order ──1:N── OrderItem
SuperAdmin (standalone)
AuditLog (standalone, shopId nullable)
PlatformSettings (standalone key/value)
```
`Product` has `stock Int?` but it is **display-only** — never decremented on order creation, no reservation/negative-stock guard. `Order.billNumber` is `${slug.slice(0,4)}-${Date.now()}`, not `@unique`, not sequential — fine for a WhatsApp order slip, not fine for a POS register (§10, §12). Invoice PDF generation is duplicated between `src/components/admin/bill-detail.tsx` and `src/components/customer/order-sheet.tsx`, both built on the shared bill-math in `src/lib/services/billing.ts::calculateBill`.

### What already exists toward Module 1 (do not rebuild)
| Piece | File | State |
|---|---|---|
| `Subscription` model | `prisma/schema.prisma:306` | Exists: `plan` enum, `status` enum, `startDate`/`endDate`. One-to-many from Shop (no uniqueness constraint) — already structurally an append-only log, just missing fields. |
| `SubscriptionPlan` / `SubscriptionStatus` enums | schema | `FREE/STARTER/PRO/ENTERPRISE`, `TRIAL/ACTIVE/EXPIRED/CANCELLED` — missing `SUSPENDED`, missing "Expiring Soon" (must be derived, never stored). |
| `feature-flags.ts` | `src/lib/feature-flags.ts` | A `PLAN_FLAGS` map keyed by the enum — **zero importers anywhere**, dead code today. Wrong shape for a per-business override system (§9) but a fine seed for default plan capabilities. |
| Businesses list/detail | `src/app/super-admin/(dashboard)/businesses/**` | Search + status filter + pagination; detail page shows subscription **read-only** (Plan/Status/Since/Expires) — no edit action anywhere. |
| Suspend/Activate/Delete | `src/app/api/super-admin/businesses/[id]/route.ts` | Discriminated-union PATCH, audit-logged. This is **account-level** suspension (blocks login entirely) — distinct from subscription-level suspension per Module 1 spec (§9). |
| `AuditAction.SUBSCRIPTION_CHANGED` | schema enum | Reserved, never written — ready to use. |
| `getSubscriptionBreakdown()` | `src/lib/services/platform-analytics.ts:35` | Computed in `overview/route.ts` but **never rendered** — a free stat for the new Subscriptions dashboard. |

**Conclusion:** Module 1 is a retrofit onto a half-built skeleton, not a greenfield build. Module 2 (POS/Barcode) is fully greenfield except for reusable bill-math and the Order/OrderItem tables it should extend rather than duplicate.

---

## 2. Files That Need Modification

### Modify (existing files, additive changes only)
| File | Change |
|---|---|
| `prisma/schema.prisma` | Add models/enums per §3. No existing field renamed or removed. |
| `src/lib/feature-flags.ts` | Superseded by DB-backed `Plan`/`Feature`/`BusinessFeaturePermission` (§9) — becomes the seed data, not the runtime source of truth. Keep the file as a typed default-catalog constant used only by the seed script. |
| `src/lib/session.ts` | No shape change to existing payloads (backward compatible) — add a feature-permission check helper alongside the existing `requireAdminSession`. |
| `src/components/super-admin/sa-shell.tsx` | Add "Subscriptions" (and "Plans") nav items. |
| `src/components/admin/admin-shell.tsx` | Add "POS" nav item, conditionally rendered only when the shop has the `pos` feature enabled (fetched server-side in the dashboard layout, passed down — same pattern already used for `isFoodBusiness`-gated nav, see `businessTypeCopy`). |
| `src/app/super-admin/(dashboard)/businesses/[id]/page.tsx` | Subscription card becomes a link/tab into the new subscription management UI instead of static text. |
| `src/app/api/super-admin/businesses/[id]/route.ts` | Unchanged interface — new subscription actions get their **own** route (`.../[id]/subscription`), not bolted onto this discriminated union, to keep account-lifecycle and subscription-lifecycle concerns separate (mirrors the Shop-status vs Subscription-status split in §9). |
| `src/app/api/orders/[id]/route.ts` pattern | POS sale creation reuses the discriminated-union PATCH convention already established here for its own new actions (§10). |
| `src/components/admin/bill-detail.tsx` | Extract the PDF-building logic (lines ~349–630) into `src/lib/pdf/invoice.ts::generateInvoicePdf(order, shop)` so POS "print receipt" can call the same function instead of a third duplicate. `order-sheet.tsx`'s copy gets migrated to call it too (both become thin callers) — the only pre-existing code this plan touches "for cleanup," and only because POS strictly needs it to avoid a third duplicate. |
| `src/app/api/auth/login/route.ts`, `src/app/api/super-admin/auth/login/route.ts` | Flagged in §12 as a pre-existing security gap (plaintext env credential instead of `SuperAdmin.passwordHash`). Fixing it is **not required** for this feature to ship, but it sits directly under a system we're about to extend (feature permission checks trusting `superAdminId`), so I recommend fixing it in Phase 1 rather than building more on top of a stub. Flagging for your decision, not assuming.

### New files (illustrative — exact filenames finalized per phase)
```
src/lib/services/plan.ts
src/lib/services/feature-permission.ts
src/lib/services/subscription.ts
src/lib/services/pos-sale.ts
src/lib/services/barcode.ts
src/lib/services/inventory.ts
src/lib/validation/subscription.ts
src/lib/validation/plan.ts
src/lib/validation/pos.ts
src/lib/pdf/invoice.ts                          (extracted, see above)
src/app/api/super-admin/plans/**
src/app/api/super-admin/features/**
src/app/api/super-admin/businesses/[id]/subscription/**
src/app/api/super-admin/businesses/[id]/feature-permissions/**
src/app/api/admin/subscription/route.ts          (read-only, business owner view)
src/app/api/admin/pos/**
src/app/super-admin/(dashboard)/subscriptions/**
src/app/super-admin/(dashboard)/plans/**
src/app/admin/(dashboard)/pos/**
src/components/super-admin/subscription-*.tsx
src/components/admin/pos/**
```

---

## 3. Database Changes

### Design decisions (need your sign-off before I touch the schema)

**Decision A — Plan becomes a table, enum stays for one release as a bridge.**
`SubscriptionPlan` enum is used in `feature-flags.ts`, business list filters/badges, and the `Subscription` model itself. Ripping it out immediately breaks those call sites. Plan: add a `Plan` model with a `code` column matching today's enum values (`FREE`/`STARTER`/`PRO`/`ENTERPRISE`), seed it from those four, add `Subscription.planId String?` (nullable FK, backfilled from the enum in the migration), keep `Subscription.plan` enum column temporarily for backward-reads, then drop the enum column once every reader is migrated to `planId`. This satisfies "plans should not be hardcoded" without a breaking API change mid-flight.

**Decision B — Subscription stays append-only; no separate `subscription_history` table.**
The existing `Subscription` model is already `shopId`-many (no unique constraint), and the codebase already queries it as `orderBy createdAt desc, take 1` to get "current." Rather than introduce a second `subscription_history` table that duplicates every column, I propose: keep inserting a new `Subscription` row per create/renew/extend/plan-change (never `UPDATE` an existing row's plan/dates), add the missing columns (`durationLabel`, `createdBy`, `remarks`, `action`) so each row IS a complete history entry, and treat "latest row by `createdAt`" as current. One table, zero duplicate data, matches "never overwrite previous subscriptions" exactly. If you'd rather have an explicit separate history table for clearer semantics (current-state table stays skinny), I can do that instead — flagging as a real fork in the design, not defaulting silently.

**Decision C — Subscription-level suspend is separate from account-level suspend.**
`Shop.status = SUSPENDED` already exists and blocks *login* entirely (account level — e.g. non-payment of hosting, ToS violation). Module 1 asks for "Suspend Subscription" as a super-admin action distinct from that — this should block *premium features only*, not login, so the owner can still log in, see the expiry warning, and renew. Implemented as `SubscriptionStatus.SUSPENDED`, checked only by the feature-permission layer (§9), never by the login/session layer. This distinction is load-bearing for the "Business owner dashboard, never delete data, can renew later" requirement.

**Decision D — POS sales reuse `Order`/`OrderItem`, not new `Sale`/`SaleItem` tables.**
AGENTS.md lists `sales`/`sale_items` as *possible* tables but also says "avoid duplicate data" and "reuse existing invoice engine." `Order` already has `billNumber`, `subtotal`, `taxTotal`, `grandTotal`, `taxBreakdown`, discount fields, `status`. Proposal: add `Order.channel OrderChannel @default(ONLINE)` (`ONLINE | POS`), `Order.paymentType PaymentType?` (`CASH|UPI|CARD|MIXED`), `Order.servedBy String?` (cashier/admin id, nullable — see Decision E), and reuse `Order`/`OrderItem` wholesale for POS sales. This means the invoice PDF, tax math, and discount logic ALL work for POS for free. I'm fairly confident this is the right call (it's the literal "avoid duplicate data" instruction), but it's consequential enough to confirm before I migrate.

**Decision E — Staff/Cashier is descoped to a later phase; POS ships with owner-only attribution first.**
There is zero multi-user infrastructure today (1 Admin : 1 Shop, single session cookie, no `Staff`/`User`/`Role` model). "Multiple Staff" is listed as a premium *feature flag* in the spec, and "Cashier" appears in Sales History requirements. Building real staff accounts (separate login, PIN or credential, per-staff permissions) is itself a mid-sized auth project. Recommendation: Phase A ships POS with `Order.servedBy` defaulting to the logged-in Admin (satisfies "Sales History stores Cashier" trivially — it's always the owner for now); a later, clearly-scoped phase adds a `StaffMember` model + lightweight PIN-based sub-session when you actually want cashier logins. This avoids building speculative auth infrastructure now. Flagging because "Multiple Staff" as an *enableable feature toggle* only becomes meaningful once that phase exists — until then it can exist as a plan feature flag that's simply always off.

### New models/enums (once decisions above are confirmed)

```prisma
enum ShopStatus { ACTIVE SUSPENDED INACTIVE DELETED }              // unchanged, account-level

enum SubscriptionStatus { TRIAL ACTIVE EXPIRED SUSPENDED CANCELLED } // + SUSPENDED added
// "Expiring Soon" is NEVER stored — always derived: status===ACTIVE && daysRemaining<=7

enum SubscriptionDuration { FIFTEEN_DAYS ONE_MONTH THREE_MONTHS SIX_MONTHS TWELVE_MONTHS CUSTOM }
enum SubscriptionAction   { CREATED RENEWED EXTENDED PLAN_CHANGED SUSPENDED RESUMED EXPIRED FEATURE_ENABLED FEATURE_DISABLED }

model Plan {
  id          String   @id @default(cuid())
  code        String   @unique          // bridges old enum values; free-form for new plans
  name        String                    // "Starter", "Standard", "Premium", "Enterprise", ...
  description String?
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  planFeatures  PlanFeature[]
  subscriptions Subscription[]

  @@map("plans")
}

model Feature {
  id          String   @id @default(cuid())
  key         String   @unique   // "pos", "barcode_scanner", "inventory", "multi_staff",
                                  // "analytics", "custom_branding", "unlimited_products", "advanced_reports"
  label       String
  description String?
  category    String?  // grouping for UI (e.g. "pos", "reporting", "branding")
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  planFeatures PlanFeature[]
  businessOverrides BusinessFeaturePermission[]

  @@map("features")
}

model PlanFeature {
  id        String  @id @default(cuid())
  planId    String
  plan      Plan    @relation(fields: [planId], references: [id], onDelete: Cascade)
  featureId String
  feature   Feature @relation(fields: [featureId], references: [id], onDelete: Cascade)
  enabled   Boolean @default(true)

  @@unique([planId, featureId])
  @@map("plan_features")
}

model BusinessFeaturePermission {
  id         String   @id @default(cuid())
  shopId     String
  shop       Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  featureId  String
  feature    Feature  @relation(fields: [featureId], references: [id], onDelete: Cascade)
  enabled    Boolean
  reason     String?
  updatedBy  String            // superAdminId
  updatedAt  DateTime @updatedAt
  createdAt  DateTime @default(now())

  @@unique([shopId, featureId])
  @@index([shopId])
  @@map("business_feature_permissions")
}

model Subscription {
  id             String               @id @default(cuid())
  shopId         String
  shop           Shop                 @relation(fields: [shopId], references: [id], onDelete: Cascade)
  planId         String?              // nullable during bridge period, see Decision A
  plan           Plan?                @relation(fields: [planId], references: [id])
  planLegacy     SubscriptionPlan?    // old enum column, deprecated, dropped once migrated
  status         SubscriptionStatus   @default(TRIAL)
  duration       SubscriptionDuration @default(ONE_MONTH)
  action         SubscriptionAction   @default(CREATED)
  startDate      DateTime             @default(now())
  endDate        DateTime?
  createdBy      String               // superAdminId
  remarks        String?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  @@index([shopId, createdAt])
  @@map("subscriptions")
}
```

### POS/Barcode additions
```prisma
enum OrderChannel { ONLINE POS }
enum PaymentType  { CASH UPI CARD MIXED }
enum InventoryChangeReason { SALE RETURN MANUAL_ADJUST RESTOCK }

// Product model additions:
//   barcode String?
//   sku     String?
//   @@unique([shopId, barcode])
//   @@unique([shopId, sku])

// Order model additions:
//   channel    OrderChannel @default(ONLINE)
//   paymentType PaymentType?
//   servedBy   String?     // Admin.id for now, see Decision E

model InventoryLog {
  id             String                 @id @default(cuid())
  shopId         String
  productId      String
  changeQty      Int                    // negative for sale, positive for restock/return
  balanceAfter   Int
  reason         InventoryChangeReason
  referenceOrderId String?
  createdBy      String
  createdAt      DateTime               @default(now())

  @@index([shopId, productId])
  @@map("inventory_logs")
}
```
`Return`/`Refund` tables are explicitly **not created yet** (per "design architecture for future... without rewriting database") — `InventoryLog.reason: RETURN` and `Order.status` already accommodate a future return flow referencing existing `Order`/`OrderItem` rows without any schema change now.

---

## 4. RBAC Changes

No new roles. Two additions to the existing two-role system:

1. **Feature-permission gate**, orthogonal to role: `assertFeatureEnabled(shopId, featureKey)` in `src/lib/services/feature-permission.ts`, called at the top of every premium API route (after `requireAdminSession()`), throwing a new `ForbiddenError` subclass (`FeatureNotEnabledError`, still maps to 403 via existing `handleApiError`) if the shop lacks the feature or the subscription is EXPIRED/SUSPENDED/CANCELLED.
2. **Super Admin scope unchanged** — SA already bypasses shop isolation for read/suspend/activate/delete; the same bypass extends naturally to subscription/plan/feature management (no new isolation rule needed, same pattern as `businesses/[id]` PATCH).

No changes to `SessionPayload`/`SuperAdminSessionPayload` shapes — fully backward compatible with existing sessions already issued to logged-in users (important: no forced re-login for existing sessions when this ships).

---

## 5. API Changes

All new, all additive — nothing existing changes its response shape.

```
# Super Admin — Plans & Features
GET    /api/super-admin/plans
POST   /api/super-admin/plans
PATCH  /api/super-admin/plans/[id]
GET    /api/super-admin/features
POST   /api/super-admin/features
PATCH  /api/super-admin/plans/[id]/features        (bulk set PlanFeature defaults)

# Super Admin — Subscriptions (per business)
GET    /api/super-admin/businesses/[id]/subscription             (current + history)
POST   /api/super-admin/businesses/[id]/subscription              { action: "create"|"renew"|"extend"|"change_plan"|"suspend"|"resume"|"expire", ... }
GET    /api/super-admin/businesses/[id]/feature-permissions
PATCH  /api/super-admin/businesses/[id]/feature-permissions       { featureId, enabled, reason }

# Business Admin — read-only subscription view
GET    /api/admin/subscription        → { plan, status, startDate, endDate, daysRemaining, enabledFeatures }

# Business Admin — POS
GET    /api/admin/pos/products?query=&barcode=&categoryId=      (search, <100ms target, see §13)
POST   /api/admin/pos/sales                                       (create Order with channel=POS, decrement stock transactionally)
GET    /api/admin/pos/sales/recent
PATCH  /api/admin/pos/products/[id]/barcode                       (assign/regenerate barcode/sku)
```
Every route in the `pos` group calls `requireAdminSession()` then `assertFeatureEnabled(shopId, "pos")` before anything else — this is the actual enforcement point requested by "every premium API must validate... feature permission."

---

## 6. Frontend Changes

- **Super Admin:** `Subscriptions` nav → list (search/business-type/status/plan/expiry filters, per spec) reusing/extracting the existing hand-rolled Businesses table into a shared `DataTable` + `FilterBar` (flagged in the super-admin audit as not yet extracted — first real reusable primitive for this section). `Plans` nav → CRUD UI for `Plan`/`Feature`/`PlanFeature`. Business detail page: Subscription tab replacing the current static card, with a "Renew/Extend/Change Plan" dialog and a history table.
- **Business Admin:** small **Expiry Warning Card** on the dashboard (`src/app/admin/(dashboard)/page.tsx`), rendered only when `daysRemaining <= 7`, matching the existing dashboard-card visual style — not a modal, not dismissible-and-gone (re-appears each visit, per "not annoying" but also not silence-able into missing a real deadline). Subscription info surfaced read-only in Settings.
- **POS:** new route group `src/app/admin/(dashboard)/pos/`, gated: layout checks `assertFeatureEnabled` server-side and redirects to a "feature not available" page if disabled (mirrors the existing `isFoodBusiness`-style conditional rendering, but at the route level, not just hidden nav). Two-pane layout (product search/cart) per spec, built mobile-first with the existing `shadcn`-derived `src/components/ui/*` primitives (`Card`, `Table`, `Dialog`, `Sheet`, `Badge`).

---

## 7. Migration Plan

All migrations purely additive (matches this repo's existing precedent — `20260720000001_features` never modified/dropped a column).

**Superseded by what actually happened (see "Phase 1 — What actually shipped" above):** the plan below assumed the migration history was intact. It isn't — a pre-existing gap (commit `549358a` applied via `db push`, no migration ever generated) had to be closed first with a retroactive baseline migration before Phase 1's own migration could be written. Actual migrations, in order:

0. `20260720090000_saas_foundation_baseline` — **retroactive**, reconstructs the `SuperAdmin`/`Subscription`/`AuditLog`/`PlatformSettings` tables and `Shop` platform fields that commit `549358a` introduced without a migration. Already-applied on the real database — mark it with `prisma migrate resolve --applied 20260720090000_saas_foundation_baseline` rather than running its SQL there.
1. `20260720093000_subscription_foundation` — adds `Plan`, `Feature`, `PlanFeature`, `BusinessFeaturePermission` tables; extends `Subscription` with `planId` (nullable FK, no rename/backfill needed — see Decision A below, simplified), `duration`, `action`, `createdBy`, `remarks`; adds `SUSPENDED` to `SubscriptionStatus`. Seeded via `npm run db:seed:plans`.
2. *(Not yet written)* `..._pos_schema` (Phase 4) — add `barcode`/`sku` to `Product` (nullable, unique-per-shop), `channel`/`paymentType`/`servedBy` to `Order`, create `InventoryLog`.

**Decision A, simplified during implementation:** rather than renaming `Subscription.plan` to `planLegacy` (as originally proposed below), Phase 1 kept the existing `plan` enum column completely untouched and added `planId` as a new, independently-named nullable relation (`planRef` in the Prisma schema, mapped to a new `planId` column) alongside it. Every existing reader of `subscription.plan` (business list badges, `feature-flags.ts`) keeps working with zero changes. `getCurrentSubscription()` (`src/lib/services/subscription.ts`) resolves the effective `Plan` row via `planId` first, falling back to matching `Plan.code === subscription.plan` when `planId` is null — so rows created before this migration (or the virtual default returned for shops with zero Subscription rows) still resolve correctly with no backfill script required. This is simpler and lower-risk than the rename originally proposed, at the cost of the enum column staying around for longer — acceptable since removing it isn't blocking anything.

---

## 8. Feature Flag Strategy

Two layers, resolved in this order (first match wins):
1. `BusinessFeaturePermission` row for `(shopId, featureId)` if one exists — explicit super-admin override (spec's "Enable/Disable Premium Features" per business).
2. Else, `PlanFeature.enabled` for the shop's current `Subscription.planId` — the plan default.
3. Else (no plan feature row at all) → **disabled** (fail closed, never fail open on a premium check).

If `Subscription.status` is `EXPIRED`/`SUSPENDED`/`CANCELLED`, **all premium features resolve to disabled** regardless of the above (free-tier baseline features, if any, are simply features with no gate — not modeled as a "feature" at all). This is computed in one function, `resolveFeatures(shopId): Record<string,boolean>`, cached per-request (not cross-request — correctness over micro-optimization here, this isn't the POS hot path).

---

## 9. Subscription Permission Strategy

```
requireAdminSession()                         → who is this, which shop
  → getShop(shopId): status !== SUSPENDED/DELETED   (account-level gate, pre-existing)
  → getCurrentSubscription(shopId)                   (latest Subscription row)
  → assertFeatureEnabled(shopId, "pos")               (§8 resolution)
      → 403 FeatureNotEnabledError if not resolved enabled
```
Enforced identically on the frontend (hide nav/route) **and** backend (every API route) — frontend hiding is UX only, per "never rely only on frontend hiding" in the spec. Route-level enforcement happens in the POS `layout.tsx` (redirect) for pages, and in every `/api/admin/pos/*` handler (403 JSON) for APIs — both derived from the same `assertFeatureEnabled` service call, no duplicated logic.

---

## 10. POS Architecture

- **Reuses `Order`/`OrderItem`** (Decision D) — a POS sale is `POST /api/admin/pos/sales` creating an `Order{channel: POS, paymentType, servedBy}` + `OrderItem[]` in one Prisma transaction that also writes `InventoryLog` rows and decrements `Product.stock`, with a `WHERE stock >= quantity` guard (or a re-check inside the transaction) to prevent negative inventory — the one real behavior change to existing tables (stock decrement never happens today, per §1).
- **billNumber**: current scheme (`slug-epoch`) stays for `channel=ONLINE`; POS gets a proper per-shop sequential number (`Shop.nextPosBillNumber Int @default(1)` incremented inside the same transaction) since register compliance needs gapless sequencing — this is a small additive schema change scoped to POS only, not a change to the existing online-order numbering.
- **Invoice**: calls the extracted `generateInvoicePdf` (§2) — same visual invoice, works immediately for POS with zero new PDF code.
- **Two-pane screen**: left = search/barcode/category filter/product grid (client component, fetches the shop's product list once on mount, filters client-side for the sub-100ms feel — see §13), right = cart (local component state, submitted as one API call on "Complete Sale").
- **Return-ready**: `InventoryLog.reason: RETURN` and unused `Order.status` values already accommodate a future return screen that adjusts stock and creates a linked record — no schema rewrite needed later, per spec's explicit ask.

---

## 11. Barcode Scanning Approach

| Input method | Approach |
|---|---|
| **USB scanner** | These emulate a keyboard (HID) — no special API needed. A hidden/focused text input on the POS screen captures rapid keystrokes ending in `Enter`; a small debounce/timing heuristic (or just listening for the terminating `Enter` since scanners type near-instantly) distinguishes a scan from manual typing. No library required. |
| **Bluetooth scanner** | Same as USB from the browser's perspective once paired at the OS level — also HID, same keystroke-capture handler. No separate code path. |
| **Camera scanning (PWA)** | Needs `BarcodeDetector` (native, Chrome/Edge/Android — check support) with a JS fallback library (e.g. `@zxing/browser`, ~small footprint) for Safari/iOS. Requires `navigator.mediaDevices.getUserMedia` — **on permission denial or unsupported browser, fall back to the manual search input already in the left pane**, per spec; this is a graceful degrade, not an error state. |

All three feed the same `onBarcodeScanned(code)` handler in the POS product-search component: look up by `(shopId, barcode)`, add to cart or increment quantity if already present — "no extra clicks," as specified.

---

## 12. Security Considerations

- Every premium API validates, in order: authentication (`requireAdminSession`) → business ownership (shopId from JWT, never from request body — already the established pattern) → subscription status → feature permission (§9). No new trust boundary introduced.
- **Pre-existing gap worth fixing alongside this work** (not required, but sits directly under what we're extending): Super Admin login checks `SUPER_ADMIN_SEED_EMAIL`/`PASSWORD` env vars instead of the `SuperAdmin.passwordHash` DB column that already exists unused. Since Module 1 adds real business-impacting super-admin powers (suspend subscriptions, disable features across potentially thousands of businesses per the spec's own stated scale), I'd rather fix this in Phase 1 than build more surface area on a stub credential check. Your call.
- `JWT_SECRET`/`SA_JWT_SECRET` have insecure hardcoded fallbacks (`"insecure-dev-secret"`) if the env var is unset — pre-existing, unrelated to this feature, flagging because a production deploy with unset env vars would silently run on a known secret. Not fixing as part of this work unless asked; not introducing anything worse.
- `BusinessFeaturePermission`/`Subscription` writes are Super-Admin-only and audit-logged (`AuditAction.SUBSCRIPTION_CHANGED`, plus new actions for feature toggles) — matches the existing suspend/activate audit pattern exactly.
- POS stock decrement runs inside a Prisma transaction with a row-level check to prevent a race condition (two POS terminals selling the last unit simultaneously) — new code, not present anywhere today since nothing decrements stock currently.

---

## 13. Performance Considerations

- POS product search target (<100ms): fetch the shop's product list **once** on POS screen mount (typical retail shop: tens to low-thousands of SKUs, not millions), filter/search entirely client-side by name/barcode/sku/category — zero network round-trip per keystroke or scan. Re-fetch only after a sale completes (to pick up the new stock numbers) or on a manual refresh.
- Barcode scan → cart: pure client-side array lookup against the already-loaded product list (map keyed by barcode for O(1)), instant by construction.
- Cart updates: local component state only, no API call until "Complete Sale" — one write per transaction, not one per line-item change.
- `resolveFeatures()` (§8) is a handful of indexed lookups (`@@unique([shopId, featureId])`, `@@index([shopId])`) — negligible cost, not a POS hot-path concern since it's checked once per page/route load, not per product scan.

---

## 14. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Enum→`Plan` migration (Decision A) breaks existing plan badges/filters mid-rollout | Bridge period: both `planLegacy` enum and `planId` FK coexist; every read site migrated and verified before the enum column is dropped in a separate, later migration. |
| Stock decrement introduces negative-inventory races under concurrent POS sales | Prisma transaction + guard clause; documented in §10/§12 as new behavior, tested explicitly per the spec's "Large Cart" / concurrent-sale test scenarios. |
| "Multiple Staff" feature toggle exists before real staff accounts do (Decision E) | Ship the toggle as inert (always resolves false) until the staff-accounts phase lands — never surface a feature switch users can enable that does nothing; gate its visibility in the Plan/Feature UI until that phase ships. |
| Reusing `Order` for POS sales (Decision D) couples two conceptually different flows | `channel` discriminator keeps every query explicit (`WHERE channel = 'POS'`); online-order code paths untouched since they all implicitly filter or simply predate the column (default `ONLINE`). |
| Fixing the Super Admin plaintext-credential login (§12) turns into unplanned scope creep | Scoped as an optional Phase 1 add-on, called out explicitly for your decision — not silently bundled. |
| Camera barcode scanning has inconsistent browser support | Explicit graceful fallback to manual search (spec's own requirement) — never a hard dependency for POS to function. |

---

## Implementation Phases (proposed)

**Rule carried over from `SAAS_ARCHITECTURE.md`: each phase fully working before the next starts.**

### Phase 1 — Subscription foundation (schema + services, no new UI beyond a subscription view)
`Plan`/`Feature`/`PlanFeature`/`BusinessFeaturePermission` tables + seed script; `Subscription` model extended (Decision B/A groundwork); `feature-permission.ts` service (`resolveFeatures`, `assertFeatureEnabled`); `GET /api/admin/subscription` + dashboard Expiry Warning Card; optional SA-login hardening (§12, your call).

### Phase 2 — Super Admin subscription management UI
Subscriptions list (search/filters per spec) + business-detail Subscription tab with Renew/Extend/Change Plan/Suspend/Resume/Expire actions + history table; Plans/Features CRUD screens.

### Phase 3 — Feature enforcement everywhere
Wire `assertFeatureEnabled` into route/page guards; Plan/Feature UI to actually enable/disable per business; confirm hide-menu/hide-route/hide-API/403 behavior across every combination in the spec's test matrix.

### Phase 4 — POS core (owner-only, no barcode yet)
`Product.barcode/sku` columns; `Order.channel/paymentType/servedBy`; `InventoryLog`; POS two-pane screen (search + cart, no scanning); stock decrement transaction; extracted `generateInvoicePdf`; sequential POS bill numbering.

### Phase 5 — Barcode scanning
USB/Bluetooth (keystroke capture) + camera (BarcodeDetector/zxing fallback) wired into the same `onBarcodeScanned` handler; barcode assignment UI on the product form.

### Phase 6 — POS polish
Keyboard shortcuts, discount UI (per-product/entire-bill, %/fixed), sales history view, offline-queue groundwork (service worker already exists — extend it to queue POS sale writes when offline, replay on reconnect; today's SW explicitly bypasses all `/api/*` caching, so this is new, scoped work, not a retrofit of something broken).

### Phase 7 — Staff/Cashier (only if you want it now — see Decision E)
`StaffMember` model, PIN-based sub-session, `Order.servedBy` populated from real staff identity, "Multiple Staff" feature toggle goes live.
