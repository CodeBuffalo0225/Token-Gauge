#!/bin/bash
# ── Token Gauge daemon control ─────────────────────────────
# Wraps launchctl so you don't have to remember the plist path.
#
# Usage:
#   ./daemon.sh start    # load + start at login
#   ./daemon.sh stop     # unload
#   ./daemon.sh restart
#   ./daemon.sh status
#   ./daemon.sh logs     # tail daemon.log

PLIST="$HOME/Library/LaunchAgents/com.codebuffalo.tokengauge.plist"
LABEL="com.codebuffalo.tokengauge"
LOG_DIR="$(cd "$(dirname "$0")" && pwd)"

case "$1" in
  start)
    launchctl load "$PLIST" && echo "✓ Token Gauge daemon loaded (runs at login, restarts on crash)"
    ;;
  stop)
    launchctl unload "$PLIST" && echo "✓ Token Gauge daemon stopped"
    ;;
  restart)
    launchctl unload "$PLIST" 2>/dev/null
    launchctl load "$PLIST" && echo "✓ Token Gauge daemon restarted"
    ;;
  status)
    if launchctl list | grep -q "$LABEL"; then
      line=$(launchctl list | grep "$LABEL")
      pid=$(echo "$line" | awk '{print $1}')
      exit_code=$(echo "$line" | awk '{print $2}')
      if [ "$pid" != "-" ]; then
        echo "✓ Running (PID $pid)"
      else
        echo "✗ Not running (last exit: $exit_code)"
      fi
    else
      echo "✗ Not loaded"
    fi
    ;;
  logs)
    tail -f "$LOG_DIR/daemon.log"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
