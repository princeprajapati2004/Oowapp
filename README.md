# MyKharcha — QR Ordering & Billing

A mobile-first QR ordering & billing app for small businesses (restaurants, cafes, tea
stalls, grocery/medical/electronics/clothing shops, etc.). Customers scan a QR, browse a
menu, build a cart, and place an order that opens WhatsApp with a formatted message — no
customer login, ever. Admins manage everything from a simple dashboard behind a login.

Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Prisma, and
PostgreSQL. Images are stored on Vercel Blob.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitives)
- **Prisma 7** ORM → **PostgreSQL** (works with Neon, Supabase, Railway, or any Postgres)
- **React Hook Form** + **Zod** for all forms and API validation
- **Vercel Blob** for logo / product photo / payment QR uploads
- **jose** (JWT) + **bcryptjs** for a minimal custom admin auth (no customer auth exists)
- **qrcode** + **jsPDF** for the QR code generator (PNG/SVG/PDF/print)

## Project structure

```
frontend/
  prisma/schema.prisma       Admin, Shop, Category, Product, Tax, Order, OrderItem
  prisma/migrations/         Initial migration (run on a real Postgres via `migrate deploy`)
  src/
    app/
      order/[slug]/          Public customer ordering page
      admin/login, signup/   Public auth pages
      admin/(dashboard)/     Everything behind the admin session (settings, categories,
                              products, taxes, qr, orders, menu-print)
      api/                   Route handlers — the "backend" (auth, admin CRUD, upload,
                              public order submission)
    components/
      ui/                    shadcn/ui primitives
      admin/                 Admin dashboard screens
      customer/               Customer menu, cart, checkout, bill
      shared/                Reused across both (ImageUploader, EmptyState, ToggleRow, …)
    lib/
      services/               Business logic, scoped by shopId (billing math lives here —
                              single source of truth for the bill screen, WhatsApp
                              message, and order persistence)
      validation/             Zod schemas shared by forms and API routes
      db.ts, auth.ts, session.ts, serialize.ts, api-client.ts
    proxy.ts                  Guards /admin/** (Next.js 16 renamed `middleware` → `proxy`)
```

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Database.** Point `DATABASE_URL` in `.env` at a Postgres instance. For local
   development without installing Postgres yourself, Prisma can run one for you:

   ```bash
   npx prisma dev -d
   ```

   This prints a `postgres://...` connection string — put it in `.env`. Then sync the
   schema:

   ```bash
   npx prisma db push
   ```

   On a **real** Postgres instance (Neon/Supabase/Railway/production), use proper
   migrations instead:

   ```bash
   npx prisma migrate deploy
   ```

3. **Environment variables** — copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — your Postgres connection string
   - `JWT_SECRET` — random string (`openssl rand -base64 32`)
   - `BLOB_READ_WRITE_TOKEN` — from Vercel dashboard → Storage → Blob (leave blank
     locally if you don't need image upload for testing)
   - `NEXT_PUBLIC_APP_URL` — the public URL the QR code should encode

4. **Run it**

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000/admin/signup` to create your first shop.

## Deploying (Vercel)

1. Push this repo to GitHub and import it into Vercel.
2. Add a Postgres integration (Neon/Supabase/Railway all work) and a Blob store; Vercel
   will wire up `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` for you (or set them manually).
3. Set `JWT_SECRET` and `NEXT_PUBLIC_APP_URL` (your production domain) in Project
   Settings → Environment Variables.
4. `prisma generate` runs automatically via the `postinstall` script. Run
   `npx prisma migrate deploy` once against the production database (locally, pointed at
   the prod `DATABASE_URL`, or via a Vercel deploy hook) before the first real deploy.

## How it works

- **One admin = one shop.** Signing up at `/admin/signup` creates both in one step —
  there's no separate "create a shop" flow.
- **Business type only changes wording** (e.g. "Table Number" vs "Delivery Address"),
  never the underlying logic — the same code serves every business vertical.
- **Taxes** apply to the entire bill or to one category, as a percentage or a fixed
  amount. The math lives in one function (`lib/services/billing.ts#calculateBill`) reused
  by the admin tax preview, the customer bill screen, the WhatsApp message, and order
  persistence.
- **Orders always go to WhatsApp.** Saving them to the database is optional
  (Settings → Order Settings → "Save orders to database") and never blocks the WhatsApp
  handoff if it fails.
