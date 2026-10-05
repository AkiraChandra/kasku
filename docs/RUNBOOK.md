# Kasku Runbook

## Baseline Resources

DiuKur pada 5 Oktober 2026 (Live Container Measurement):

| Service    | Memory Limit | Expected Baseline | Alert Threshold |
|------------|-------------|-------------------|-----------------|
| postgres   | 256MB       | ~10.4 MB          | >200MB          |
| api        | 192MB       | ~15.7 MB          | >150MB          |
| caddy      | 64MB        | ~24.6 MB          | >50MB           |

Total Kasku stack: ~50.7 MB RAM.

## Backup Procedure

1. Trigger pg_dump (Plain SQL Gzip):
   ```bash
   bash scripts/backup.sh
   ```

2. Manual trigger:
   ```bash
   docker compose exec -T postgres pg_dump -U kasku kasku | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
   ```

## Restore Procedure

1. Test restore via script:
   ```bash
   bash scripts/backup-restore-test.sh
   ```

2. Manual restore:
   ```bash
   docker compose stop api
   gunzip -c backup_<timestamp>.sql.gz | docker compose exec -T postgres psql -U kasku kasku
   docker compose start api
   ```

## Key Rotation

### AUTH_SECRET / EVENT_HMAC_SECRET

1. Generate new secret:
   ```bash
   openssl rand -base64 32
   ```

2. Update `.env`:
   ```bash
   # Update AUTH_SECRET and/or EVENT_HMAC_SECRET
   ```

3. Restart api:
   ```bash
   docker compose up -d api
   ```

4. Existing sessions will be invalidated (users must re-login).

## Resource Alert Thresholds

| Metric            | Warning | Critical |
|-------------------|---------|----------|
| Container memory  | 80%     | 90%      |
| Disk usage        | 70%     | 80%      |
| Available RAM     | <500MB  | <400MB   |
| Swap usage        | >200MB  | >300MB   |

## Health Checks

```bash
# Check all containers
docker compose ps

# Check api health
curl http://localhost/health

# Check postgres
docker compose exec postgres pg_isready -U kasku
```
