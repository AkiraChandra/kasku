import { and, desc, eq, gte, lte, sql, max } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { accounts, assets, assetValuations, debts, networthSnapshots, transactions } from '../db/schema/index.js'

// ── Types ────────────────────────────────────────────────────────────────────

export type AssetType = 'gold' | 'stock' | 'mutual_fund' | 'crypto' | 'deposit' | 'property' | 'vehicle' | 'other'
export type ValuationSource = 'manual' | 'auto'

export type AssetRow = {
  id: string
  userId: string
  type: AssetType
  name: string
  unit: string | null
  quantity: number
  costBasis: number
  isLiquid: boolean
  isArchived: boolean
  notes: string | null
  currentValue: number
  unrealizedPL: number
  createdAt: string
  updatedAt: string
}

export type ValuationRow = {
  id: string
  assetId: string
  userId: string
  valuedAt: string
  unitPrice: number | null
  totalValue: number
  source: ValuationSource
  createdAt: string
}

export type NetworthSnapshotRow = {
  id: string
  userId: string
  snapshotDate: string
  assetsTotal: number
  liabilitiesTotal: number
  receivablesTotal: number
  netWorth: number
  breakdownJson: Record<string, number>
  createdAt: string
}

export type NetworthBreakdown = {
  netWorth: number
  assetsTotal: number
  liabilitiesTotal: number
  receivablesTotal: number
  emergencyFundRatio: number | null
  breakdown: Array<{ category: string; amount: number; percentage: number }>
  byType: Array<{ type: AssetType; amount: number; percentage: number }>
}

export type CreateAssetInput = {
  type: AssetType
  name: string
  unit?: string
  quantity?: number
  costBasis?: number
  isLiquid?: boolean
  notes?: string
  initialValue?: number
}

