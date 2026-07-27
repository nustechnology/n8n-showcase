import { CreditCard } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";

export default function BillingSettingsPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Plan, usage, and payment details."
      />
      <div className="p-6 sm:p-8">
        {/* Ships in Phase 3 against a stubbed plan-limits response — real
            billing data isn't a backend deliverable until Phase 5
            (integration contract §10). */}
        <EmptyState
          icon={CreditCard}
          title="Billing arrives in Phase 3"
          description="Plan limits and usage will show here, initially against placeholder data until the backend's billing system ships in Phase 5."
        />
      </div>
    </>
  );
}
