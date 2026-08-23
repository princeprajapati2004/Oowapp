import { notFound } from "next/navigation";
import { getPublicShopBundle } from "@/lib/services/shop";
import { getSmsConfig, describeMissing } from "@/lib/services/sms-config";
import { CustomerLoginForm } from "@/components/customer/customer-login-form";

export default async function CustomerLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getPublicShopBundle(slug);
  if (!shop) notFound();

  const smsConfig = await getSmsConfig();
  const otpAvailable = describeMissing(smsConfig).length === 0;

  return (
    <CustomerLoginForm
      slug={slug}
      businessName={shop.businessName}
      logoUrl={shop.logoUrl}
      otpAvailable={otpAvailable}
    />
  );
}
