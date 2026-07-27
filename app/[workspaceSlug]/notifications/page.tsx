import { PageHeader } from "@/components/patterns/page-header";
import { NotificationsList } from "@/components/domain/notifications-list";

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Alerts from runs that need your attention."
      />
      <div className="p-6 sm:p-8">
        <NotificationsList />
      </div>
    </>
  );
}
