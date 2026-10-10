import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listCategories } from "@/lib/services/category";
import { TaxFormPage } from "@/components/admin/tax-form-page";

export default async function NewTaxPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const categories = await listCategories(session.shopId);

  return <TaxFormPage categories={categories} />;
}
