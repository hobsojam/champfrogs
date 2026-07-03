const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateOrder } = require('./handlers');
const { CARD_IDS } = require('./sessions');

test('accepts all 10 card IDs in any order', () => {
  assert.equal(validateOrder([...CARD_IDS]), true);
  assert.equal(validateOrder([...CARD_IDS].reverse()), true);
});

test('rejects non-arrays', () => {
  assert.equal(validateOrder(null), false);
  assert.equal(validateOrder(undefined), false);
  assert.equal(validateOrder('CHAMPFROGS'), false);
  assert.equal(validateOrder({ 0: 'C' }), false);
});

test('rejects wrong length', () => {
  assert.equal(validateOrder(CARD_IDS.slice(0, 9)), false);
  assert.equal(validateOrder([...CARD_IDS, 'C']), false);
  assert.equal(validateOrder([]), false);
});

test('rejects duplicates', () => {
  const withDup = [...CARD_IDS];
  withDup[9] = withDup[0];
  assert.equal(validateOrder(withDup), false);
});

test('rejects unknown card IDs', () => {
  const withBogus = [...CARD_IDS];
  withBogus[0] = 'X';
  assert.equal(validateOrder(withBogus), false);
});
