import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { CustomerLoginForm } from "@/components/customer/customer-login-form";

export default async function CustomerLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  return (
    <CustomerLoginForm
      slug={slug}
      businessName={shop.businessName}
      logoUrl={shop.logoUrl}
    />
  );
}
