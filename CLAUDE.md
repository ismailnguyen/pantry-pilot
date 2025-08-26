# Pantry Pilot

> **Purpose**: A small, production-ready service that looks up a pantry inventory, computes which items must be replenished before they run out, marks them in the inventory, and notifies the user. Written in **Node.js (ESM)** using **Ports & Adapters (Hexagonal) Architecture** with a clean domain core.

---

## 1) Objectives & Scope

* **Primary goal**: Prevent stockouts by emailing a periodic summary of items that should be reordered.
* **Inputs**: Inventory data (Google Sheets for v1).
* **Outputs**:
  * Inventory updates (mark items that need replenishment, add metadata).
  * Email notification with a clear list of items to buy, where to buy them, and by when.
* **Triggering**:
  * Manual via REST API endpoint.
  * Scheduled via GitHub Actions cron calling the API.
* **Non‑goals (v1)**: UI, multi-user auth/roles, complex forecasting or price comparison.

---

## 2) Architecture — Ports & Adapters

### 2.1 High-Level

* **Core domain (pure JS, no I/O)**
  * Entities, value objects, domain services, and use case (`CheckAndNotifyReplenishment`).
  * Operates only on abstractions (ports). No external library imports inside domain.
* **Adapters (outside core)**
  * **InventoryRepository** adapter: Google Sheets (read/write).
  * **Notifier** adapter: SMTP (Gmail via Nodemailer).
  * **Clock** adapter: provides current time (for deterministic tests).
  * **Logger** adapter: structured logging.
  * **HTTP API** adapter: Express route `POST /api/check-replenishment`.
  * **Config** adapter: env + request payload merger/validation.

### 2.2 Suggested Directory Layout

```
repo/
  package.json
  .env.example
  src/
    domain/
      entities/
        Product.js
      services/
        ReplenishmentPolicy.js
      ports/
        InventoryRepository.js   // interface (JSDoc typedef)
        Notifier.js              // interface
        Clock.js                 // interface
        Logger.js                // interface
      usecases/
        CheckAndNotifyReplenishment.js
      errors/
        DomainError.js
    adapters/
      inventory/
        googleSheets/
          GoogleSheetsInventoryRepository.js
      notify/
        email/
          SmtpEmailNotifier.js
      runtime/
        SystemClock.js
        PinoLogger.js
        EnvConfig.js
      http/
        server.js
        routes.js
        authApiKey.js
      mappers/
        SheetRowMapper.js
    app/
      compose.js      // wire ports to adapters
      index.js        // start HTTP server or run CLI (optional)
    tests/
      unit/
        ReplenishmentPolicy.spec.js
        CheckAndNotifyReplenishment.spec.js
      integration/
        InMemoryInventoryRepository.js
        InMemoryNotifier.js
        endToEnd.spec.js
  .github/
    workflows/
      trigger-inventory-check.yml
```

---

## 3) Domain Model (Core)

### 3.1 Entities & Value Objects

**Product**
* `id` (string) — stable identifier.
* `name` (string)
* `brand` (string | null)
* `unit` ("count" | "ml" | "g") — base unit of remaining stock & consumption.
* `qtyRemaining` (number) — in base `unit`.
* `avgDailyConsumption` (number | null) — average per day in base `unit`.
* `avgMonthlyConsumption` (number | null) — alternative to daily; if present and `avgDailyConsumption` is null, convert with 30.44.
* `lastReplenishedAt` (Date | null)
* `autoSubscription` ({ active: boolean, details?: string } | null)
* `buy` ({ place?: string, url?: string } | null)
* `leadTimeDays` (number) — expected supplier delivery time; default 2.
* `safetyStockDays` (number) — buffer days; default 3.
* `minOrderQty` (number | null) — minimum order multiple; default 1.
* `packSize` (number | null) — size per pack in base unit; used to round recommended qty.
* **Derived/Output fields** (written back by use case):
  * `needsReplenishment` (boolean)
  * `replenishByDate` (Date | null)
  * `recommendedOrderQty` (number | null)
  * `reason` (string | null)
  * `lastCheckAt` (Date)

**Assumptions**

* Units are consistent per product (e.g., if shampoo tracked in ml, both qtyRemaining and consumption are ml).
* Either daily or monthly avg consumption is provided (or both); at least one is required for decisioning.

