import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { PartyFormPage } from "@/components/admin/party-form-page";

export default async function NewPartyPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  return <PartyFormPage returnTo="/admin/parties" />;
}
