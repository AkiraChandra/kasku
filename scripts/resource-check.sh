#!/bin/bash
# Exit 0 if PASS, 1 if FAIL
# Checks: RAM >= 400MB, swap < 300MB, disk < 80%, no OOM, kasku containers running

FAIL=0

# Check: available RAM (free + cache/buffers) >= 400MB
AVAILABLE=$(grep -E '^MemAvailable:' /proc/meminfo | awk '{print $2}')
if [ -z "$AVAILABLE" ]; then
  AVAILABLE=$(awk '/^MemFree:/{free=$2} /^Cached:/{cached=$2} END{print free+cached}' /proc/meminfo)
fi
AVAILABLE_MB=$((AVAILABLE / 1024))
if [ "$AVAILABLE_MB" -ge 400 ]; then
  echo "PASS: Available RAM ${AVAILABLE_MB}MB >= 400MB"
else
  echo "FAIL: Available RAM ${AVAILABLE_MB}MB < 400MB"
  FAIL=1
fi

# Check: swap used < 300MB
SWAP_USED=$(grep -E '^SwapTotal:' /proc/meminfo | awk '{print $2}')
if [ -n "$SWAP_USED" ] && [ "$SWAP_USED" -gt 0 ]; then
  SWAP_AVAIL=$(grep -E '^SwapFree:' /proc/meminfo | awk '{print $2}')
  SWAP_USED_KB=$((SWAP_TOTAL - SWAP_AVAIL))
  SWAP_USED_MB=$((SWAP_USED_KB / 1024))
  if [ "$SWAP_USED_MB" -lt 300 ]; then
    echo "PASS: Swap used ${SWAP_USED_MB}MB < 300MB"
  else
    echo "FAIL: Swap used ${SWAP_USED_MB}MB >= 300MB (system under memory pressure)"
    FAIL=1
  fi
else
  echo "PASS: Swap not in use (0MB)"
fi

# Check: disk usage < 80%
ROOT_PCT=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$ROOT_PCT" -lt 80 ]; then
  echo "PASS: Disk usage ${ROOT_PCT}% < 80%"
else
  echo "FAIL: Disk usage ${ROOT_PCT}% >= 80%"
  FAIL=1
fi

# Check: no OOM in dmesg recently
if dmesg -T 2>/dev/null | grep -q "Out of memory"; then
  OOM_RECENT=$(dmesg -T 2>/dev/null | grep "Out of memory" | tail -1)
  echo "FAIL: OOM detected: $OOM_RECENT"
  FAIL=1
else
  echo "PASS: No OOM in dmesg"
fi

# Check: all kasku containers running
for svc in caddy api postgres; do
  CONTAINER=$(docker compose ps -q "$svc" 2>/dev/null)
  if [ -n "$CONTAINER" ]; then
    RUNNING=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)
    if [ "$RUNNING" = "true" ]; then
      echo "PASS: Container $svc is running"
    else
      echo "FAIL: Container $svc is NOT running"
      FAIL=1
    fi
  else
    echo "FAIL: Container $svc not found"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "=== ALL CHECKS PASSED ==="
  exit 0
else
  echo ""
  echo "=== SOME CHECKS FAILED ==="
  exit 1
fi
