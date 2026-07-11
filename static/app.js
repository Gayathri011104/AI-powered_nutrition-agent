/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   NutriBot — AI Nutrition Agent  ·  Frontend JavaScript     ║
 * ║   IBM Watsonx.ai  |  Flask  |  Bootstrap 5                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

/* ════════════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════════════ */
const state = {
  chatHistory: [],          // [{role, content}]
  profile: {},              // active user profile
  familyMembers: [],        // [{name, age, gender, goal, restrictions}]
  waterCount: 0,
  mealLog: {},              // { breakfast: bool, snack1: bool, lunch: bool, snack2: bool, dinner: bool }
  charts: { macro: null, weekly: null },
  theme: 'light',
};

/* ════════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  initTheme();
  renderWaterGlasses();
  initCharts();
  updateDashboardStats();
  renderMealLog();
  attachProfileBadgeClick();

  // Auto-resize textarea
  const ta = document.getElementById('chatInput');
  if (ta) {
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    });
  }
});

/* ════════════════════════════════════════════════════════════════
   LOCAL STORAGE
════════════════════════════════════════════════════════════════ */
function saveToStorage() {
  try {
    localStorage.setItem('nb_profile',       JSON.stringify(state.profile));
    localStorage.setItem('nb_family',        JSON.stringify(state.familyMembers));
    localStorage.setItem('nb_water',         state.waterCount);
    localStorage.setItem('nb_meal_log',      JSON.stringify(state.mealLog));
    localStorage.setItem('nb_chat_history',  JSON.stringify(state.chatHistory.slice(-20)));
    localStorage.setItem('nb_theme',         state.theme);
  } catch (_) {}
}

function loadFromStorage() {
  try {
    state.profile       = JSON.parse(localStorage.getItem('nb_profile'))       || {};
    state.familyMembers = JSON.parse(localStorage.getItem('nb_family'))        || [];
    state.chatHistory   = JSON.parse(localStorage.getItem('nb_chat_history'))  || [];
    state.waterCount    = parseInt(localStorage.getItem('nb_water') || '0', 10);
    state.mealLog       = JSON.parse(localStorage.getItem('nb_meal_log'))      || {};
    state.theme         = localStorage.getItem('nb_theme') || 'light';
  } catch (_) {
    state.profile = {}; state.familyMembers = []; state.chatHistory = []; state.waterCount = 0; state.mealLog = {};
  }

  if (state.profile.name) {
    document.getElementById('activeProfileName').textContent = state.profile.name;
    fillProfileModal(state.profile);
  }
  renderFamilyMembers();
  renderSavedChatHistory();
}

/* ════════════════════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════════════════════ */
function initTheme() {
  applyTheme(state.theme);
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
  }
  if (state.charts.macro || state.charts.weekly) {
    setTimeout(initCharts, 100); // re-render charts with new colours
  }
  saveToStorage();
}

document.getElementById('themeToggle')?.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

/* ════════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════════ */
function showSection(id) {
  // Hide all
  document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  // Show target
  const section = document.getElementById(`section-${id}`);
  if (section) section.classList.add('active');

  const btn = document.getElementById(`nav-${id}`);
  if (btn) btn.classList.add('active');

  // Close mobile offcanvas if open
  const oc = bootstrap.Offcanvas.getInstance(document.getElementById('mobileMenu'));
  if (oc) oc.hide();

  // Lazy render for dashboard
  if (id === 'dashboard') updateDashboardStats();
}

