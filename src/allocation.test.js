import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAllocation, AllocationError } from './allocation.js';

const bets = (...odds) => odds.map((value) => ({ odds: value }));

test('proportional allocation floors to 100 yen and uses actual purchases for profit', () => {
  for (const allowZero of [false, true]) {
    const result = calculateAllocation(10000, bets(10, 20, 50), allowZero);
    assert.deepEqual(result.results.map((row) => row.amount), [5800, 2900, 1100]);
    assert.deepEqual(result.results.map((row) => row.estimatedPayout), [58000, 58000, 55000]);
    assert.deepEqual(result.results.map((row) => row.estimatedProfit), [48200, 48200, 45200]);
    assert.equal(result.totalAmount, 9800);
    assert.equal(result.unallocatedAmount, 200);
    assert.equal(result.payoutSpread, 3000);
    assert.equal(result.minimumProfit, 45200);
  }
});

test('does not replace proportional flooring with minimum-spread optimization', () => {
  const result = calculateAllocation(10000, bets(3, 5, 10));
  assert.deepEqual(result.results.map((row) => row.amount), [5200, 3100, 1500]);
  assert.equal(result.payoutSpread, 600);
});

test('zero toggle either excludes or clamps high-odds bets', () => {
  const allowed = calculateAllocation(1000, bets(2, 3, 100), true);
  assert.deepEqual(allowed.results.map((row) => row.amount), [500, 300, 0]);
  assert.equal(allowed.purchasedCount, 2);
  assert.equal(allowed.minimumPayout, 900);
  assert.equal(allowed.results[2].estimatedProfit, -800);
  assert.equal(allowed.results[2].excluded, true);
  const required = calculateAllocation(1000, bets(2, 3, 100));
  assert.deepEqual(required.results.map((row) => row.amount), [500, 300, 100]);
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