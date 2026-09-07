import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/session";
import { SAShell } from "@/components/super-admin/sa-shell";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect("/super-admin/login");
  }

  return <SAShell>{children}</SAShell>;
}