/* ════════════════════════════════════════════════════════════════
   CHAT
════════════════════════════════════════════════════════════════ */
function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = (input?.value || '').trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  appendUserMessage(text);
  state.chatHistory.push({ role: 'user', content: text });

  // Hide quick prompts after first real message
  const qp = document.getElementById('quickPrompts');
  if (qp) qp.style.display = 'none';

  const typingId = showTypingIndicator();
  setBtnState(true);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: state.chatHistory.slice(-12),
        profile: state.profile,
      }),
    });
    const data = await res.json();
    removeTypingIndicator(typingId);

    if (data.error) {
      appendBotMessage(`⚠️ **Error:** ${data.error}`);
    } else {
      appendBotMessage(data.reply);
      state.chatHistory.push({ role: 'assistant', content: data.reply });
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendBotMessage(`⚠️ **Network error:** ${err.message}. Please check your connection.`);
  } finally {
    setBtnState(false);
    saveToStorage();
  }
}

function sendQuick(text) {
  const input = document.getElementById('chatInput');
  if (input) input.value = text;
  sendMessage();
}

function appendUserMessage(text) {
  const container = document.getElementById('chatMessages');
  const row = document.createElement('div');
  row.className = 'msg-row user-row';
  row.innerHTML = `
    <div class="msg-avatar user-avatar"><i class="bi bi-person-fill"></i></div>
    <div class="msg-bubble user-bubble">
      ${escapeHtml(text).replace(/\n/g, '<br>')}
      <div class="msg-time">${timeNow()}</div>
    </div>`;
  container.appendChild(row);
  scrollToBottom(container);
}

function appendBotMessage(markdown) {
  const container = document.getElementById('chatMessages');
  const row = document.createElement('div');
  row.className = 'msg-row bot-row';
  const rendered = typeof marked !== 'undefined'
    ? marked.parse(markdown || '')
    : escapeHtml(markdown || '').replace(/\n/g, '<br>');
  row.innerHTML = `
    <div class="msg-avatar bot-avatar"><i class="bi bi-robot"></i></div>
    <div class="msg-bubble bot-bubble">
      ${rendered}
      <div class="msg-time">${timeNow()}</div>
    </div>`;
  container.appendChild(row);
  scrollToBottom(container);
}

function showTypingIndicator() {
  const container = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();
  const row = document.createElement('div');
  row.id = id;
  row.className = 'msg-row bot-row';
  row.innerHTML = `
    <div class="msg-avatar bot-avatar"><i class="bi bi-robot"></i></div>
    <div class="msg-bubble bot-bubble py-3 px-4">
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>`;
  container.appendChild(row);
  scrollToBottom(container);
  return id;
}

function removeTypingIndicator(id) {
  document.getElementById(id)?.remove();
}

function renderSavedChatHistory() {
  if (!state.chatHistory.length) return;
  const container = document.getElementById('chatMessages');
  state.chatHistory.slice(-20).forEach(turn => {
    if (turn.role === 'user') appendUserMessage(turn.content);
    else appendBotMessage(turn.content);
  });
}

function clearChat() {
  state.chatHistory = [];
  const container = document.getElementById('chatMessages');
  if (container) container.innerHTML = '';
  // Re-show quick prompts
  const qp = document.getElementById('quickPrompts');
  if (qp) qp.style.display = '';
  saveToStorage();
}

function setBtnState(loading) {
  const btn = document.getElementById('sendBtn');
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span class="spinner-border spinner-border-sm"></span>'
    : '<i class="bi bi-send-fill"></i>';
}

/* ════════════════════════════════════════════════════════════════
   MEAL PLAN
════════════════════════════════════════════════════════════════ */
async function generateMealPlan() {
  const goal         = document.getElementById('mp-goal')?.value         || 'balanced nutrition';
  const days         = document.getElementById('mp-days')?.value         || 7;
  const calories     = document.getElementById('mp-calories')?.value     || 1800;
  const restrictions = document.getElementById('mp-restrictions')?.value || '';

  toggleLoader('mealPlanLoader', true);
  toggleOutput('mealPlanOutput', false);

  try {
    const res = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal, days: parseInt(days), profile: {
          restrictions, calories: parseInt(calories), goal,
        },
      }),
    });
    const data = await res.json();
    if (data.error) {
      showToast('Error: ' + data.error, 'danger');
    } else {
      renderMarkdownTo('mealPlanContent', data.plan);
      toggleOutput('mealPlanOutput', true);
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'danger');
  } finally {
    toggleLoader('mealPlanLoader', false);
  }
}

