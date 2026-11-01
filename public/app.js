const $ = selector => document.querySelector(selector);
const key = 'floussi-v1';
const MAX_AMOUNT = 99999999900;
let state = { opening: { CIH: 0, Tijari: 0, Cash: 0 }, transactions: [] };
let filter = 'all';
let editingBank;

const expenseCategories = ['Dentiste', 'Formation', 'Abonnement', 'Alimentation', 'Transport', 'Logement', 'Shopping', 'Santé', 'Autres'];
const incomeCategories = ['E-commerce', 'Digital', 'Services', 'Salaire', 'Autres'];


function today() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Old bank-only data and backups gain a zero cash balance without changing records.
function normalizeState(value) {
  if (value && value.opening && typeof value.opening === 'object' && !Object.hasOwn(value.opening, 'Cash')) {
    return { ...value, opening: { ...value.opening, Cash: 0 } };
  }
  return value;
}

function validState(value) {
  if (!value || !value.opening || !Array.isArray(value.transactions)) return false;
  if (value.transactions.length > 20000) return false;
  if (!['CIH', 'Tijari', 'Cash'].every(bank => Number.isSafeInteger(value.opening[bank]) && Math.abs(value.opening[bank]) <= MAX_AMOUNT)) return false;
  const ids = new Set();
  return value.transactions.every(transaction => {
    if (!transaction || !['income', 'expense'].includes(transaction.type)
      || !['CIH', 'Tijari', 'Cash'].includes(transaction.bank)
      || !Number.isSafeInteger(transaction.amount) || transaction.amount <= 0 || transaction.amount > MAX_AMOUNT
      || !validDate(transaction.date)
      || typeof transaction.category !== 'string' || !transaction.category.trim() || transaction.category.length > 80
      || typeof transaction.note !== 'string' || transaction.note.length > 160
      || typeof transaction.id !== 'string' || !transaction.id || transaction.id.length > 100 || ids.has(transaction.id)) return false;
    ids.add(transaction.id);
    return true;
  });
}

const { messages, categories: categoryTranslations } = window.FloussiI18n;
const languageKey = 'floussi-language';
let language = 'ar';
try { if (localStorage.getItem(languageKey) === 'en') language = 'en'; } catch { /* Session preference remains usable. */ }
const locale = () => language === 'ar' ? 'ar-MA-u-nu-latn' : 'en-GB';
const t = (key, values = {}) => (messages[language][key] || messages.en[key] || key)
  .replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
const categoryLabel = category => categoryTranslations[language][category] || category;
const accountLabel = account => account === 'Cash' ? t('account.cash') : account;
const money = cents => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'MAD', currencyDisplay: 'code' }).format(cents / 100);
let storageMode = 'persistent';
let backupFeedbackKey = '';

function translateDOM() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  for (const attribute of ['aria-label', 'placeholder']) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      element.setAttribute(attribute, t(element.getAttribute('data-i18n-' + attribute)));
    });
  }
  document.querySelectorAll('[data-language-switch]').forEach(button => {
    button.textContent = language === 'ar' ? 'English' : 'العربية';
    button.lang = language === 'ar' ? 'en' : 'ar';
    button.setAttribute('aria-label', t('language.switch'));
  });
  $('#entry-title').textContent = t(editingTransaction ? 'form.editTitle' : 'form.addTitle');
  $('#submit-label').textContent = t(editingTransaction ? 'form.saveEdit' : 'form.submit');
  $('#balance-title').textContent = t('balance.title', { bank: accountLabel(editingBank || 'CIH') });
  $('#backup-feedback').textContent = backupFeedbackKey ? t(backupFeedbackKey) : '';
  $('#feedback').textContent = '';
  updateStorageStatus();
}

function updateStorageStatus() {
  const temporary = storageMode !== 'persistent';
  $('#storage-error').hidden = !temporary;
  $('#storage-error').textContent = temporary ? t(storageMode === 'corrupt' ? 'storage.corrupt' : 'storage.warning') : '';
  for (const key of ['storage.autosave', 'storage.saved']) {
    const element = document.querySelector(`[data-i18n="${key}"]`);
    if (element) element.textContent = t(temporary ? 'storage.sessionLabel' : key);
  }
  document.querySelector('.form-note [data-i18n]').textContent = t(temporary ? 'form.session' : 'form.storage');
}

// Some file previews and private browsers deny storage. Keep the controls usable
// in memory, visibly explain the limitation, and allow a JSON backup to be saved.
try {
  const raw = localStorage.getItem(key);
  if (raw !== null) {
    try {
      const saved = normalizeState(JSON.parse(raw));
      if (!validState(saved)) throw new Error('Invalid saved data');
      state = saved;
    } catch { storageMode = 'corrupt'; }
  }
} catch { storageMode = 'session'; }

