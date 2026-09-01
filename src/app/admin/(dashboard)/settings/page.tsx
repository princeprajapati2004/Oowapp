import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { isFoodBusiness } from "@/lib/business-types";
import { db } from "@/lib/db";
import {
  getCurrentSubscription,
  computeDisplayStatus,
  computeDaysRemaining,
} from "@/lib/services/subscription";
import { resolveFeatures } from "@/lib/services/feature-permission";
import { getOrCreateItemSettings } from "@/lib/services/item-settings";
import { BusinessInfoForm } from "@/components/admin/settings/business-info-form";
import { ItemSettingsForm } from "@/components/admin/settings/item-settings-form";
import { PaymentSettingsForm } from "@/components/admin/settings/payment-settings-form";
import { OrderSettingsForm } from "@/components/admin/settings/order-settings-form";
import { MenuSettingsForm } from "@/components/admin/settings/menu-settings-form";
import { BillNumberingForm } from "@/components/admin/settings/bill-numbering-form";
import { PrintSettingsForm } from "@/components/admin/settings/print-settings-form";
import { PrinterSettingsPanel } from "@/components/admin/settings/printer-settings-panel";
import { RestaurantSettingsForm } from "@/components/admin/settings/restaurant-settings-form";
import { NotificationSettingsForm } from "@/components/admin/settings/notification-settings-form";
import { SubscriptionBillingSection } from "@/components/admin/settings/subscription-billing-section";
import { SettingsAccordion } from "@/components/admin/settings/settings-accordion";
import type { BusinessInfoInput } from "@/lib/validation/shop-settings";

// Same 7-day window as the (now-removed) dashboard subscription card —
// EXPIRY_WARNING_DAYS in subscription.ts isn't exported, so it's mirrored
// here rather than changing that module's exports.
const EXPIRY_WARNING_DAYS = 7;

