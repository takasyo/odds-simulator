export const LIMITS = Object.freeze({ budget: 1_000_000, bets: 30, odds: 9999.99 });

export class AllocationError extends Error {
  constructor(message, field, index) {
    super(message);
    this.name = 'AllocationError';
    this.field = field;
    this.index = index;
  }
}

function addExtraRange(reachable, minimum, maximum, limitMask) {
  let additions = 0n;
  for (let extra = minimum; extra <= maximum; extra += 1) {
    additions |= reachable << BigInt(extra);
  }
  return additions & limitMask;
}

function getExtraRanges(baseUnits, odds, extraUnits, minimumPayout, spread) {
  return baseUnits.map((base, index) => {
    const minimumUnits = Math.max(base, Math.floor((minimumPayout + odds[index] - 1) / odds[index]));
    const maximumUnits = Math.min(base + extraUnits, Math.floor((minimumPayout + spread) / odds[index]));
    if (minimumUnits > maximumUnits) return null;
    return [minimumUnits - base, maximumUnits - base];
  });
}

function hasAllocationInRange(baseUnits, odds, extraUnits, minimumPayout, spread, allowZero) {
  const ranges = getExtraRanges(baseUnits, odds, extraUnits, minimumPayout, spread);
  if (!allowZero) {
    let minimumExtra = 0;
    let maximumExtra = 0;
    for (const range of ranges) {
      if (!range) return false;
      minimumExtra += range[0];
      maximumExtra += range[1];
    }
    return minimumExtra <= extraUnits && extraUnits <= maximumExtra;
  }

  const limitMask = (1n << BigInt(extraUnits + 1)) - 1n;
  let reachable = [1n, 0n, 0n];
  for (let index = 0; index < ranges.length; index += 1) {
    const next = [0n, 0n, 0n];
    if (baseUnits[index] === 0) {
      next[0] |= reachable[0];
      next[1] |= reachable[1];
      next[2] |= reachable[2];
    }
    const range = ranges[index];
    if (range) {
      for (let purchased = 0; purchased <= 2; purchased += 1) {
        const nextCount = Math.min(2, purchased + 1);
        next[nextCount] |= addExtraRange(reachable[purchased], range[0], range[1], limitMask);
      }
    }
    reachable = next;
  }
  return ((reachable[2] >> BigInt(extraUnits)) & 1n) === 1n;
}

function findMinimumSpread(baseUnits, odds, extraUnits, allowZero) {
  const candidates = new Set();
  for (let index = 0; index < baseUnits.length; index += 1) {
    const firstUnit = Math.max(1, baseUnits[index]);
    for (let units = firstUnit; units <= baseUnits[index] + extraUnits; units += 1) {
      candidates.add(units * odds[index]);
    }
  }
  const minimumPayouts = [...candidates].sort((left, right) => left - right);
  const activePayouts = baseUnits
    .map((units, index) => units * odds[index])
    .filter((_, index) => baseUnits[index] > 0);
  const minimumBasePayout = Math.min(...activePayouts);
  const maximumBasePayout = Math.max(...activePayouts);
  const activeIndex = baseUnits.findIndex((units) => units > 0);
  const addedPayout = extraUnits * odds[activeIndex];
  let low = 0;
  let high = Math.max(maximumBasePayout, maximumBasePayout + addedPayout) - minimumBasePayout;

  const hasSpread = (spread) => minimumPayouts.some((minimumPayout) =>
    hasAllocationInRange(baseUnits, odds, extraUnits, minimumPayout, spread, allowZero));

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (hasSpread(middle)) high = middle;
    else low = middle + 1;
  }

  const minimumPayout = minimumPayouts.find((candidate) =>
    hasAllocationInRange(baseUnits, odds, extraUnits, candidate, low, allowZero));
  return { spread: low, minimumPayout };
}

