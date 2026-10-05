#!/usr/bin/env node
/**
 * WhatsApp Parser Test Suite
 *
 * Exercises parse-message.js with 10 test cases covering:
 * - Indonesian shorthand amounts (rb, jt, k)
 * - Raw number amounts
 * - Income / expense / transfer detection
 * - Category auto-detection
 * - Edge cases: slash commands, empty messages, no-amount messages
 *
 * Usage: node test-whatsapp-parser.js
 */

import { parseMessage, isTransactionIntent } from '../../../.hermes/hermes-agent/scripts/whatsapp-bridge/parse-message.js';

const log = (/** @type {string} */ msg) => console.log(msg);
const pass = (/** @type {string} */ label) => log(`  ✅ PASS: ${label}`);
const fail = (/** @type {string} */ label, expected, got) => log(`  ❌ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);

let passed = 0;
let failed = 0;

function assert(/** @type {string} */ label, /** @type {any} */ got, /** @type {any} */ expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) { pass(label); passed++; }
  else { fail(label, expected, got); failed++; }
}

function assertTrue(/** @type {string} */ label, /** @type {any} */ got) {
  if (got) { pass(label); passed++; }
  else { fail(label, true, got); failed++; }
}

function assertFalse(/** @type {string} */ label, /** @type {any} */ got) {
  if (!got) { pass(label); passed++; }
  else { fail(label, false, got); failed++; }
}

function assertIncludes(/** @type {string} */ label, /** @type {any} */ got, /** @type {any} */ value) {
  const gotStr = String(got ?? '');
  const ok = gotStr.includes(String(value));
  if (ok) { pass(label); passed++; }
  else { fail(label, `includes "${value}"`, gotStr); failed++; }
}

log('\n=== WhatsApp Transaction Parser Tests ===\n');

// ── TC1: Basic expense with 'rb' multiplier ──────────────────────────────────
log('TC1: makan 35rb');
{
  const r = parseMessage('makan 35rb');
  assertTrue('  parses to object (not null)', r !== null);
  assertTrue('  amount = 35000', r.amount === 35000);
  assertTrue('  type = expense', r.type === 'expense');
  assertTrue('  category = FOOD', r.category === 'FOOD');
}

// ── TC2: Income with 'jt' multiplier ────────────────────────────────────────
log('\nTC2: gaji 5jt');
{
  const r = parseMessage('gaji 5jt');
  assertTrue('  parses to object', r !== null);
  assertTrue('  amount = 5000000', r.amount === 5_000_000);
  assertTrue('  type = income', r.type === 'income');
  assertTrue('  category = INCOME', r.category === 'INCOME');
}

// ── TC3: Raw number amount (no multiplier) ───────────────────────────────────
log('\nTC3: beli baju 200000');
{
  const r = parseMessage('beli baju 200000');
  assertTrue('  parses to object', r !== null);
  assertTrue('  amount = 200000', r.amount === 200_000);
  assertTrue('  type = expense', r.type === 'expense');
  assertTrue('  category = SHOPPING', r.category === 'SHOPPING');
}

// ── TC4: Transfer with target account ───────────────────────────────────────
log('\nTC4: transfer 500 ke bca');
{
  const r = parseMessage('transfer 500 ke bca');
  assertTrue('  parses to object', r !== null);
  assertTrue('  amount = 500000 (jt implied)', r.amount === 500_000);
  assertTrue('  type = transfer', r.type === 'transfer');
  assertTrue('  category = TRANSFER', r.category === 'TRANSFER');
}

// ── TC5: Utility bill with 'rb' ─────────────────────────────────────────────
log('\nTC5: bayar listrik 150rb');
{
  const r = parseMessage('bayar listrik 150rb');
  assertTrue('  parses to object', r !== null);
  assertTrue('  amount = 150000', r.amount === 150_000);
  assertTrue('  type = expense', r.type === 'expense');
  assertTrue('  category = BILLS', r.category === 'BILLS');
}

// ── TC6: IsTransactionIntent guard ───────────────────────────────────────────
log('\nTC6: isTransactionIntent guard');
{
  assertFalse('  slash command not detected', isTransactionIntent('/start hello'));
  assertFalse('  plain greeting not detected', isTransactionIntent('halo apa kabar'));
  assertFalse('  very short text not detected', isTransactionIntent('ok'));
  assertFalse('  text with tiny number not detected', isTransactionIntent('harga 50'));
  assertTrue('  text with 500+ detected as transaction', isTransactionIntent('harga 500'));
  assertTrue('  makan 35rb detected', isTransactionIntent('makan 35rb'));
  assertTrue('  raw 200000 detected', isTransactionIntent('beli 200000'));
  assertTrue('  5jt detected', isTransactionIntent('gaji 5jt'));
}

// ── TC7: Slash command returns null ───────────────────────────────────────────
log('\nTC7: slash command returns null');
{
  const r = parseMessage('/gaji 5jt');
  assertTrue('  returns null', r === null);
  const r2 = parseMessage('/help');
  assertTrue('  returns null', r2 === null);
}

// ── TC8: Shopping with 'k' multiplier ───────────────────────────────────────
log('\nTC8: beli kopi 15k');
{
  const r = parseMessage('beli kopi 15k');
  assertTrue('  parses to object', r !== null);
  assertTrue('  amount = 15000', r.amount === 15_000);
  assertTrue('  type = expense', r.type === 'expense');
}

// ── TC9: Health category ─────────────────────────────────────────────────────
log('\nTC9: obat 50rb');
{
  const r = parseMessage('obat 50rb');
  assertTrue('  parses to object', r !== null);
  assertTrue('  amount = 50000', r.amount === 50_000);
  assertTrue('  type = expense', r.type === 'expense');
  assertTrue('  category = HEALTH', r.category === 'HEALTH');
}

// ── TC10: Edge cases ─────────────────────────────────────────────────────────
log('\nTC10: edge cases');
{
  // Null / empty
  assertTrue('  null message returns null', parseMessage(null) === null);
  assertTrue('  empty string returns null', parseMessage('') === null);
  // Non-transaction text
  const r = parseMessage('halo apa kabar');
  assertTrue('  non-transaction text returns null', r === null);
  // Has amount but unknown category → defaults to OTHER / EXPENSE
  const r2 = parseMessage('sesuatu 75rb');
  assertTrue('  unknown keyword still parses amount', r2 !== null && r2.amount === 75_000);
  assertTrue('  unknown keyword type = expense', r2 !== null && r2.type === 'expense');
  assertTrue('  unknown keyword category = OTHER', r2 !== null && r2.category === 'OTHER');
  // Description preserved
  const r3 = parseMessage('beli baju 200rb di mall');
  assertIncludes('  description extracted', r3?.description, 'baju');
}

// ── TC11: Juta long-form ─────────────────────────────────────────────────────
log('\nTC11: juta long-form');
{
  const r = parseMessage('bonus 1.5 juta');
  assertTrue('  parses 1.5 juta', r !== null);
  assertTrue('  amount = 1500000', r.amount === 1_500_000);
  assertTrue('  type = income', r.type === 'income');
}

// ── Summary ─────────────────────────────────────────────────────────────────
log('\n=== Results ===');
log(`  Passed: ${passed}`);
log(`  Failed: ${failed}`);
if (failed > 0) {
  log('\n❌ Some tests failed!\n');
  process.exit(1);
} else {
  log('\n✅ All tests passed!\n');
  process.exit(0);
}
