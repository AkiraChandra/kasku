import { pgTable, pgEnum, bigint, timestamp, text, boolean, integer, uuid, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted'])
export const channelTypeEnum = pgEnum('channel_type', ['telegram', 'whatsapp', 'discord', 'slack', 'email', 'web'])
export const transactionTypeEnum = pgEnum('transaction_type', ['income', 'expense', 'transfer', 'lend', 'collect', 'borrow', 'repay', 'adjustment'])
export const transactionStatusEnum = pgEnum('transaction_status', ['pending', 'confirmed', 'rejected', 'recurring'])
export const reminderTypeEnum = pgEnum('reminder_type', ['one_time', 'recurring'])
export const debtTypeEnum = pgEnum('debt_type', ['lent_out', 'borrowed'])
export const debtStatusEnum = pgEnum('debt_status', ['active', 'settled', 'cancelled'])
export const assetTypeEnum = pgEnum('asset_type', ['cash', 'bank_account', 'investment', 'crypto', 'property', 'vehicle', 'other'])
export const billFrequencyEnum = pgEnum('bill_frequency', ['weekly', 'monthly', 'quarterly', 'yearly'])
export const billStatusEnum = pgEnum('bill_status', ['upcoming', 'due', 'overdue', 'paid', 'skipped'])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalId: text('external_id').notNull().unique(),
    email: text('email'),
    passwordHash: text('password_hash'),
    name: text('name'),
    username: text('username'),
    displayName: text('display_name'),
    language: text('language').default('id'),
    timezone: text('timezone').default('Asia/Jakarta'),
    status: userStatusEnum('status').default('active'),
    defaultCurrency: text('default_currency').default('IDR'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('users_external_id_idx').on(t.externalId),
    uniqueIndex('users_email_idx').on(t.email),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
  ],
)

export const channelIdentities = pgTable(
  'channel_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    channelType: channelTypeEnum('channel_type').notNull(),
    channelId: text('channel_id').notNull(),
    username: text('username'),
    displayName: text('display_name'),
    isPrimary: boolean('is_primary').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex('channel_identities_user_channel_idx').on(t.userId, t.channelType, t.channelId)],
)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    last4: text('last4'),
    scopes: text('scopes').array().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_user_id_idx').on(t.userId), uniqueIndex('api_keys_key_hash_idx').on(t.keyHash)],
)

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    response: jsonb('response'),
    statusCode: integer('status_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('idempotency_keys_user_key_idx').on(t.userId, t.key)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // cash, bank, ewallet, credit_card, investment
    institution: text('institution'),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    currency: text('currency').default('IDR'),
    icon: text('icon'),
    color: text('color'),
    isArchived: boolean('is_archived').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
)

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // null = system
    name: text('name').notNull(),
    type: transactionTypeEnum('type').notNull(),
    icon: text('icon'),
    color: text('color'),
    isArchived: boolean('is_archived').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('categories_user_id_idx').on(t.userId)],
)

export const merchantRules = pgTable(
  'merchant_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('merchant_rules_user_id_idx').on(t.userId)],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id),
    categoryId: uuid('category_id').references(() => categories.id),
    type: transactionTypeEnum('type').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    note: text('note'),
    date: timestamp('date', { withTimezone: true }).notNull(),
    merchant: text('merchant'),
    tags: text('tags').array().default([]),
    status: transactionStatusEnum('status').default('confirmed'),
    recurringId: uuid('recurring_id'),
    parentId: uuid('parent_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    referenceNo: text('reference_no'),
    source: text('source').notNull().default('web'),
    ingestSourceId: uuid('ingest_source_id').references(() => ingestSources.id, { onDelete: 'set null' }),
    corroboratedBy: jsonb('corroborated_by').default(sql`'[]'`),
    rawInput: text('raw_input'),
    sourceRef: text('source_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('transactions_user_id_idx').on(t.userId), index('transactions_date_idx').on(t.date)],
)

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // receipt, invoice, screenshot
    url: text('url').notNull(),
    filename: text('filename'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('attachments_user_id_idx').on(t.userId), index('attachments_transaction_id_idx').on(t.transactionId)],
)

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Budget'),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    period: text('period').notNull(), // weekly, monthly, quarterly, yearly
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('budgets_user_id_idx').on(t.userId)],
)

export const budgetAlertsSent = pgTable(
  'budget_alerts_sent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id').notNull().references(() => budgets.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    threshold: integer('threshold').notNull(), // percentage
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex('budget_alerts_sent_budget_period_idx').on(t.budgetId, t.periodStart, t.threshold)],
)

export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    accountId: uuid('account_id').references(() => accounts.id),
    amountType: text('amount_type').default('fixed'), // fixed | variable
    amount: bigint('amount', { mode: 'number' }).notNull(),
    recurrence: text('recurrence').notNull().default('monthly'), // weekly | monthly | quarterly | yearly
    dueDay: integer('due_day'), // 1-31
    reminderDaysBefore: integer('reminder_days_before').array().default([3, 1, 0]),
    isActive: boolean('is_active').default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('bills_user_id_idx').on(t.userId), index('bills_next_due_date_idx').on(t.updatedAt)],
)

