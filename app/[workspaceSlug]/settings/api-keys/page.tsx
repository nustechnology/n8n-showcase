import { KeyRound } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";

export default function ApiKeysSettingsPage() {
  return (
    <>
      <PageHeader
        title="API keys"
        description="Programmatic access to your workspace's data."
      />
      <div className="p-6 sm:p-8">
        <EmptyState
          icon={KeyRound}
          title="API keys arrive in Phase 5"
          description="Customer-facing API access ships alongside the backend's public API."
        />
      </div>
    </>
  );
}
