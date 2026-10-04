/**
 * Seed data for Kasku development and initial setup.
 * Run via: npx tsx db/seed.ts (requires DATABASE_URL)
 *
 * Creates:
 * - Owner user with hashed password (SEED_OWNER_PASSWORD env)
 * - Default accounts: Tunai, BCA, GoPay, BRI
 * - Default expense categories (Indonesian)
 * - Default income categories (Indonesian)
 * - Channel identity for owner's WhatsApp number
 */

import pg from 'pg'
const { Pool } = pg
import { hashPassword } from '../src/lib/auth.js'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/kasku'
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'akira@kasku.local'
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'kasku-dev-password'
const OWNER_NAME = process.env.SEED_OWNER_NAME ?? 'Akira'
const OWNER_EXTERNAL_ID = process.env.SEED_OWNER_EXTERNAL_ID ?? 'akira@kasku.local'
const WA_NUMBER = process.env.SEED_WA_NUMBER ?? '6281290496017'
const OWNER_USER_ID = '00000000-0000-0000-0000-000000000001'

const EXPENSE_CATEGORIES = [
  { name: 'Makanan & Minuman', icon: '🍽', children: [
    { name: 'Makan di luar' },
    { name: 'Belanja dapur' },
    { name: 'Kopi & Jajan' },
  ]},
  { name: 'Transportasi', icon: '🚗', children: [
    { name: 'BBM' },
    { name: 'Parkir & Tol' },
    { name: 'Ojol' },
    { name: 'Servis Kendaraan' },
  ]},
  { name: 'Tagihan & Utilitas', icon: '📄', children: [
    { name: 'Listrik' },
    { name: 'Air' },
    { name: 'Internet' },
    { name: 'Pulsa & Data' },
    { name: 'Kos/Sewa' },
  ]},
  { name: 'Belanja', icon: '🛒', children: [
    { name: 'Kebutuhan Rumah' },
    { name: 'Pakaian' },
    { name: 'Elektronik' },
  ]},
  { name: 'Hiburan & Langganan', icon: '🎬', children: [
    { name: 'Netflix & Streaming' },
    { name: 'Game' },
    { name: 'Hiburan Lain' },
  ]},
  { name: 'Keluarga & Sosial', icon: '❤️', children: [
    { name: 'Zakat & Sedekah' },
    { name: 'Hadiah' },
    { name: 'Orang Tua' },
  ]},
  { name: 'Kesehatan', icon: '💊', children: [
    { name: 'Obat & Apotek' },
    { name: 'Dokter & RS' },
  ]},
  { name: 'Lain-lain', icon: '📌', children: [
    { name: 'Lainnya' },
  ]},
]

const INCOME_CATEGORIES = [
  { name: 'Gaji', icon: '💰' },
  { name: 'Bonus & THR', icon: '🎁' },
  { name: 'Usaha/Freelance', icon: '💼' },
  { name: 'Hadiah', icon: '🎁' },
  { name: 'Lainnya', icon: '📌' },
]

const ACCOUNTS = [
  { name: 'Tunai', type: 'cash', institution: null, icon: '💵', color: '#4CAF50' },
  { name: 'BCA', type: 'bank', institution: 'BCA', icon: '🏦', color: '#1565C0' },
  { name: 'GoPay', type: 'ewallet', institution: 'Gojek', icon: '🟢', color: '#00A100' },
  { name: 'BRI', type: 'bank', institution: 'BRI', icon: '🏦', color: '#E65100' },
]

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL })

  try {
    console.log('🔑 Hashing password...')
    const passwordHash = await hashPassword(OWNER_PASSWORD)

    console.log('👤 Upserting owner user...')
    const ownerResult = await pool.query(`
      INSERT INTO users (id, external_id, email, password_hash, name, display_name, status)
      VALUES ($1::uuid, $2, $3, $4, $5, $5, 'active')
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        display_name = EXCLUDED.display_name
      RETURNING id, email
    `, [OWNER_USER_ID, OWNER_EXTERNAL_ID, OWNER_EMAIL, passwordHash, OWNER_NAME])
    const userId = ownerResult.rows[0].id
    console.log(`   Owner: ${ownerResult.rows[0].email} (${userId})`)

    console.log('💳 Inserting default accounts...')
    for (const acct of ACCOUNTS) {
      await pool.query(`
        INSERT INTO accounts (user_id, name, type, institution, balance, icon, color)
        VALUES ($1::uuid, $2, $3, $4, 0, $5, $6)
        ON CONFLICT DO NOTHING
      `, [userId, acct.name, acct.type, acct.institution, acct.icon, acct.color])
      console.log(`   + ${acct.name}`)
    }

    console.log('🏷 Inserting expense categories...')
    for (const cat of EXPENSE_CATEGORIES) {
      const catResult = await pool.query(`
        INSERT INTO categories (user_id, name, type, icon)
        VALUES ($1::uuid, $2, 'expense', $3)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [userId, cat.name, cat.icon])
      const catId = catResult.rows[0]?.id
      if (catId && cat.children.length > 0) {
        for (const child of cat.children) {
          await pool.query(`
            INSERT INTO categories (user_id, name, type, icon)
            VALUES ($1::uuid, $2, 'expense', $3)
            ON CONFLICT DO NOTHING
          `, [userId, child.name, cat.icon])
        }
      }
      console.log(`   + ${cat.name}`)
    }

    console.log('🏷 Inserting income categories...')
    for (const cat of INCOME_CATEGORIES) {
      await pool.query(`
        INSERT INTO categories (user_id, name, type, icon)
        VALUES ($1::uuid, $2, 'income', $3)
        ON CONFLICT DO NOTHING
      `, [userId, cat.name, cat.icon])
      console.log(`   + ${cat.name}`)
    }

    console.log('📱 Inserting WhatsApp channel identity...')
    await pool.query(`
      INSERT INTO channel_identities (user_id, channel_type, channel_id, display_name, is_primary)
      VALUES ($1::uuid, 'whatsapp', $2, $3, true)
      ON CONFLICT (user_id, channel_type, channel_id)
      DO UPDATE SET display_name = EXCLUDED.display_name, is_primary = true
    `, [userId, WA_NUMBER, OWNER_NAME])
    console.log(`   + WhatsApp: ${WA_NUMBER}`)

    console.log('\n✅ Seed complete!')
    console.log(`   Email: ${OWNER_EMAIL}`)
    console.log(`   Password: ${OWNER_PASSWORD}`)
    console.log('   (Change these values in production!)')
  } finally {
    await pool.end()
  }
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message)
  process.exit(1)
})