function copyMealPlan() {
  const el = document.getElementById('mealPlanContent');
  if (!el) return;
  navigator.clipboard.writeText(el.innerText)
    .then(() => showToast('Meal plan copied!', 'success'))
    .catch(() => showToast('Copy failed', 'warning'));
}

/* ════════════════════════════════════════════════════════════════
   BMI + TDEE
════════════════════════════════════════════════════════════════ */
async function calculateBMI() {
  const weight   = parseFloat(document.getElementById('bmi-weight')?.value);
  const height   = parseFloat(document.getElementById('bmi-height')?.value);
  const age      = parseInt  (document.getElementById('bmi-age')?.value, 10);
  const gender   = document.getElementById('bmi-gender')?.value  || 'male';
  const activity = document.getElementById('bmi-activity')?.value || 'moderate';

  if (!weight || !height) {
    showToast('Please enter weight and height', 'warning'); return;
  }

  try {
    const [bmiRes, tdeeRes] = await Promise.all([
      fetch('/api/bmi',  { method: 'POST', headers: {'Content-Type':'application/json'},
                           body: JSON.stringify({ weight, height }) }),
      age ? fetch('/api/tdee', { method: 'POST', headers: {'Content-Type':'application/json'},
                                 body: JSON.stringify({ weight, height, age, gender, activity }) })
          : Promise.resolve(null),
    ]);

    const bmiData  = await bmiRes.json();
    const tdeeData = tdeeRes ? await tdeeRes.json() : null;

    if (bmiData.error) { showToast(bmiData.error, 'danger'); return; }

    renderBMIResult(bmiData, tdeeData);

    // Auto-fill dashboard
    if (tdeeData && tdeeData.tdee) updateDashboardCalories(tdeeData.tdee);

  } catch (err) {
    showToast('Error: ' + err.message, 'danger');
  }
}

function renderBMIResult(bmi, tdee) {
  const categoryClass = { 'Underweight': 'bmi-under', 'Normal weight': 'bmi-normal',
                           'Overweight': 'bmi-over',   'Obese': 'bmi-obese' };
  const cls  = categoryClass[bmi.category] || 'bmi-normal';
  const tdeeHtml = tdee?.tdee ? `
    <div class="mt-3 pt-3 border-top w-100 text-center">
      <div class="fw-semibold mb-1">Daily Calorie Needs (TDEE)</div>
      <div style="font-size:2rem;font-weight:700;color:var(--orange)">${tdee.tdee.toLocaleString()}</div>
      <small class="text-muted">kcal / day at selected activity level</small>
      <div class="mt-2 d-flex gap-2 justify-content-center flex-wrap">
        <span class="badge" style="background:var(--green-light);color:var(--green)">
          Weight Loss: ${tdee.tdee - 500} kcal
        </span>
        <span class="badge" style="background:var(--accent-light);color:var(--accent)">
          Maintenance: ${tdee.tdee} kcal
        </span>
        <span class="badge" style="background:var(--orange-light);color:var(--orange)">
          Muscle Gain: ${tdee.tdee + 300} kcal
        </span>
      </div>
    </div>` : '';

  document.getElementById('bmiResults').innerHTML = `
    <div class="bmi-gauge-wrap">
      <canvas id="bmiGauge" width="200" height="200"></canvas>
      <div class="bmi-value-overlay">
        <div class="bmi-number">${bmi.bmi}</div>
        <div style="font-size:11px;color:var(--text-muted)">BMI</div>
      </div>
    </div>
    <span class="bmi-category-badge ${cls}">${bmi.category}</span>
    <p class="text-center text-muted mb-0" style="font-size:13px;max-width:280px">${bmi.advice}</p>
    ${tdeeHtml}
  `;
  drawBMIGauge(bmi.bmi);
}

