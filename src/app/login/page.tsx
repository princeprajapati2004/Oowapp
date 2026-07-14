import { redirect } from "next/navigation";
import { getAdminSession, getSuperAdminSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const [saSession, baSession] = await Promise.all([
    getSuperAdminSession(),
    getAdminSession(),
  ]);

  if (saSession) redirect("/super-admin");
  if (baSession) redirect("/admin");

  return <LoginForm />;
}