function allocateWithinSpread(baseUnits, odds, extraUnits, minimumPayout, spread, allowZero) {
  const ranges = getExtraRanges(baseUnits, odds, extraUnits, minimumPayout, spread);
  if (!allowZero) {
    const extras = ranges.map((range) => range[0]);
    let remaining = extraUnits - extras.reduce((sum, value) => sum + value, 0);
    for (let index = extras.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const additional = Math.min(remaining, ranges[index][1] - extras[index]);
      extras[index] += additional;
      remaining -= additional;
    }
    return baseUnits.map((units, index) => units + extras[index]);
  }

  const limitMask = (1n << BigInt(extraUnits + 1)) - 1n;
  const suffix = Array(baseUnits.length + 1);
  suffix[baseUnits.length] = [1n, 0n, 0n];
  for (let index = baseUnits.length - 1; index >= 0; index -= 1) {
    const next = [0n, 0n, 0n];
    if (baseUnits[index] === 0) {
      next[0] |= suffix[index + 1][0];
      next[1] |= suffix[index + 1][1];
      next[2] |= suffix[index + 1][2];
    }
    const range = ranges[index];
    if (range) {
      for (let purchased = 0; purchased <= 2; purchased += 1) {
        const nextCount = Math.min(2, purchased + 1);
        next[nextCount] |= addExtraRange(suffix[index + 1][purchased], range[0], range[1], limitMask);
      }
    }
    suffix[index] = next;
  }

  const allocation = [...baseUnits];
  let remaining = extraUnits;
  let purchasedBefore = 0;
  const canReach = (states, minimumCount, extra) => {
    for (let count = minimumCount; count <= 2; count += 1) {
      if (((states[count] >> BigInt(extra)) & 1n) === 1n) return true;
    }
    return false;
  };
  for (let index = 0; index < baseUnits.length; index += 1) {
    const minimumRemainingCount = Math.max(0, 2 - Math.min(2, purchasedBefore));
    if (baseUnits[index] === 0
      && canReach(suffix[index + 1], minimumRemainingCount, remaining)) {
      continue;
    }
    const range = ranges[index];
    const purchasedAfter = Math.min(2, purchasedBefore + 1);
    const requiredAfter = Math.max(0, 2 - purchasedAfter);
    let selectedExtra;
    for (let extra = range[0]; extra <= range[1]; extra += 1) {
      const remainingAfter = remaining - extra;
      if (remainingAfter >= 0
        && canReach(suffix[index + 1], requiredAfter, remainingAfter)) {
        selectedExtra = extra;
        break;
      }
    }
    allocation[index] += selectedExtra;
    remaining -= selectedExtra;
    purchasedBefore += 1;
  }
  return allocation;
}

function optimizeRemainder(units, odds, budget, allowZero) {
  const baseUnits = units.map(Number);
  const numericOdds = odds.map(Number);
  const remainingUnits = Math.floor(budget / 100) - baseUnits.reduce((sum, value) => sum + value, 0);
  if (remainingUnits <= 0) return units;

  const basePayouts = baseUnits.map((value, index) => value * numericOdds[index]);
  const activePayouts = basePayouts.filter((_, index) => baseUnits[index] > 0);
  const bestBaseSpread = Math.max(...activePayouts) - Math.min(...activePayouts);
  let bestSpread = bestBaseSpread;
  let bestExtraUnits = 0;
  let bestAllocation = baseUnits;

  for (let extraUnits = remainingUnits; extraUnits > 0; extraUnits -= 1) {
    const optimal = findMinimumSpread(baseUnits, numericOdds, extraUnits, allowZero);
    if (optimal.spread < bestSpread || (optimal.spread === bestSpread && extraUnits > bestExtraUnits)) {
      bestSpread = optimal.spread;
      bestExtraUnits = extraUnits;
      bestAllocation = allocateWithinSpread(
        baseUnits, numericOdds, extraUnits, optimal.minimumPayout, optimal.spread, allowZero,
      );
    }
  }
  return bestAllocation.map(BigInt);
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

  if (allowZero && units.filter((value) => value > 0n).length < 2) {
    throw new AllocationError('購入できる買い目が2点未満です。予算を増やすか、0円の許可をオフにしてください。', 'bets');
  }
  const optimizedUnits = optimizeRemainder(units, odds, budget, allowZero);

  const totalAmount = Number(optimizedUnits.reduce((sum, value) => sum + value, 0n) * 100n);
  const results = bets.map((bet, index) => {
    const amount = Number(optimizedUnits[index] * 100n);
    const estimatedPayout = Number(optimizedUnits[index] * odds[index]);
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