function drawBMIGauge(bmiVal) {
  const canvas = document.getElementById('bmiGauge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 100, cy = 110, r = 80;

  ctx.clearRect(0, 0, 200, 200);

  // Draw arc segments
  const segments = [
    { start: Math.PI, end: Math.PI * 1.25, color: '#4d90fe' },   // underweight
    { start: Math.PI * 1.25, end: Math.PI * 1.55, color: '#16a34a' }, // normal
    { start: Math.PI * 1.55, end: Math.PI * 1.8,  color: '#ea580c' }, // overweight
    { start: Math.PI * 1.8,  end: Math.PI * 2,    color: '#dc2626' }, // obese
  ];
  segments.forEach(s => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, s.start, s.end);
    ctx.lineWidth = 18;
    ctx.strokeStyle = s.color;
    ctx.stroke();
  });

  // Needle
  const minBMI = 15, maxBMI = 40;
  const norm    = Math.min(Math.max((bmiVal - minBMI) / (maxBMI - minBMI), 0), 1);
  const angle   = Math.PI + norm * Math.PI;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * 65, cy + Math.sin(angle) * 65);
  ctx.lineWidth  = 3;
  ctx.strokeStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue('--text').trim() || '#1a202c';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.documentElement)
                  .getPropertyValue('--accent').trim() || '#0f62fe';
  ctx.fill();
}

/* ════════════════════════════════════════════════════════════════
   FAMILY
════════════════════════════════════════════════════════════════ */
function addFamilyMember() {
  const name         = document.getElementById('fm-name')?.value.trim();
  const age          = document.getElementById('fm-age')?.value;
  const gender       = document.getElementById('fm-gender')?.value;
  const goal         = document.getElementById('fm-goal')?.value;
  const restrictions = document.getElementById('fm-restrictions')?.value.trim();

  if (!name) { showToast('Please enter a name', 'warning'); return; }

  state.familyMembers.push({ name, age: parseInt(age)||0, gender, goal, restrictions });
  saveToStorage();
  renderFamilyMembers();

  // Clear fields
  ['fm-name','fm-age','fm-restrictions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  showToast(`${name} added!`, 'success');
}

function removeFamilyMember(index) {
  state.familyMembers.splice(index, 1);
  saveToStorage();
  renderFamilyMembers();
}

function renderFamilyMembers() {
  const list  = document.getElementById('familyMemberList');
  const count = document.getElementById('memberCount');
  const btn   = document.getElementById('familyPlanBtn');

  if (!list) return;

  if (state.familyMembers.length === 0) {
    list.innerHTML = '<p class="text-muted text-center py-3">No members added yet. Add your first family member!</p>';
    if (count) count.textContent = '0';
    if (btn) btn.disabled = true;
    return;
  }

  if (count) count.textContent = state.familyMembers.length;
  if (btn) btn.disabled = false;

  list.innerHTML = state.familyMembers.map((m, i) => `
    <div class="family-member-card">
      <div class="member-avatar">${m.name.charAt(0).toUpperCase()}</div>
      <div class="member-info">
        <div class="member-name">${escapeHtml(m.name)}</div>
        <div class="member-meta">
          ${m.age ? m.age + ' yrs · ' : ''}${capitalize(m.gender)} · ${escapeHtml(m.goal)}
          ${m.restrictions ? ' · ' + escapeHtml(m.restrictions) : ''}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger ms-auto" onclick="removeFamilyMember(${i})" title="Remove">
        <i class="bi bi-trash3"></i>
      </button>
    </div>`).join('');
}

async function generateFamilyPlan() {
  if (!state.familyMembers.length) {
    showToast('Add at least one family member first', 'warning'); return;
  }
  toggleLoader('familyPlanLoader', true);
  toggleOutput('familyPlanOutput', false);

  try {
    const res = await fetch('/api/family-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: state.familyMembers }),
    });
    const data = await res.json();
    if (data.error) {
      showToast('Error: ' + data.error, 'danger');
    } else {
      renderMarkdownTo('familyPlanContent', data.recommendations);
      toggleOutput('familyPlanOutput', true);
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'danger');
  } finally {
    toggleLoader('familyPlanLoader', false);
  }
}

