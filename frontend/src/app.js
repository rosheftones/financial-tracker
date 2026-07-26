// frontend/src/app.js
const API_URL = '/api';
const tg = window.Telegram?.WebApp;


if (tg) {
    try { tg.ready(); tg.expand(); } catch(e) {}
}

const state = {
    accounts: [], categories: [], transactions: [], goals: [],
    currentType: 'expense', selectedEmoji: '🛒', currentDepositGoalId: null,
    guideStep: 0
};

const EMOJIS = ['🏠', '🛒', '🚌', '🍔', '🎓', '💊', '🎉', '🎮', '👕', '📱', '💸', '💼', '🎁', '✈️', '🐶'];
const CHART_COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#5856D6', '#FF2D55'];

const GUIDE_STEPS = [
    { element: 'guide-accounts', text: '1️⃣ Здесь отображаются твои счета (карта, наличка, крипта).' },
    { element: 'guide-savings', text: '2️⃣ Здесь твои накопительные цели и копилки.' },
    { element: 'guide-transactions', text: '3️⃣ Тут списком выводятся последние доходы и расходы.' },
    { element: 'guide-tab-add', text: '4️⃣ Нажми сюда, чтобы быстро внести новую покупку или доход!' }
];

function showNotice(message) {
    if (tg?.initData && tg?.showAlert) tg.showAlert(message);
    else alert(message);
}

async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': tg?.initData || '' }
        };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(`${API_URL}${endpoint}`, options);
        const responseText = await res.text();

        if (!responseText) throw new Error(`Пустой ответ сервера (HTTP ${res.status})`);

        let data;
        try { data = JSON.parse(responseText); } catch (e) {
            throw new Error(`Ошибка ответа (не JSON): ${responseText.substring(0, 100)}`);
        }

        if (!res.ok) throw new Error(data.error || `Ошибка сервера (${res.status})`);
        return data;
    } catch (err) {
        if (err.message.includes('fetch') || err.name === 'TypeError') {
            throw new Error('Бэкенд недоступен! Запустите npm run dev в папке backend');
        }
        throw err;
    }
}

async function initApp() {
    bindEvents();
    renderEmojiPicker();
    try {
        const data = await apiRequest('/init');
        state.accounts = data.accounts || [];
        state.categories = data.categories || [];
        state.transactions = data.transactions || [];
        state.goals = data.goals || [];

        if (data.user?.first_name) {
            document.getElementById('user-greeting').innerText = `Привет, ${data.user.first_name}`;
        }

        refreshUI();
        loadFreeCash();
        checkOnboarding();
    } catch (err) {
        showNotice(err.message);
    }
}

function refreshUI() {
    renderAccounts();
    renderSavings();
    renderTransactions();
    updateFormSelects();
}

async function loadFreeCash() {
    try {
        const data = await apiRequest('/analytics/free-cash');
        document.getElementById('free-cash-byn').innerText = `${data.free_cash_byn} BYN`;
        document.getElementById('free-cash-usd').innerText = `~ $${data.free_cash_usd}`;
    } catch(e) {}
}

function bindEvents() {
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-target');
            document.getElementById(target).classList.add('active');
            if (target === 'tab-forecast') loadForecast();
        };
    });

    document.querySelectorAll('.segment').forEach(seg => {
        seg.onclick = () => {
            document.querySelectorAll('.segment').forEach(s => s.classList.remove('active'));
            seg.classList.add('active');
            state.currentType = seg.getAttribute('data-type');
            updateFormSelects();
        };
    });

    document.getElementById('btn-open-acc-modal').onclick = () => openModal('modal-account');
    document.getElementById('btn-open-cat-modal').onclick = () => openModal('modal-category');
    document.getElementById('btn-open-goal-modal').onclick = () => openModal('modal-goal');
    document.getElementById('btn-restart-guide').onclick = startGuide;

    document.querySelectorAll('.modal-close').forEach(btn => btn.onclick = closeModals);

    document.getElementById('btn-save-acc').onclick = saveAccount;
    document.getElementById('btn-save-cat').onclick = saveCategory;
    document.getElementById('btn-save-goal').onclick = saveGoal;
    document.getElementById('btn-save-deposit').onclick = saveDeposit;

    document.getElementById('transaction-form').onsubmit = saveTransaction;
    document.getElementById('onboarding-btn').onclick = nextGuideStep;
}

function checkOnboarding() {
    if (!localStorage.getItem('minsk_guide_seen')) {
        startGuide();
    }
}

function startGuide() {
    state.guideStep = 0;
    document.getElementById('onboarding-overlay').classList.add('show');
    showGuideStep();
}

