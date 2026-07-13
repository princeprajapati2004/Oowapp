import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { BusinessInfoForm } from "@/components/admin/settings/business-info-form";
import { PaymentSettingsForm } from "@/components/admin/settings/payment-settings-form";
import { OrderSettingsForm } from "@/components/admin/settings/order-settings-form";
import type { BusinessInfoInput } from "@/lib/validation/shop-settings";

export default async function SettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const shop = await getShopById(session.shopId);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Business info, payments, and order rules.</p>
      </div>

      <BusinessInfoForm
        defaultValues={{
          businessName: shop.businessName,
          businessType: shop.businessType,
          logoUrl: shop.logoUrl,
          phone: shop.phone ?? "",
          whatsappNumber: shop.whatsappNumber,
          address: shop.address ?? "",
          gstNumber: shop.gstNumber ?? "",
          currency: shop.currency as BusinessInfoInput["currency"],
        }}
      />

      <PaymentSettingsForm
        defaultValues={{
          upiId: shop.upiId ?? "",
          acceptCash: shop.acceptCash,
          bankAccountName: shop.bankAccountName ?? "",
          bankAccountNumber: shop.bankAccountNumber ?? "",
          bankIfsc: shop.bankIfsc ?? "",
          bankName: shop.bankName ?? "",
          paymentQrImageUrl: shop.paymentQrImageUrl,
        }}
      />

      <OrderSettingsForm
        defaultValues={{
          requireCustomerName: shop.requireCustomerName,
          requirePhone: shop.requirePhone,
          requireTableNumber: shop.requireTableNumber,
          requireDeliveryAddress: shop.requireDeliveryAddress,
          allowNotes: shop.allowNotes,
          saveOrdersToDb: shop.saveOrdersToDb,
          isPublished: shop.isPublished,
        }}
      />
    </div>
  );
}