function save(next, recovery = false) {
  if (!validState(next)) {
    $('#feedback').textContent = t('form.invalid');
    return false;
  }
  // Never overwrite unreadable, pre-existing data with a blank account.
  if (storageMode !== 'corrupt' || recovery) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      storageMode = 'persistent';
    } catch { storageMode = 'session'; }
  }
  state = next;
  updateStorageStatus();
  return true;
}

let fallbackBackdrop;
function showDialog(dialog) {
  if (typeof dialog.showModal === 'function') { dialog.showModal(); return; }
  if (!fallbackBackdrop) {
    fallbackBackdrop = document.createElement('div');
    fallbackBackdrop.className = 'dialog-backdrop';
    document.body.append(fallbackBackdrop);
  }
  fallbackBackdrop.hidden = false;
  dialog.dataset.fallback = 'true';
  dialog.setAttribute('open', '');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
}
function closeDialog(dialog) {
  if (!dialog.dataset.fallback && typeof dialog.close === 'function') { dialog.close(); return; }
  dialog.removeAttribute('open');
  dialog.removeAttribute('aria-modal');
  if (fallbackBackdrop) fallbackBackdrop.hidden = true;
  dialog.dispatchEvent(new Event('close'));
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const dialog = document.querySelector('dialog[data-fallback][open]');
    if (dialog) { event.preventDefault(); closeDialog(dialog); }
  }
});

function cents(value) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= MAX_AMOUNT ? (negative ? -amount : amount) : NaN;
}

function transactionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    let id;
    do { id = 'txn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); } while (state.transactions.some(item => item.id === id));
    return id;
  }
  return [...crypto.getRandomValues(new Uint32Array(4))].map(value => value.toString(16).padStart(8, '0')).join('-');
}

$('#date').value = today();
$('#month').value = today().slice(0, 7);
let editingTransaction = null;
let toastTimer;
const categoryIcons = { Dentiste: 'tooth', Formation: 'book', Abonnement: 'repeat', 'E-commerce': 'bag', Digital: 'monitor', Services: 'spark', Salaire: 'briefcase', Shopping: 'bag' };
const palette = ['#547e55', '#b7c788', '#ddc7a1', '#8caa9d', '#d6a88a', '#a8b4a0', '#ced6ae', '#8ea37a', '#b4b39d'];

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function options(selected) {
  const categories = [...($('input[name="type"]:checked').value === 'income' ? incomeCategories : expenseCategories)];
  if (selected && !categories.includes(selected)) categories.push(selected);
  $('#category').replaceChildren(...categories.map(category => new Option(categoryLabel(category), category)));
  if (selected) $('#category').value = selected;
}

function openEntry(transaction) {
  const lastBank = $('#bank').value;
  $('#transaction').reset();
  editingTransaction = transaction?.id || null;
  $('#entry-title').textContent = t(transaction ? 'form.editTitle' : 'form.addTitle');
  $('#submit-label').textContent = t(transaction ? 'form.saveEdit' : 'form.submit');
  $('#feedback').textContent = '';
  const type = transaction?.type || 'expense';
  $(`input[name="type"][value="${type}"]`).checked = true;
  options(transaction?.category);
  $('#bank').value = transaction?.bank || lastBank;
  $('#date').value = transaction?.date || today();
  $('#amount').value = transaction ? (transaction.amount / 100).toFixed(2) : '';
  $('#note').value = transaction?.note || '';
  showDialog($('#entry-dialog'));
  requestAnimationFrame(() => $('#amount').focus({ preventScroll: true }));
}

