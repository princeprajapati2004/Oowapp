import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import { OnboardingFlow } from "@/components/admin/onboarding-flow";
import { CURRENCIES, type Currency } from "@/lib/currencies";

function toCurrency(value: string): Currency {
  return (CURRENCIES as readonly string[]).includes(value) ? (value as Currency) : "INR";
}

export default async function AdminOnboardingPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [admin, shop] = await Promise.all([
    db.admin.findUnique({ where: { id: session.adminId }, select: { email: true, phoneVerified: true } }),
    db.shop.findUnique({
      where: { id: session.shopId },
      select: {
        slug: true,
        businessName: true,
        whatsappNumber: true,
        onboardingCompleted: true,
        ownerName: true,
        address: true,
        city: true,
        state: true,
        country: true,
        pincode: true,
        gstNumber: true,
        currency: true,
        timezone: true,
      },
    }),
  ]);
  if (!admin || !shop) redirect("/login");

  // Already onboarded — nothing to do here.
  if (shop.onboardingCompleted) redirect("/admin");

  return (
    <OnboardingFlow
      email={admin.email}
      phoneVerified={admin.phoneVerified}
      businessName={shop.businessName}
      whatsappNumber={shop.whatsappNumber}
      shopSlug={shop.slug}
      initialProfile={{
        ownerName: shop.ownerName ?? "",
        address: shop.address ?? "",
        city: shop.city ?? "",
        state: shop.state ?? "",
        country: shop.country ?? "India",
        pincode: shop.pincode ?? "",
        gstNumber: shop.gstNumber ?? "",
        currency: toCurrency(shop.currency),
        timezone: shop.timezone ?? "Asia/Kolkata",
      }}
    />
  );
}
