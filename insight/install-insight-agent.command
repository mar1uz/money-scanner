#!/bin/bash
# One-time install of the JEV Insight daily runner as a user LaunchAgent.
# Double-click to install. After this, the insight pipeline runs every day at
# 07:45 (after the deterministic morning scan) and whenever a request file is
# dropped into ~/antigravity/Money Scanner/insight/requests/ by the bridge.
# The AI Gateway key stays in jev-router/.env.local and is never copied,
# printed, or logged. No changes to the app, only local report files.
set -e
REPO="$HOME/antigravity/Money Scanner"
LABEL="no.moneyscanner.jev-insight"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$REPO/insight/requests"
chmod +x "$REPO/insight/run-insight.sh"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$REPO/insight/run-insight.sh</string><string>--run</string></array>
  <key>WatchPaths</key>
  <array><string>$REPO/insight/requests</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>45</integer></dict>
  <key>StandardOutPath</key><string>$REPO/insight/launchd.log</string>
  <key>StandardErrorPath</key><string>$REPO/insight/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Status: $(launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep state || echo unknown)"
echo "Daily run: 07:45 local. On-demand: drop a file into $REPO/insight/requests/"
echo "Check: $REPO/insight/run-insight.sh --status"