document.querySelectorAll('[data-new]').forEach(button => { button.onclick = () => openEntry(); });
$('.close-dialog').onclick = () => closeDialog($('#entry-dialog'));
$('#entry-dialog').onclose = () => { editingTransaction = null; };

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function transactionRow(transaction) {
  const row = document.createElement('tr');
  const title = cell('', 'title-cell');
  const wrapper = document.createElement('div');
  wrapper.className = 'transaction-title';
  const categoryIcon = document.createElement('span');
  categoryIcon.className = 'transaction-icon' + (transaction.type === 'income' ? ' income-category' : '');
  categoryIcon.append(icon(categoryIcons[transaction.category] || 'wallet'));
  const content = document.createElement('div');
  const category = document.createElement('strong');
  category.textContent = categoryLabel(transaction.category);
  content.append(category);
  if (transaction.note) {
    const note = document.createElement('small');
    note.textContent = transaction.note;
    note.title = transaction.note;
    content.append(note);
  }
  wrapper.append(categoryIcon, content);
  title.append(wrapper);
  const bank = cell('', 'bank-cell');
  const badge = document.createElement('span');
  badge.className = 'badge' + (transaction.bank === 'Tijari' ? ' tijari-badge' : transaction.bank === 'Cash' ? ' cash-badge' : '');
  badge.textContent = accountLabel(transaction.bank);
  bank.append(badge);
  const actions = cell('', 'actions-cell');
  const menu = document.createElement('details');
  menu.className = 'row-menu';
  const toggle = document.createElement('summary');
  toggle.setAttribute('aria-label', t('table.menu', { category: categoryLabel(transaction.category) }));
  toggle.append(icon('more'));
  const menuContent = document.createElement('div');
  const edit = document.createElement('button');
  edit.className = 'edit';
  edit.append(icon('edit'), document.createTextNode(t('table.edit')));
  edit.setAttribute('aria-label', t('table.editLabel', { category: categoryLabel(transaction.category) }));
  edit.onclick = () => { menu.open = false; openEntry(transaction); };
  const remove = document.createElement('button');
  remove.className = 'delete';
  remove.append(icon('trash'), document.createTextNode(t('table.delete')));
  remove.setAttribute('aria-label', t('table.deleteLabel', { category: categoryLabel(transaction.category) }));
  remove.onclick = () => {
    menu.open = false;
    if (confirm(t('table.confirmDelete', { category: categoryLabel(transaction.category), amount: money(transaction.amount) })) && save({
      ...state, transactions: state.transactions.filter(item => item.id !== transaction.id),
    })) { render(); notify(t('notice.deleted')); }
  };
  menuContent.append(edit, remove);
  menu.append(toggle, menuContent);
  actions.append(menu);
  const positive = transaction.type === 'income';
  row.append(title, cell(transaction.date, 'tx-date'), bank,
    cell((positive ? '+' : '−') + money(transaction.amount), positive ? 'positive amount' : 'negative amount'), actions);
  return row;
}

function renderWeekly(monthly) {
  const weeks = Array.from({ length: 4 }, () => ({ income: 0, expense: 0 }));
  monthly.forEach(transaction => {
    const index = Math.min(3, Math.floor((Number(transaction.date.slice(8)) - 1) / 7));
    weeks[index][transaction.type] += transaction.amount;
  });
  const max = Math.max(...weeks.flatMap(week => [week.income, week.expense]));
  const axisMax = max ? Math.ceil(max / 10000) * 10000 : 0;
  const compact = value => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value / 100);
  $('#chart-max').textContent = compact(axisMax);
  $('#chart-mid').textContent = compact(axisMax / 2);
  const month = $('#month').value;
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const labels = ['1 – 7', '8 – 14', '15 – 21', '22 – ' + lastDay];
  const descriptions = [];
  $('#cashflow-chart').replaceChildren(...weeks.map((week, index) => {
    const group = document.createElement('div');
    group.className = 'week-group';
    const bars = document.createElement('div');
    bars.className = 'week-bars';
    for (const type of ['income', 'expense']) {
      const bar = document.createElement('div');
      bar.className = 'chart-bar ' + type + '-bar';
      bar.style.height = (week[type] / (axisMax || 1) * 100) + '%';
      bar.title = t(type === 'income' ? 'chart.income' : 'chart.expense', { amount: money(week[type]) });
      bars.append(bar);
    }
    const label = document.createElement('span');
    label.className = 'week-label';
    label.textContent = labels[index];
    group.append(bars, label);
    descriptions.push(t('chart.period', { days: labels[index], income: money(week.income), expense: money(week.expense) }));
    return group;
  }));
  $('#cashflow-chart').setAttribute('aria-label', descriptions.join(language === 'ar' ? '؛ ' : '; '));
}

