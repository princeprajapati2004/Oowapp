import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { CategoryFormPage } from "@/components/admin/category-form-page";

// Deliberately outside the (dashboard) route group — full-screen, sidebar-free
// page, same convention as /admin/orders/create.
export default async function NewCategoryPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return <CategoryFormPage />;
}
