import { createElement, ChartNoAxesCombined, Plus, Trash2 } from 'lucide';
import { AllocationError, calculateAllocation, LIMITS } from './allocation.js';
import './style.css';

const icons = { chart: ChartNoAxesCombined, plus: Plus, trash: Trash2 };
const numberFormat = new Intl.NumberFormat('ja-JP');
const money = (value) => numberFormat.format(value);
const signedMoney = (value) => `${value > 0 ? '+' : ''}${money(value)}`;
const budgetInput = document.querySelector('#budget');
const allowZero = document.querySelector('#allow-zero');
const rowsContainer = document.querySelector('#bet-rows');
const addButton = document.querySelector('#add-bet');
const validation = document.querySelector('#validation');
let nextId = 0;

function moveNumericCaretToEnd(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches('#budget, .odds-input')) return;
  input.setSelectionRange(input.value.length, input.value.length);
}

function renderIcons(root) {
  root.querySelectorAll('[data-icon]').forEach((placeholder) => {
    placeholder.replaceWith(createElement(icons[placeholder.dataset.icon], { width: 20, height: 20, 'aria-hidden': 'true', 'stroke-width': 1.8 }));
  });
}

function updateRowLabels() {
  const rows = [...rowsContainer.children];
  rows.forEach((row, index) => {
    row.querySelector('.row-number').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('.name-label').textContent = `買い目 ${index + 1}の名前`;
    row.querySelector('.odds-label').textContent = `オッズ ${index + 1}`;
    row.querySelector('.name-input').placeholder = `買い目 ${index + 1}`;
    const removeButton = row.querySelector('.remove-button');
    removeButton.setAttribute('aria-label', `買い目 ${index + 1}を削除`);
    removeButton.title = `買い目 ${index + 1}を削除`;
    removeButton.disabled = rows.length <= 1;
  });
  document.querySelector('#bet-count').textContent = rows.length;
  addButton.disabled = rows.length >= LIMITS.bets;
  addButton.title = addButton.disabled ? '買い目は30点までです' : '買い目を追加';
}

function addRow(name = '', odds = '10') {
  if (rowsContainer.children.length >= LIMITS.bets) return;
  const row = document.querySelector('#bet-template').content.firstElementChild.cloneNode(true);
  const id = nextId++;
  const nameInput = row.querySelector('.name-input');
  const oddsInput = row.querySelector('.odds-input');
  nameInput.id = `name-${id}`;
  oddsInput.id = `odds-${id}`;
  row.querySelector('.name-label').htmlFor = nameInput.id;
  row.querySelector('.odds-label').htmlFor = oddsInput.id;
  nameInput.value = name;
  oddsInput.value = odds;
  oddsInput.setAttribute('aria-describedby', 'validation');
  row.querySelector('.remove-button').addEventListener('click', () => {
    const neighbor = row.nextElementSibling ?? row.previousElementSibling;
    row.remove();
    updateRowLabels();
    updateResults();
    neighbor?.querySelector('.name-input').focus();
  });
  renderIcons(row);
  rowsContainer.append(row);
  updateRowLabels();
  return row;
}

function clearResults() {
  document.querySelectorAll('[data-summary], .amount, .payout, .profit').forEach((element) => {
    element.textContent = '—';
    element.classList.remove('positive', 'negative');
  });
  rowsContainer.querySelectorAll('.bet-row').forEach((row) => {
    row.classList.remove('is-excluded');
    row.querySelector('.excluded-tag').hidden = true;
    row.querySelector('.payout-bar').style.width = '0%';
  });
  document.querySelector('#purchased-count').textContent = '—';
  document.querySelector('#excluded-warning').hidden = true;
  document.querySelector('#live-result').textContent = '';
}

