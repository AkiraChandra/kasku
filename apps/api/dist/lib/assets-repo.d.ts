import type { Pool } from 'pg';
export type AssetType = 'gold' | 'stock' | 'mutual_fund' | 'crypto' | 'deposit' | 'property' | 'vehicle' | 'other';
export type ValuationSource = 'manual' | 'auto';
export type AssetRow = {
    id: string;
    userId: string;
    type: AssetType;
    name: string;
    unit: string | null;
    quantity: number;
    costBasis: number;
    isLiquid: boolean;
    isArchived: boolean;
    notes: string | null;
    currentValue: number;
    unrealizedPL: number;
    createdAt: string;
    updatedAt: string;
};
export type ValuationRow = {
    id: string;
    assetId: string;
    userId: string;
    valuedAt: string;
    unitPrice: number | null;
    totalValue: number;
    source: ValuationSource;
    createdAt: string;
};
export type NetworthSnapshotRow = {
    id: string;
    userId: string;
    snapshotDate: string;
    assetsTotal: number;
    liabilitiesTotal: number;
    receivablesTotal: number;
    netWorth: number;
    breakdownJson: Record<string, number>;
    createdAt: string;
};
export type NetworthBreakdown = {
    netWorth: number;
    assetsTotal: number;
    liabilitiesTotal: number;
    receivablesTotal: number;
    emergencyFundRatio: number | null;
    breakdown: Array<{
        category: string;
        amount: number;
        percentage: number;
    }>;
    byType: Array<{
        type: AssetType;
        amount: number;
        percentage: number;
    }>;
};
export type CreateAssetInput = {
    type: AssetType;
    name: string;
    unit?: string;
    quantity?: number;
    costBasis?: number;
    isLiquid?: boolean;
    notes?: string;
    initialValue?: number;
};
export type AddValuationInput = {
    unitPrice?: number;
    totalValue: number;
    valuedAt?: string;
    source?: ValuationSource;
};
export interface AssetsRepository {
    reset?(): void;
    listAssets(userId: string): Promise<AssetRow[]>;
    createAsset(userId: string, input: CreateAssetInput): Promise<AssetRow>;
    getAsset(userId: string, id: string): Promise<AssetRow | null>;
    updateAsset(userId: string, id: string, input: Partial<CreateAssetInput>): Promise<AssetRow>;
    deleteAsset(userId: string, id: string): Promise<boolean>;
    addValuation(userId: string, assetId: string, input: AddValuationInput): Promise<ValuationRow>;
    getValuations(userId: string, assetId: string): Promise<ValuationRow[]>;
    listSnapshots(userId: string, limit?: number): Promise<NetworthSnapshotRow[]>;
    takeSnapshot(userId: string): Promise<NetworthSnapshotRow>;
    getNetworthBreakdown(userId: string): Promise<NetworthBreakdown>;
}
export declare const inMemoryAssetsRepository: AssetsRepository;
export declare function createDatabaseAssetsRepository(pool: Pool): AssetsRepository;
