export type Account = { id: string; name: string; type: string; balance: number }
export type Transaction = { id: string; type: 'income' | 'expense' | 'transfer'; amount: number; note: string | null; date: string; source?: string | null }
export type Category = { id: string; name: string; type: string }
