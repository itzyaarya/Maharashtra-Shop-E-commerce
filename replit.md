# JV Electric Works

Responsive JV Electric Works storefront for electrical, solar, mobile phone and repair services, backed by a Hono Worker and Cloudflare D1. Supports retail and approved trade orders, inventory, shipping quotes, repairs and an owner dashboard.

## Run & operate

- Storefront preview: workflow `artifacts/maharashtra-electrical-store: web`
- Local API + D1: workflow `artifacts/api-server: API Server`
- `pnpm run typecheck` — workspace typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate client hooks and request validators from OpenAPI
- Cloudflare setup and deployment: `artifacts/api-server/README.md`

## Stack and source of truth

- Storefront: React, Vite, Tailwind CSS, lightweight query hooks in `artifacts/maharashtra-electrical-store`
- API: Cloudflare Workers, Hono, Cloudflare Access JWT validation in `artifacts/api-server/src`
- Database: Cloudflare D1; migration and demo seed data in `artifacts/api-server/migrations`
- API contract: `lib/api-spec/openapi.yaml`; generated clients and Zod validators live in `lib/api-client-react` and `lib/api-zod`
- Cloudflare configuration: `artifacts/api-server/wrangler.toml`

## Operating notes

- The database migration seeds demonstration products, stock, shipping zones, and prices. Replace and verify those values, pincode coverage, and GST rates before accepting live orders.
- Checkout supports COD, cash at shop pickup, and manual UPI confirmation. No payment gateway is wired in.
- Admin routes fail closed until Cloudflare Access is configured. Protect the production hostname with an owner-only Access policy.
- Owner dashboard notices are immediate. An optional `OWNER_WEBHOOK_URL` creates a retried webhook outbox.
- Trade approval currently uses the approved customer's phone number at checkout; add phone verification or a trade access-code flow before relying on wholesale discounts for sensitive pricing.

## Product

Customers can browse products, choose variants, quote regional shipping, submit an order, request a mobile repair, and apply for a trade account. Owners can process orders, reconcile payments, receive stock batches, adjust inventory, review repairs and trade applications, and inspect sales and low-stock alerts.
