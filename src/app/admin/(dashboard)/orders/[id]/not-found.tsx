import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function OrderNotFound() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <EmptyState
        icon={FileQuestion}
        title="Order not found."
        description="This order doesn't exist, or it may have been deleted."
        action={
          <Button render={<Link href="/admin/orders" />}>
            Back to Orders
          </Button>
        }
      />
    </div>
  );
}
