import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { db } from "@/lib/db";
import { RETURN_DETAIL_INCLUDE, toReturnDetailPayload } from "@/lib/services/return-request";
import { ReturnDetailPage } from "@/components/admin/returns/return-detail-page";

export default async function ReturnDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const shop = await getShopById(session.shopId);

  const returnRequest = await db.returnRequest.findFirst({
    where: { id, shopId: session.shopId },
    include: RETURN_DETAIL_INCLUDE,
  });
  if (!returnRequest) notFound();

  return <ReturnDetailPage initial={toReturnDetailPayload(returnRequest)} currency={shop.currency} />;
}