### 3.2 Replenishment Policy (Deterministic)

**Definitions**

* `avgDaily = avgDailyConsumption ?? (avgMonthlyConsumption / 30.44)`
* If `avgDaily <= 0` or missing ⇒ cannot compute days to depletion ⇒ *skip decision* with reason `"insufficient_consumption_data"`.
* `daysUntilDepletion = qtyRemaining / avgDaily`
* `targetWindowDays = leadTimeDays + safetyStockDays`

**Decision Rules**

1. If `autoSubscription?.active === true` ⇒ mark `needsReplenishment = false`, reason `"auto_subscription_active"`, but still compute `daysUntilDepletion` for info.
2. If `daysUntilDepletion` is **NaN/∞/<=0** ⇒ mark as `needsReplenishment = true` with minimal recommended order (`minOrderQty || packSize || 1`), reason `"depleted_or_invalid"`.
3. Else if `daysUntilDepletion <= targetWindowDays` ⇒ `needsReplenishment = true`.
4. Else `needsReplenishment = false`.

**Replenish-By Date**

* `replenishByDate = now + max(0, daysUntilDepletion - leadTimeDays) days` (rounded down to date).

**Recommended Order Quantity**

* Aim to cover `targetWindowDays + reviewHorizonDays` ahead. Define `reviewHorizonDays` = 14 (configurable at request level).
* `targetCoverageDays = targetWindowDays + reviewHorizonDays`.
* `targetQty = ceil( max(0, targetCoverageDays * avgDaily - qtyRemaining) )`
* Apply `packSize` rounding if provided: round `targetQty` **up** to nearest multiple of `packSize`.
* Enforce `minOrderQty` if provided.

**Reason Codes** (opaque, stable):

* `"auto_subscription_active"`
* `"depleted_or_invalid"`
* `"within_target_window"`
* `"sufficient_stock"`
* `"insufficient_consumption_data"`

---

## 4) Ports (Domain Interfaces)

> Declare as **JSDoc typedefs** (since JS) so adapters must implement the same shape.

**InventoryRepository**

```js
/** @typedef {Object} InventoryRepository
 *  @property {() => Promise<Product[]>} listProducts
 *  @property {(updates: Product[]) => Promise<void>} saveProducts // saves derived fields only, non-destructive
 */
```

**Notifier**

```js
/** @typedef {Object} Notifier
 *  @property {(message: {subject: string, html?: string, text?: string}) => Promise<void>} send
 */
```

**Clock**

```js
/** @typedef {Object} Clock
 *  @property {() => Date} now
 */
```

**Logger**

```js
/** @typedef {Object} Logger
 *  @property {(obj: any, msg?: string) => void} info
 *  @property {(obj: any, msg?: string) => void} warn
 *  @property {(obj: any, msg?: string) => void} error
 */
```

---

## 5) Use Case (Core)

**`CheckAndNotifyReplenishment.execute(params)`**

* **Input**:

  * `policyOverrides?`: `{ targetWindowDays?, safetyStockDaysDefault?, reviewHorizonDays? }`
  * `notification?: { enabled: boolean, subjectPrefix?: string, dryRun?: boolean }`
* **Injected Ports**: `InventoryRepository`, `Notifier`, `Clock`, `Logger`.
* **Steps**:

  1. `products = repo.listProducts()`.
  2. For each product, compute decision according to policy.
  3. Build `updates[]` for products (set derived fields + `lastCheckAt = now`).
  4. If not `dryRun`, `repo.saveProducts(updates)`.
  5. Build email summary (HTML + plaintext) for those with `needsReplenishment = true`.
  6. If `notification.enabled && itemsToNotify.length > 0` then `notifier.send(message)`.
  7. Return a **result DTO** (pure data): counts, items, and metadata used (policy numbers, timestamps).

**Output (Result DTO)**

```ts
{
  checkedCount: number,
  needsReplenishmentCount: number,
  generatedAt: string, // ISO
  policy: { targetWindowDays: number, reviewHorizonDays: number },
  items: Array<{
    id: string,
    name: string,
    brand?: string,
    unit: string,
    qtyRemaining: number,
    avgDaily: number|null,
    daysUntilDepletion: number|null,
    needsReplenishment: boolean,
    recommendedOrderQty?: number|null,
    replenishByDate?: string|null,
    reason: string,
    buy?: { place?: string, url?: string }
  }>
}
```

