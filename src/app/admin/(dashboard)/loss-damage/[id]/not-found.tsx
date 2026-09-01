import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function LossDamageNotFound() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <EmptyState
        icon={FileQuestion}
        title="Record not found."
        description="This loss/damage record doesn't exist, or it may have been deleted."
        action={
          <Button render={<Link href="/admin/loss-damage" />}>
            Back to Loss & Damage
          </Button>
        }
      />
    </div>
  );
}
