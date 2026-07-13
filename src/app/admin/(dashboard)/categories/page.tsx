import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listCategories } from "@/lib/services/category";
import { CategoriesManager } from "@/components/admin/categories-manager";

export default async function CategoriesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const categories = await listCategories(session.shopId);

  return <CategoriesManager initialCategories={categories} />;
}
