import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { getPartyStatement } from "@/lib/services/party";
import { NotFoundError } from "@/lib/api-utils";
import { PartyStatement } from "@/components/admin/party-statement";

export default async function PartyStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const shop = await getShopById(session.shopId);

  let statement;
  try {
    statement = await getPartyStatement(session.shopId, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <PartyStatement
      initialStatement={statement}
      shop={{
        businessName: shop.businessName,
        logoUrl: shop.logoUrl,
        address: shop.address,
        phone: shop.phone,
        gstNumber: shop.gstNumber,
        currency: shop.currency,
      }}
    />
  );
}
