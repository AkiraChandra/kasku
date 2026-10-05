import { describe, it, expect, beforeEach } from 'vitest';
import { inMemoryAssetsRepository } from '../lib/assets-repo.js';
const UID = '00000000-0000-0000-0000-000000000001';
const UID2 = '00000000-0000-0000-0000-000000000002';
describe('AssetsRepository (in-memory)', () => {
    beforeEach(() => { inMemoryAssetsRepository.reset?.(); });
    describe('listAssets', () => {
        it('returns empty list initially', async () => {
            const result = await inMemoryAssetsRepository.listAssets(UID);
            expect(result).toEqual([]);
        });
        it('returns only non-archived assets', async () => {
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas 10g', initialValue: 15000000,
            });
            const assets = await inMemoryAssetsRepository.listAssets(UID);
            expect(assets).toHaveLength(1);
        });
        it('isolates between users', async () => {
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            await inMemoryAssetsRepository.createAsset(UID2, {
                type: 'stock', name: 'Saham BBCA', initialValue: 5000000,
            });
            const user1 = await inMemoryAssetsRepository.listAssets(UID);
            const user2 = await inMemoryAssetsRepository.listAssets(UID2);
            expect(user1).toHaveLength(1);
            expect(user1[0].name).toBe('Emas');
            expect(user2).toHaveLength(1);
            expect(user2[0].name).toBe('Saham BBCA');
        });
        it('computes unrealized P/L', async () => {
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas 10g', costBasis: 12000000, initialValue: 15000000,
            });
            const assets = await inMemoryAssetsRepository.listAssets(UID);
            expect(assets[0].unrealizedPL).toBe(3000000);
            expect(assets[0].currentValue).toBe(15000000);
        });
    });
    describe('createAsset', () => {
        it('creates asset with correct fields', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold',
                name: 'Emas 10 gram',
                unit: 'gram',
                quantity: 10,
                costBasis: 12000000,
                isLiquid: false,
                notes: 'Simpan di brankas',
                initialValue: 15000000,
            });
            expect(asset.id).toBeTruthy();
            expect(asset.type).toBe('gold');
            expect(asset.name).toBe('Emas 10 gram');
            expect(asset.unit).toBe('gram');
            expect(asset.quantity).toBe(10);
            expect(asset.costBasis).toBe(12000000);
            expect(asset.isLiquid).toBe(false);
            expect(asset.currentValue).toBe(15000000);
            expect(asset.unrealizedPL).toBe(3000000);
            expect(asset.isArchived).toBe(false);
        });
        it('uses defaults for optional fields', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'property', name: 'Rumah',
            });
            expect(asset.quantity).toBe(1);
            expect(asset.costBasis).toBe(0);
            expect(asset.isLiquid).toBe(false);
            expect(asset.unit).toBeNull();
            expect(asset.notes).toBeNull();
            expect(asset.currentValue).toBe(0);
        });
        it('creates initial valuation', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas 10g', unit: 'gram', quantity: 10, initialValue: 15000000,
            });
            const valuations = await inMemoryAssetsRepository.getValuations(UID, asset.id);
            expect(valuations).toHaveLength(1);
            expect(valuations[0].totalValue).toBe(15000000);
            expect(valuations[0].source).toBe('manual');
        });
    });
    describe('updateAsset', () => {
        it('updates allowed fields', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', costBasis: 12000000, initialValue: 15000000,
            });
            const updated = await inMemoryAssetsRepository.updateAsset(UID, asset.id, {
                name: 'Emas 10g Antam',
                costBasis: 13000000,
                isLiquid: true,
            });
            expect(updated.name).toBe('Emas 10g Antam');
            expect(updated.costBasis).toBe(13000000);
            expect(updated.isLiquid).toBe(true);
        });
        it('throws ASSET_NOT_FOUND for wrong user', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            await expect(inMemoryAssetsRepository.updateAsset(UID2, asset.id, { name: 'Hacked' })).rejects.toThrow('ASSET_NOT_FOUND');
        });
    });
    describe('deleteAsset', () => {
        it('soft-deletes by archiving', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            const deleted = await inMemoryAssetsRepository.deleteAsset(UID, asset.id);
            expect(deleted).toBe(true);
            const assets = await inMemoryAssetsRepository.listAssets(UID);
            expect(assets).toHaveLength(0);
        });
        it('returns false for non-existent', async () => {
            const deleted = await inMemoryAssetsRepository.deleteAsset(UID, 'does-not-exist');
            expect(deleted).toBe(false);
        });
    });
    describe('addValuation', () => {
        it('adds a new valuation and updates current value', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', unit: 'gram', quantity: 10, costBasis: 12000000, initialValue: 15000000,
            });
            const val = await inMemoryAssetsRepository.addValuation(UID, asset.id, {
                totalValue: 16000000,
                unitPrice: 1600000,
                source: 'manual',
            });
            expect(val.totalValue).toBe(16000000);
            expect(val.unitPrice).toBe(1600000);
            const assets = await inMemoryAssetsRepository.listAssets(UID);
            expect(assets[0].currentValue).toBe(16000000);
            expect(assets[0].unrealizedPL).toBe(4000000); // 16M - 12M costBasis
        });
        it('keeps history of valuations', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', unit: 'gram', quantity: 10, initialValue: 15000000,
            });
            await inMemoryAssetsRepository.addValuation(UID, asset.id, { totalValue: 15500000 });
            await inMemoryAssetsRepository.addValuation(UID, asset.id, { totalValue: 16000000 });
            const vals = await inMemoryAssetsRepository.getValuations(UID, asset.id);
            expect(vals).toHaveLength(3);
        });
        it('throws ASSET_NOT_FOUND for wrong user', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            await expect(inMemoryAssetsRepository.addValuation(UID2, asset.id, { totalValue: 16000000 })).rejects.toThrow('ASSET_NOT_FOUND');
        });
    });
    describe('getValuations', () => {
        it('returns valuations sorted newest first', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'stock', name: 'Saham BBCA', initialValue: 5000000,
            });
            await inMemoryAssetsRepository.addValuation(UID, asset.id, { totalValue: 5500000 });
            const vals = await inMemoryAssetsRepository.getValuations(UID, asset.id);
            expect(vals[0].totalValue).toBe(5500000);
            expect(vals[1].totalValue).toBe(5000000);
        });
    });
    describe('takeSnapshot', () => {
        it('takes a snapshot and returns it', async () => {
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'stock', name: 'Saham', initialValue: 5000000,
            });
            const snapshot = await inMemoryAssetsRepository.takeSnapshot(UID);
            expect(snapshot.id).toBeTruthy();
            expect(snapshot.assetsTotal).toBe(20000000);
            expect(snapshot.netWorth).toBe(20000000);
            expect(snapshot.snapshotDate).toBeTruthy();
        });
        it('is idempotent - same day returns same snapshot', async () => {
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            const first = await inMemoryAssetsRepository.takeSnapshot(UID);
            const second = await inMemoryAssetsRepository.takeSnapshot(UID);
            expect(first.id).toBe(second.id);
        });
    });
    describe('getNetworthBreakdown', () => {
        it('calculates correct net worth', async () => {
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'deposit', name: 'Deposito', initialValue: 10000000, isLiquid: true,
            });
            const breakdown = await inMemoryAssetsRepository.getNetworthBreakdown(UID);
            expect(breakdown.assetsTotal).toBe(25000000);
            expect(breakdown.netWorth).toBe(25000000);
            expect(breakdown.liabilitiesTotal).toBe(0);
            expect(breakdown.receivablesTotal).toBe(0);
        });
        it('returns allocation by type', async () => {
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            await inMemoryAssetsRepository.createAsset(UID, {
                type: 'stock', name: 'Saham', initialValue: 5000000,
            });
            const breakdown = await inMemoryAssetsRepository.getNetworthBreakdown(UID);
            expect(breakdown.byType).toHaveLength(2);
            const goldType = breakdown.byType.find(t => t.type === 'gold');
            expect(goldType?.amount).toBe(15000000);
            expect(goldType?.percentage).toBe(75);
        });
    });
    describe('asset types', () => {
        it('supports all asset types', async () => {
            const types = ['gold', 'stock', 'mutual_fund', 'crypto', 'deposit', 'property', 'vehicle', 'other'];
            for (const type of types) {
                const asset = await inMemoryAssetsRepository.createAsset(UID, {
                    type, name: `Asset ${type}`, initialValue: 1000000,
                });
                expect(asset.type).toBe(type);
            }
        });
    });
    describe('user isolation', () => {
        it('user A cannot access user B assets', async () => {
            const asset = await inMemoryAssetsRepository.createAsset(UID, {
                type: 'gold', name: 'Emas', initialValue: 15000000,
            });
            await expect(inMemoryAssetsRepository.getAsset(UID2, asset.id)).resolves.toBeNull();
            await expect(inMemoryAssetsRepository.updateAsset(UID2, asset.id, { name: 'Hacked' })).rejects.toThrow('ASSET_NOT_FOUND');
            await expect(inMemoryAssetsRepository.addValuation(UID2, asset.id, { totalValue: 16000000 })).rejects.toThrow('ASSET_NOT_FOUND');
        });
    });
});
