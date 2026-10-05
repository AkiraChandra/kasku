import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { failure, success } from '../index.js';
import { parseAmount, AmountParseError } from './money.js';
const sessionCookie = 'kasku_session';
const assetTypes = ['gold', 'stock', 'mutual_fund', 'crypto', 'deposit', 'property', 'vehicle', 'other'];
const valuationSources = ['manual', 'auto'];
const createAssetSchema = z.object({
    type: z.enum(assetTypes),
    name: z.string().trim().min(1).max(200),
    unit: z.string().trim().max(50).optional(),
    quantity: z.union([z.string(), z.number()]).optional(),
    costBasis: z.union([z.string(), z.number()]).optional(),
    isLiquid: z.boolean().optional(),
    notes: z.string().trim().max(500).optional(),
    initialValue: z.union([z.string(), z.number()]).optional(),
});
const updateAssetSchema = z.object({
    type: z.enum(assetTypes).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    unit: z.string().trim().max(50).nullable().optional(),
    quantity: z.union([z.string(), z.number()]).optional(),
    costBasis: z.union([z.string(), z.number()]).optional(),
    isLiquid: z.boolean().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
});
const valuationSchema = z.object({
    unitPrice: z.union([z.string(), z.number()]).optional(),
    totalValue: z.union([z.string(), z.number()]),
    valuedAt: z.string().datetime().optional(),
    source: z.enum(valuationSources).optional(),
});
function validationError(error) {
    const issue = error.issues[0];
    return failure('VALIDATION_ERROR', issue.message, issue.path.join('.'));
}
function parseMoney(value) {
    try {
        return parseAmount(value);
    }
    catch (error) {
        if (error instanceof AmountParseError)
            throw error;
        throw new AmountParseError('INVALID_AMOUNT', 'Jumlah tidak valid');
    }
}
export function createAssetsRoutes(assetsRepo, authRepo) {
    const app = new Hono();
    async function currentUserId(c) {
        if (!authRepo)
            return null;
        const token = getCookie(c, sessionCookie);
        if (!token)
            return null;
        const session = await authRepo.findSessionByTokenHash((await import('./auth.js')).hashToken(token));
        return session?.user.id ?? null;
    }
    async function requireUser(c) {
        const userId = await currentUserId(c);
        if (!userId)
            return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401);
        return userId;
    }
    app.get('/assets', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const assets = await assetsRepo.listAssets(user);
        return c.json(success(assets));
    });
    app.post('/assets', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = createAssetSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        let quantity;
        if (parsed.data.quantity !== undefined) {
            quantity = parseMoney(parsed.data.quantity);
            if (quantity < 0)
                return c.json(failure('INVALID_AMOUNT', 'Kuantitas tidak boleh negatif', 'quantity'), 400);
        }
        let costBasis;
        if (parsed.data.costBasis !== undefined) {
            costBasis = parseMoney(parsed.data.costBasis);
            if (costBasis < 0)
                return c.json(failure('INVALID_AMOUNT', 'Cost basis tidak boleh negatif', 'costBasis'), 400);
        }
        let initialValue;
        if (parsed.data.initialValue !== undefined) {
            initialValue = parseMoney(parsed.data.initialValue);
            if (initialValue < 0)
                return c.json(failure('INVALID_AMOUNT', 'Nilai tidak boleh negatif', 'initialValue'), 400);
        }
        const asset = await assetsRepo.createAsset(user, { ...parsed.data, quantity, costBasis, initialValue });
        return c.json(success(asset), 201);
    });
    app.get('/assets/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const asset = await assetsRepo.getAsset(user, id);
        if (!asset)
            return c.json(failure('NOT_FOUND', 'Aset tidak ditemukan'), 404);
        return c.json(success(asset));
    });
    app.patch('/assets/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = updateAssetSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        try {
            const asset = await assetsRepo.updateAsset(user, id, parsed.data);
            return c.json(success(asset));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'ASSET_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Aset tidak ditemukan'), 404);
            throw error;
        }
    });
    app.delete('/assets/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const deleted = await assetsRepo.deleteAsset(user, id);
        if (!deleted)
            return c.json(failure('NOT_FOUND', 'Aset tidak ditemukan'), 404);
        return c.json(success({ id, deleted: true }));
    });
    app.post('/assets/:id/valuations', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = valuationSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        let totalValue;
        try {
            totalValue = parseMoney(parsed.data.totalValue);
        }
        catch (error) {
            return c.json(failure('INVALID_AMOUNT', error instanceof Error ? error.message : 'Jumlah tidak valid', 'totalValue'), 400);
        }
        if (totalValue < 0)
            return c.json(failure('INVALID_AMOUNT', 'Nilai tidak boleh negatif', 'totalValue'), 400);
        let unitPrice;
        if (parsed.data.unitPrice !== undefined) {
            unitPrice = parseMoney(parsed.data.unitPrice);
            if (unitPrice < 0)
                return c.json(failure('INVALID_AMOUNT', 'Harga satuan tidak boleh negatif', 'unitPrice'), 400);
        }
        try {
            const valuation = await assetsRepo.addValuation(user, id, {
                ...parsed.data,
                totalValue,
                unitPrice,
            });
            return c.json(success(valuation, `Nilai ${formatIDR(totalValue)} tercatat`));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'ASSET_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Aset tidak ditemukan'), 404);
            throw error;
        }
    });
    app.get('/assets/:id/valuations', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const valuations = await assetsRepo.getValuations(user, id);
        return c.json(success(valuations));
    });
    // Net Worth
    app.get('/networth', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const limit = Math.min(365, Math.max(1, Number(c.req.query('limit') ?? 30)));
        const snapshots = await assetsRepo.listSnapshots(user, limit);
        return c.json(success(snapshots));
    });
    app.get('/networth/breakdown', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const breakdown = await assetsRepo.getNetworthBreakdown(user);
        return c.json(success(breakdown));
    });
    app.post('/networth/snapshot', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const snapshot = await assetsRepo.takeSnapshot(user);
        return c.json(success(snapshot));
    });
    return app;
}
function formatIDR(amount) {
    return `Rp${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
