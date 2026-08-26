import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { toLossDamagePayload } from "@/lib/services/loss-damage";
import { LossDamageDetailPage } from "@/components/admin/loss-damage/loss-damage-detail-page";

export default async function LossDamageDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const shop = await getShopById(session.shopId);

  const record = await db.lossDamageRecord.findFirst({
    where: { id, shopId: session.shopId },
    include: {
      product: { select: { id: true, name: true, imageUrl: true } },
      returnItem: {
        select: {
          id: true,
          returnId: true,
          returnRequest: { select: { id: true, orderId: true } },
        },
      },
    },
  });
  if (!record) notFound();

  return <LossDamageDetailPage record={toLossDamagePayload(record)} currency={shop.currency} />;
}
