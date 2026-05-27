const API_BASE = ""; // same origin

function saveToken(token) {
  localStorage.setItem("fs_token", token);
}

function getToken() {
  return localStorage.getItem("fs_token");
}

function clearToken() {
  localStorage.removeItem("fs_token");
}

async function signup() {
  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;
  const errorEl = document.getElementById("signupError");
  errorEl.textContent = "";

  try {
    const res = await fetch(`${API_BASE}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Signup failed.";
      return;
    }
    saveToken(data.token);
    window.location.href = "dashboard.html";
  } catch (e) {
    console.error(e);
    errorEl.textContent = "Network error.";
  }
}

async function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Login failed.";
      return;
    }
    saveToken(data.token);
    window.location.href = "dashboard.html";
  } catch (e) {
    console.error(e);
    errorEl.textContent = "Network error.";
  }
}

async function loadMe() {
  const token = getToken();
  if (!token) {
    window.location.href = "index.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      clearToken();
      window.location.href = "index.html";
      return;
    }

    const topbarUser = document.getElementById("topbarUser");
    const balanceText = document.getElementById("balanceText");
    if (topbarUser) {
      topbarUser.textContent = data.user.username;
    }
    if (balanceText) {
      balanceText.textContent = `$${data.user.balance}`;
    }
  } catch (e) {
    console.error(e);
    clearToken();
    window.location.href = "index.html";
  }
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