export type AddValuationInput = {
  unitPrice?: number
  totalValue: number
  valuedAt?: string
  source?: ValuationSource
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface AssetsRepository {
  reset?(): void
  listAssets(userId: string): Promise<AssetRow[]>
  createAsset(userId: string, input: CreateAssetInput): Promise<AssetRow>
  getAsset(userId: string, id: string): Promise<AssetRow | null>
  updateAsset(userId: string, id: string, input: Partial<CreateAssetInput>): Promise<AssetRow>
  deleteAsset(userId: string, id: string): Promise<boolean>
  addValuation(userId: string, assetId: string, input: AddValuationInput): Promise<ValuationRow>
  getValuations(userId: string, assetId: string): Promise<ValuationRow[]>
  listSnapshots(userId: string, limit?: number): Promise<NetworthSnapshotRow[]>
  takeSnapshot(userId: string): Promise<NetworthSnapshotRow>
  getNetworthBreakdown(userId: string): Promise<NetworthBreakdown>
}

// ── In-memory store ──────────────────────────────────────────────────────────

const memoryAssets = new Map<string, AssetRow>()
const memoryValuations = new Map<string, ValuationRow>()
const memorySnapshots = new Map<string, NetworthSnapshotRow>()

let _tsSeq = 0
function ts(): string {
  // Ensure strictly increasing ISO timestamps across rapid calls
  return new Date(Date.now() + _tsSeq++).toISOString()
}

let _valuationSeq = 0

function computeCurrentValue(assetId: string): number {
  const valuations = [...memoryValuations.values()]
    .filter(v => v.assetId === assetId)
    .sort((a, b) => b.valuedAt.localeCompare(a.valuedAt))
  return valuations[0]?.totalValue ?? 0
}

export const inMemoryAssetsRepository: AssetsRepository = {
  reset() {
    memoryAssets.clear()
    memoryValuations.clear()
    memorySnapshots.clear()
    _tsSeq = 0
  },

  async listAssets(userId) {
    const assets = [...memoryAssets.values()]
      .filter(a => a.userId === userId && !a.isArchived)
      .map(a => ({
        ...a,
        currentValue: computeCurrentValue(a.id),
        unrealizedPL: computeCurrentValue(a.id) - a.costBasis,
      }))
    return assets
  },

  async createAsset(userId, input) {
    const now = ts()
    const asset: AssetRow = {
      id: crypto.randomUUID(),
      userId,
      type: input.type,
      name: input.name,
      unit: input.unit ?? null,
      quantity: input.quantity ?? 1,
      costBasis: input.costBasis ?? 0,
      isLiquid: input.isLiquid ?? false,
      isArchived: false,
      notes: input.notes ?? null,
      currentValue: input.initialValue ?? 0,
      unrealizedPL: (input.initialValue ?? 0) - (input.costBasis ?? 0),
      createdAt: now,
      updatedAt: now,
    }
    memoryAssets.set(asset.id, asset)
    if (input.initialValue !== undefined) {
      const val: ValuationRow = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        userId,
        valuedAt: now,
        unitPrice: input.unit ? Math.floor(input.initialValue / (input.quantity ?? 1)) : null,
        totalValue: input.initialValue,
        source: 'manual',
        createdAt: now,
      }
      memoryValuations.set(val.id, val)
    }
    return asset
  },

  async getAsset(userId, id) {
    const a = memoryAssets.get(id)
    if (!a || a.userId !== userId) return null
    return { ...a, currentValue: computeCurrentValue(a.id), unrealizedPL: computeCurrentValue(a.id) - a.costBasis }
  },

  async updateAsset(userId, id, input) {
    const a = memoryAssets.get(id)
    if (!a || a.userId !== userId) throw new Error('ASSET_NOT_FOUND')
    const updated: AssetRow = {
      ...a,
      type: input.type ?? a.type,
      name: input.name ?? a.name,
      unit: input.unit !== undefined ? input.unit : a.unit,
      quantity: input.quantity ?? a.quantity,
      costBasis: input.costBasis ?? a.costBasis,
      isLiquid: input.isLiquid ?? a.isLiquid,
      notes: input.notes !== undefined ? input.notes : a.notes,
      currentValue: computeCurrentValue(a.id),
      unrealizedPL: computeCurrentValue(a.id) - (input.costBasis ?? a.costBasis),
      updatedAt: ts(),
    }
    memoryAssets.set(id, updated)
    return updated
  },

  async deleteAsset(userId, id) {
    const a = memoryAssets.get(id)
    if (!a || a.userId !== userId) return false
    a.isArchived = true
    a.updatedAt = ts()
    return true
  },

  async addValuation(userId, assetId, input) {
    const a = memoryAssets.get(assetId)
    if (!a || a.userId !== userId) throw new Error('ASSET_NOT_FOUND')
    const now = ts()
    const val: ValuationRow = {
      id: crypto.randomUUID(),
      assetId,
      userId,
      valuedAt: input.valuedAt ?? now,
      unitPrice: input.unitPrice ?? null,
      totalValue: input.totalValue,
      source: input.source ?? 'manual',
      createdAt: now,
    }
    memoryValuations.set(val.id, val)
    // Update asset's current value
    const asset = memoryAssets.get(assetId)
    if (asset) {
      memoryAssets.set(assetId, { ...asset, currentValue: val.totalValue, unrealizedPL: val.totalValue - asset.costBasis })
    }
    return val
  },

  async getValuations(userId, assetId) {
    const a = memoryAssets.get(assetId)
    if (!a || a.userId !== userId) return []
    return [...memoryValuations.values()]
      .filter(v => v.assetId === assetId && v.userId === userId)
      .sort((a, b) => b.valuedAt.localeCompare(a.valuedAt))
  },

  async listSnapshots(userId, limit = 30) {
    return [...memorySnapshots.values()]
      .filter(s => s.userId === userId)
      .sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate))
      .slice(0, limit)
  },

  async takeSnapshot(userId) {
    const assets = [...memoryAssets.values()].filter(a => a.userId === userId && !a.isArchived)
    const assetsTotal = assets.reduce((sum, a) => sum + computeCurrentValue(a.id), 0)
    const costBasis = assets.reduce((sum, a) => sum + a.costBasis, 0)
    // Liabilities = borrowed debts
    const debtsList = [] // we'd need access to debts
    const liabilitiesTotal = 0
    const receivablesTotal = 0
    const netWorth = assetsTotal - liabilitiesTotal + receivablesTotal

    const today = new Date().toISOString().slice(0, 10)
    const existing = [...memorySnapshots.values()].find(s => s.userId === userId && s.snapshotDate.slice(0, 10) === today)
    if (existing) return existing

    const snapshot: NetworthSnapshotRow = {
      id: crypto.randomUUID(),
      userId,
      snapshotDate: today,
      assetsTotal,
      liabilitiesTotal,
      receivablesTotal,
      netWorth,
      breakdownJson: { assets: assetsTotal, liabilities: liabilitiesTotal, receivables: receivablesTotal },
      createdAt: ts(),
    }
    memorySnapshots.set(snapshot.id, snapshot)
    return snapshot
  },

  async getNetworthBreakdown(userId) {
    const assetList = await this.listAssets(userId)
    const assetsTotal = assetList.reduce((sum, a) => sum + a.currentValue, 0)
    const liabilitiesTotal = 0
    const receivablesTotal = 0
    const netWorth = assetsTotal - liabilitiesTotal + receivablesTotal

    const byType = assetList.reduce((acc, a) => {
      const existing = acc.find(t => t.type === a.type)
      if (existing) existing.amount += a.currentValue
      else acc.push({ type: a.type, amount: a.currentValue })
      return acc
    }, [] as Array<{ type: AssetType; amount: number }>)

    const breakdown = [
      { category: 'Aset', amount: assetsTotal, percentage: assetsTotal > 0 ? 100 : 0 },
    ]

    return {
      netWorth,
      assetsTotal,
      liabilitiesTotal,
      receivablesTotal,
      emergencyFundRatio: null,
      breakdown,
      byType: byType.map(t => ({
        ...t,
        percentage: assetsTotal > 0 ? Math.round((t.amount / assetsTotal) * 100) : 0,
      })),
    }
  },
}

