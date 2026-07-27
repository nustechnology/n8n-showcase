# automation-experience-center-n8n

n8n instance + the versioned workflow JSON that runs order automation for the
Automation Experience Center platform. This repo is the workflow engine: it
gets told a run should start by the backend repo (NestJS/Prisma), executes
the workflow, and calls back into the backend for everything that needs
state or a secret. It never talks to Shopify or holds tenant credentials.

## Quickstart

```bash
cp .env.example .env
openssl rand -hex 32   # paste into .env as N8N_ENCRYPTION_KEY
docker compose up -d
```

Open `http://localhost:5680`, complete the owner signup screen, then:

1. **Settings → n8n API → Create an API key** — hand the raw key to whoever
   owns the backend repo (it belongs in *their* `.env`, not this one).
2. Generate a shared internal-service secret (`openssl rand -hex 32`), store
   it as a **Header Auth credential** in n8n (name `Backend Internal Token`,
   header `Authorization`, value `Bearer <secret>`), and hand the same raw
   value to the backend repo.
3. Build the workflow against the contract below, export it via the n8n UI
   (three-dot menu → Download) into `workflows/`, and commit it. Re-export
   after every change made in the n8n UI — the exported JSON is this repo's
   source of truth; the live workflow in the n8n UI is just the working copy.

## The contract with the backend repo

- **Backend → this repo**: a Webhook node (path `order-received`), Header
  Auth against the shared-secret credential, payload
  `{ tenantId, orderId, correlationId }`.
- **This repo → backend**: HTTP Request nodes calling the backend's
  `/internal/*` API — order/run bookkeeping (`workflow-runs`,
  `ai/validate-order`, `orders/:id/status`, `orders/:id/events`,
  `workflow-runs/:id/steps`) plus per-provider integration actions
  (`integrations/zoho/check-inventory`, `integrations/easypost/create-shipment`,
  `integrations/shopify/update-order`, `integrations/slack/send-message`) —
  each authenticated with the same shared-secret Header Auth credential as
  an `Authorization: Bearer <token>` header.

The backend's `/internal/*` API is built and wired up: a Shopify order
webhook now triggers this repo's Webhook node automatically, and this
repo's HTTP Request nodes call back into the backend for everything else.

**The order-validation workflow now runs the full fulfillment pipeline**,
not just validation. On the `valid` branch, after `Mark Validated`, the
workflow checks inventory (Zoho), creates a shipment (EasyPost — swapped
from the originally-planned ShipStation), writes the tracking number back
to Shopify, and posts a Slack notification, before closing the run. Every
step records its own status via `POST .../workflow-runs/:id/steps`
(`check_inventory`, `create_shipment`, `update_shopify`, `notify_slack`).
Inventory, shipment, and Shopify-writeback failures are hard failures —
they mark the order `FAILED` and close the run immediately. The Slack
notification is deliberately best-effort (`onError: continueRegularOutput`
on that node): a Slack outage never fails an otherwise-successful order.
This repo still never touches a Zoho/EasyPost/Slack/Shopify credential —
every third-party call happens on the backend side.

**Retries are a courtesy for brief blips, not a substitute for the circuit
breaker's own cooldown.** `Check Inventory`/`Create Shipment`/`Update
Shopify`/`Notify Slack` retry (3 tries, a few seconds apart) — deliberately
short, and deliberately *not* sized to outlast the backend's circuit breaker
reset timeout (30s for Zoho/EasyPost/Shopify, 15s for Slack — see
`CircuitBreakerService` in the backend repo). A real circuit trip will
outlive every retry in this workflow and fail the order once; recovery is
the tenant-facing "Retry" action on the failed workflow run
(`POST /workflow-runs/:id/retry`), not a longer in-workflow wait. This is
why the three "Mark Order Failed" nodes tag `reason: 'circuit_open'`
distinctly from a real failure (`insufficient_stock`/
`shipment_creation_failed`/`shopify_update_failed`) — the backend repo's FE
surfaces that reason on the order timeline, which is the actual signal a
human acts on to know a retry is worth trying.

That reason tag is read from the failed HTTP Request node's own error
output — `item.json.error.message`, checked for the literal `"CircuitOpen"`
string (the backend's actual `error` code), not the human-readable message
text those exceptions carry. Match the *code*, not the copy, if you touch
this logic — message text is free to change independently on the backend
side. (`item.json.error` on one of these nodes is an object —
`{ message, name, stack, code, status }` — not a plain string; verified
directly against a live n8n execution, not assumed from reading the node
config.)

**Reaching the backend from inside this container**: the backend runs as a
plain host process, not another service in this `docker-compose.yml`, so
`localhost` inside the n8n container means the container itself, not the
host machine. `docker-compose.yml` adds
`extra_hosts: ["host.docker.internal:host-gateway"]` for exactly this
reason — every HTTP Request node here points at
`http://host.docker.internal:<backend port>`, not `http://localhost:<port>`.
If the backend's port changes, update both the workflow (re-export after
editing in the UI) and confirm connectivity from inside the container:
`docker exec aec-n8n wget -qO- http://host.docker.internal:<port>/health`.

Full detail on every field, status, and what's explicitly out of scope (no
third-party credentials stored here, no public exposure, no per-tenant
workflow clones) lives in the handoff brief this repo was scaffolded from.
