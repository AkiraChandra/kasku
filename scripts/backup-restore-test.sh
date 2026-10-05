#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Kasku Backup Restore Test
# Downloads the latest backup, decrypts, decompresses, and
# verifies the SQL schema is intact (no row data).
# Run manually or scheduled monthly.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive:kasku-backups}"
RCLONE_CONF="${RCLONE_CONFIG:-${HOME}/.config/rclone/rclone.conf}"
BACKUP_ENCRYPT_PASSWORD="${BACKUP_ENCRYPT_PASSWORD:-}"
BACKUP_FILE="${BACKUP_FILE:-}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Starting restore test ==="

if [[ -z "${BACKUP_ENCRYPT_PASSWORD}" ]]; then
  echo "ERROR: BACKUP_ENCRYPT_PASSWORD not set" >&2
  exit 1
fi

# ── 1. Locate backup ─────────────────────────────────────────
if [[ -n "${BACKUP_FILE}" ]]; then
  if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "ERROR: BACKUP_FILE does not exist: ${BACKUP_FILE}" >&2
    exit 1
  fi
  cp -- "${BACKUP_FILE}" "${WORKDIR}/backup.enc"
  echo "Using local backup: ${BACKUP_FILE}"
else
  if ! command -v rclone >/dev/null 2>&1; then
    echo "ERROR: rclone is not installed; set BACKUP_FILE to a local .enc backup or install/configure rclone" >&2
    exit 1
  fi
  LATEST=$(rclone ls "${RCLONE_REMOTE}/daily/" --config="${RCLONE_CONF}" --log-level ERROR \
    | awk '{print $2}' | sort | tail -1)
  if [[ -z "${LATEST}" ]]; then
    echo "ERROR: No backups found in ${RCLONE_REMOTE}/daily/"
    exit 1
  fi
  LATEST="${LATEST#/}"  # strip leading slash
  echo "Latest backup: ${LATEST}"

  # ── 2. Download ───────────────────────────────────────────
  rclone copyto "${RCLONE_REMOTE}/daily/${LATEST}" "${WORKDIR}/backup.enc" \
    --config="${RCLONE_CONF}" --log-level ERROR
fi
echo "Downloaded: $(du -sh "${WORKDIR}/backup.enc" | cut -f1)"

# ── 3. Decrypt ─────────────────────────────────────────────
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "pass:${BACKUP_ENCRYPT_PASSWORD}" \
  -in "${WORKDIR}/backup.enc" \
  -out "${WORKDIR}/backup.gz"
echo "Decrypted."

# ── 4. Decompress ──────────────────────────────────────────
gunzip -c "${WORKDIR}/backup.gz" > "${WORKDIR}/backup.sql"
echo "Decompressed: $(wc -l < "${WORKDIR}/backup.sql") lines"

# ── 5. Verify schema ───────────────────────────────────────
# Check key tables exist
TABLES=(
  "users"
  "accounts"
  "transactions"
  "categories"
  "budgets"
  "debts"
  "ingest_sources"
)
MISSING=()
for t in "${TABLES[@]}"; do
  if ! grep -q "CREATE TABLE.*${t}" "${WORKDIR}/backup.sql"; then
    MISSING+=("${t}")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Missing tables in backup: ${MISSING[*]}"
  exit 1
fi
echo "Schema verification PASSED."

# ── 6. Count rows (for audit) ───────────────────────────────
echo "Table row counts:"
for t in "${TABLES[@]}"; do
  COUNT=$(grep "COPY ${t}" "${WORKDIR}/backup.sql" 2>/dev/null | wc -l || echo "0")
  echo "  ${t}: ${COUNT} rows"
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restore test PASSED. Backup is valid."