/* ════════════════════════════════════════════════════════════════
   ANALYZE MEAL
════════════════════════════════════════════════════════════════ */
async function analyzeMeal() {
  const meal = document.getElementById('analyzeMealInput')?.value.trim();
  if (!meal) { showToast('Please describe a meal first', 'warning'); return; }

  toggleLoader('analyzeLoader', true);
  toggleOutput('analyzeOutput', false);

  try {
    const res = await fetch('/api/analyze-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal }),
    });
    const data = await res.json();
    if (data.error) {
      showToast('Error: ' + data.error, 'danger');
    } else {
      renderMarkdownTo('analyzeContent', data.analysis);
      toggleOutput('analyzeOutput', true);
    }
  } catch (err) {
    showToast('Network error: ' + err.message, 'danger');
  } finally {
    toggleLoader('analyzeLoader', false);
  }
}

/* ════════════════════════════════════════════════════════════════
   PROFILE
════════════════════════════════════════════════════════════════ */
function attachProfileBadgeClick() {
  document.getElementById('activeProfileBadge')?.addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('profileModal')).show();
  });
}

function fillProfileModal(p) {
  ['name','age','gender','weight','height','goal','restrictions','conditions']
    .forEach(k => {
      const el = document.getElementById('prof-' + k);
      if (el && p[k] !== undefined) el.value = p[k];
    });
}

function saveProfile() {
  state.profile = {
    name:         document.getElementById('prof-name')?.value.trim()        || 'Guest',
    age:          parseInt(document.getElementById('prof-age')?.value)       || 0,
    gender:       document.getElementById('prof-gender')?.value              || 'male',
    weight:       parseFloat(document.getElementById('prof-weight')?.value)  || 0,
    height:       parseFloat(document.getElementById('prof-height')?.value)  || 0,
    goal:         document.getElementById('prof-goal')?.value                || 'balanced nutrition',
    restrictions: document.getElementById('prof-restrictions')?.value.trim() || '',
    conditions:   document.getElementById('prof-conditions')?.value.trim()   || '',
  };

  saveToStorage();
  document.getElementById('activeProfileName').textContent = state.profile.name;

  bootstrap.Modal.getInstance(document.getElementById('profileModal'))?.hide();
  showToast('Profile saved!', 'success');

  if (state.profile.weight && state.profile.height) updateDashboardStats();
}

/* ════════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════════ */
function updateDashboardStats() {
  const p = state.profile;

  // Profile hint text
  const hint = document.getElementById('db-profile-hint');
  if (hint) hint.textContent = p.name ? `personalised for ${p.name}` : 'set your profile to personalise';

  if (!p.weight || !p.height || !p.age) {
    _updateBMIRing(null, null);
    return;
  }

  const gender   = p.gender || 'male';
  const activity = 'moderate';
  const tdee     = estimateTDEELocal(Number(p.age), gender, Number(p.weight), Number(p.height), activity);
  updateDashboardCalories(tdee);

  // BMI
  const bmiVal = Math.round((p.weight / Math.pow(p.height / 100, 2)) * 10) / 10;
  _updateBMIRing(bmiVal, p);

  // Goal tag
  const goalTag = document.getElementById('db-goal-tag');
  if (goalTag) goalTag.textContent = p.goal || 'Balanced';

  // Micronutrients by goal
  _updateMicroChips(p.goal || '');

  // Meal log render
  renderMealLog();
}

