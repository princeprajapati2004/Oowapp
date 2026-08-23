import { notFound, redirect } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { getCustomerSession } from "@/lib/customer-session";
import { getWalletSummary } from "@/lib/services/wallet";
import { serializeWalletTransactions } from "@/lib/serialize";
import { db } from "@/lib/db";
import { WalletPage } from "@/components/customer/wallet-page";

export default async function CustomerWalletPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  const shopRow = await db.shop.findUnique({ where: { slug }, select: { id: true } });
  const session = await getCustomerSession();
  // No guest wallet — send them to log in (matches order-history.tsx's
  // existing "log in to see your orders" redirect; there's no return-to-page
  // param anywhere else in the customer auth flow to piggyback on).
  if (!shopRow || !session || session.shopId !== shopRow.id) {
    redirect(`/order/${slug}/login`);
  }

  const { balance, transactions } = await getWalletSummary(shopRow.id, session.customerId);

  return (
    <WalletPage
      slug={slug}
      businessName={shop.businessName}
      currency={shop.currency}
      balance={balance}
      transactions={serializeWalletTransactions(transactions)}
    />
  );
}
