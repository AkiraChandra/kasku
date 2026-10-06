import { describe, expect, it } from 'vitest'
import { parseBankCsv } from '../lib/csv-parser.js'

describe('parseBankCsv', () => {
  it('parses BCA CSV rows and maps D to expense', () => {
    const rows = parseBankCsv([
      'Tanggal,Keterangan,Jumlah,D/K,Saldo',
      '01/02/2025,"KOPI ABC",25.000,D,1.000.000',
      '02/02/2025,"GAJI",5.000.000,K,6.000.000',
    ].join('\n'))

    expect(rows).toEqual([
      {
        occurred_at: '2025-02-01T00:00:00.000Z',
        merchant: 'KOPI ABC',
        amount: 25000,
        type: 'expense',
        source_ref: 'bca:1',
      },
      {
        occurred_at: '2025-02-02T00:00:00.000Z',
        merchant: 'GAJI',
        amount: 5000000,
        type: 'income',
        source_ref: 'bca:2',
      },
    ])
  })

  it('parses Mandiri CSV rows and maps debit and credit types', () => {
    const rows = parseBankCsv([
      'Tanggal,Keterangan,Jumlah,Jenis,Saldo',
      '2025-03-03,"TAGIHAN",150000,DB,850000',
      '2025-03-04,"SETORAN",200000,CR,1050000',
    ].join('\n'))

    expect(rows).toEqual([
      {
        occurred_at: '2025-03-03T00:00:00.000Z',
        merchant: 'TAGIHAN',
        amount: 150000,
        type: 'expense',
        source_ref: 'mandiri:1',
      },
      {
        occurred_at: '2025-03-04T00:00:00.000Z',
        merchant: 'SETORAN',
        amount: 200000,
        type: 'income',
        source_ref: 'mandiri:2',
      },
    ])
  })
})