function updateDashboardCalories(tdee) {
  const protein = Math.round(tdee * 0.25 / 4);
  const carbs   = Math.round(tdee * 0.50 / 4);
  const fat     = Math.round(tdee * 0.25 / 9);
  const maxMacro = carbs; // carbs is always largest, use as 100% reference

  setText('db-calories', tdee.toLocaleString());
  setText('db-protein',  protein + 'g');
  setText('db-carbs',    carbs   + 'g');
  setText('db-fat',      fat     + 'g');

  // Macro progress bars — widths are % of calories
  _setBar('bar-protein',  25, protein + 'g',  'bar-protein-val');
  _setBar('bar-carbs',    50, carbs   + 'g',  'bar-carbs-val');
  _setBar('bar-fat',      25, fat     + 'g',  'bar-fat-val');
  _setBar('bar-calories', 70, tdee.toLocaleString() + ' kcal', 'bar-calories-val');

  updateMacroChart(protein, carbs, fat);
}

function _setBar(barId, pct, label, valId) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (bar) bar.style.width = pct + '%';
  if (val) val.textContent = label;
}

function _updateBMIRing(bmiVal, p) {
  const ringFill = document.getElementById('bmiRingFill');
  const numEl    = document.getElementById('db-bmi-val');
  const catEl    = document.getElementById('db-bmi-cat');
  const advEl    = document.getElementById('db-bmi-advice');
  if (!ringFill) return;

  if (bmiVal === null) {
    ringFill.style.strokeDashoffset = 201;
    if (numEl) numEl.textContent = '—';
    if (catEl) { catEl.textContent = 'Set profile'; catEl.className = 'bmi-category-badge bmi-normal'; }
    if (advEl) advEl.textContent = 'Enter weight & height in your profile.';
    return;
  }

  // Map BMI 10–40 onto 0–100% of circumference (201)
  const pct    = Math.min(Math.max((bmiVal - 10) / 30, 0), 1);
  const offset = Math.round(201 - pct * 201);
  ringFill.style.strokeDashoffset = offset;

  let cat, cls, color, advice;
  if (bmiVal < 18.5) {
    cat = 'Underweight'; cls = 'bmi-under';
    color = 'var(--accent)';
    advice = 'Consider a calorie-surplus plan rich in proteins and healthy fats.';
  } else if (bmiVal < 25) {
    cat = 'Normal Weight'; cls = 'bmi-normal';
    color = 'var(--green)';
    advice = 'Great job! Maintain your current healthy lifestyle.';
  } else if (bmiVal < 30) {
    cat = 'Overweight'; cls = 'bmi-over';
    color = 'var(--orange)';
    advice = 'A moderate calorie deficit with more fibre and lean protein can help.';
  } else {
    cat = 'Obese'; cls = 'bmi-obese';
    color = 'var(--red)';
    advice = 'Please consult a doctor; a structured diet and exercise plan is important.';
  }

  ringFill.style.stroke = color;
  if (numEl) { numEl.textContent = bmiVal; numEl.style.color = color; }
  if (catEl) { catEl.textContent = cat; catEl.className = 'bmi-category-badge ' + cls; }
  if (advEl) advEl.textContent = advice;
}

const _microMap = {
  'weight loss':        ['Fibre', 'Vitamin D', 'Iron', 'Potassium', 'Zinc'],
  'muscle gain':        ['Protein', 'Creatine', 'Vitamin B12', 'Magnesium', 'Zinc'],
  'diabetic-friendly':  ['Fibre', 'Magnesium', 'Chromium', 'Vitamin D', 'Omega-3'],
  'heart-healthy':      ['Omega-3', 'Potassium', 'Magnesium', 'Folate', 'Vitamin E'],
  'balanced nutrition': ['Vitamin D', 'Iron', 'Calcium', 'Fibre', 'Omega-3', 'Magnesium'],
  'high protein vegetarian': ['Iron', 'Vitamin B12', 'Calcium', 'Zinc', 'Omega-3'],
};