---

## 6) Adapters (v1)

### 6.1 Inventory — Google Sheets

* **Library**: `googleapis`.
* **Auth**: Service Account recommended for server-to-server.

  * Share the Google Sheet with the Service Account email.
* **Env** (can also be provided in request body – see API):

  * `GOOGLE_SPREADSHEET_ID`
  * `GOOGLE_SHEET_NAME = Inventory`
  * `GOOGLE_CLIENT_EMAIL`
  * `GOOGLE_PRIVATE_KEY` (use `\n` newline escaped form)
* **Read**: Range `Inventory!A:Z` (configurable). Map rows ⇄ Product via mapper.
* **Write**: Only update derived columns (see schema) using batchUpdate by row index.
* **Failure modes**: network, 429 rate limit, auth. Adapter must translate to friendly errors and never crash the process.

### 6.2 Notifier — SMTP Email (Gmail)

* **Library**: `nodemailer`.
* **Auth**: Prefer **App Password** (if 2FA) or OAuth2. Spec default: App Password.
* **Env** (or provided in request):

  * `SMTP_HOST = smtp.gmail.com`
  * `SMTP_PORT = 465`
  * `SMTP_SECURE = true`
  * `SMTP_USER`
  * `SMTP_PASS`
  * `EMAIL_FROM` (e.g., "Inventory Bot [me@gmail.com](mailto:me@gmail.com)")
  * `EMAIL_TO` (comma-separated recipients)
* **Email content**: HTML table + plaintext fallback with columns: Name, Brand, Qty Remaining, Days Until Depletion, Replenish By, Recommended Qty, Buy Link.

### 6.3 HTTP API — Express

* **Auth**: API key via header `x-api-key`. Env: `API_KEY`.
* **Route**: `POST /api/check-replenishment`
* **Responsibilities**:

  * Validate and merge config from body + env (env is default; body may override **non-secret** fields; secrets may be passed inline only for local testing if `allowInlineSecrets` enabled by env toggle).
  * Construct adapters (inventory, notifier, clock, logger).
  * Call use case and return result DTO.
  * Optional `dryRun` flag: skip persistence + skip email send (but still compute result).

---

## 7) Data Schemas

### 7.1 Google Sheet Schema (tab: `Inventory`)

| Col | Header                    | Type    | Required | Notes                                   |
| --- | ------------------------- | ------- | -------- | --------------------------------------- |
| A   | id                        | string  | yes      | Stable unique id                        |
| B   | name                      | string  | yes      | "Shampoo X"                             |
| C   | brand                     | string  | no       | "BrandY"                                |
| D   | unit                      | enum    | yes      | `count` \| `ml` \| `g`                  |
| E   | qty\_remaining            | number  | yes      | In base unit                            |
| F   | avg\_daily\_consumption   | number  | no       | If blank, use monthly                   |
| G   | avg\_monthly\_consumption | number  | no       | If blank and daily blank ⇒ insufficient |
| H   | last\_replenished\_at     | date    | no       | ISO or sheet date                       |
| I   | auto\_subscription        | boolean | no       | TRUE/FALSE                              |
| J   | auto\_subscription\_note  | string  | no       | Optional details                        |
| K   | buy\_place                | string  | no       | e.g., "Amazon"                          |
| L   | buy\_url                  | string  | no       | link                                    |
| M   | lead\_time\_days          | number  | no       | default 2                               |
| N   | safety\_stock\_days       | number  | no       | default 3                               |
| O   | min\_order\_qty           | number  | no       | default 1                               |
| P   | pack\_size                | number  | no       | rounding multiple                       |
| Q   | needs\_replenishment      | boolean | OUT      | computed                                |
| R   | replenish\_by\_date       | date    | OUT      | computed                                |
| S   | recommended\_order\_qty   | number  | OUT      | computed                                |
| T   | reason                    | string  | OUT      | reason code                             |
| U   | last\_check\_at           | date    | OUT      | ISO timestamp                           |
| V   | notes                     | string  | no       | free text                               |

**Sample Row**

```
abc-001 | Shampoo Repair | BrandZ | ml | 250 | 8 |  | 2025-07-30 | FALSE |  | Amazon | https://... | 2 | 3 | 1 | 250 |  |  |  |  |  |
```