// ── Drizzle implementation ────────────────────────────────────────────────────

function assetRowToRow(row: typeof assets.$inferSelect, currentValue = 0): AssetRow {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as AssetType,
    name: row.name,
    unit: row.unit ?? null,
    quantity: Number(row.quantity ?? 1),
    costBasis: Number(row.costBasis ?? 0),
    isLiquid: row.isLiquid ?? false,
    isArchived: row.isArchived ?? false,
    notes: row.notes ?? null,
    currentValue,
    unrealizedPL: currentValue - Number(row.costBasis ?? 0),
    createdAt: (row.createdAt ?? new Date(0)).toISOString(),
    updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
  }
}

function valuationToRow(row: typeof assetValuations.$inferSelect): ValuationRow {
  return {
    id: row.id,
    assetId: row.assetId,
    userId: row.userId,
    valuedAt: (row.valuedAt ?? new Date(0)).toISOString(),
    unitPrice: row.unitPrice !== null ? Number(row.unitPrice) : null,
    totalValue: Number(row.totalValue),
    source: (row.source as ValuationSource) ?? 'manual',
    createdAt: (row.createdAt ?? new Date(0)).toISOString(),
  }
}

function snapshotToRow(row: typeof networthSnapshots.$inferSelect): NetworthSnapshotRow {
  return {
    id: row.id,
    userId: row.userId,
    snapshotDate: (row.snapshotDate ?? new Date(0)).toISOString(),
    assetsTotal: Number(row.assetsTotal),
    liabilitiesTotal: Number(row.liabilitiesTotal),
    receivablesTotal: Number(row.receivablesTotal),
    netWorth: Number(row.netWorth),
    breakdownJson: (row.breakdownJson as Record<string, number>) ?? {},
    createdAt: (row.createdAt ?? new Date(0)).toISOString(),
  }
}

