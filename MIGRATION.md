# GitHub Actions daily rates

Cloudflare is discarded. The candidate keeps the same design and WhatsApp flow.
The live site still uses Supabase until the migration is deployed and verified.

## Operation

Actions runs at 04:17, 05:17 and 06:17 UTC (00:17, 01:17, 02:17 Dominican time).
Only the first successful fresh snapshot is used for the day. Later runs skip the provider call.
A persistent reservation is pushed before fetching; maximum 3 attempts/day and 95/month.
Errors never overwrite or re-date the prior snapshot. A missing/currently expired rate blocks all numeric quotes.
GitHub may delay scheduled jobs: after midnight, quotes remain blocked until the new rate is published.
Gold and FX are fetched in a single Metals.Dev request. The secret never reaches the browser.
The purchase formula runs in the browser: 75%, existing karat purities, half-up pesos.
Rates and the purchase percentage are public, as required for client-side calculation.
New quotes are not stored in a database. Over RD$500,000 requires direct valuation.

## Cutover checklist

1. Add repository Actions secret METALS_DEV_API_KEY (configured).
2. Set Pages build source to GitHub Actions, preventing unverified branch deployments.
3. Publish candidate files/workflow to main. Run workflow_dispatch; inspect successful fresh provider response and Pages deployment.
4. Check two quote calculations use the same daily snapshot, and mobile WhatsApp/design stay correct.
5. Check remaining provider quota, and reserve for any calls already made by Supabase this month.
6. Refresh the private eight-quote backup if live data changed. Delete Supabase only after successful replacement and the required confirmation.

Never use a personal access token in the browser or public code. GITHUB_TOKEN pushes do not trigger Pages builds, so this workflow explicitly deploys the static artifact. Concurrency serializes refresh and deployment runs. Workflow must live on the default branch for scheduling. Public scheduled workflows can be disabled after 60 days of repository inactivity; daily successful data commits normally keep this repository active, but workflow failures/disablement must be monitored. An expired snapshot is always blocked.

Local verification: npm test; node --check app.js; node --check scripts/refresh.mjs.
