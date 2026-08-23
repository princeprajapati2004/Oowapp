import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/session";
import { SuperAdminLoginForm } from "./super-admin-login-form";

export default async function SuperAdminLoginPage() {
  const session = await getSuperAdminSession();
  if (session) redirect("/super-admin");

  return <SuperAdminLoginForm />;
}