function renderSpending(monthly, expense) {
  const grouped = new Map();
  monthly.filter(transaction => transaction.type === 'expense').forEach(transaction => {
    grouped.set(transaction.category, (grouped.get(transaction.category) || 0) + transaction.amount);
  });
  $('#categories').replaceChildren();
  $('#donut-total').textContent = money(expense);
  if (!expense) {
    $('#categories').textContent = t('spending.empty');
    $('#spending-donut').style.setProperty('--segments', '#edf0e7');
    $('#spending-donut').setAttribute('aria-label', t('spending.empty'));
    return;
  }
  let position = 0;
  const segments = [];
  const descriptions = [];
  [...grouped].sort((a, b) => b[1] - a[1]).forEach(([name, amount], index) => {
    const color = palette[index % palette.length];
    const percent = amount / expense * 100;
    segments.push(`${color} ${position}% ${position + percent}%`);
    position += percent;
    const box = document.createElement('div');
    const line = document.createElement('div');
    const label = document.createElement('span');
    const dot = document.createElement('i');
    const percentage = document.createElement('span');
    const value = document.createElement('span');
    const bar = document.createElement('div');
    const fill = document.createElement('i');
    line.className = 'category-line';
    label.className = 'category-name';
    dot.className = 'legend-dot';
    dot.style.background = color;
    label.append(dot, document.createTextNode(categoryLabel(name)));
    percentage.className = 'category-percentage';
    percentage.textContent = Math.round(percent) + '%';
    value.className = 'category-amount';
    value.textContent = money(amount);
    line.append(label, percentage, value);
    bar.className = 'bar';
    fill.style.width = percent + '%';
    fill.style.background = color;
    bar.append(fill);
    box.append(line, bar);
    $('#categories').append(box);
    descriptions.push(categoryLabel(name) + ': ' + money(amount) + '، ' + Math.round(percent) + '%');
  });
  $('#spending-donut').style.setProperty('--segments', segments.join(', '));
  $('#spending-donut').setAttribute('aria-label', descriptions.join(language === 'ar' ? '؛ ' : '; '));
}

function render() {
  const month = $('#month').value;
  const monthly = state.transactions.filter(transaction => transaction.date.startsWith(month));
  const balances = { ...state.opening };
  for (const transaction of state.transactions) {
    balances[transaction.bank] += (transaction.type === 'income' ? 1 : -1) * transaction.amount;
  }
  $('#total').textContent = money(balances.CIH + balances.Tijari + balances.Cash);
  $('#banks-total').textContent = t('balances.banksTotal', { amount: money(balances.CIH + balances.Tijari) });
  $('#cash-balance').textContent = money(balances.Cash);
  $('#cih-balance').textContent = money(balances.CIH);
  $('#tijari-balance').textContent = money(balances.Tijari);
  const sum = type => monthly.filter(transaction => transaction.type === type).reduce((total, transaction) => total + transaction.amount, 0);
  const income = sum('income');
  const expense = sum('expense');
  $('#income').textContent = money(income);
  $('#expense').textContent = money(expense);
  $('#net').textContent = money(income - expense);
  $('#net').className = income - expense < 0 ? 'negative' : 'positive';
  $('#net-insight').textContent = income - expense < 0 ? t('stats.negative') : income ? t('stats.retained', { percent: Math.round((income - expense) / income * 100) }) : t('stats.formula');
  $('#month-name').textContent = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'Africa/Casablanca' }).format(new Date(month + '-15T12:00:00Z'));
  $('#getting-started').hidden = state.transactions.length > 0 || state.opening.CIH !== 0 || state.opening.Tijari !== 0 || state.opening.Cash !== 0;

  const query = $('#search').value.trim().toLocaleLowerCase();
  const visible = monthly.filter(transaction => (filter === 'all' || transaction.type === filter)
    && (transaction.category + ' ' + (categoryTranslations.ar[transaction.category] || '') + ' ' + (categoryTranslations.en[transaction.category] || '') + ' ' + transaction.note + ' ' + transaction.bank + ' ' + accountLabel(transaction.bank) + ' ' + transaction.date).toLocaleLowerCase().includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('#count').textContent = t('transactions.count', { count: visible.length });
  $('#empty').hidden = visible.length > 0;
  $('#rows').replaceChildren(...visible.map(transactionRow));
  $('#empty h3').textContent = t(monthly.length ? 'empty.filtered' : 'empty.title');
  $('#empty p').textContent = t(monthly.length ? 'empty.filteredDescription' : 'empty.description');
  $('#empty [data-new]').hidden = monthly.length > 0;
  renderWeekly(monthly);
  renderSpending(monthly, expense);
}

document.querySelectorAll('input[name="type"]').forEach(input => { input.onchange = () => options(); });
$('#month').onchange = () => {
  if (!/^\d{4}-\d{2}$/.test($('#month').value)) $('#month').value = today().slice(0, 7);
  render();
};
function shiftMonth(offset) {
  const date = new Date($('#month').value + '-15T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return;
  $('#month').value = date.toISOString().slice(0, 7);
  render();
}
$('#prev-month').onclick = () => shiftMonth(-1);
$('#next-month').onclick = () => shiftMonth(1);
$('#current-month').onclick = () => { $('#month').value = today().slice(0, 7); render(); };
$('#search').oninput = render;
function selectFilter(value) {
  filter = value;
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.classList.toggle('selected', button.dataset.filter === filter);
    button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  });
}
document.querySelectorAll('[data-filter]').forEach(button => {
  button.onclick = () => { selectFilter(button.dataset.filter); render(); };
});
selectFilter('all');

