# Deploying Oowapp to MilesWeb (cPanel Node.js)

Everything is done through **https://dashboard.mympanel.com/** — no SSH client needed.

---

## Before you start — one-time setup checklist

- [ ] Domain added and pointed to MilesWeb nameservers
- [ ] SSL certificate issued (cPanel → SSL/TLS → AutoSSL)
- [ ] PostgreSQL database created (see Step 0 below)
- [ ] Code pushed to GitHub

---

## Step 0 — Create a PostgreSQL database

In mympanel.com dashboard:

1. Go to **cPanel → PostgreSQL Databases**
2. Create a new database, e.g. `oowapp_db`
3. Create a database user with a strong password
4. Add the user to the database with **All Privileges**
5. Note down: `host`, `port` (usually `5432`), `dbname`, `user`, `password`

Your `DATABASE_URL` will be:
```
postgresql://USER:PASSWORD@localhost:5432/CPANELUSERNAME_oowapp_db
```

> Note: on cPanel the full db name includes your cPanel username prefix, e.g. `myuser_oowapp_db`.

---

## Step 1 — Prepare the repo locally

Make sure your code is committed and pushed to GitHub:

```bash
git add .
git commit -m "production ready"
git push origin main
```

**Never push:**
- `node_modules/`
- `.next/`
- `.env`

---

## Step 2 — Open Terminal in mympanel

In mympanel.com → **cPanel → Terminal**

This is a browser-based terminal — no SSH client needed.

Check Node is ready:

```bash
node -v    # should show v22.x
npm -v
```

If Node is not installed, run:

```bash
/usr/bin/install_nvm_and_node.sh
```

---

## Step 3 — Clone the project

In the Terminal:

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git oowapp
cd oowapp
```

If your GitHub repo is **private**, use a Personal Access Token:

```bash
git clone https://YOUR_GITHUB_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git oowapp
```

> Generate a token at: GitHub → Settings → Developer Settings → Personal Access Tokens → Classic → `repo` scope.

---

## Step 4 — Create the .env file

In the Terminal (still inside `~/oowapp`):

```bash
nano .env
```

Paste this and fill in your real values:

```env
# Database
DATABASE_URL=postgresql://CPANELUSERNAME_dbuser:PASSWORD@localhost:5432/CPANELUSERNAME_oowapp_db

# Auth
NEXTAUTH_SECRET=generate_a_random_32char_string_here
NEXTAUTH_URL=https://yourdomain.com

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# Web Push (copy from your current Vercel env)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:prince@forensiccybertech.com

# App URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

Save: `Ctrl+O` → Enter → `Ctrl+X`

> To generate NEXTAUTH_SECRET: `openssl rand -base64 32`

---

## Step 5 — Install dependencies

```bash
npm ci
```

This also auto-runs `prisma generate` (from postinstall in package.json).

---

## Step 6 — Set up the database

First time only:

```bash
npx prisma migrate deploy
```

If you have no migration history yet (fresh start):

```bash
npx prisma db push
```

Then seed the super admin account:

```bash
npx tsx scripts/seed-super-admin.ts
```

---

## Step 7 — Build the app

```bash
npm run build
```

Takes 1–3 minutes. Creates the `.next/` folder.

---

## Step 8 — Set up Node.js App in mympanel

In mympanel.com → **cPanel → Setup Node.js App** → **Create Application**:

| Setting | Value |
|---|---|
| Node.js version | `22.x` (latest available) |
| Application mode | `Production` |
| Application root | `oowapp` |
| Application URL | `yourdomain.com` (or a subdomain) |
| Application startup file | `node_modules/.bin/next` |
| Startup command | `npm start` |
| Port | `3000` |

Click **Create**.

If the panel has an **Environment Variables** section — add your `.env` values there too (some panels require it alongside the file).

Click **Start Application**.

---

## Step 9 — Check it's working

Visit `https://yourdomain.com` in your browser.

If it doesn't load, check logs in the Terminal:

```bash
# Application error log
cat ~/oowapp/logs/error.log

# Or check cPanel → Error Log
```

---

## Updating the app (after every code change)

```bash
cd ~/oowapp
git pull origin main
npm ci
npx prisma migrate deploy    # skip if no schema changes
npm run build
```

Then in mympanel → Setup Node.js App → click **Restart**.

---

## Quick reference

```bash
# Verify build succeeds
npm run build

# Check DB migration status
npx prisma migrate status

# Re-seed super admin (if needed)
npx tsx scripts/seed-super-admin.ts

# Check Node version
node -v
```

---

## Project-specific notes

- **PostgreSQL on cPanel**: database name and user always have your cPanel username as prefix (e.g. `myuser_oowapp_db`).
- **Prisma migrations**: always use `migrate deploy` in production, never `migrate dev`.
- **Cloudinary**: images live in Cloudinary — nothing to migrate on the server.
- **VAPID keys**: copy the exact same keys from your current environment. Changing them breaks all existing push notification subscriptions.
- **Next.js 16 App Router**: project is in `src/app/`. Runs as a standard Node.js server via `npm start`.
