import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold">Page not found</h1>
      <Link href="/admin/login" className="text-sm underline underline-offset-4">
        Go to admin login
      </Link>
    </div>
  );
}