export function createDatabaseAssetsRepository(pool: Pool): AssetsRepository {
  const db = drizzle(pool)

  return {
    async listAssets(userId) {
      const rows = await db.select().from(assets).where(
        and(eq(assets.userId, userId), eq(assets.isArchived, false))
      ).orderBy(desc(assets.createdAt))

      // Get latest valuation per asset
      const result: AssetRow[] = []
      for (const row of rows) {
        const latestVal = await db.select({ totalValue: assetValuations.totalValue })
          .from(assetValuations)
          .where(eq(assetValuations.assetId, row.id))
          .orderBy(desc(assetValuations.valuedAt))
          .limit(1)
        const cv = latestVal[0] ? Number(latestVal[0].totalValue) : 0
        result.push(assetRowToRow(row, cv))
      }
      return result
    },

    async createAsset(userId, input) {
      const now = ts()
      const id = crypto.randomUUID()
      const initialValue = input.initialValue ?? 0
      const costBasis = input.costBasis ?? 0

      if (input.initialValue !== undefined) {
        await db.insert(assetValuations).values({
          userId,
          assetId: id,
          valuedAt: now,
          unitPrice: input.unit ? Math.floor(input.initialValue / (input.quantity ?? 1)) : null,
          totalValue: input.initialValue,
          source: 'manual',
        } as any)
      }

      const rows = await db.insert(assets).values({
        userId,
        type: input.type,
        name: input.name,
        unit: input.unit ?? null,
        quantity: input.quantity ?? 1,
        costBasis,
        isLiquid: input.isLiquid ?? false,
        notes: input.notes ?? null,
      } as any).returning()

      return assetRowToRow(rows[0], initialValue)
    },

    async getAsset(userId, id) {
      const rows = await db.select().from(assets).where(
        and(eq(assets.id, id), eq(assets.userId, userId))
      ).limit(1)
      if (!rows[0]) return null
      const latestVal = await db.select({ totalValue: assetValuations.totalValue })
        .from(assetValuations)
        .where(eq(assetValuations.assetId, id))
        .orderBy(desc(assetValuations.valuedAt))
        .limit(1)
      return assetRowToRow(rows[0], latestVal[0] ? Number(latestVal[0].totalValue) : 0)
    },

    async updateAsset(userId, id, input) {
      const existing = await db.select().from(assets).where(
        and(eq(assets.id, id), eq(assets.userId, userId))
      ).limit(1)
      if (!existing[0]) throw new Error('ASSET_NOT_FOUND')
      const setCols: Record<string, unknown> = { updatedAt: new Date() }
      if (input.type !== undefined) setCols.type = input.type
      if (input.name !== undefined) setCols.name = input.name
      if (input.unit !== undefined) setCols.unit = input.unit
      if (input.quantity !== undefined) setCols.quantity = input.quantity
      if (input.costBasis !== undefined) setCols.costBasis = input.costBasis
      if (input.isLiquid !== undefined) setCols.isLiquid = input.isLiquid
      if (input.notes !== undefined) setCols.notes = input.notes
      const updated = await db.update(assets).set(setCols as any)
        .where(and(eq(assets.id, id), eq(assets.userId, userId))).returning()
      const latestVal = await db.select({ totalValue: assetValuations.totalValue })
        .from(assetValuations).where(eq(assetValuations.assetId, id))
        .orderBy(desc(assetValuations.valuedAt)).limit(1)
      return assetRowToRow(updated[0], latestVal[0] ? Number(latestVal[0].totalValue) : 0)
    },

    async deleteAsset(userId, id) {
      const rows = await db.update(assets).set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(assets.id, id), eq(assets.userId, userId))).returning({ id: assets.id })
      return rows.length > 0
    },

    async addValuation(userId, assetId, input) {
      // Verify asset belongs to user
      const assetRows = await db.select().from(assets).where(
        and(eq(assets.id, assetId), eq(assets.userId, userId))
      ).limit(1)
      if (!assetRows[0]) throw new Error('ASSET_NOT_FOUND')

      const rows = await db.insert(assetValuations).values({
        userId,
        assetId,
        valuedAt: input.valuedAt ? new Date(input.valuedAt) : new Date(),
        unitPrice: input.unitPrice ?? null,
        totalValue: input.totalValue,
        source: input.source ?? 'manual',
      } as any).returning()
      return valuationToRow(rows[0])
    },

    async getValuations(userId, assetId) {
      const rows = await db.select().from(assetValuations).where(
        and(eq(assetValuations.assetId, assetId), eq(assetValuations.userId, userId))
      ).orderBy(desc(assetValuations.valuedAt))
      return rows.map(valuationToRow)
    },

    async listSnapshots(userId, limit = 30) {
      const rows = await db.select().from(networthSnapshots).where(
        eq(networthSnapshots.userId, userId)
      ).orderBy(desc(networthSnapshots.snapshotDate)).limit(limit)
      return rows.map(snapshotToRow)
    },

    async takeSnapshot(userId) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Check if already taken today
      const existingRows = await db.select().from(networthSnapshots).where(
        and(
          eq(networthSnapshots.userId, userId),
          sql`DATE(${networthSnapshots.snapshotDate}) = CURRENT_DATE`
        )
      ).limit(1)
      if (existingRows[0]) return snapshotToRow(existingRows[0])

      // Calculate assets total
      const activeAssets = await db.select().from(assets).where(
        and(eq(assets.userId, userId), eq(assets.isArchived, false))
      )
      let assetsTotal = 0
      for (const asset of activeAssets) {
        const latestVal = await db.select({ totalValue: assetValuations.totalValue })
          .from(assetValuations).where(eq(assetValuations.assetId, asset.id))
          .orderBy(desc(assetValuations.valuedAt)).limit(1)
        assetsTotal += latestVal[0] ? Number(latestVal[0].totalValue) : 0
      }

      // Calculate liabilities (borrowed debts outstanding)
      const debtRows = await db.select({ remainingAmount: debts.remainingAmount })
        .from(debts).where(and(eq(debts.userId, userId), eq(debts.type, 'borrowed')))
      const liabilitiesTotal = debtRows.reduce((sum, r) => sum + Number(r.remainingAmount), 0)

      // Calculate receivables (lent_out debts outstanding)
      const receivableRows = await db.select({ remainingAmount: debts.remainingAmount })
        .from(debts).where(and(eq(debts.userId, userId), eq(debts.type, 'lent_out')))
      const receivablesTotal = receivableRows.reduce((sum, r) => sum + Number(r.remainingAmount), 0)

      const netWorth = assetsTotal - liabilitiesTotal + receivablesTotal
      const breakdownJson: Record<string, number> = { assets: assetsTotal, liabilities: liabilitiesTotal, receivables: receivablesTotal }

      const rows = await db.insert(networthSnapshots).values({
        userId,
        snapshotDate: today,
        assetsTotal,
        liabilitiesTotal,
        receivablesTotal,
        netWorth,
        breakdownJson,
      } as any).returning()

      return snapshotToRow(rows[0])
    },

    async getNetworthBreakdown(userId) {
      // Get asset totals by type
      const activeAssets = await db.select().from(assets).where(
        and(eq(assets.userId, userId), eq(assets.isArchived, false))
      )

      const typeAmounts = new Map<AssetType, number>()
      let assetsTotal = 0

      for (const asset of activeAssets) {
        const latestVal = await db.select({ totalValue: assetValuations.totalValue })
          .from(assetValuations).where(eq(assetValuations.assetId, asset.id))
          .orderBy(desc(assetValuations.valuedAt)).limit(1)
        const val = latestVal[0] ? Number(latestVal[0].totalValue) : 0
        assetsTotal += val
        const current = typeAmounts.get(asset.type as AssetType) ?? 0
        typeAmounts.set(asset.type as AssetType, current + val)
      }

      const debtRows = await db.select({ remainingAmount: debts.remainingAmount, type: debts.type })
        .from(debts).where(eq(debts.userId, userId))
      const liabilitiesTotal = debtRows
        .filter(r => r.type === 'borrowed')
        .reduce((sum, r) => sum + Number(r.remainingAmount), 0)
      const receivablesTotal = debtRows
        .filter(r => r.type === 'lent_out')
        .reduce((sum, r) => sum + Number(r.remainingAmount), 0)

      const netWorth = assetsTotal - liabilitiesTotal + receivablesTotal

      // Emergency fund ratio: liquid assets / monthly expenses (3-period avg)
      const monthAgo = new Date()
      monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 3)
      const expenses = await db.select({ amount: transactions.amount }).from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.type, 'expense'), gte(transactions.date, monthAgo)))
      const avgMonthly = expenses.reduce((sum, r) => sum + Number(r.amount), 0) / 3
      const liquidAssets = await db.select({ totalValue: assetValuations.totalValue })
        .from(assetValuations)
        .innerJoin(assets, eq(assets.id, assetValuations.assetId))
        .where(and(eq(assets.userId, userId), eq(assets.isLiquid, true)))
      const liquidTotal = liquidAssets.reduce((sum, r) => sum + Number(r.totalValue), 0)
      const emergencyFundRatio = avgMonthly > 0 ? Math.round(liquidTotal / avgMonthly * 10) / 10 : null

      const byType = [...typeAmounts.entries()].map(([type, amount]) => ({
        type,
        amount,
        percentage: assetsTotal > 0 ? Math.round((amount / assetsTotal) * 100) : 0,
      }))

      return {
        netWorth,
        assetsTotal,
        liabilitiesTotal,
        receivablesTotal,
        emergencyFundRatio,
        breakdown: [
          { category: 'Aset', amount: assetsTotal, percentage: assetsTotal > 0 ? 100 : 0 },
          { category: 'Liabilitas', amount: liabilitiesTotal, percentage: assetsTotal > 0 ? Math.round((liabilitiesTotal / assetsTotal) * 100) : 0 },
          { category: 'Piutang', amount: receivablesTotal, percentage: assetsTotal > 0 ? Math.round((receivablesTotal / assetsTotal) * 100) : 0 },
        ],
        byType,
      }
    },
  }
}