function _updateMicroChips(goal) {
  const chips  = document.getElementById('microChips');
  if (!chips) return;
  const list = _microMap[goal.toLowerCase()] || _microMap['balanced nutrition'];
  chips.innerHTML = list.map(n => `<span class="micro-chip">${n}</span>`).join('');
}

/* ── Meal log ── */
const _MEALS = ['breakfast','snack1','lunch','snack2','dinner'];

function toggleMealLog(meal) {
  state.mealLog[meal] = !state.mealLog[meal];
  renderMealLog();
  saveToStorage();
}

function renderMealLog() {
  const labels = { breakfast:'~350 kcal', snack1:'~150 kcal', lunch:'~550 kcal', snack2:'~200 kcal', dinner:'~500 kcal' };
  let logged = 0;
  _MEALS.forEach(m => {
    const on  = !!state.mealLog[m];
    const row = document.getElementById('ml-' + m);
    const dot = document.getElementById('mld-' + m);
    const cal = document.getElementById('mlc-' + m);
    if (row) row.classList.toggle('logged', on);
    if (dot) { dot.className = 'meal-log-dot ' + (on ? 'ml-dot-on' : 'ml-dot-off'); }
    if (cal) cal.textContent = on ? labels[m] : 'not logged';
    if (on) logged++;
  });
  const footer = document.getElementById('ml-logged-count');
  if (footer) footer.textContent = logged + '/' + _MEALS.length;
}

function estimateTDEELocal(age, gender, weight, height, activity) {
  let bmr;
  if (gender === 'male') bmr = 88.362 + 13.397*weight + 4.799*height - 5.677*age;
  else                    bmr = 447.593 + 9.247*weight + 3.098*height - 4.330*age;
  const mult = { sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9 };
  return Math.round(bmr * (mult[activity] || 1.55));
}

/* ════════════════════════════════════════════════════════════════
   CHARTS
════════════════════════════════════════════════════════════════ */
function initCharts() {
  initMacroChart();
  initWeeklyChart();
  initWaterGlasses();
}

function getChartColors() {
  const dark = state.theme === 'dark';
  return {
    text:    dark ? '#e2e8f0' : '#1a202c',
    muted:   dark ? '#94a3b8' : '#718096',
    grid:    dark ? '#2d3141' : '#e2e8f0',
    surface: dark ? '#1a1d27' : '#ffffff',
  };
}

function initMacroChart() {
  const canvas = document.getElementById('macroChart');
  if (!canvas) return;
  if (state.charts.macro) { state.charts.macro.destroy(); }
  const c = getChartColors();
  state.charts.macro = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Protein', 'Carbs', 'Fat'],
      datasets: [{
        data: [25, 50, 25],
        backgroundColor: ['#16a34a', '#0f62fe', '#7c3aed'],
        borderColor: c.surface,
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}%` }
        }
      },
      cutout: '68%',
    }
  });
}

function updateMacroChart(protein, carbs, fat) {
  if (!state.charts.macro) initMacroChart();
  const total = protein + carbs + fat;
  if (!total) return;
  const pPct = Math.round(protein/total*100);
  const cPct = Math.round(carbs  /total*100);
  const fPct = Math.round(fat    /total*100);
  state.charts.macro.data.datasets[0].data = [pPct, cPct, fPct];
  state.charts.macro.data.labels = [
    `Protein ${pPct}% (${protein}g)`,
    `Carbs ${cPct}% (${carbs}g)`,
    `Fat ${fPct}% (${fat}g)`,
  ];
  state.charts.macro.update();
  // Update static legend below chart
  const lg = document.querySelector('.macro-legend');
  if (lg) {
    lg.innerHTML = `
      <span><span class="macro-dot" style="background:var(--green)"></span>Protein ${pPct}% · ${protein}g</span>
      <span><span class="macro-dot" style="background:var(--accent)"></span>Carbs ${cPct}% · ${carbs}g</span>
      <span><span class="macro-dot" style="background:var(--purple)"></span>Fat ${fPct}% · ${fat}g</span>
    `;
  }
}

function initWeeklyChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas) return;
  if (state.charts.weekly) { state.charts.weekly.destroy(); }
  const c = getChartColors();
  const days   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const sample = [1820, 2080, 1760, 2150, 1940, 2020, 1680];
  const tdee   = (() => {
    const p = state.profile;
    if (p.weight && p.height && p.age)
      return estimateTDEELocal(Number(p.age), p.gender || 'male', Number(p.weight), Number(p.height), 'moderate');
    return 2000;
  })();

  state.charts.weekly = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Calories',
          data: sample,
          backgroundColor: days.map((_,i) => i === new Date().getDay() - 1 ? 'rgba(15,98,254,.9)' : 'rgba(15,98,254,.35)'),
          borderColor: 'transparent',
          borderRadius: 6,
          borderWidth: 0,
        },
        {
          label: 'Target',
          data: Array(7).fill(tdee),
          type: 'line',
          borderColor: 'rgba(234,88,12,.7)',
          borderWidth: 2,
          borderDash: [4, 3],
          pointRadius: 0,
          fill: false,
          tension: 0,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: c.muted, font: { size: 11 } },
          border: { display: false },
        },
        y: {
          grid: { color: c.grid, drawBorder: false },
          ticks: { color: c.muted, font: { size: 11 }, maxTicksLimit: 5 },
          border: { display: false },
          beginAtZero: false,
          min: 1200,
        },
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { color: c.muted, font: { size: 11 }, boxWidth: 12, padding: 10 }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} kcal` } }
      }
    }
  });
}

