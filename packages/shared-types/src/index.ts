import type {
  OrderStatus,
  WorkflowRunStatus,
  WorkflowStepStatus,
  IntegrationStatus,
  IntegrationProvider,
  PublicProvider,
  ConnectShopifyInput,
  ConnectEasyPostInput,
  ConnectShippoInput,
  ConnectResendInput,
  ConnectSendGridInput,
  ConnectMailgunInput,
  ConnectSlackInput,
  ConnectDiscordInput,
  ConnectOdooInput,
  InviteMemberInput,
  UpdateMemberInput,
  UpdateTenantInput,
} from "@n8n-showcase/shared-schemas";

export type {
  OrderStatus,
  WorkflowRunStatus,
  WorkflowStepStatus,
  IntegrationStatus,
  IntegrationProvider,
  PublicProvider,
  ConnectShopifyInput,
  ConnectEasyPostInput,
  ConnectShippoInput,
  ConnectResendInput,
  ConnectSendGridInput,
  ConnectMailgunInput,
  ConnectSlackInput,
  ConnectDiscordInput,
  ConnectOdooInput,
  InviteMemberInput,
  UpdateMemberInput,
  UpdateTenantInput,
};

export type WorkspaceRole = "owner" | "admin" | "operator" | "viewer";

export type PermissionAction =
  | "workflow:retry"
  | "order:override"
  | "integration:manage"
  | "integration:test"
  | "member:manage"
  | "workspace:delete"
  | "tenant:manage"
  | "billing:manage"
  | "audit:read";

export type OauthConnectResponse = {
  authorizeUrl: string;
};

export type ApiKeyConnectResponse = {
  status: "ACTIVE";
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  unreadCount?: number;
};
