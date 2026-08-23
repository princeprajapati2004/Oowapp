import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyPendingRegistration, PENDING_REGISTRATION_COOKIE } from "@/lib/auth";
import { BusinessDetailsForm } from "./business-details-form";

export default async function BusinessDetailsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_REGISTRATION_COOKIE)?.value;
  const pending = token ? await verifyPendingRegistration(token) : null;

  if (!pending) redirect("/admin/signup");

  return <BusinessDetailsForm />;
}