function updateResults() {
  const rows = [...rowsContainer.children];
  const bets = rows.map((row) => ({ name: row.querySelector('.name-input').value, odds: row.querySelector('.odds-input').value }));
  document.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
  validation.hidden = true;
  validation.textContent = '';
  budgetInput.removeAttribute('aria-valuenow');

  let result;
  try {
    const units = budgetInput.value;
    if (!/^\d+$/.test(units) || Number(units) < 1 || Number(units) > LIMITS.budget / 100) {
      throw new AllocationError('予算は1〜10,000の整数（100円単位）で入力してください。', 'budget');
    }
    budgetInput.setAttribute('aria-valuenow', String(Number(units)));
    result = calculateAllocation(Number(units) * 100, bets, allowZero.checked);
  } catch (error) {
    clearResults();
    validation.textContent = error instanceof AllocationError ? error.message : '計算できませんでした。入力内容を確認してください。';
    validation.hidden = false;
    const input = error.field === 'budget' ? budgetInput : error.field === 'odds' ? rows[error.index]?.querySelector('.odds-input') : null;
    input?.setAttribute('aria-invalid', 'true');
    return;
  }

  result.results.forEach((bet, index) => {
    const row = rows[index];
    row.querySelector('.amount').textContent = money(bet.amount);
    row.querySelector('.payout').textContent = money(bet.estimatedPayout);
    const profit = row.querySelector('.profit');
    profit.textContent = signedMoney(bet.estimatedProfit);
    profit.classList.toggle('positive', bet.estimatedProfit > 0);
    profit.classList.toggle('negative', bet.estimatedProfit < 0);
    row.classList.toggle('is-excluded', bet.excluded);
    row.querySelector('.excluded-tag').hidden = !bet.excluded;
    row.querySelector('.payout-bar').style.width = `${(bet.estimatedPayout / result.maximumPayout) * 100}%`;
  });
  const summary = {
    remaining: result.unallocatedAmount,
    total: result.totalAmount,
    'minimum-payout': result.minimumPayout,
    'maximum-payout': result.maximumPayout,
    spread: result.payoutSpread,
    'minimum-profit': result.minimumProfit,
  };
  document.querySelector('#budget-yen').textContent = `${money(result.budget)} 円`;
  Object.entries(summary).forEach(([id, value]) => {
    document.getElementById(id).textContent = id === 'minimum-profit' ? signedMoney(value) : money(value);
  });
  const minimumProfit = document.querySelector('#minimum-profit');
  minimumProfit.classList.toggle('positive', result.minimumProfit > 0);
  minimumProfit.classList.toggle('negative', result.minimumProfit < 0);
  document.querySelector('#purchased-count').textContent = `${result.purchasedCount} / ${rows.length} 点購入`;
  const excludedWarning = document.querySelector('#excluded-warning');
  excludedWarning.hidden = result.purchasedCount === rows.length;
  excludedWarning.textContent = `購入なしの${rows.length - result.purchasedCount}点が的中した場合、払戻金は0円、収支は${signedMoney(-result.totalAmount)}円です。`;
  document.querySelector('#live-result').textContent = `購入合計${money(result.totalAmount)}円、残予算${money(result.unallocatedAmount)}円。購入する買い目の最低払戻金${money(result.minimumPayout)}円。`;
}

renderIcons(document);
addRow('A → B → C', '10');
addRow('A → C → B', '20');
addRow('B → A → C', '50');
budgetInput.addEventListener('input', updateResults);
budgetInput.addEventListener('keydown', (event) => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key) || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  const units = Number(budgetInput.value);
  if (!/^\d+$/.test(budgetInput.value) || !Number.isSafeInteger(units)) return;
  event.preventDefault();
  const nextUnits = units + (event.key === 'ArrowUp' ? 1 : -1);
  budgetInput.value = String(Math.max(1, Math.min(LIMITS.budget / 100, nextUnits)));
  budgetInput.dispatchEvent(new Event('input', { bubbles: true }));
});
for (const eventType of ['click', 'dblclick']) {
  document.addEventListener(eventType, moveNumericCaretToEnd);
}
allowZero.addEventListener('change', updateResults);
rowsContainer.addEventListener('input', updateResults);
addButton.addEventListener('click', () => {
  const row = addRow();
  updateResults();
  row?.querySelector('.odds-input').focus();
});
updateResults();