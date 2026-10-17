# Cloudflare deployment

The Worker serves the API and the built storefront from one Cloudflare hostname. Local Replit previews use the separate Vite and Wrangler workflows.

## Local development

From the workspace root:

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run dev
```

The API workflow uses Wrangler's local D1 database under `artifacts/api-server/.wrangler/state`. Apply local migrations with:

```sh
cd artifacts/api-server
pnpm exec wrangler d1 migrations apply maharashtra-electrical-shop --local
```

## Prepare Cloudflare

1. From `artifacts/api-server`, create the D1 database:

   ```sh
   pnpm exec wrangler d1 create maharashtra-electrical-shop
   ```

2. Put the returned database ID in `wrangler.toml`, replacing the local placeholder.
3. Apply migrations to the remote database:

   ```sh
   pnpm exec wrangler d1 migrations apply maharashtra-electrical-shop --remote
   ```

4. Create a Cloudflare Access application for the production hostname. Restrict its policy to the shop owner. Configure the Worker's Access team domain and application audience:

   ```sh
   pnpm exec wrangler secret put CF_ACCESS_TEAM_DOMAIN
   pnpm exec wrangler secret put CF_ACCESS_AUD
   ```

   Optionally add `ADMIN_EMAIL_ALLOWLIST` as a comma-separated owner email list for an additional check.
5. Optionally configure an owner notification webhook:

   ```sh
   pnpm exec wrangler secret put OWNER_WEBHOOK_URL
   ```

## Build and deploy

The API package's build command builds the Vite storefront and performs a Wrangler dry run. Deploy after configuring D1 and Cloudflare Access:

```sh
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run deploy
```

The frontend uses same-origin `/api/v1` requests. The Worker handles `/api/*`; Cloudflare static assets serve the Vite build and route page refreshes through the SPA fallback.

## Before accepting real orders

- Replace the sample product catalog, prices, stock counts and batch data with verified shop records.
- Set the correct GST rate for each item and confirm whether displayed prices are tax-inclusive.
- Verify statewide cable coverage, restricted/fragile zones, pickup availability, shipping rates and free-shipping thresholds against the shop's actual carrier arrangements.
- Configure Cloudflare Access before exposing the admin dashboard. Admin routes return an error until Access is configured.
- Review the wholesale approval process. Current checkout matches approved trade accounts by phone number; phone verification or a secure trade access code is recommended before exposing wholesale pricing.
- COD and manual UPI are order-recording flows only. UPI payments are marked received manually in the admin dashboard; no payment gateway or automated payment verification is configured.
