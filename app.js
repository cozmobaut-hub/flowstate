const API_BASE = ""; // same origin

function saveToken(token) { localStorage.setItem("fs_token", token); }
function getToken() { return localStorage.getItem("fs_token"); }
function clearToken() { localStorage.removeItem("fs_token"); }

async function readUsers() {
  try {
    const res = await fetch("data/users.json", { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

function makeTokenFor(username) {
  return btoa(JSON.stringify({ username, ts: Date.now() }));
}
function usernameFromToken(token) {
  try {
    const obj = JSON.parse(atob(token));
    return obj.username;
  } catch (e) {
    return null;
  }
}

// --- user helpers for static (GitHub Pages) mode --------------------------------
async function getCurrentUserObj() {
  const token = getToken();
  const username = usernameFromToken(token);
  if (!username) return null;
  const users = await readUsers();
  const extra = JSON.parse(localStorage.getItem("fs_extra_users") || "[]");
  const all = users.concat(extra);
  let user = all.find(u => u.username === username);
  if (!user) return null;

  const overrides = JSON.parse(localStorage.getItem("fs_user_overrides") || "{}");
  const o = overrides[username];
  if (o && typeof o.balance === 'number') user.balance = o.balance;
  return user;
}

function saveUserBalance(username, balance) {
  const overrides = JSON.parse(localStorage.getItem("fs_user_overrides") || "{}");
  overrides[username] = overrides[username] || {};
  overrides[username].balance = balance;
  localStorage.setItem("fs_user_overrides", JSON.stringify(overrides));
}

async function placeBet(marketId, amount, outcome) {
  const user = await getCurrentUserObj();
  if (!user) throw new Error("Not logged in");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");
  if (amt > user.balance) throw new Error("Insufficient funds");
  const newBal = Math.round((user.balance - amt) * 100) / 100;
  saveUserBalance(user.username, newBal);
  // store a simple bets list (optional)
  const bets = JSON.parse(localStorage.getItem("fs_bets") || "[]");
  bets.push({ marketId, outcome, amount: amt, user: user.username, ts: Date.now() });
  localStorage.setItem("fs_bets", JSON.stringify(bets));
  return { balance: newBal };
}

async function getAllUsersForLeaderboard() {
  const users = await readUsers();
  const extra = JSON.parse(localStorage.getItem("fs_extra_users") || "[]");
  const all = users.concat(extra).map(u => ({ username: u.username, balance: u.balance || 0 }));
  const overrides = JSON.parse(localStorage.getItem("fs_user_overrides") || "{}");
  return all.map(u => ({ username: u.username, balance: overrides[u.username]?.balance ?? u.balance }));
}

// ----------------- SHARED MARKETS -----------------

const SAMPLE_MARKETS = [
  {
    id: 'm1',
    title: 'Prologue Prelim 1',
    meta: 'AFF: Qulici-Flynn, NEG: Hawbaker-Owens',
    outcomes: [
      { key: 'A', label: 'AFF', odds: -130 },
      { key: 'B', label: 'NEG', odds: +110 }
    ],
    deadline: '2026-10-05 20:00'
  }
  // add more markets here

  {
    "id": "m2",
    "title": "Prologue Prelim 2",
    "meta": "AFF: Hawbaker-Owens, NEG: Flood-Maganda",
    "outcomes": [
      {
        "key": "AFF",
        "label": "Hawbaker-Owens",
        "odds": 80
      },
      {
        "key": "NEG",
        "label": "Flood-Maganda",
        "odds": -90
      }
    ],
    "deadline": "2026-06-18 12:00"
  },];

function renderMarketsInto(containerId, options = { showBetControls: false }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  SAMPLE_MARKETS.forEach(m => {
    const card = document.createElement('div');
    card.className = 'market-card';
    card.innerHTML = `
      <div class="market-title">${m.title}</div>
      <div class="market-meta">
        <span>${m.meta}</span>
        <span class="badge badge-open">OPEN</span>
      </div>
      <div class="market-odds-row"></div>
      <div class="market-footer">
        <span class="muted">Deadline: ${m.deadline}</span>
      </div>
    `;

    const oddsRow = card.querySelector('.market-odds-row');

    m.outcomes.forEach(o => {
      const pill = document.createElement('div');
      pill.className = 'outcome-pill';

      if (options.showBetControls) {
        // full version for markets.html
        pill.innerHTML = `
          <div>
            <strong>${o.label}</strong>
            <span class="odds">${o.odds}</span>
          </div>
          <div style="margin-top:8px">
            <input type="number" min="1" placeholder="Amount"
                   class="bet-amount"
                   data-market="${m.id}"
                   data-outcome="${o.key}">
            <button class="btn-primary btn-bet"
                    data-market="${m.id}"
                    data-outcome="${o.key}">
              Bet
            </button>
          </div>
        `;
      } else {
        // simple read-only version for dashboard
        pill.innerHTML = `
          <span>${o.label}</span>
          <span class="odds">${o.odds}</span>
        `;
      }

      oddsRow.appendChild(pill);
    });

    container.appendChild(card);
  });

  if (options.showBetControls) {
    document.querySelectorAll('.btn-bet').forEach(btn => {
      btn.addEventListener('click', async () => {
        const market = btn.getAttribute('data-market');
        const outcome = btn.getAttribute('data-outcome');
        const input = document.querySelector(
          `.bet-amount[data-market="${market}"][data-outcome="${outcome}"]`
        );
        const amt = Number(input.value);
        const err = () => alert('Bet failed. Check balance and amount.');

        try {
          const res = await placeBet(market, amt, outcome);
          alert(`Bet placed. New balance: $${res.balance}`);
          const b = document.getElementById('balanceText');
          if (b) b.textContent = `$${res.balance}`;
        } catch {
          err();
        }
      });
    });
  }
}

// ----------------- AUTH / UI -----------------

async function signup() {
  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;
  const errorEl = document.getElementById("signupError");
  errorEl.textContent = "";
  if (!username || !password) { errorEl.textContent = "Missing fields."; return; }

  // Try server first
  try {
    const res = await fetch(`${API_BASE}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const data = await res.json();
      saveToken(data.token);
      window.location.href = "dashboard.html";
      return;
    }
  } catch (e) { /* ignore and fallback */ }

  // Fallback: local users.json (signup only in-memory)
  const users = await readUsers();
  if (users.find(u => u.username === username)) {
    errorEl.textContent = "Username taken.";
    return;
  }
  const user = { username, password, balance: 300 };
  const extraUsers = JSON.parse(localStorage.getItem("fs_extra_users") || "[]");
  extraUsers.push(user);
  localStorage.setItem("fs_extra_users", JSON.stringify(extraUsers));
  saveToken(makeTokenFor(username));
  window.location.href = "dashboard.html";
}

async function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  if (!username || !password) { errorEl.textContent = "Missing fields."; return; }

  // Try server
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const data = await res.json();
      saveToken(data.token);
      window.location.href = "dashboard.html";
      return;
    }
  } catch (e) { /* fallback below */ }

  // Fallback: check data/users.json and localStorage extras
  const users = await readUsers();
  const extra = JSON.parse(localStorage.getItem("fs_extra_users") || "[]");
  const all = users.concat(extra);
  const user = all.find(u => u.username === username && u.password === password);
  if (!user) {
    errorEl.textContent = "Login failed.";
    return;
  }
  saveToken(makeTokenFor(username));
  window.location.href = "dashboard.html";
}

async function loadMe() {
  const token = getToken();
  if (!token) {
    window.location.href = "index.html";
    return;
  }

  // Try server
  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const topbarUser = document.getElementById("topbarUser");
      const balanceText = document.getElementById("balanceText");
      if (topbarUser) topbarUser.textContent = data.user.username;
      if (balanceText) balanceText.textContent = `$${data.user.balance}`;
      return;
    }
  } catch (e) { /* fallback */ }

  // Fallback: read users.json and local extras
  const username = usernameFromToken(token);
  if (!username) { clearToken(); window.location.href = "index.html"; return; }
  const users = await readUsers();
  const extra = JSON.parse(localStorage.getItem("fs_extra_users") || "[]");
  const all = users.concat(extra);
  const user = all.find(u => u.username === username);
  if (!user) { clearToken(); window.location.href = "index.html"; return; }

  const overrides = JSON.parse(localStorage.getItem("fs_user_overrides") || "{}");
  const o = overrides[username];
  const effectiveBalance = (o && typeof o.balance === 'number') ? o.balance : user.balance;

  const topbarUser = document.getElementById("topbarUser");
  const balanceText = document.getElementById("balanceText");
  if (topbarUser) topbarUser.textContent = user.username;
  if (balanceText) balanceText.textContent = `$${effectiveBalance}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const signupBtn = document.getElementById("signupBtn");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (signupBtn) signupBtn.addEventListener("click", signup);
  if (loginBtn) loginBtn.addEventListener("click", login);
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearToken();
      window.location.href = "index.html";
    });
  }

  // any page that cares about user/balance
  if (document.getElementById("balanceText")) {
    loadMe();
  }

  // page-specific markets
  if (document.getElementById("marketsList")) {
    // full betting UI on markets page
    renderMarketsInto("marketsList", { showBetControls: true });
  }
  if (document.getElementById("marketGrid")) {
    // read-only preview on dashboard
    renderMarketsInto("marketGrid", { showBetControls: false });
  }
});