export default async function SettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const isRestaurant = isFoodBusiness(shop.businessType);

  const [admin, rawSubscription, enabledFeatureKeys, allFeatures, itemSettings] = await Promise.all([
    db.admin.findUnique({ where: { id: session.adminId }, select: { id: true, createdAt: true } }),
    getCurrentSubscription(session.shopId),
    resolveFeatures(session.shopId),
    db.feature.findMany({ where: { isActive: true }, select: { key: true, label: true } }),
    getOrCreateItemSettings(session.shopId),
  ]);

  const displayStatus = computeDisplayStatus(rawSubscription);
  const daysRemaining = computeDaysRemaining(rawSubscription.endDate);
  const featureLabelByKey = new Map(allFeatures.map((f) => [f.key, f.label]));
  const enabledFeatureLabels = Object.entries(enabledFeatureKeys)
    .filter(([, enabled]) => enabled)
    .map(([key]) => featureLabelByKey.get(key) ?? key);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;

  const sections = [
    {
      id: "business",
      title: "Business information",
      description: "Logo, name, type, contact details, address and currency.",
      defaultOpen: true,
      content: (
        <BusinessInfoForm
          bare
          defaultValues={{
            businessName: shop.businessName,
            businessType: shop.businessType,
            logoUrl: shop.logoUrl,
            ownerName: shopAny.ownerName ?? "",
            phone: shop.phone ?? "",
            whatsappNumber: shop.whatsappNumber,
            email: shopAny.email ?? "",
            address: shop.address ?? "",
            city: shopAny.city ?? "",
            state: shopAny.state ?? "",
            pincode: shopAny.pincode ?? "",
            gstNumber: shop.gstNumber ?? "",
            panNumber: shopAny.panNumber ?? "",
            website: shopAny.website ?? "",
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
            paymentDisplayName: shop.paymentDisplayName ?? "",
            googlePayUpi: shop.googlePayUpi ?? "",
            phonePeUpi: shop.phonePeUpi ?? "",
            paytmUpi: shop.paytmUpi ?? "",
            bhimUpi: shop.bhimUpi ?? "",
          }}
        />
      ),
    },
    {
      id: "orders",
      title: "Order settings",
      description: "Checkout fields, order logging, and store visibility.",
      content: (
        <OrderSettingsForm
          bare
          defaultValues={{
            requireCustomerName: shop.requireCustomerName,
            requirePhone: shop.requirePhone,
            enableTableNumber: shopAny.enableTableNumber ?? true,
            requireTableNumber: shop.requireTableNumber,
            requireDeliveryAddress: shop.requireDeliveryAddress,
            allowNotes: shop.allowNotes,
            saveOrdersToDb: shop.saveOrdersToDb,
            isPublished: shop.isPublished,
            enableOrderBarcodeLabels: (shopAny.enableOrderBarcodeLabels as boolean) ?? false,
            enableQrOrdering: (shopAny.enableQrOrdering as boolean) ?? true,
          }}
        />
      ),
    },
    {
      id: "items",
      title: "Item settings",
      description: "Which product fields your business collects — Description, MRP, Barcode, Stock, and more.",
      content: (
        <ItemSettingsForm
          bare
          defaultValues={{
            descriptionEnabled: itemSettings.descriptionEnabled,
            mrpEnabled: itemSettings.mrpEnabled,
            purchasePriceEnabled: itemSettings.purchasePriceEnabled,
            wholesalePriceEnabled: itemSettings.wholesalePriceEnabled,
            partyPricingEnabled: itemSettings.partyPricingEnabled,
            serialNumberEnabled: itemSettings.serialNumberEnabled,
            batchNumberEnabled: itemSettings.batchNumberEnabled,
            barcodeEnabled: itemSettings.barcodeEnabled,
            productTypeEnabled: itemSettings.productTypeEnabled,
            stockEnabled: itemSettings.stockEnabled,
            productImageEnabled: itemSettings.productImageEnabled,
            productCodeEnabled: itemSettings.productCodeEnabled,
            offerEnabled: itemSettings.offerEnabled,
            categoryRequired: itemSettings.categoryRequired,
            hsnEnabled: itemSettings.hsnEnabled,
            hsnRequired: itemSettings.hsnRequired,
            allowNegativeStock: itemSettings.allowNegativeStock,
          }}
        />
      ),
    },
    {
      id: "menu",
      title: isRestaurant ? "Menu display" : "Catalogue display",
      description: isRestaurant
        ? "Control what customers and staff see on the menu."
        : "Control what customers see in your online catalogue.",
      content: (
        <MenuSettingsForm
          bare
          defaultValues={{ showProductImages: (shopAny.showProductImages as boolean) ?? true }}
        />
      ),
    },
    {
      id: "billNumbering",
      title: "Order numbering",
      description: "Prefix and sequence used for order/bill numbers.",
      content: (
        <BillNumberingForm
          bare
          defaultValues={{ billNumberPrefix: shopAny.billNumberPrefix ?? "" }}
          nextNumber={(shopAny.billNumberNext as number) ?? 1}
        />
      ),
    },
    {
      id: "print",
      title: "Print settings",
      description: "Default bill/receipt layout for every print action.",
      content: <PrintSettingsForm bare defaultFormat={shop.printFormat} />,
    },
    {
      id: "printers",
      title: "Printer devices",
      description: "Connect real Bluetooth, Wi-Fi, or USB printers and manage the print queue.",
      content: (
        <PrinterSettingsPanel businessName={shop.businessName} initialAutoPrint={(shopAny.autoPrintCompletedBill as boolean) ?? false} />
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
            orderMode: (shopAny.orderMode as "WHATSAPP" | "DIRECT") ?? "WHATSAPP",
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
    {
      id: "notifications",
      title: "Notifications",
      description: "Push notifications for new orders and updates.",
      content: (
        <NotificationSettingsForm
          bare
          defaultValues={{
            notifyNewOrders: (shopAny.notifyNewOrders as boolean) ?? true,
            notifyOrderUpdates: (shopAny.notifyOrderUpdates as boolean) ?? true,
          }}
        />
      ),
    },
    {
      id: "subscription",
      title: "Subscription & billing",
      description: "Your current plan, billing cycle, and account details.",
      content: (
        <SubscriptionBillingSection
          subscription={{
            planCode: rawSubscription.planCode,
            planName: rawSubscription.planName,
            status: displayStatus,
            startDate: rawSubscription.startDate,
            endDate: rawSubscription.endDate,
            daysRemaining,
            showExpiryWarning: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= EXPIRY_WARNING_DAYS,
          }}
          duration={rawSubscription.duration}
          enabledFeatureLabels={enabledFeatureLabels}
          accountId={admin?.id ?? session.adminId}
          businessId={shop.id}
          registeredOn={admin?.createdAt ?? shop.createdAt}
          lastLogin={shopAny.lastLoginAt as Date | null}
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
