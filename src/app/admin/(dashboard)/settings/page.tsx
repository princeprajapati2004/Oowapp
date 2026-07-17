import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { isFoodBusiness } from "@/lib/business-types";
import { BusinessInfoForm } from "@/components/admin/settings/business-info-form";
import { PaymentSettingsForm } from "@/components/admin/settings/payment-settings-form";
import { OrderSettingsForm } from "@/components/admin/settings/order-settings-form";
import { RestaurantSettingsForm } from "@/components/admin/settings/restaurant-settings-form";
import { SettingsAccordion } from "@/components/admin/settings/settings-accordion";
import type { BusinessInfoInput } from "@/lib/validation/shop-settings";

export default async function SettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const isRestaurant = isFoodBusiness(shop.businessType);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;

  const sections = [
    {
      id: "business",
      title: "Business information",
      description: "Name, type, contact details, logo and currency.",
      defaultOpen: true,
      content: (
        <BusinessInfoForm
          bare
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
      ),
    },
    {
      id: "payment",
      title: "Payment settings",
      description: "UPI, bank details, and payment QR shown on bills.",
      content: (
        <PaymentSettingsForm
          bare
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
      ),
    },
    {
      id: "orders",
      title: "Order settings",
      description: "Checkout fields, order logging, and menu visibility.",
      content: (
        <OrderSettingsForm
          bare
          businessType={shop.businessType}
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
      ),
    },
    {
      id: "restaurant",
      title: "Restaurant settings",
      description: "Table-wise QR ordering configuration.",
      hidden: !isRestaurant,
      content: (
        <RestaurantSettingsForm
          bare
          defaultValues={{
            enableTableQr: shopAny.enableTableQr ?? false,
            tableNames: shopAny.tableNames
              ? (() => {
                  try {
                    return JSON.parse(shopAny.tableNames) as string[];
                  } catch {
                    return [];
                  }
                })()
              : [],
          }}
        />
      ),
    },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Business info, payments, and order rules.</p>
      </div>

      <SettingsAccordion items={sections} />
    </div>
  );
}
