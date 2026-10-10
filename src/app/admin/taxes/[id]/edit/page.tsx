import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getTax } from "@/lib/services/tax";
import { listCategories } from "@/lib/services/category";
import { serializeTax } from "@/lib/serialize";
import { TaxFormPage } from "@/components/admin/tax-form-page";

export default async function EditTaxPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [tax, categories] = await Promise.all([getTax(session.shopId, id), listCategories(session.shopId)]);
  if (!tax) notFound();

  return <TaxFormPage tax={serializeTax(tax)} categories={categories} />;
}
