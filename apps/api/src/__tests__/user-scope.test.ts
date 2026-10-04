import { describe, expect, it } from 'vitest'
import { filterByUserId } from '../lib/user-scope'

describe('filterByUserId', () => {
  it('keeps records belonging only to the requested user', () => {
    const records = [
      { id: 'a', userId: 'user-a' },
      { id: 'b', userId: 'user-b' },
      { id: 'c', userId: 'user-a' },
    ]
    expect(filterByUserId(records, 'user-a')).toEqual([
      { id: 'a', userId: 'user-a' },
      { id: 'c', userId: 'user-a' },
    ])
  })
})
