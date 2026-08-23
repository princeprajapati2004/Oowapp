import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listCustomerAccounts } from "@/lib/services/wallet";
import { getShopById } from "@/lib/services/shop";
import { serializeCustomerAccounts } from "@/lib/serialize";
import { CustomerAccountsManager } from "@/components/admin/customer-accounts-manager";

export default async function CustomersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [customers, shop] = await Promise.all([
    listCustomerAccounts(session.shopId),
    getShopById(session.shopId),
  ]);

  return (
    <CustomerAccountsManager initialCustomers={serializeCustomerAccounts(customers)} currency={shop.currency} />
  );
}
