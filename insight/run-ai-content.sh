#!/bin/bash
# AI content writer executor - runs in the trusted host context (user
# LaunchAgent), OUTSIDE the connector sandbox. Sources the AI Gateway key from
# jev-router/.env.local with Marius's own file permissions and publishes the
# generated takes through the token-protected publish endpoint.
cd "<local-path>/Money Scanner"
exec /opt/homebrew/bin/node scripts/ai-content-writer.mjs