### 7.2 API — Request/Response JSON Schema (informal)

**Request (POST /api/check-replenishment)**

```json
{
  "auth": { "apiKey": "..." },
  "options": {
    "dryRun": false,
    "subjectPrefix": "[Home Inventory]",
    "reviewHorizonDays": 14,
    "overrideTargetWindowDays": null
  },
  "inventory": {
    "type": "google_sheets",
    "spreadsheetId": "${GOOGLE_SPREADSHEET_ID}",
    "sheetName": "Inventory"
  },
  "secrets": {
    "google": {
      "clientEmail": "${GOOGLE_CLIENT_EMAIL}",
      "privateKey": "${GOOGLE_PRIVATE_KEY}"
    },
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 465,
      "secure": true,
      "user": "${SMTP_USER}",
      "pass": "${SMTP_PASS}",
      "from": "Inventory Bot <me@gmail.com>",
      "to": "me@gmail.com, partner@gmail.com"
    }
  }
}
```

> **Security**: In production, omit `secrets` in body. The server should take them from environment. Allow body secrets only if `ALLOW_INLINE_SECRETS=true`.

**Response (200)** — mirrors the Result DTO:

```json
{
  "checkedCount": 27,
  "needsReplenishmentCount": 6,
  "generatedAt": "2025-08-25T07:30:12.123Z",
  "policy": { "targetWindowDays": 5, "reviewHorizonDays": 14 },
  "items": [
    {
      "id": "abc-001",
      "name": "Shampoo Repair",
      "brand": "BrandZ",
      "unit": "ml",
      "qtyRemaining": 250,
      "avgDaily": 8.0,
      "daysUntilDepletion": 31.25,
      "needsReplenishment": false,
      "reason": "sufficient_stock",
      "buy": { "place": "Amazon", "url": "https://..." }
    }
  ]
}
```

**Errors**

* `400` validation error: `{ code: "bad_request", details: [...] }`
* `401` missing/invalid API key
* `500` adapter error: `{ code: "adapter_error", adapter: "google_sheets", message: "..." }`

### 7.3 OpenAPI 3.0 (YAML)

```yaml
openapi: 3.0.3
info:
  title: Home Inventory Replenishment API
  version: 1.0.0
paths:
  /api/check-replenishment:
    post:
      security:
        - ApiKeyAuth: []
      summary: Trigger inventory check and optional email notification
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                options:
                  type: object
                  properties:
                    dryRun: { type: boolean }
                    subjectPrefix: { type: string }
                    reviewHorizonDays: { type: integer, minimum: 0 }
                    overrideTargetWindowDays: { type: integer, minimum: 0, nullable: true }
                inventory:
                  type: object
                  properties:
                    type: { type: string, enum: [google_sheets] }
                    spreadsheetId: { type: string }
                    sheetName: { type: string }
                secrets:
                  type: object
                  properties:
                    google:
                      type: object
                      properties:
                        clientEmail: { type: string }
                        privateKey: { type: string }
                    smtp:
                      type: object
                      properties:
                        host: { type: string }
                        port: { type: integer }
                        secure: { type: boolean }
                        user: { type: string }
                        pass: { type: string }
                        from: { type: string }
                        to: { type: string }
      responses:
        '200':
          description: Summary of replenishment decisions
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ResultDto'
        '400': { description: Bad Request }
        '401': { description: Unauthorized }
        '500': { description: Adapter/Internal Error }
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
  schemas:
    ResultDto:
      type: object
      properties:
        checkedCount: { type: integer }
        needsReplenishmentCount: { type: integer }
        generatedAt: { type: string, format: date-time }
        policy:
          type: object
          properties:
            targetWindowDays: { type: integer }
            reviewHorizonDays: { type: integer }
        items:
          type: array
          items:
            type: object
            properties:
              id: { type: string }
              name: { type: string }
              brand: { type: string, nullable: true }
              unit: { type: string, enum: [count, ml, g] }
              qtyRemaining: { type: number }
              avgDaily: { type: number, nullable: true }
              daysUntilDepletion: { type: number, nullable: true }
              needsReplenishment: { type: boolean }
              recommendedOrderQty: { type: number, nullable: true }
              replenishByDate: { type: string, format: date, nullable: true }
              reason: { type: string }
              buy:
                type: object
                properties:
                  place: { type: string }
                  url: { type: string }
```

