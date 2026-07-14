import { db } from "@/lib/db";

export const BusinessAnalyticsService = {
  async getOrderStats(shopId: string, from?: Date, to?: Date) {
    const dateFilter =
      from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {};

    const where = { shopId, ...dateFilter };

    const [totalOrders, revenue] = await Promise.all([
      db.order.count({ where }),
      db.order.aggregate({ where, _sum: { grandTotal: true } }),
    ]);

    return {
      totalOrders,
      totalRevenue: revenue._sum.grandTotal ?? 0,
    };
  },

  async getProductStats(shopId: string) {
    const [totalProducts, availableProducts, totalCategories] = await Promise.all([
      db.product.count({ where: { shopId } }),
      db.product.count({ where: { shopId, isAvailable: true } }),
      db.category.count({ where: { shopId } }),
    ]);

    return { totalProducts, availableProducts, totalCategories };
  },

  async getRecentOrders(shopId: string, limit = 10) {
    return db.order.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { items: true },
    });
  },

  async getDashboardSummary(shopId: string) {
    const [orderStats, productStats, recentOrders] = await Promise.all([
      BusinessAnalyticsService.getOrderStats(shopId),
      BusinessAnalyticsService.getProductStats(shopId),
      BusinessAnalyticsService.getRecentOrders(shopId, 5),
    ]);

    return { orderStats, productStats, recentOrders };
  },
};
