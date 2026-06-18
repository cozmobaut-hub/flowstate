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

  const topbarUser = document.getElementById("topbarUser");
  const balanceText = document.getElementById("balanceText");
  if (topbarUser) topbarUser.textContent = user.username;
  if (balanceText) balanceText.textContent = `$${user.balance}`;
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

  if (document.getElementById("balanceText")) {
    loadMe();
  }
});
