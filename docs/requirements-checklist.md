# Requirements Checklist

## Minimum Product Requirements

- Ingest data: implemented in the browser via CSV upload and in the CRM API via `POST /ingest`.
- Store customers and orders: implemented with in-memory customer/order collections for a dependency-free demo.
- Segment shoppers: implemented with manual filters and AI intent parsing.
- Send personalized communications: implemented with `{{name}}` replacement and per-shopper communication jobs.
- Use a separate channel service: implemented in `simulator-service/server.js`.
- Simulate communication lifecycle: implemented with sent, delivered, failed, opened, read, clicked, and converted/order events.
- Callback-driven receipt API: implemented with `POST /webhooks/channel-events`.
- Surface performance insights: implemented in dashboard metrics, lifecycle bars, activity feed, and AI insight cards.
- Shopper/consumer CRM scope: focused on D2C marketing campaigns, not sales pipeline or support CRM.

## AI-Native Product Choices

- Natural-language command turns marketer intent into audience rules.
- Campaign writer drafts personalized copy and channel recommendation.
- Insights convert raw metrics into next-best-action guidance.

## Explicit Tradeoffs

- Data is in memory to keep the review demo runnable without external setup.
- A production version would add durable storage, auth, tenancy, idempotent webhook event IDs, and a real queue.
- LLM behavior is deterministic locally so the app runs without API keys.