---

## 8) Configuration & Secrets

* **Node**: `>= 20.x` (ESM). Set `"type": "module"` in `package.json`.
* **Env Vars** (server defaults):

  * `PORT=8080`
  * `API_KEY=<random-long-string>`
  * `TZ=Europe/Paris`
  * `ALLOW_INLINE_SECRETS=false`
  * Google: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_NAME`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`
  * SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_TO`
* **Secrets handling**: Never log secrets. Mask in logs. Private key must preserve newlines (use `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`).

---

## 9) Email Template (HTML & Text)

**Subject**: `${subjectPrefix} ${needsReplenishmentCount} item(s) need replenishment — ${YYYY-MM-DD}`

**HTML Body**

* Intro paragraph with `generatedAt` and policy window.
* Table columns: `Name | Brand | Remaining | Days Left | Replenish By | Recommended | Buy` (link if available).
* Footer: "Dry run" badge if applicable.

**Text Body**

* Same information in aligned text.

---

## 10) Logging & Observability

* Use `pino` logger adapter. Levels: info/warn/error.
* Log one line per request with timing and result counts.
* Do not include PII beyond item names.

---

## 11) Validation Rules

* Reject rows missing `id`, `name`, `unit`, or `qty_remaining` (log and skip with reason `"invalid_row"`).
* If both `avg_daily_consumption` and `avg_monthly_consumption` are missing ⇒ mark reason `"insufficient_consumption_data"` and **do not** set `needsReplenishment` unless `qty_remaining <= 0`.
* Units must be among `count|ml|g`.
* Numbers must be finite and ≥ 0 (except `avgDaily` can be null).

---

## 12) Pseudocode (Core Use Case)

```js
async function execute({ policyOverrides, notification }, { repo, notifier, clock, logger }) {
  const now = clock.now();
  const products = await repo.listProducts();
  const updates = [];
  const results = [];

  for (const p of products) {
    const avgDaily = p.avgDailyConsumption ?? (p.avgMonthlyConsumption ? p.avgMonthlyConsumption / 30.44 : null);
    if (p.autoSubscription?.active) {
      results.push({ ...info(p), avgDaily, daysUntilDepletion: safeDiv(p.qtyRemaining, avgDaily), needsReplenishment: false, reason: 'auto_subscription_active' });
      continue;
    }

    if (!avgDaily || avgDaily <= 0) {
      const needs = p.qtyRemaining <= 0;
      const rec = needs ? Math.max(1, p.minOrderQty || p.packSize || 1) : null;
      results.push({ ...info(p), avgDaily: null, daysUntilDepletion: null, needsReplenishment: needs, recommendedOrderQty: rec, reason: needs ? 'depleted_or_invalid' : 'insufficient_consumption_data' });
      if (needs) updates.push(deriveUpdate(p, { now, needs, rec, reason: 'depleted_or_invalid' }));
      continue;
    }

    const daysLeft = p.qtyRemaining / avgDaily;
    const safety = p.safetyStockDays ?? 3;
    const lead = p.leadTimeDays ?? 2;
    const review = (policyOverrides?.reviewHorizonDays ?? 14);
    const targetWindow = (policyOverrides?.overrideTargetWindowDays ?? (lead + safety));

    const needs = daysLeft <= targetWindow;
    let rec = null, replBy = null, reason = needs ? 'within_target_window' : 'sufficient_stock';
    if (needs) {
      const targetCoverage = targetWindow + review;
      const targetQty = Math.ceil(Math.max(0, targetCoverage * avgDaily - p.qtyRemaining));
      rec = roundUpToMultiple(Math.max(targetQty, p.minOrderQty || 1), p.packSize || 1);
      replBy = new Date(now.getTime() + Math.max(0, (daysLeft - lead)) * 86400000);
    }

    results.push({ ...info(p), avgDaily, daysUntilDepletion: daysLeft, needsReplenishment: needs, recommendedOrderQty: rec, replenishByDate: replBy?.toISOString().slice(0,10), reason });
    updates.push(deriveUpdate(p, { now, needs, rec, replBy, reason }));
  }

  if (!notification?.dryRun) await repo.saveProducts(updates);

  const itemsToNotify = results.filter(r => r.needsReplenishment);
  if ((notification?.enabled ?? true) && itemsToNotify.length > 0) {
    const message = renderEmail({ now, items: itemsToNotify, subjectPrefix: notification?.subjectPrefix });
    if (!notification?.dryRun) await notifier.send(message);
  }

  return { checkedCount: results.length, needsReplenishmentCount: itemsToNotify.length, generatedAt: now.toISOString(), policy: { targetWindowDays: updates.length ? (updates[0].targetWindowDays ?? undefined) : undefined, reviewHorizonDays: policyOverrides?.reviewHorizonDays ?? 14 }, items: results };
}
```

---

## 13) GitHub Action — Scheduled Trigger

**`.github/workflows/trigger-inventory-check.yml`**

```yaml
name: Trigger Inventory Check

