# Xeno AI Campaign Copilot

An AI-native mini CRM for D2C brands to reach shoppers with intelligent audience segmentation, personalized campaign copy, simulated channel delivery, and live performance insights.

## Product Point of View

This prototype chooses one polished workflow instead of many shallow CRUD screens:

1. A marketer describes intent in natural language.
2. The copilot turns that intent into shopper segment rules.
3. It drafts personalized campaign copy with `{{name}}` variables.
4. The campaign is sent through a stubbed channel service.
5. Delivery, open, click, and order events flow back through webhooks.
6. The dashboard turns results into marketer-friendly insights.

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

To run the reviewable backend architecture:

```bash
npm run simulator
npm run backend
```

Or run all three:

```bash
npm run start:all
```

## Services

### Frontend

Path: `frontend/`

- Attractive glass UI with animated 3D depth.
- In-browser seed data for fast demos.
- AI command center, segment builder, campaign writer, live analytics, and architecture view.
- No external dependency required for the demo.

### CRM API

Path: `backend/server.js`

Endpoints:

- `POST /ingest`
- `GET /customers`
- `POST /segments/ai`
- `POST /campaigns`
- `POST /webhooks/channel-events`
- `GET /campaigns/:id/metrics`

Responsibilities:

- Owns customers, orders, segments, campaigns, communications, and metrics.
- Accepts customer/order imports as JSON or CSV text.
- Converts natural language prompts into practical segment rules.
- Dispatches communication jobs to the simulator.
- Receives callback events and updates communication state.

### Channel Simulator

Path: `simulator-service/server.js`

Endpoint:

- `POST /send`

Responsibilities:

- Accepts a communication request.
- Randomly simulates delivered, failed, opened, clicked, and converted outcomes.
- Emits a separate read event after opens to model richer channel lifecycles.
- Calls the CRM webhook asynchronously.

## Scale Assumptions and Tradeoffs

- This version uses in-memory data so reviewers can run it instantly.
- At production scale, customers/orders/communications would move to MongoDB or Postgres.
- Dispatch would move from `setTimeout` to Redis + BullMQ or a cloud queue.
- Webhook callbacks would be idempotent using event IDs and ordered with provider timestamps.
- Metrics would be incrementally materialized instead of recalculated from communication rows.
- Real OpenAI calls are represented by deterministic local logic to keep the demo runnable without secrets.

## Demo Script

Use this flow for a 5-6 minute walkthrough:

1. Product intro: "AI Campaign Copilot for D2C brands."
2. Click "Launch comeback campaign" and show the AI-generated segment and message.
3. Watch delivery analytics update as the simulator sends callbacks.
4. Explain the CRM API, simulator service, and webhook receipt loop.
5. Open `backend/server.js` and `simulator-service/server.js` to show the lifecycle model.
6. Explain tradeoffs: in-memory now, queue/database/idempotency at scale.