/* ════════════════════════════════════════════════════════════════
   WATER TRACKER
════════════════════════════════════════════════════════════════ */
function initWaterGlasses() {
  renderWaterGlasses();
}

function renderWaterGlasses() {
  const container = document.getElementById('waterGlasses');
  if (!container) return;
  container.innerHTML = Array.from({ length: 8 }, (_, i) => `
    <span class="glass-icon ${i < state.waterCount ? 'filled' : ''}"
          onclick="toggleGlass(${i})" title="Glass ${i+1}">🥤</span>
  `).join('');
  setText('waterCount', state.waterCount);
  const bar = document.getElementById('waterProgressBar');
  if (bar) bar.style.width = `${Math.round((state.waterCount / 8) * 100)}%`;
}

function toggleGlass(i) {
  state.waterCount = i < state.waterCount ? i : i + 1;
  renderWaterGlasses();
  saveToStorage();
}

function addWater() {
  if (state.waterCount < 8) { state.waterCount++; renderWaterGlasses(); saveToStorage(); }
  else showToast('Daily water goal reached! 🎉', 'success');
}

function resetWater() {
  state.waterCount = 0;
  renderWaterGlasses();
  saveToStorage();
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════════ */
function toggleLoader(id, show) {
  document.getElementById(id)?.classList.toggle('d-none', !show);
}

function toggleOutput(id, show) {
  document.getElementById(id)?.classList.toggle('d-none', !show);
}

function renderMarkdownTo(id, markdown) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof marked !== 'undefined') {
    el.innerHTML = marked.parse(markdown || '');
  } else {
    el.textContent = markdown || '';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

function showToast(message, type = 'info') {
  const colors = { success: '#16a34a', danger: '#dc2626', warning: '#ea580c', info: '#0f62fe' };
  const icons  = { success: 'check-circle-fill', danger: 'x-circle-fill',
                   warning: 'exclamation-triangle-fill', info: 'info-circle-fill' };

  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(container);
  }

  const id = 'toast-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'toast align-items-center show';
  div.setAttribute('role', 'alert');
  div.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi bi-${icons[type] || 'info-circle-fill'}" style="color:${colors[type]||'#0f62fe'}"></i>
        ${escapeHtml(message)}
      </div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(div);

  new bootstrap.Toast(div, { delay: 3500 }).show();
  div.addEventListener('hidden.bs.toast', () => div.remove());
}
