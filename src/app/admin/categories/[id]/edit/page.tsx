import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import { CategoryFormPage } from "@/components/admin/category-form-page";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const category = await db.category.findFirst({ where: { id, shopId: session.shopId } });
  if (!category) notFound();

  return <CategoryFormPage category={category} />;
}
