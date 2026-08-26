import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function ReturnNotFound() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <EmptyState
        icon={FileQuestion}
        title="Return not found."
        description="This return doesn't exist, or it may have been deleted."
        action={
          <Button render={<Link href="/admin/returns" />}>
            Back to Returns & Refunds
          </Button>
        }
      />
    </div>
  );
}