on:
  schedule:
    - cron: '0 7 * * *'   # 07:00 Europe/Paris daily
  workflow_dispatch: {}

jobs:
  call-api:
    runs-on: ubuntu-latest
    steps:
      - name: Call check-replenishment endpoint
        env:
          API_URL: ${{ secrets.API_URL }}
          API_KEY: ${{ secrets.API_KEY }}
        run: |
          set -euo pipefail
          curl -sS -X POST "$API_URL/api/check-replenishment" \
            -H "Content-Type: application/json" \
            -H "x-api-key: $API_KEY" \
            -d '{"options": {"dryRun": false}}' | jq '.'
```

> Set repository **Secrets**: `API_URL`, `API_KEY`.

---

## 14) Dependencies

* Runtime: `express`, `pino`, `nodemailer`, `googleapis`, `zod` (validation), `helmet`, `cors` (optional).
* Dev/Test: `jest`, `supertest`, `eslint`.

---

## 15) Testing Strategy

* **Unit**:

  * `ReplenishmentPolicy` (table-driven: various `qtyRemaining`, `avgDaily`, lead/safety, packSize/minOrder constraints, auto-subscription).
  * `CheckAndNotifyReplenishment` with in-memory ports.
* **Integration**:

  * Google Sheets repo against a **dedicated test sheet** (guarded by env `ALLOW_LIVE_SHEETS_TESTS`).
  * SMTP notifier replaced with in-memory or `smtp-tester`.
* **E2E**: Spin Express server, hit API with fixture secrets, assert response + sheet written in test environment.

---

## 16) Operational Notes

* **Idempotency**: Domain writes only derived fields; running multiple times updates `last_check_at`. Email duplicates are acceptable in v1; later add `last_notified_at` if needed.
* **Rate Limiting**: Add simple middleware limiting to N requests/minute (optional) to protect endpoint.
* **Healthcheck**: `GET /healthz` returns `{ ok: true, time: ISO }`.
* **Time Zone**: process env `TZ` controls date-only fields; use UTC internally but format `YYYY-MM-DD` for sheet.

---

## 17) Example `.env.example`

```
PORT=8080
API_KEY=change-me-long-random
TZ=Europe/Paris
ALLOW_INLINE_SECRETS=false

GOOGLE_SPREADSHEET_ID=
GOOGLE_SHEET_NAME=Inventory
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
EMAIL_FROM="Inventory Bot <you@gmail.com>"
EMAIL_TO=you@gmail.com
```

---

## 18) Future Extensions (Out of Scope v1)

* Additional adapters: Notifier (Push/Telegram/Slack), Inventory (CSV, Airtable, Notion).
* Price tracking and best-vendor recommendation.
* Multi-household, multi-user.
* Basic web dashboard to edit inventory.
* Machine-learned consumption rates derived from replenishment history.

---

## 19) Acceptance Criteria (v1)

1. **Manual trigger**: Posting to `/api/check-replenishment` with valid API key computes decisions and returns a JSON summary.
2. **Sheet update**: When `dryRun=false`, derived columns (Q–U) are updated for all rows.
3. **Email**: If at least one item needs replenishment, an email is sent to `EMAIL_TO` with the correct table.
4. **Auto-subscription**: Items with `auto_subscription=TRUE` never trigger replenishment emails.
5. **Cron**: The GitHub Action successfully triggers the endpoint at the scheduled time.
6. **Tests**: Unit tests cover main policy branches; CI passes.

---

## 20) License & Ownership

* MIT license suggested. Secrets and personal data remain private; repository should not contain real secrets.