function showGuideStep() {
    document.querySelectorAll('.highlight-element').forEach(el => el.classList.remove('highlight-element'));

    if (state.guideStep >= GUIDE_STEPS.length) {
        document.getElementById('onboarding-overlay').classList.remove('show');
        localStorage.setItem('minsk_guide_seen', 'true');
        return;
    }

    const step = GUIDE_STEPS[state.guideStep];
    const targetEl = document.getElementById(step.element);
    if (targetEl) targetEl.classList.add('highlight-element');

    document.getElementById('onboarding-text').innerText = step.text;
}

function nextGuideStep() {
    state.guideStep++;
    showGuideStep();
}

function openModal(id) {
    closeModals();
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('show');
}

function closeModals() {
    document.querySelectorAll('.ios-modal').forEach(m => m.classList.remove('show'));
}

function renderEmojiPicker() {
    const container = document.getElementById('emoji-grid');
    if (!container) return;
    container.innerHTML = EMOJIS.map(emoji =>
        `<button type="button" class="emoji-btn ${emoji === state.selectedEmoji ? 'selected' : ''}">${emoji}</button>`
    ).join('');

    container.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.onclick = (e) => {
            container.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            state.selectedEmoji = e.target.innerText;
        };
    });
}

function renderAccounts() {
    const container = document.getElementById('accounts-list');
    if (!container) return;
    if (state.accounts.length === 0) {
        container.innerHTML = '<div style="color:var(--ios-hint); font-size:14px;">Нет счетов. Нажмите "+ Счет"</div>';
        return;
    }
    container.innerHTML = state.accounts.map(acc => `
    <div class="ios-card-acc">
      <div style="color:var(--ios-hint); font-size:13px;">${acc.name}</div>
      <div class="val">${Number(acc.balance).toFixed(2)} ${acc.currency_code}</div>
    </div>
  `).join('');
}

function renderSavings() {
    const container = document.getElementById('savings-list');
    if (!container) return;
    if (state.goals.length === 0) {
        container.innerHTML = '<div style="color:var(--ios-hint); font-size:13px; text-align:center;">Нет целей. Нажмите "+ Цель"</div>';
        return;
    }
    container.innerHTML = state.goals.map(g => {
        const percent = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
        return `
      <div class="goal-card">
        <div style="display:flex; justify-content:space-between; font-weight:600; font-size:15px;">
          <span>🎯 ${g.title}</span>
          <span>${g.current_amount} / ${g.target_amount} ${g.currency_code}</span>
        </div>
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width: ${percent}%;"></div>
        </div>
        <button class="ios-link-btn" style="text-align:right; font-size:13px;" onclick="window.openDepositModal(${g.id}, '${g.title}')">+ Отложить денег</button>
      </div>
    `;
    }).join('');
}

window.openDepositModal = (goalId, goalTitle) => {
    state.currentDepositGoalId = goalId;
    document.getElementById('deposit-goal-title').innerText = `Цель: ${goalTitle}`;
    const select = document.getElementById('deposit-from-account');
    select.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name} (${a.balance} ${a.currency_code})</option>`).join('');
    openModal('modal-deposit');
};

function renderTransactions() {
    const container = document.getElementById('transactions-list');
    if (!container) return;
    if (state.transactions.length === 0) {
        container.innerHTML = '<li style="justify-content:center; color:var(--ios-hint);">Операций пока нет</li>';
        return;
    }
    container.innerHTML = state.transactions.map(tx => `
    <li>
      <div class="tx-left">
        <span class="tx-icon">${tx.category_icon || '📁'}</span>
        <div>
          <div class="tx-title">${tx.category_name || 'Категория'}</div>
          <div class="tx-sub">${tx.account_name || 'Счет'} ${tx.note ? '• ' + tx.note : ''}</div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-val ${tx.type === 'income' ? 'ios-green' : ''}">
          ${tx.type === 'expense' ? '-' : '+'}${tx.amount} <span style="font-size:12px">${tx.currency_code}</span>
        </div>
        <button class="tx-delete-btn" onclick="window.deleteTx(${tx.id})" title="Удалить">🗑️</button>
      </div>
    </li>
  `).join('');
}

window.deleteTx = async (txId) => {
    if (!confirm('Удалить эту операцию? Баланс счета будет пересчитан.')) return;
    try {
        await apiRequest(`/transactions/${txId}`, 'DELETE');
        await initApp();
    } catch(e) {
        showNotice(e.message);
    }
};

function updateFormSelects() {
    const accSelect = document.getElementById('tx-account');
    const catSelect = document.getElementById('tx-category');
    if (accSelect) accSelect.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name} (${a.currency_code})</option>`).join('');
    if (catSelect) {
        const filtered = state.categories.filter(c => c.type === state.currentType);
        catSelect.innerHTML = filtered.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    }
}

