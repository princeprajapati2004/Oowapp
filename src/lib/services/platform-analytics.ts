import { db } from "@/lib/db";

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
        shop: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
  },

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

    const where = {
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(status ? { status: status as never } : {}),
    };

    const [shops, total] = await Promise.all([
      db.shop.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: "desc" },
        include: {
          admin: { select: { email: true } },
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: { select: { products: true, orders: true } },
        },
      }),
      db.shop.count({ where }),
    ]);

    return { shops, total, page, perPage, totalPages: Math.ceil(total / perPage) };
  },
};