$('#transaction').onsubmit = event => {
  event.preventDefault();
  if (!$('#transaction').reportValidity()) return;
  const amount = cents($('#amount').value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || !validDate($('#date').value)) return;
  const wasEditing = Boolean(editingTransaction);
  const transaction = {
    id: editingTransaction || transactionId(), type: $('input[name="type"]:checked').value,
    amount, bank: $('#bank').value, date: $('#date').value,
    category: $('#category').value, note: $('#note').value.trim(),
  };
  const transactions = wasEditing ? state.transactions.map(item => item.id === editingTransaction ? transaction : item) : [...state.transactions, transaction];
  if (save({ ...state, transactions })) {
    $('#month').value = transaction.date.slice(0, 7);
    selectFilter('all');
    $('#search').value = '';
    closeDialog($('#entry-dialog'));
    render();
    notify(t(wasEditing ? 'notice.edited' : 'notice.added'));
  }
};

document.querySelectorAll('[data-bank]').forEach(button => {
  button.onclick = () => {
    editingBank = button.dataset.bank;
    $('#balance-title').textContent = t('balance.title', { bank: accountLabel(editingBank) });
    $('#opening').value = (state.opening[editingBank] / 100).toFixed(2);
    showDialog($('#balance-dialog'));
    requestAnimationFrame(() => $('#opening').focus());
  };
});
$('#cancel').onclick = () => closeDialog($('#balance-dialog'));
$('#balance-form').onsubmit = event => {
  event.preventDefault();
  if (!$('#balance-form').reportValidity()) return;
  const amount = cents($('#opening').value);
  if (Number.isSafeInteger(amount) && save({ ...state, opening: { ...state.opening, [editingBank]: amount } })) {
    closeDialog($('#balance-dialog'));
    render();
    notify(t('notice.balance', { bank: accountLabel(editingBank) }));
  }
};

document.addEventListener('click', event => {
  document.querySelectorAll('.row-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
});
document.querySelectorAll('.sidebar-nav a, .mobile-nav a').forEach(link => {
  link.onclick = () => {
    document.querySelectorAll('.sidebar-nav a, .mobile-nav a').forEach(item => {
      const active = item.hash === link.hash;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    });
  };
});

function download(contents, type, name) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#export').onclick = () => {
  const escape = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  const records = state.transactions.filter(transaction => transaction.date.startsWith($('#month').value));
  const rows = [[t('table.date'), t('csv.type'), t('form.category'), t('table.account'), t('csv.amount'), t('csv.note')],
    ...records.map(transaction => [transaction.date, t('kind.' + transaction.type), categoryLabel(transaction.category),
      transaction.bank, (transaction.amount / 100).toFixed(2), transaction.note])];
  const csv = '\ufeff' + rows.map(row => row.map(escape).join(',')).join('\r\n');
  download(csv, 'text/csv;charset=utf-8', 'floussi-' + $('#month').value + '.csv');
};

$('#backup').onclick = () => {
  download(JSON.stringify(state, null, 2), 'application/json', 'floussi-backup-' + today() + '.json');
  backupFeedbackKey = 'backup.created';
  $('#backup-feedback').textContent = t(backupFeedbackKey);
};
$('#restore').onclick = () => $('#backup-file').click();
$('#backup-file').onchange = async () => {
  const file = $('#backup-file').files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('File too large');
    const imported = normalizeState(JSON.parse(await file.text()));
    if (!validState(imported)) throw new Error('Invalid backup');
    if (!confirm(t('backup.confirm', { count: imported.transactions.length }))) return;
    if (save(imported, true)) {
      render();
      backupFeedbackKey = 'backup.restored'; $('#backup-feedback').textContent = t(backupFeedbackKey);
    }
  } catch {
    backupFeedbackKey = 'backup.invalid'; $('#backup-feedback').textContent = t(backupFeedbackKey);
  } finally {
    $('#backup-file').value = '';
  }
};

window.addEventListener('storage', event => { if (event.key === key) location.reload(); });
document.querySelectorAll('[data-language-switch]').forEach(button => { button.onclick = () => {
  const selected = $('#category').value;
  language = language === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem(languageKey, language); } catch { /* Preference stays in memory. */ }
  $('#toast').hidden = true;
  translateDOM();
  options(selected);
  render();
}; });
translateDOM();
options();
render();
