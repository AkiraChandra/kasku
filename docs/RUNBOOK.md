# Kasku Runbook

## Baseline Resources

> **TODO**: Fill from actual measurement after first deployment.

| Service    | Memory Limit | Expected Baseline | Alert Threshold |
|------------|-------------|-------------------|-----------------|
| postgres   | 256MB       | TBD MB            | >200MB          |
| api        | 192MB       | TBD MB            | >150MB          |
| caddy      | 64MB        | TBD MB            | >50MB           |

## Backup Procedure

1. Trigger pg_dump:
   ```bash
   docker compose exec postgres pg_dump -U kasku kasku > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. Encrypt backup:
   ```bash
   gpg --symmetric --cipher-algo AES256 backup_<timestamp>.sql
   rm backup_<timestamp>.sql
   ```

3. Upload to offsite storage (S3, rclone, etc.)

## Restore Procedure

1. Download and decrypt backup:
   ```bash
   gpg --decrypt backup_<timestamp>.sql.gpg > backup_restore.sql
   ```

2. Stop api:
   ```bash
   docker compose stop api
   ```

3. Restore:
   ```bash
   docker compose exec -T postgres psql -U kasku kasku < backup_restore.sql
   ```

4. Restart api:
   ```bash
   docker compose up -d api
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
curl http://localhost/api/health

# Check postgres
docker compose exec postgres pg_isready -U kasku
```