async function saveAccount() {
    const name = document.getElementById('new-acc-name').value.trim();
    const currency_code = document.getElementById('new-acc-currency').value;
    const balance = document.getElementById('new-acc-balance').value || 0;
    if (!name) return showNotice('Введите название счета!');

    await apiRequest('/accounts', 'POST', { name, currency_code, balance });
    closeModals();
    document.getElementById('new-acc-name').value = '';
    initApp();
}

async function saveGoal() {
    const title = document.getElementById('new-goal-title').value.trim();
    const target_amount = document.getElementById('new-goal-target').value;
    const currency_code = document.getElementById('new-goal-currency').value;
    if (!title || !target_amount) return showNotice('Заполните параметры цели!');

    await apiRequest('/savings/goals', 'POST', { title, target_amount, currency_code });
    closeModals();
    document.getElementById('new-goal-title').value = '';
    document.getElementById('new-goal-target').value = '';
    initApp();
}

async function saveDeposit() {
    const account_id = document.getElementById('deposit-from-account').value;
    const amount = document.getElementById('deposit-amount').value;
    if (!amount || parseFloat(amount) <= 0) return showNotice('Укажите корректную сумму!');

    await apiRequest('/savings/deposit', 'POST', {
        goal_id: state.currentDepositGoalId,
        account_id: parseInt(account_id),
        amount: parseFloat(amount)
    });
    closeModals();
    document.getElementById('deposit-amount').value = '';
    initApp();
}

async function saveCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return showNotice('Введите название!');
    await apiRequest('/categories', 'POST', { name, icon: state.selectedEmoji, type: state.currentType });
    closeModals();
    document.getElementById('new-cat-name').value = '';
    initApp();
}

async function saveTransaction(e) {
    e.preventDefault();
    const accId = document.getElementById('tx-account').value;
    const catId = document.getElementById('tx-category').value;
    const amount = document.getElementById('tx-amount').value;
    if (!accId || !catId) return showNotice('Сначала создайте счет и категорию!');

    await apiRequest('/transactions', 'POST', {
        account_id: parseInt(accId),
        category_id: parseInt(catId),
        type: state.currentType,
        amount: parseFloat(amount),
        note: document.getElementById('tx-note').value.trim()
    });

    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-note').value = '';
    await initApp();
    document.querySelector('[data-target="tab-balance"]').click();
}

async function loadForecast() {
    try {
        const data = await apiRequest('/analytics/breakdown');
        document.getElementById('donut-total').innerText = `${data.total_expense} BYN`;

        renderDonutChart(data.categories);
        renderBreakdownList(data.categories);
        renderComments(data.comments);
    } catch(e) {
        console.error('Ошибка загрузки аналитики:', e);
    }
}

function renderDonutChart(categories) {
    const svg = document.getElementById('donut-svg');
    if (!svg) return;
    svg.querySelectorAll('.donut-segment').forEach(el => el.remove());

    let accumulatedPercent = 0;

    categories.forEach((cat, index) => {
        const percent = cat.percentage;
        const color = CHART_COLORS[index % CHART_COLORS.length];

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'donut-segment');
        circle.setAttribute('cx', '21');
        circle.setAttribute('cy', '21');
        circle.setAttribute('r', '15.91549430918954');
        circle.setAttribute('fill', 'transparent');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', '5');

        const strokeDasharray = `${percent} ${100 - percent}`;
        const strokeDashoffset = 100 - accumulatedPercent;

        circle.setAttribute('stroke-dasharray', strokeDasharray);
        circle.setAttribute('stroke-dashoffset', strokeDashoffset.toString());

        svg.appendChild(circle);
        accumulatedPercent += percent;
    });
}

function renderBreakdownList(categories) {
    const container = document.getElementById('category-breakdown-list');
    if (!container) return;
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--ios-hint);">Нет расходов за месяц</div>';
        return;
    }

    container.innerHTML = categories.map((cat, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return `
      <div class="breakdown-row">
        <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:500;">
          <span>${cat.icon} ${cat.name}</span>
          <span>${cat.amount} BYN (${cat.percentage}%)</span>
        </div>
        <div class="breakdown-bar-bg">
          <div class="breakdown-bar-fill" style="width: ${cat.percentage}%; background: ${color};"></div>
        </div>
      </div>
    `;
    }).join('');
}

function renderComments(comments) {
    const container = document.getElementById('student-comments-list');
    if (!container) return;
    if (!comments || comments.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = comments.map(text => `
    <div class="comment-card">${text}</div>
  `).join('');
}

const BACKEND_PROD_URL = 'https://minsk-finance-api-xyz1.onrender.com/api';

const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? '/api'
  : BACKEND_PROD_URL;

document.addEventListener('DOMContentLoaded', initApp);
