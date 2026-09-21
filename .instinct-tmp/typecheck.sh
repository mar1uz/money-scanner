#!/bin/bash
cd "/Users/marius/antigravity/Money Scanner"
rm -f .instinct-tmp/tc.done .instinct-tmp/tc.log
( echo "== API tsc =="; cd apps/api && npx tsc --noEmit; echo "api_exit=$?"; cd ../..
  echo "== WEB tsc =="; cd apps/web && npx tsc --noEmit; echo "web_exit=$?"; cd ../..
  echo "== publisher node --check =="; node --check scripts/instinct-content-publisher.mjs; echo "pub_exit=$?"
  echo "== dispatcher test compile =="; cd packages/notifications && npx tsc --noEmit; echo "notif_exit=$?"
  touch ../../.instinct-tmp/tc.done ) > .instinct-tmp/tc.log 2>&1
