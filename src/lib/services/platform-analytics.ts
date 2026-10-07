import { db } from "@/lib/db";
import { caseInsensitive } from "@/lib/db-provider";

export const PlatformAnalyticsService = {
  async getOverview() {
    const [totalBusinesses, activeBusinesses, suspendedBusinesses, totalOrders, totalProducts] =
      await Promise.all([
        db.shop.count(),
        db.shop.count({ where: { status: "ACTIVE" } }),
        db.shop.count({ where: { status: "SUSPENDED" } }),
        db.order.count(),
        db.product.count(),
      ]);

    return { totalBusinesses, activeBusinesses, suspendedBusinesses, totalOrders, totalProducts };
  },

  async getRecentSignups(limit = 10) {
    return db.admin.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        shops: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
  },

  // Groups by the legacy `plan` enum column — any plan created after that enum
  // (e.g. MOON_STAR/SUPER_STAR) falls back to "FREE" in this column (see
  // subscription-admin.ts::legacyPlanColumnValue) and will bucket there, not
  // under its real name. Fine as long as this stays unrendered (confirmed: no
  // current UI reads it); re-key to group by planId/planRef.code before
  // surfacing this anywhere.
  async getSubscriptionBreakdown() {
    return db.subscription.groupBy({
      by: ["plan"],
      _count: { _all: true },
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
    });
  },

  async getBusinessList(opts: {
    page?: number;
    perPage?: number;
    search?: string;
    status?: string;
  } = {}) {
    const { page = 1, perPage = 20, search, status } = opts;
    const skip = (page - 1) * perPage;

    const VALID_STATUSES = new Set(["ACTIVE", "SUSPENDED", "INACTIVE", "DELETED"]);
    const safeStatus = status && VALID_STATUSES.has(status) ? status : undefined;

    const where = {
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, ...caseInsensitive() } },
              { slug: { contains: search, ...caseInsensitive() } },
            ],
          }
        : {}),
      ...(safeStatus ? { status: safeStatus as never } : {}),
    };

    const [shops, total] = await Promise.all([
      db.shop.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: "desc" },
        include: {
          admin: { select: { email: true } },
          // Subscription is account-level (adminId), not per-shop — the caller
          // batch-resolves the real plan via getLatestSubscriptionsByAdminIds
          // using shop.adminId (a plain scalar column, already present without
          // needing its own `include` entry). Do NOT reintroduce a raw
          // `subscriptions: {take:1}` include here — that was reading the
          // legacy per-shop row directly and silently misreported the plan
          // for any admin with more than one business.
          _count: { select: { products: true, orders: true } },
        },
      }),
      db.shop.count({ where }),
    ]);

    return { shops, total, page, perPage, totalPages: Math.ceil(total / perPage) };
  },
};
