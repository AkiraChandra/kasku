import pg from 'pg'
import fs from 'node:fs/promises'
import path from 'node:path'

const { Pool } = pg
const migrationFiles = [
  '0000_cultured_unicorn.sql',
  '0001_solid_warhawk.sql',
  '0002_auth.sql',
  '0003_m1_finance.sql',
]

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kasku_schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const appliedResult = await client.query(
      'SELECT filename FROM kasku_schema_migrations ORDER BY filename',
    )
    const applied = new Set(appliedResult.rows.map((row) => row.filename))

    // Adopt a database created before migration tracking was added, only when
    // the complete auth schema is already present.
    if (applied.size === 0) {
      const legacy = await client.query(`
        SELECT
          to_regclass('public.users') IS NOT NULL AS has_users,
          to_regclass('public.sessions') IS NOT NULL AS has_sessions,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
          ) AS has_email
      `)
      const row = legacy.rows[0]
      if (row.has_users && row.has_sessions && row.has_email) {
        for (const filename of migrationFiles.slice(0, 3)) {
          await client.query(
            'INSERT INTO kasku_schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [filename],
          )
          applied.add(filename)
        }
        console.log('[migrate] Adopted existing pre-M1 schema')
      }
    }

    for (const filename of migrationFiles) {
      if (applied.has(filename)) continue

      const sql = await fs.readFile(path.join('/app/drizzle', filename), 'utf8')
      console.log(`[migrate] Applying ${filename}...`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO kasku_schema_migrations (filename) VALUES ($1)',
          [filename],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Migration ${filename} failed: ${message}`)
      }
    }

    console.log('[migrate] Schema is up to date')
  } finally {
    client.release()
    await pool.end()
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for migrations')
}

migrate().catch((error) => {
  console.error(`[migrate] ${error.message}`)
  process.exit(1)
})
