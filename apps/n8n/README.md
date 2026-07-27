# n8n Workflow Engine

Order automation workflow executed by n8n. This is one of three apps in the
`@n8n-showcase` turborepo monorepo — the backend (NestJS) triggers workflows,
n8n executes them, and calls back into the backend's `/internal/*` API for
everything that needs state or credentials. n8n never touches Shopify or
holds tenant credentials.

## Quickstart

The root `docker-compose.yml` starts n8n alongside the backend and frontend:

```bash
cp ../.env.example ../.env
# Fill in N8N_ENCRYPTION_KEY, N8N_INTERNAL_TOKEN, etc.

# From the monorepo root:
docker compose up -d n8n
```

Open `http://localhost:5680`, complete the owner signup screen, then:

1. **Settings → n8n API → Create an API key** — copy it, set `N8N_API_KEY`
   in the root `.env`.
2. Generate a shared internal-service secret (`openssl rand -hex 32`), set
   it as `N8N_INTERNAL_TOKEN` in the root `.env`, then create a **Header
   Auth credential** in n8n:
   - Name: `Backend Internal Token`
   - Header: `Authorization`
   - Value: `Bearer <N8N_INTERNAL_TOKEN value>`
3. Import the workflow:
   - Go to **Import** → **File** and select
     `workflows/order-validation.json`
   - Update all HTTP Request node URLs to `http://backend:3000/...`
     (the backend's Docker Compose service name)
4. Build the workflow against the contract below. Export it via the n8n UI
   (three-dot menu → Download) into `workflows/`, and commit it. Re-export
   after every change made in the n8n UI — the exported JSON is the source
   of truth; the live workflow in the n8n UI is just the working copy.

## The contract with the backend

- **Backend → n8n**: Webhook node (path `order-received`), Header Auth
  against the shared-secret credential, payload
  `{ tenantId, orderId, correlationId }`.
- **n8n → backend**: HTTP Request nodes calling the backend's
  `/internal/*` API — order/run bookkeeping (`workflow-runs`,
  `ai/validate-order`, `orders/:id/status`, `orders/:id/events`,
  `workflow-runs/:id/steps`) plus per-provider integration actions
  (`integrations/zoho/check-inventory`, `integrations/easypost/create-shipment`,
  `integrations/shopify/update-order`, `integrations/slack/send-message`) —
  each authenticated with the same Header Auth credential as an
  `Authorization: Bearer <token>` header.

The backend's `/internal/*` API is built and wired up: a Shopify order
webhook now triggers this workflow's Webhook node automatically, and the
HTTP Request nodes call back into the backend for everything else.

## Service networking (monorepo Docker Compose)

All three apps run in the same Docker Compose network:

- Backend → `http://backend:3000`
- Frontend → `http://frontend:3001`
- n8n → `http://n8n:5678`

Update all HTTP Request nodes in the workflow to use `http://backend:3000`
as the base URL instead of `host.docker.internal` (the old approach when
the backend ran as a host process). Verify connectivity:

```bash
docker exec n8n-showcase-n8n wget -qO- http://backend:3000/health
```

## Workflow pipeline

The order-validation workflow runs the full fulfillment pipeline, not
just validation. On the `valid` branch, after marking validated, the
workflow checks inventory (Zoho), creates a shipment (EasyPost), writes
the tracking number back to Shopify, and posts a Slack notification,
before closing the run.

Every step records its status via `POST .../workflow-runs/:id/steps`
(`check_inventory`, `create_shipment`, `update_shopify`, `notify_slack`).
Inventory, shipment, and Shopify-writeback failures are hard failures —
they mark the order `FAILED` and close the run immediately. The Slack
notification is deliberately best-effort (`onError: continueRegularOutput`
on that node): a Slack outage never fails an otherwise-successful order.

Circuit-breaker retries are a courtesy for brief blips, not a substitute
for the breaker's own cooldown. Each step retries 3 times, a few seconds
apart — deliberately not sized to outlast the backend's circuit breaker
reset timeout (30s for Zoho/EasyPost/Shopify, 15s for Slack). A real
circuit trip will outlast every retry and fail the order once; recovery
is the tenant-facing "Retry" action (`POST /workflow-runs/:id/retry`).

The `circuit_open` reason tag is read from the failed HTTP Request node's
error output — `item.json.error.code`, checked for the literal
`"CircuitOpen"` string, not the human-readable message text.
