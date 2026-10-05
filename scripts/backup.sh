#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Kasku Backup Script
# pg_dump → gzip → openssl encrypt → rclone upload to cloud
# Retention: 14 daily + 6 monthly
# Usage: ./scripts/backup.sh
# Schedule: cron 02:30 daily (cron expression: 30 2 * * *)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ──────────────────────────────────────────────────
DB_NAME="${DB_NAME:-kasku}"
DB_USER="${DB_USER:-kasku}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DATABASE_URL="${DATABASE_URL:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
BACKUP_ENCRYPT_PASSWORD="${BACKUP_ENCRYPT_PASSWORD:-}"
BACKUP_RETENTION_DAYS=14
BACKUP_RETENTION_MONTHS=6

# rclone remote (set RCLONE_REMOTE in .env, e.g. "gdrive:kasku-backups")
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive:kasku-backups}"
RCLONE_CONF="${RCLONE_CONFIG:-${HOME}/.config/rclone/rclone.conf}"

# Local staging
BACKUP_DIR="${BACKUP_DIR:-/tmp/kasku-backups}"
STAMP="$(date '+%Y%m%d_%H%M%S')"
DOW="$(date '+%a')"
DAY="$(date '+%d')"

mkdir -p "${BACKUP_DIR}"
cd "${BACKUP_DIR}"

# ── Log ─────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log_start() { log "=== Starting backup: ${STAMP} ==="; }
log_end()   { log "=== Backup complete: ${STAMP} ==="; }
log_error() { log "ERROR: $*" >&2; }

# ── Pre-flight ──────────────────────────────────────────────
if [[ -z "${DATABASE_URL}" && -z "${DB_HOST}" ]]; then
  log_error "DATABASE_URL or DB_HOST not set"
  exit 1
fi

if [[ -z "${BACKUP_ENCRYPT_PASSWORD}" ]]; then
  log_error "BACKUP_ENCRYPT_PASSWORD not set"
  exit 1
fi

# ── 1. pg_dump ──────────────────────────────────────────────
PGDUMP_FILE="kasku_${STAMP}.sql"
log "Dumping database ${DB_NAME}..."
if [[ -n "${DATABASE_URL}" ]]; then
  PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump "${DATABASE_URL}" \
    --no-owner \
    --no-acl \
    --exclude-table='pg_*' \
    --exclude-table='sqlit_*' \
    --file="${PGDUMP_FILE}" \
    2>&1 | tail -5
else
  PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" "${DB_NAME}" \
    --no-owner \
    --no-acl \
    --file="${PGDUMP_FILE}" \
    2>&1 | tail -5
fi
log "Dump done: ${PGDUMP_FILE} ($(du -sh "${PGDUMP_FILE}" | cut -f1))"

# ── 2. gzip ─────────────────────────────────────────────────
log "Compressing..."
gzip -6 < "${PGDUMP_FILE}" > "${PGDUMP_FILE}.gz"
rm -f "${PGDUMP_FILE}"
GZ_FILE="${PGDUMP_FILE}.gz"
log "Compression done: ${GZ_FILE} ($(du -sh "${GZ_FILE}" | cut -f1))"

# ── 3. openssl encrypt ─────────────────────────────────────
ENC_FILE="${GZ_FILE}.enc"
log "Encrypting..."
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -pass "pass:${BACKUP_ENCRYPT_PASSWORD}" \
  -in "${GZ_FILE}" \
  -out "${ENC_FILE}"
rm -f "${GZ_FILE}"
log "Encryption done: ${ENC_FILE} ($(du -sh "${ENC_FILE}" | cut -f1))"

# ── 4. rclone upload ───────────────────────────────────────
log "Uploading to ${RCLONE_REMOTE}..."
# Create daily backup
RCLONE_DEST="${RCLONE_REMOTE}/daily/${STAMP}.sql.gz.enc"
if ! rclone copyto "${ENC_FILE}" "${RCLONE_DEST}" \
  --config="${RCLONE_CONF}" \
  --progress \
  --log-level ERROR \
  --retries 3; then
  log_error "rclone upload failed"
  rm -f "${ENC_FILE}"
  exit 1
fi

# ── 5. Monthly backup (keep 6 months) ───────────────────────
if [[ "${DAY}" == "01" ]]; then
  log "Creating monthly backup..."
  RCLONE_MONTH_DEST="${RCLONE_REMOTE}/monthly/$(date '+%Y-%m').sql.gz.enc"
  rclone copyto "${ENC_FILE}" "${RCLONE_MONTH_DEST}" \
    --config="${RCLONE_CONF}" \
    --log-level ERROR \
    --retries 3
  log "Monthly backup: ${RCLONE_MONTH_DEST}"
fi

# ── 6. Prune local files ───────────────────────────────────
rm -f "${ENC_FILE}"
log "Local file cleaned."

# ── 7. Retention: prune rclone daily (keep 14) ─────────────
log "Applying retention policy (daily: ${BACKUP_RETENTION_DAYS}, monthly: ${BACKUP_RETENTION_MONTHS})..."
rclone ls "${RCLONE_REMOTE}/daily/" --config="${RCLONE_CONF}" --log-level ERROR \
  | awk '{print $2}' \
  | sort \
  | head -n -"${BACKUP_RETENTION_DAYS}" \
  | while read -r f; do
  rclone delete "${RCLONE_REMOTE}/daily/${f}" --config="${RCLONE_CONF}" --log-level ERROR
  log "Pruned daily: ${f}"
done

# ── 8. Retention: prune monthly (keep 6) ────────────────────
rclone ls "${RCLONE_REMOTE}/monthly/" --config="${RCLONE_CONF}" --log-level ERROR \
  | awk '{print $2}' \
  | sort \
  | head -n -"${BACKUP_RETENTION_MONTHS}" \
  | while read -r f; do
  rclone delete "${RCLONE_REMOTE}/monthly/${f}" --config="${RCLONE_CONF}" --log-level ERROR
  log "Pruned monthly: ${f}"
done

log_end
