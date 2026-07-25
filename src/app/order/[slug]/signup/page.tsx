import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { CustomerSignupForm } from "@/components/customer/customer-signup-form";

export default async function CustomerSignupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  return <CustomerSignupForm slug={slug} businessName={shop.businessName} logoUrl={shop.logoUrl} />;
}
