import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAllocation, AllocationError } from './allocation.js';

const bets = (...odds) => odds.map((value) => ({ odds: value }));

test('minimizes payout spread by redistributing remaining 100-yen units', () => {
  for (const allowZero of [false, true]) {
    const result = calculateAllocation(10000, bets(10, 20, 50), allowZero);
    assert.deepEqual(result.results.map((row) => row.amount), [5800, 3000, 1200]);
    assert.deepEqual(result.results.map((row) => row.estimatedPayout), [58000, 60000, 60000]);
    assert.deepEqual(result.results.map((row) => row.estimatedProfit), [48000, 50000, 50000]);
    assert.equal(result.totalAmount, 10000);
    assert.equal(result.unallocatedAmount, 0);
    assert.equal(result.payoutSpread, 2000);
    assert.equal(result.minimumProfit, 48000);
  }
});

test('the optimal calculation result', () => {
  for (const allowZero of [false, true]) {
    const result = calculateAllocation(10000, bets(12.9, 11.8, 42.2), allowZero);
    assert.deepEqual(result.results.map((row) => row.amount), [4200, 4500, 1300]);
    assert.deepEqual(result.results.map((row) => row.estimatedPayout), [54180, 53100, 54860]);
    assert.deepEqual(result.results.map((row) => row.estimatedProfit), [44180, 43100, 44860]);
    assert.equal(result.totalAmount, 10000);
    assert.equal(result.unallocatedAmount, 0);
    assert.equal(result.payoutSpread, 1760);
    assert.equal(result.minimumProfit, 43100);
  }
});

test('optimizes payout spread for other odds while retaining the floor allocation as a minimum', () => {
  const result = calculateAllocation(10000, bets(3, 5, 10));
  assert.deepEqual(result.results.map((row) => row.amount), [5200, 3200, 1600]);
  assert.deepEqual(result.results.map((row) => row.estimatedPayout), [15600, 16000, 16000]);
  assert.equal(result.payoutSpread, 400);
});

test('leaves budget unspent when every additional unit worsens payout spread', () => {
  const result = calculateAllocation(900, bets(2, 2));
  assert.deepEqual(result.results.map((row) => row.amount), [400, 400]);
  assert.equal(result.totalAmount, 800);
  assert.equal(result.unallocatedAmount, 100);
  assert.equal(result.payoutSpread, 0);
});

test('zero toggle either excludes or clamps high-odds bets', () => {
  const allowed = calculateAllocation(1000, bets(2, 3, 100), true);
  assert.deepEqual(allowed.results.map((row) => row.amount), [600, 400, 0]);
  assert.equal(allowed.purchasedCount, 2);
  assert.equal(allowed.minimumPayout, 1200);
  assert.equal(allowed.results[2].estimatedProfit, -1000);
  assert.equal(allowed.results[2].excluded, true);
  const required = calculateAllocation(1000, bets(2, 3, 100));
  assert.deepEqual(required.results.map((row) => row.amount), [500, 400, 100]);
});

test('handles repeated minimum clamping and exact boundaries', () => {
  assert.deepEqual(calculateAllocation(500, bets(1, 4, 100)).results.map((row) => row.amount), [300, 100, 100]);
  assert.deepEqual(calculateAllocation(300, bets(1, 1, 9999.99)).results.map((row) => row.amount), [100, 100, 100]);
  assert.deepEqual(calculateAllocation(600, bets('1.01', '1.01', '1.01')).results.map((row) => row.amount), [200, 200, 200]);
  assert.equal(calculateAllocation(199, bets(2)).unallocatedAmount, 99);
});

test('validates incomplete, nonfinite, unsupported and insufficient inputs', () => {
  for (const budget of ['', '1.5', -100, 0, 99, NaN, Infinity, 1000001]) {
    assert.throws(() => calculateAllocation(budget, bets(2)), AllocationError);
  }
  for (const odds of ['', '.', '2.', 0, -1, 0.99, NaN, Infinity, '2e1', '1.001', 10000]) {
    assert.throws(() => calculateAllocation(1000, bets(odds)), AllocationError);
  }
  assert.throws(() => calculateAllocation(1000, []), AllocationError);
  assert.throws(() => calculateAllocation(1000, null), AllocationError);
  assert.throws(() => calculateAllocation(100, bets(2, 3)), AllocationError);
  assert.throws(() => calculateAllocation(200, bets(1, 1, 100), true), /2点未満/);
  assert.throws(() => calculateAllocation(1000, bets(2), true), /2点以上/);
  assert.throws(() => calculateAllocation(1000000, bets(...Array(31).fill(2))), AllocationError);
});

test('bounded generated inputs respect monetary invariants in both modes', () => {
  for (let count = 2; count <= 12; count++) {
    for (let sample = 1; sample <= 40; sample++) {
      const rows = bets(...Array.from({ length: count }, (_, index) => ((sample * 83 + index * 137) % 9990 + 100) / 100));
      const budget = count * 100 + sample * 113;
      for (const allowZero of [false, true]) {
        let result;
        try {
          result = calculateAllocation(budget, rows, allowZero);
        } catch (error) {
          assert.ok(allowZero && error instanceof AllocationError && /2点未満/.test(error.message));
          continue;
        }
        assert.ok(result.totalAmount <= budget);
        assert.ok(result.unallocatedAmount >= 0 && result.unallocatedAmount < 100 * count);
        assert.ok(result.purchasedCount >= (allowZero ? 2 : count));
        for (const row of result.results) {
          assert.equal(row.amount % 100, 0);
          assert.ok(Number.isSafeInteger(row.estimatedPayout));
          assert.equal(row.estimatedProfit, row.estimatedPayout - result.totalAmount);
          if (!allowZero) assert.ok(row.amount >= 100);
        }
      }
    }
  }
});

test('maximum supported inputs and labels remain safe', () => {
  const result = calculateAllocation(1000000, Array.from({ length: 30 }, () => ({ odds: '9999.99', name: '<test>' })));
  assert.equal(result.results[0].name, '<test>');
  assert.ok(result.results.every((row) => Number.isSafeInteger(row.estimatedPayout)));
});