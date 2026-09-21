#!/bin/bash
cd "/Users/marius/antigravity/Money Scanner"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.12
rm -f .instinct-tmp/deploy2.done .instinct-tmp/deploy2.log
(
  echo "== files differing from committed 8d0cdb2 (should be exactly the 5 reverted) =="
  git status --porcelain
  echo "== tsc =="
  (cd packages/notifications && npx tsc --noEmit) && echo notif_ok
  (cd apps/api && npx tsc --noEmit) && echo api_ok
  (cd apps/web && npx tsc --noEmit) && echo web_ok
  git add -A
  git commit --amend -m "Asset-profile Instinct takes + on-chain metrics section + i18n compound flip ages

- ai-routes/publisher accept asset-profile-<SYM> keys (same outbox contract as investment-guide, 36h freshness, EN+RO)
- asset-detail API serves assetProfile takes plus new onchain metrics: supply/unlock %, ATH/ATL distance, volume/mcap (CoinGecko), TVL + TVL/mcap + 24h protocol fees (DefiLlama, by gecko_id, omitted when not listed)
- new OnchainDataCard on the asset AI tab; AssetProfileOverviewCard renders the Instinct take above the template profile
- i18n: compound 'acum X zile si Y ore' / 'acum X ore si Y minute' patterns before simple ones, singular zi/ora forms
- bell/test-alert behavior intentionally untouched per Marius"
  SHA=$(git rev-parse --short HEAD)
  echo "committed=$SHA"
  gcloud builds submit --config cloudbuild.yaml --substitutions=COMMIT_SHA=$SHA --async . 2>&1 | grep -E "Created|ID|QUEUED|builds/" | head -4
  touch .instinct-tmp/deploy2.done
) > .instinct-tmp/deploy2.log 2>&1
