import { describe, expect, it } from 'vitest';
import { buildBatchSourceRef, similarity } from '../lib/ingest-routes.js';
import { hasApiScope, isAuthorizedForScope } from '../lib/auth-resolver.js';
describe('ingest batch idempotency', () => {
    it('builds stable per-item source refs from source_ref_prefix', () => {
        expect(buildBatchSourceRef('bank_csv', 'bank:', undefined, 0)).toBe('bank:1');
        expect(buildBatchSourceRef('bank_csv', 'bank:', undefined, 1)).toBe('bank:2');
        expect(buildBatchSourceRef('bank_csv', 'bank:', undefined, 0)).toBe('bank:1');
    });
    it('keeps an explicit item source_ref unchanged', () => {
        expect(buildBatchSourceRef('bank_csv', 'bank:', 'statement-row-1', 0)).toBe('statement-row-1');
    });
    it('does not treat unrelated merchants as duplicates', () => {
        expect(similarity('gofood', 'gojek')).toBeLessThanOrEqual(0.7);
    });
});
describe('API-key scopes', () => {
    it('allows only explicitly granted scopes', () => {
        expect(hasApiScope(['ingest:w'], 'ingest:w')).toBe(true);
        expect(hasApiScope(['ingest:w'], 'web')).toBe(false);
        expect(hasApiScope(undefined, 'ingest:w')).toBe(false);
    });
    it('does not grant API keys session-level access', () => {
        expect(isAuthorizedForScope({ authMethod: 'api_key', scopes: ['ingest:w'] }, 'ingest:w')).toBe(true);
        expect(isAuthorizedForScope({ authMethod: 'api_key', scopes: ['ingest:w'] }, 'web')).toBe(false);
        expect(isAuthorizedForScope({ authMethod: 'session', scopes: null }, 'web')).toBe(true);
    });
});
