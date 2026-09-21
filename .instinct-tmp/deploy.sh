#!/bin/bash
cd "/Users/marius/antigravity/Money Scanner"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.12
rm -f .instinct-tmp/deploy.done .instinct-tmp/deploy.log
(
  git add -A packages/notifications apps/api apps/web scripts/instinct-content-publisher.mjs
  git commit -m "Alert test label fix + viewed-timeframe bell + asset-profile takes + on-chain metrics + i18n compound ages

- alert-dispatcher: forced test sends now show TEST ALERTA - STARE CURENTA with 'fara tranzitie' instead of a bogus identical-tier flip
- /api/alerts/test accepts timeframe (validated 1h..1m, default 1h); asset-page bell and modal pass the currently viewed timeframe
- ai-routes/publisher accept asset-profile-<SYM> keys (same outbox contract, 36h freshness, EN+RO)
- scanner asset-detail serves assetProfile takes + new onchain metrics (CoinGecko supply/ATH/ATL/vol-mcap, DefiLlama TVL/fees where listed)
- new OnchainDataCard + AssetProfileOverviewCard instinctTake render on the asset AI tab
- i18n: compound 'acum X zile si Y ore' / 'X ore si Y minute' patterns before simple ones; singular zi/ora forms"
  SHA=$(git rev-parse --short HEAD)
  echo "committed=$SHA"
  gcloud builds submit --config cloudbuild.yaml --substitutions=COMMIT_SHA=$SHA --async . 2>&1 | tail -8
  touch .instinct-tmp/deploy.done
) > .instinct-tmp/deploy.log 2>&1
