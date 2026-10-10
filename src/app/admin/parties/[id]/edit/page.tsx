import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getParty } from "@/lib/services/party";
import { PartyFormPage } from "@/components/admin/party-form-page";

export default async function EditPartyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const party = await getParty(session.shopId, id);
  if (!party) notFound();

  return (
    <PartyFormPage
      party={{
        id: party.id,
        type: party.type,
        name: party.name,
        phone: party.phone,
        gstNumber: party.gstNumber,
        businessName: party.businessName,
        address: party.address,
        category: party.category,
        openingBalance: Number(party.openingBalance),
        creditLimit: party.creditLimit === null ? null : Number(party.creditLimit),
        notes: party.notes,
      }}
      returnTo={`/admin/parties/${party.id}`}
    />
  );
}
