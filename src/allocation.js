export const LIMITS = Object.freeze({ budget: 1_000_000, bets: 30, odds: 9999.99 });

export class AllocationError extends Error {
  constructor(message, field, index) {
    super(message);
    this.name = 'AllocationError';
    this.field = field;
    this.index = index;
  }
}

function parseBudget(value) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || Number(text) < 100 || Number(text) > LIMITS.budget) {
    throw new AllocationError('予算は100〜1,000,000円の整数で入力してください。', 'budget');
  }
  return Number(text);
}

function parseOdds(value, index) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) < 1 || Number(text) > LIMITS.odds) {
    throw new AllocationError('オッズは1〜9,999.99倍、小数第2位までで入力してください。', 'odds', index);
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function calculateAllocation(budgetInput, bets, allowZero = false) {
  const budget = parseBudget(budgetInput);
  if (!Array.isArray(bets) || bets.length < 1 || bets.length > LIMITS.bets) {
    throw new AllocationError('買い目は1〜30点で指定してください。', 'bets');
  }
  const odds = bets.map((bet, index) => parseOdds(bet?.odds, index));
  if (allowZero && bets.length < 2) {
    throw new AllocationError('0円を許可する場合は、買い目を2点以上入力してください。', 'bets');
  }
  if (!allowZero && budget < bets.length * 100) {
    throw new AllocationError(`全点を購入するには${(bets.length * 100).toLocaleString('ja-JP')}円以上の予算が必要です。`, 'budget');
  }

  const units = bets.map(() => 0n);
  let active = odds.map((_, index) => index);
  let remaining = BigInt(budget);

  while (active.length > 0) {
    const product = active.reduce((value, index) => value * odds[index], 1n);
    const weights = active.map((index) => product / odds[index]);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0n);
    const clamped = allowZero ? [] : active.filter((_, position) => remaining * weights[position] < 100n * weightSum);

    if (clamped.length > 0) {
      for (const index of clamped) units[index] = 1n;
      remaining -= BigInt(clamped.length) * 100n;
      const fixed = new Set(clamped);
      active = active.filter((index) => !fixed.has(index));
    } else {
      active.forEach((index, position) => {
        units[index] = (remaining * weights[position]) / (100n * weightSum);
      });
      break;
    }
  }

  const totalAmount = Number(units.reduce((sum, value) => sum + value, 0n) * 100n);
  const results = bets.map((bet, index) => {
    const amount = Number(units[index] * 100n);
    const estimatedPayout = Number(units[index] * odds[index]);
    return {
      name: String(bet.name ?? '').trim() || `買い目 ${index + 1}`,
      odds: Number(odds[index]) / 100,
      amount,
      estimatedPayout,
      estimatedProfit: estimatedPayout - totalAmount,
      excluded: amount === 0,
    };
  });
  const purchased = results.filter((bet) => !bet.excluded);
  if (allowZero && purchased.length < 2) {
    throw new AllocationError('購入できる買い目が2点未満です。予算を増やすか、0円の許可をオフにしてください。', 'bets');
  }
  const minimumPayout = Math.min(...purchased.map((bet) => bet.estimatedPayout));
  const maximumPayout = Math.max(...purchased.map((bet) => bet.estimatedPayout));
  return {
    budget,
    totalAmount,
    unallocatedAmount: budget - totalAmount,
    minimumPayout,
    maximumPayout,
    payoutSpread: maximumPayout - minimumPayout,
    minimumProfit: minimumPayout - totalAmount,
    purchasedCount: purchased.length,
    results,
  };
}