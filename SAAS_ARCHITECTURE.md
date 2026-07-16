# OOWAPP — Multi-Tenant SaaS Architecture

**Status:** Awaiting approval before implementation begins.

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Problems Found](#2-problems-found)
3. [Database Changes](#3-database-changes)
4. [Authentication & RBAC](#4-authentication--rbac)
5. [Business Isolation](#5-business-isolation)
6. [API Changes](#6-api-changes)
7. [Dashboard Design](#7-dashboard-design)
8. [Navigation & Routing](#8-navigation--routing)
9. [Implementation Phases](#9-implementation-phases)

---

## 1. Current Architecture

### What exists today

**User roles:** One. A "Business Admin" who owns exactly one Shop.

**Authentication:** JWT stored in an HTTP-only cookie. Session payload: `{ adminId, shopId }`. No role field. All protected routes call `requireAdminSession()` which returns this payload — there is no permission system.

**Database:** 7 models.

```
Admin ─── (1:1) ──► Shop
                     │
          ┌──────────┼──────────┬────────┐
          ▼          ▼          ▼        ▼
      Category    Product     Tax     Order
          │          │                  │
          └──────────►       OrderItem ◄┘
```

**Routing:**
```
/                          → redirect to /admin/login
/admin/login               → Business Admin login
/admin/signup              → Business Admin signup
/admin/(dashboard)/*       → Protected admin panel
/order/[slug]              → Customer ordering page (public)
/api/auth/*                → Auth endpoints
/api/admin/*               → Business admin APIs
/api/orders                → Customer order submission
/api/upload                → Cloudinary image upload
```

**Current flow — Customer:**
1. Customer scans QR → lands on `/order/[slug]`
2. Browses menu, adds items to cart (localStorage)
3. Fills checkout form → bill calculated client-side
4. Taps "Send Order via WhatsApp" → pre-filled message opens WhatsApp
5. Order optionally saved to DB (toggle in settings)

**Current flow — Business Admin:**
1. Signup → shop created automatically
2. Manage categories, products, taxes
3. Configure payment, order settings
4. Download/print QR code
5. View order history (optional)

**Image storage:** Cloudinary (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).

**Database:** Prisma Postgres via `@prisma/adapter-pg` (`DATABASE_URL` from `.env`).

---

## 2. Problems Found

### Critical gaps for multi-tenant SaaS

| # | Problem | Impact |
|---|---------|--------|
| 1 | No Super Admin role or model | Cannot manage the platform at all |
| 2 | No role field in JWT session | Cannot distinguish SA from BA in middleware |
| 3 | `Admin` and `Shop` are 1:1 tightly coupled | Future: owner managing multiple shops is blocked |
| 4 | No subscription model | Cannot implement plans or billing hooks |
| 5 | No audit log table | Cannot track who did what |
| 6 | No platform settings table | Cannot configure branding, currency defaults, etc. |
| 7 | Shop model is missing business metadata | No ownerName, city, state, country, lastLoginAt |
| 8 | Business status field missing | Cannot suspend / activate a business |
| 9 | No notification system | Cannot alert SA on new signups, large orders |
| 10 | `shopId` vs `businessId` naming inconsistency | Confusing — every table uses `shopId` but the entity is a business |

### Minor issues
- No rate limiting on auth endpoints
- No email verification on signup
- `saveOrdersToDb` is a business toggle — orders never auto-save in current architecture
- Order `billNumber` is generated on the server but not validated for uniqueness across time
- `isPublished` on Shop model is the only protection — unpublished shop returns 404 on `/order/[slug]`

---

## 3. Database Changes

### New models to add

#### `SuperAdmin`
```prisma
model SuperAdmin {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("super_admins")
}
```

#### `Subscription`
```prisma
enum SubscriptionPlan {
  FREE
  STARTER
  PRO
  ENTERPRISE
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  CANCELLED
  TRIAL
}

model Subscription {
  id        String             @id @default(cuid())
  shopId    String             @unique
  shop      Shop               @relation(fields: [shopId], references: [id], onDelete: Cascade)
  plan      SubscriptionPlan   @default(FREE)
  status    SubscriptionStatus @default(ACTIVE)
  startDate DateTime           @default(now())
  endDate   DateTime?
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  @@map("subscriptions")
}
```

#### `AuditLog`
```prisma
enum AuditAction {
  BUSINESS_CREATED
  BUSINESS_UPDATED
  BUSINESS_DELETED
  BUSINESS_SUSPENDED
  BUSINESS_ACTIVATED
  ADMIN_LOGIN
  ADMIN_SIGNUP
  SETTINGS_CHANGED
  PRODUCT_CREATED
  PRODUCT_DELETED
  ORDER_PLACED
}

model AuditLog {
  id          String      @id @default(cuid())
  action      AuditAction
  actorType   String      // "super_admin" | "business_admin" | "customer"
  actorId     String?     // SuperAdmin.id or Admin.id
  targetType  String?     // "shop" | "product" | "order"
  targetId    String?
  metadata    Json?       // extra context (IP, previous values, etc.)
  shopId      String?     // which shop this event belongs to (null = platform event)
  createdAt   DateTime    @default(now())

  @@index([shopId])
  @@index([actorId])
  @@index([action])
  @@map("audit_logs")
}
```

#### `PlatformSettings`
```prisma
model PlatformSettings {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt

  @@map("platform_settings")
}
```

### Changes to existing `Shop` model
Add these fields:
```prisma
// Business identity
ownerName       String?
city            String?
state           String?
country         String?     @default("IN")

// Platform management
status          ShopStatus  @default(ACTIVE)
lastLoginAt     DateTime?
suspendedAt     DateTime?
suspendedReason String?
deletedAt       DateTime?   // soft delete

// Relations
subscription    Subscription?
```

New enum:
```prisma
enum ShopStatus {
  ACTIVE
  SUSPENDED
  INACTIVE
  DELETED
}
```

### Summary of all schema changes

| Change | Type | Reason |
|--------|------|--------|
| Add `SuperAdmin` model | New | Platform owner role |
| Add `Subscription` model | New | Plan management |
| Add `AuditLog` model | New | Activity tracking |
| Add `PlatformSettings` model | New | Platform config |
| Add `Shop.ownerName` | Field | Business identity |
| Add `Shop.city/state/country` | Fields | Location info |
| Add `Shop.status` | Enum field | Suspend/activate |
| Add `Shop.lastLoginAt` | Field | Admin analytics |
| Add `Shop.suspendedAt/Reason` | Fields | Suspension context |
| Add `Shop.deletedAt` | Field | Soft delete |

**No existing fields removed or renamed.** All changes are purely additive — no data migration required.

---

## 4. Authentication & RBAC

### Three distinct session types

```typescript
type SessionRole = "super_admin" | "business_admin";

interface BaseSession {
  role: SessionRole;
  iat: number;
  exp: number;
}

interface SuperAdminSession extends BaseSession {
  role: "super_admin";
  superAdminId: string;
}

interface BusinessAdminSession extends BaseSession {
  role: "business_admin";
  adminId: string;
  shopId: string;
}

type SessionPayload = SuperAdminSession | BusinessAdminSession;
```

### New session helpers

```typescript
// Existing (updated to include role)
requireAdminSession()     → BusinessAdminSession
requireSuperAdminSession() → SuperAdminSession
```

### Super Admin auth flow
- Separate login page: `/super-admin/login`
- Separate cookie: `sa_session`
- Same JWT mechanism, different secret env var (`SA_JWT_SECRET`)
- Super Admin accounts created via seed script (not self-signup)

### RBAC enforcement levels

| Route | Enforcement |
|-------|-------------|
| `/super-admin/*` | `requireSuperAdminSession()` — SA cookie must be valid |
| `/admin/*` | `requireAdminSession()` — BA cookie must be valid |
| `/api/super-admin/*` | `requireSuperAdminSession()` in every handler |
| `/api/admin/*` | `requireAdminSession()` — `session.shopId` scopes all queries |
| `/order/[slug]` | Public — no auth required |
| `/api/orders` | Public — no auth required |

**Business isolation guarantee:** Every `db.*` call inside `/api/admin/*` routes passes `shopId: session.shopId`. A Business Admin can never query another business's data because the `shopId` comes from the verified JWT, not from the request body.

---

## 5. Business Isolation

### Current state
Already isolated at the data layer — every model references `shopId`. The session payload contains `shopId` which is extracted from the JWT (signed server-side), not from query parameters. This is secure.

### What changes
1. **Session payload gets a `role` field** — needed to distinguish SA from BA in shared middleware.
2. **Super Admin bypasses shop isolation** — SA can query any `shopId` explicitly.
3. **Soft delete** — `Shop.deletedAt` means deleted businesses' data is preserved for compliance; filtered out by default in all queries.
4. **Suspended businesses** — `Shop.status === "SUSPENDED"` blocks Business Admin login and shows a suspension notice instead of the customer menu.

### Isolation check matrix

| Actor | Can read own data | Can read other business data | Can modify other business |
|-------|------------------|------------------------------|--------------------------|
| Super Admin | ✓ | ✓ (read only) | ✓ (suspend/activate/delete) |
| Business Admin | ✓ | ✗ | ✗ |
| Customer | ✗ (no login) | ✗ | ✗ |

---

## 6. API Changes

### New API routes (Super Admin)

```
POST   /api/super-admin/auth/login
POST   /api/super-admin/auth/logout

GET    /api/super-admin/dashboard          ← platform stats
GET    /api/super-admin/businesses         ← list all + filter + search + paginate
POST   /api/super-admin/businesses         ← create business (and admin)
GET    /api/super-admin/businesses/[id]    ← business details
PATCH  /api/super-admin/businesses/[id]    ← update business metadata
DELETE /api/super-admin/businesses/[id]    ← soft delete

POST   /api/super-admin/businesses/[id]/suspend
POST   /api/super-admin/businesses/[id]/activate

GET    /api/super-admin/businesses/[id]/analytics
GET    /api/super-admin/businesses/[id]/orders

GET    /api/super-admin/audit-logs

GET    /api/super-admin/settings
PATCH  /api/super-admin/settings
```

### Existing API routes (unchanged interface, behaviour updates)

```
POST /api/auth/login      ← add: update Shop.lastLoginAt + write AuditLog
POST /api/auth/signup     ← add: write AuditLog, create FREE Subscription
```

All `/api/admin/*` routes remain unchanged in interface.

### Customer API (unchanged)
```
POST /api/orders          ← unchanged
GET  /api/upload          ← unchanged
```

---

## 7. Dashboard Design

### Super Admin Dashboard

Inspired by: Vercel, Clerk, Stripe dashboards.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  ◈ OOWAPP Platform    [Bell] [SA Avatar ▾]        │
├──────────────┬──────────────────────────────────────┤
│              │                                       │
│  Dashboard   │   OVERVIEW CARDS (row of 4)           │
│  Businesses  │   ┌────────┐┌────────┐┌────────┐┌──┐ │
│  Analytics   │   │Total   ││Active  ││Orders  ││$  │ │
│  Settings    │   │Biz     ││Biz     ││Today   ││Rev│ │
│  Audit Logs  │   └────────┘└────────┘└────────┘└──┘ │
│  Reports     │                                       │
│              │   ACTIVITY CHART (line, 30 days)      │
│  ─────────   │   ┌──────────────────────────────────┐│
│  Platform    │   │  ~~orders~~  ~~businesses~~       ││
│  v1.0        │   └──────────────────────────────────┘│
│              │                                       │
│              │   ┌──────────────┐ ┌────────────────┐ │
│              │   │Recent Biz    │ │Recent Orders   │ │
│              │   │[table rows]  │ │[table rows]    │ │
│              │   └──────────────┘ └────────────────┘ │
└──────────────┴──────────────────────────────────────┘
```

**Dashboard cards:**
1. Total Businesses (+ this month badge)
2. Active Businesses
3. Orders Today
4. Total Orders (all time)
5. QR Codes Generated (= total active shops)
6. New Signups (this week)

**Businesses table columns:**
`Business Name | Owner | Type | Plan | Status | Orders | Created | Actions`

**Business detail page:**
- Header: logo + name + status badge + action buttons (Suspend/Activate/Delete)
- Tabs: Overview | Orders | Analytics | Settings
- Overview: all metadata fields, subscription info
- Orders: paginated order table for that business
- Analytics: order volume chart, top products, revenue
- Settings: edit metadata (name, owner, contact, address)

### Business Admin Dashboard (updated)

Existing dashboard gets enhanced:
- Today's orders count card (live)
- Today's revenue card
- Active menu items count
- Recent orders table (last 10, with status)
- Quick actions: Add Product | View QR | Share Menu Link

---

## 8. Navigation & Routing

### New route tree

```
/super-admin
├── /login                        ← SA login
└── /(dashboard)
    ├── layout.tsx                ← SA shell (separate from business admin)
    ├── page.tsx                  ← Platform dashboard
    ├── /businesses
    │   ├── page.tsx              ← Business list + search + filter
    │   └── [id]
    │       └── page.tsx          ← Business detail + tabs
    ├── /analytics
    │   └── page.tsx              ← Platform-wide analytics
    ├── /audit-logs
    │   └── page.tsx              ← Audit trail
    ├── /settings
    │   └── page.tsx              ← Platform settings
    └── /reports
        └── page.tsx              ← Export CSV/PDF

/admin                            ← existing, unchanged routing
/order/[slug]                     ← existing, unchanged
```

### Super Admin sidebar navigation

```
Platform Dashboard
Businesses
  └ All Businesses
Analytics
Audit Logs
Reports
──────────
Settings
```

### Business Admin sidebar (additions to existing)
```
Dashboard          ← enhanced with stats
Categories
Products
Taxes
QR Code
Orders
Settings
──────────
Preview Menu       ← external link
```

---

## 9. Implementation Phases

**Rule:** Each phase must be fully working before the next starts.

### Phase 1 — Foundation (Super Admin Auth + DB)
**Scope:** Backend only. No visible UI changes.
1. Add `SuperAdmin`, `Subscription`, `AuditLog`, `PlatformSettings` models to schema
2. Add new fields to `Shop` model
3. Run migration
4. Update session types (`role` field in JWT payload)
5. Add `SA_JWT_SECRET` env var
6. Create SA seed script (`npm run db:seed:sa`)
7. New auth helpers: `requireSuperAdminSession()`
8. Write AuditLog on: signup, login, business suspend/delete

**Deliverable:** Database migrated, SA can be seeded, session tokens include role.

---

### Phase 2 — Super Admin Shell + Business List
**Scope:** SA login page + dashboard shell + business list.
1. `/super-admin/login` page
2. `/api/super-admin/auth/login` + `/logout` endpoints
3. SA dashboard layout with sidebar
4. `/api/super-admin/businesses` — list with search, filter, pagination
5. Businesses page: table with Name, Owner, Type, Plan, Status, Actions
6. Stat cards on dashboard (total, active, inactive counts)

**Deliverable:** SA can log in and see all businesses.

---

### Phase 3 — Business Management
**Scope:** Create, view, edit, suspend, activate, delete businesses.
1. Business detail page (tabs: Overview, Orders, Settings)
2. `PATCH /api/super-admin/businesses/[id]` — edit metadata
3. `POST /api/super-admin/businesses/[id]/suspend`
4. `POST /api/super-admin/businesses/[id]/activate`
5. Soft delete with confirmation dialog
6. Suspended business check in BA login flow (show suspension notice)
7. Suspended business customer-facing: show "Temporarily unavailable" instead of menu

**Deliverable:** SA can fully manage any business lifecycle.

---

### Phase 4 — Platform Analytics
**Scope:** Charts and stats for SA.
1. `/api/super-admin/dashboard` — aggregated stats (orders/day, new businesses/week)
2. Line chart: orders over last 30 days
3. Line chart: business signups over last 30 days
4. Business detail analytics tab: orders chart, top products list
5. Enhanced Business Admin dashboard: today's stats, recent orders table

**Deliverable:** Both SA and BA see meaningful analytics.

---

### Phase 5 — Subscription Architecture
**Scope:** Schema + UI. No payment gateway.
1. `Subscription` record created automatically on signup (FREE plan)
2. SA can change a business's plan from business detail page
3. Plan limits defined in code (e.g., FREE: max 50 products, max 5 categories)
4. Plan displayed on SA business list and BA dashboard
5. Plan badge on BA header

**Deliverable:** Plan field exists, SA can assign plans, limits are enforced.

---

### Phase 6 — Audit Logs + Reports
**Scope:** Visibility and compliance.
1. Audit log writes on every significant action (already wired in Phase 1 for key events)
2. SA audit log page: filterable by action type, date range, business
3. BA: view their own audit trail in settings
4. Reports page: export business list as CSV
5. Export orders (per business) as CSV

**Deliverable:** Complete activity trail, basic export capability.

---

## Appendix — Environment Variables Needed

| Variable | Purpose | New? |
|----------|---------|------|
| `DATABASE_URL` | Prisma PostgreSQL | Existing |
| `JWT_SECRET` | Business Admin JWT | Existing |
| `SA_JWT_SECRET` | Super Admin JWT | **New** |
| `CLOUDINARY_CLOUD_NAME` | Image uploads | Existing |
| `CLOUDINARY_API_KEY` | Image uploads | Existing |
| `CLOUDINARY_API_SECRET` | Image uploads | Existing |
| `NEXT_PUBLIC_APP_URL` | QR code base URL | Existing |
| `SUPER_ADMIN_SEED_EMAIL` | SA seed script | **New** |
| `SUPER_ADMIN_SEED_PASSWORD` | SA seed script | **New** |

---

## Appendix — Decisions Made & Why

| Decision | Rationale |
|----------|-----------|
| Separate SA cookie (`sa_session`) | Prevents any JWT confusion between roles; SA token cannot accidentally authenticate a BA route |
| Super Admin is not self-service | Platform owners are created via seed/CLI only — prevents anyone from becoming SA |
| No rename of `shopId` to `businessId` | Purely additive changes — renaming a foreign key used in 50+ places risks migration errors with no user benefit |
| Soft delete on Shop | Orders, products, audit logs belong to a shop — hard delete breaks referential integrity |
| `Subscription` as separate model | Future payment gateway integration needs its own table; embedding plan in Shop is a dead end |
| AuditLog uses `actorType` string not enum | Extensible — future system events (cron jobs, webhooks) don't fit in a closed enum |
| Phase 1 migrations are purely additive | Zero downtime — no existing columns changed, no existing data touched |
