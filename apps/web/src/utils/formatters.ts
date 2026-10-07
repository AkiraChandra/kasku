export function formatIDR(amount: number): string {
  const formatted = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount))
  return `${amount < 0 ? '-' : ''}Rp ${formatted}`
}

export function parseRupiah(value: string): number {
  const clean = value.replace(/[^\d-]/g, '')
  return parseInt(clean, 10) || 0
}
