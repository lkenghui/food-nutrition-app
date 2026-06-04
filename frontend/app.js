// ── State ─────────────────────────────────────────────────────────────────
let lastResult = null;
let selectedMealType = "breakfast";

// ── Service Worker ────────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/static/sw.js").catch(() => {});
}

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach(s => s.classList.toggle("active", s.id === `tab-${name}`));
  if (name === "today") loadToday();
  if (name === "history") loadHistory();
}

// ── Meal type chips ───────────────────────────────────────────────────────
function selectMealType(el) {
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  selectedMealType = el.dataset.type;
}

// ── Analyse food ──────────────────────────────────────────────────────────
async function analyseFood() {
  const desc = document.getElementById("food-input").value.trim();
  if (!desc) return;

  const btn = document.getElementById("analyse-btn");
  btn.disabled = true;
  btn.textContent = "Analysing…";
  document.getElementById("result-card").style.display = "none";
  document.getElementById("log-status").style.display = "none";

  try {
    const res = await fetch("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc, meal_type: selectedMealType }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    lastResult = { ...data, description: desc };
    showResult(data, desc);
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyse";
  }
}

function showResult(data, desc) {
  document.getElementById("result-food-name").textContent = desc;
  document.getElementById("result-serving").textContent = data.serving_note || "";
  document.getElementById("res-calories").textContent = Math.round(data.calories);
  document.getElementById("res-protein").textContent = data.protein_g.toFixed(1) + "g";
  document.getElementById("res-carbs").textContent = data.carbs_g.toFixed(1) + "g";
  document.getElementById("res-fat").textContent = data.fat_g.toFixed(1) + "g";
  document.getElementById("res-fiber").textContent = data.fiber_g.toFixed(1) + "g";

  const hl = document.getElementById("result-highlights");
  hl.innerHTML = (data.highlights || []).map(h =>
    `<div class="highlight-item">${h}</div>`
  ).join("");

  const warn = document.getElementById("result-warning");
  if (data.warning) {
    warn.textContent = "⚠️ " + data.warning;
    warn.style.display = "block";
  } else {
    warn.style.display = "none";
  }

  document.getElementById("result-card").style.display = "block";
}

// ── Log meal ──────────────────────────────────────────────────────────────
async function logMeal() {
  if (!lastResult) return;
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: lastResult.description,
        meal_type: selectedMealType,
        calories: lastResult.calories,
        protein_g: lastResult.protein_g,
        carbs_g: lastResult.carbs_g,
        fat_g: lastResult.fat_g,
        fiber_g: lastResult.fiber_g,
        serving_note: lastResult.serving_note || "",
      }),
    });
    const status = document.getElementById("log-status");
    status.textContent = "✅ Logged!";
    status.style.display = "block";
    document.getElementById("result-card").style.display = "none";
    document.getElementById("food-input").value = "";
    lastResult = null;
    setTimeout(() => { status.style.display = "none"; }, 2500);
  } catch (e) {
    alert("Failed to log: " + e.message);
  }
}

// ── Today tab ─────────────────────────────────────────────────────────────
async function loadToday() {
  const day = new Date().toISOString().slice(0, 10);
  const res = await fetch(`/api/today?day=${day}`);
  const data = await res.json();

  const { totals, goals, meals } = data;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("today-cal", Math.round(totals.calories));
  set("goal-cal", Math.round(goals.calories));
  set("today-pro", Math.round(totals.protein_g));
  set("goal-pro", Math.round(goals.protein_g));
  set("today-carb", Math.round(totals.carbs_g));
  set("goal-carb", Math.round(goals.carbs_g));
  set("today-fat", Math.round(totals.fat_g));
  set("goal-fat", Math.round(goals.fat_g));

  const pct = (val, goal) => Math.min(100, goal > 0 ? (val / goal) * 100 : 0) + "%";
  document.getElementById("bar-cal").style.width  = pct(totals.calories,   goals.calories);
  document.getElementById("bar-pro").style.width  = pct(totals.protein_g,  goals.protein_g);
  document.getElementById("bar-carb").style.width = pct(totals.carbs_g,    goals.carbs_g);
  document.getElementById("bar-fat").style.width  = pct(totals.fat_g,      goals.fat_g);

  const list = document.getElementById("today-list");
  if (!meals.length) {
    list.innerHTML = "<li class='empty-state'>No meals logged today.</li>";
  } else {
    list.innerHTML = meals.map(m => mealItemHTML(m, true)).join("");
  }
}

async function getSuggestion() {
  const day = new Date().toISOString().slice(0, 10);
  const box = document.getElementById("suggestion-box");
  box.style.display = "block";
  box.textContent = "Thinking…";
  const res = await fetch(`/api/suggest?day=${day}`);
  const data = await res.json();
  box.textContent = data.suggestion;
}

// ── History tab ───────────────────────────────────────────────────────────
async function loadHistory() {
  const res = await fetch("/api/history");
  const meals = await res.json();
  const list = document.getElementById("history-list");

  if (!meals.length) {
    list.innerHTML = "<li class='empty-state'>No meals logged yet.</li>";
    return;
  }

  // Group by date
  const groups = {};
  meals.forEach(m => {
    const day = (m.logged_at || "").slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(m);
  });

  list.innerHTML = Object.entries(groups).map(([day, items]) =>
    `<li class="history-date">${formatDate(day)}</li>` +
    items.map(m => `<li>${mealItemHTML(m, false)}</li>`).join("")
  ).join("");
}

// ── Helpers ───────────────────────────────────────────────────────────────
function mealItemHTML(m, showDelete) {
  const badge = m.meal_type || "snack";
  const del = showDelete
    ? `<button class="delete-btn" onclick="deleteMeal(${m.id})">✕</button>`
    : "";
  return `
    <div class="meal-item">
      <span class="meal-type-badge">${badge}</span>
      <div class="meal-info">
        <div class="meal-desc">${escHtml(m.description)}</div>
        <div class="meal-macros">P ${(m.protein_g || 0).toFixed(0)}g · C ${(m.carbs_g || 0).toFixed(0)}g · F ${(m.fat_g || 0).toFixed(0)}g</div>
      </div>
      <span class="meal-cal">${Math.round(m.calories || 0)} kcal</span>
      ${del}
    </div>`;
}

async function deleteMeal(id) {
  await fetch(`/api/meal/${id}`, { method: "DELETE" });
  loadToday();
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Init ──────────────────────────────────────────────────────────────────
// Enter to analyse
document.getElementById("food-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); analyseFood(); }
});