export const billOccurrences = pgTable(
  'bill_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    expectedAmount: bigint('expected_amount', { mode: 'number' }).notNull(),
    status: billStatusEnum('status').default('upcoming'),
    transactionId: uuid('transaction_id').references(() => transactions.id),
    paidDate: timestamp('paid_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('bill_occurrences_user_id_idx').on(t.userId), index('bill_occurrences_bill_id_idx').on(t.billId), index('bill_occurrences_due_date_idx').on(t.dueDate)],
)

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: reminderTypeEnum('type').notNull(),
    title: text('title').notNull(),
    message: text('message'),
    triggerAt: timestamp('trigger_at', { withTimezone: true }).notNull(),
    recurrenceRule: text('recurrence_rule'),
    relatedId: uuid('related_id'),
    isSent: boolean('is_sent').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('reminders_user_id_idx').on(t.userId), index('reminders_trigger_at_idx').on(t.triggerAt)],
)

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone'),
    bankAccount: text('bank_account'),
    notes: text('notes'),
    tags: text('tags').array().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('contacts_user_id_idx').on(t.userId)],
)

export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    personName: text('person_name').notNull().default(''),
    type: debtTypeEnum('type').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    remainingAmount: bigint('remaining_amount', { mode: 'number' }).notNull(),
    currency: text('currency').default('IDR'),
    description: text('description'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    status: debtStatusEnum('status').default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('debts_user_id_idx').on(t.userId), index('debts_contact_id_idx').on(t.contactId)],
)

export const debtPayments = pgTable(
  'debt_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    debtId: uuid('debt_id').notNull().references(() => debts.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    note: text('note'),
    paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('debt_payments_user_id_idx').on(t.userId), index('debt_payments_debt_id_idx').on(t.debtId)],
)

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // gold | stock | mutual_fund | crypto | deposit | property | vehicle | other
    name: text('name').notNull(),
    unit: text('unit'),
    quantity: bigint('quantity', { mode: 'number' }).default(1),
    costBasis: bigint('cost_basis', { mode: 'number' }).default(0),
    isLiquid: boolean('is_liquid').default(false),
    isArchived: boolean('is_archived').default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('assets_user_id_idx').on(t.userId)],
)

export const assetValuations = pgTable(
  'asset_valuations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
    valuedAt: timestamp('valued_at', { withTimezone: true }).notNull().defaultNow(),
    unitPrice: bigint('unit_price', { mode: 'number' }),
    totalValue: bigint('total_value', { mode: 'number' }).notNull(),
    source: text('source').default('manual'), // manual | auto
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('asset_valuations_user_id_idx').on(t.userId), index('asset_valuations_asset_id_idx').on(t.assetId), index('asset_valuations_valued_at_idx').on(t.valuedAt)],
)

export const networthSnapshots = pgTable(
  'networth_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull().defaultNow(),
    assetsTotal: bigint('assets_total', { mode: 'number' }).notNull().default(0),
    liabilitiesTotal: bigint('liabilities_total', { mode: 'number' }).notNull().default(0),
    receivablesTotal: bigint('receivables_total', { mode: 'number' }).notNull().default(0),
    netWorth: bigint('net_worth', { mode: 'number' }).notNull(),
    breakdownJson: jsonb('breakdown_json').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('networth_snapshots_user_id_idx').on(t.userId), index('networth_snapshots_snapshot_at_idx').on(t.snapshotDate)],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    changes: jsonb('changes'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('audit_log_user_id_idx').on(t.userId), index('audit_log_created_at_idx').on(t.createdAt)],
)

// M2b: ingest sources for multi-channel transaction ingestion
export const ingestSources = pgTable(
  'ingest_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(), // email, webhook, notification, csv, form, autopay
    apiKeyId: uuid('api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    trust: text('trust').notNull().default('review'), // review | auto
    parserName: text('parser_name'),
    totalOk: bigint('total_ok', { mode: 'number' }).notNull().default(0),
    totalCorrected: bigint('total_corrected', { mode: 'number' }).notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('ingest_sources_user_id_idx').on(t.userId),
    index('ingest_sources_kind_idx').on(t.kind),
  ],
)

// Drizzle config for migrations
export const schema = {
  users,
  channelIdentities,
  apiKeys,
  idempotencyKeys,
  accounts,
  categories,
  merchantRules,
  transactions,
  attachments,
  budgets,
  budgetAlertsSent,
  bills,
  billOccurrences,
  reminders,
  contacts,
  debts,
  debtPayments,
  assets,
  assetValuations,
  networthSnapshots,
  auditLog,
  sessions,
  enums: { userStatusEnum, channelTypeEnum, transactionTypeEnum, transactionStatusEnum, reminderTypeEnum, debtTypeEnum, debtStatusEnum, assetTypeEnum, billFrequencyEnum, billStatusEnum },
}
