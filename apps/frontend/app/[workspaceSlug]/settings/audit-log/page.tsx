import { PageHeader } from "@/components/patterns/page-header";
import { AuditLogList } from "@/components/domain/audit-log-list";

export default function AuditLogPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, when — member changes, order overrides, and integration connects."
      />
      <div className="p-6 sm:p-8">
        <AuditLogList />
      </div>
    </>
  );
}
