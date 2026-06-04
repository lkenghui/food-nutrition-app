// ── Service Worker ────────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/static/sw.js").catch(() => {});
}

// Inject SVG gradient defs (for calorie ring)
document.body.insertAdjacentHTML("beforeend", `
  <svg class="hidden-svg">
    <defs>
      <linearGradient id="calGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ea580c"/>
        <stop offset="100%" stop-color="#fb923c"/>
      </linearGradient>
    </defs>
  </svg>`);

// ── State ─────────────────────────────────────────────────────────────────
let lastResult   = null;
let photoBase64  = null;
let photoType    = "image/jpeg";
let selectedMealType    = "breakfast";
let selectedGenderVal   = "male";
let selectedActivityVal = 1.375;
let selectedGoalType    = "maintain";
let userGoals = loadGoals();

function loadGoals() {
  try {
    const g = JSON.parse(localStorage.getItem("nutrition_goals") || "null");
    return g || { calories: 2000, protein_g: 50, carbs_g: 250, fat_g: 65, fiber_g: 25 };
  } catch { return { calories: 2000, protein_g: 50, carbs_g: 250, fat_g: 65, fiber_g: 25 }; }
}

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach(s =>
    s.classList.toggle("active", s.id === `tab-${name}`));
  if (name === "today")   loadToday();
  if (name === "history") loadHistory();
  if (name === "profile") loadProfileForm();
}

// ── Meal type selection ───────────────────────────────────────────────────
function selectMealType(el) {
  document.querySelectorAll(".meal-chips .chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  selectedMealType = el.dataset.type;
}

// ── Camera ────────────────────────────────────────────────────────────────
function triggerCamera() {
  document.getElementById("camera-input").click();
}

function removePhoto() {
  photoBase64 = null;
  photoType = "image/jpeg";
  document.getElementById("photo-preview-wrap").style.display = "none";
  document.getElementById("photo-preview").src = "";
}

function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  photoType = file.type || "image/jpeg";

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("photo-preview").src = e.target.result;
    document.getElementById("photo-preview-wrap").style.display = "block";
  };
  reader.readAsDataURL(file);

  // Resize and extract base64 for API
  resizeImage(file, 1024, (base64) => {
    photoBase64 = base64;
    // Auto-analyse
    document.getElementById("food-input").value = "";
    analyseFood();
  });
}

function resizeImage(file, maxPx, callback) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    // Extract pure base64 (strip data URL prefix)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    callback(dataUrl.split(",")[1]);
    photoType = "image/jpeg"; // canvas always outputs jpeg
  };
  img.src = url;
}

// ── Analyse food ──────────────────────────────────────────────────────────
async function analyseFood() {
  const desc  = document.getElementById("food-input").value.trim();
  const isPhoto = !!photoBase64;
  if (!desc && !isPhoto) return;

  const btn = document.getElementById("analyse-btn");
  const btnText = document.getElementById("analyse-btn-text");
  btn.disabled = true;
  btnText.textContent = isPhoto ? "🔍 Recognising food…" : "✨ Analysing…";
  document.getElementById("result-card").style.display = "none";
  document.getElementById("log-status").style.display = "none";

  try {
    let data;
    if (isPhoto) {
      const res = await fetch("/api/analyse-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: photoBase64, media_type: photoType }),
      });
      if (!res.ok) throw new Error(await res.text());
      data = await res.json();
      // Use AI-detected name if no text was typed
      if (!desc && data.food_name) {
        document.getElementById("food-input").value = data.food_name;
      }
    } else {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, meal_type: selectedMealType }),
      });
      if (!res.ok) throw new Error(await res.text());
      data = await res.json();
    }
    lastResult = {
      ...data,
      description: document.getElementById("food-input").value.trim() || data.food_name || "Food",
    };
    showResult(data);
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = "✨ Analyse";
  }
}

function showResult(data) {
  const name = data.food_name || document.getElementById("food-input").value.trim() || "Food";
  document.getElementById("result-food-name").textContent = name;
  document.getElementById("result-serving").textContent   = data.serving_note || "";
  document.getElementById("res-calories").textContent = Math.round(data.calories);
  document.getElementById("res-protein").textContent  = data.protein_g.toFixed(1) + "g";
  document.getElementById("res-carbs").textContent    = data.carbs_g.toFixed(1) + "g";
  document.getElementById("res-fat").textContent      = data.fat_g.toFixed(1) + "g";
  document.getElementById("res-fiber").textContent    = data.fiber_g.toFixed(1) + "g";

  const hl = document.getElementById("result-highlights");
  hl.innerHTML = (data.highlights || []).map(h =>
    `<div class="highlight-item">${escHtml(h)}</div>`).join("");

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
        description:  lastResult.description,
        meal_type:    selectedMealType,
        calories:     lastResult.calories,
        protein_g:    lastResult.protein_g,
        carbs_g:      lastResult.carbs_g,
        fat_g:        lastResult.fat_g,
        fiber_g:      lastResult.fiber_g,
        serving_note: lastResult.serving_note || "",
      }),
    });
    const status = document.getElementById("log-status");
    status.textContent = "✅ Meal logged!";
    status.style.display = "block";
    document.getElementById("result-card").style.display = "none";
    document.getElementById("food-input").value = "";
    removePhoto();
    lastResult = null;
    setTimeout(() => { status.style.display = "none"; }, 2500);
  } catch (e) { alert("Failed to log: " + e.message); }
}

// ── Today tab ─────────────────────────────────────────────────────────────
async function loadToday() {
  const day = new Date().toISOString().slice(0, 10);
  document.getElementById("today-date").textContent =
    new Date().toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" });

  const res  = await fetch(`/api/today?day=${day}`);
  const data = await res.json();
  const { totals, meals } = data;
  const goals = userGoals;

  // Calorie ring
  const calPct = Math.min(1, goals.calories > 0 ? totals.calories / goals.calories : 0);
  const circumference = 314.16;
  document.getElementById("ring-cal-fill").style.strokeDashoffset =
    circumference * (1 - calPct);
  document.getElementById("ring-cal-value").textContent = Math.round(totals.calories);
  document.getElementById("ring-cal-goal").textContent  = Math.round(goals.calories);

  // Macro bars
  const set = (barId, valId, val, goal, unit) => {
    const pct = Math.min(100, goal > 0 ? (val / goal) * 100 : 0);
    document.getElementById(barId).style.width = pct + "%";
    document.getElementById(valId).textContent = Math.round(val) + unit;
  };
  set("rm-bar-pro",  "rm-pro",  totals.protein_g, goals.protein_g, "g");
  set("rm-bar-carb", "rm-carb", totals.carbs_g,   goals.carbs_g,   "g");
  set("rm-bar-fat",  "rm-fat",  totals.fat_g,     goals.fat_g,     "g");
  set("rm-bar-fib",  "rm-fib",  totals.fiber_g,   goals.fiber_g,   "g");

  // Meals list
  const list = document.getElementById("today-list");
  list.innerHTML = meals.length
    ? meals.map(m => `<li>${mealItemHTML(m, true)}</li>`).join("")
    : "<li class='empty-state'>No meals logged today.</li>";
}

async function getSuggestion() {
  const day = new Date().toISOString().slice(0, 10);
  const box = document.getElementById("suggestion-box");
  box.style.display = "block";
  box.textContent = "💭 Thinking…";
  const res  = await fetch(
    `/api/suggest?day=${day}&goal_calories=${userGoals.calories}&goal_protein=${userGoals.protein_g}`);
  const data = await res.json();
  box.textContent = data.suggestion;
}

// ── History tab ───────────────────────────────────────────────────────────
async function loadHistory() {
  const res   = await fetch("/api/history");
  const meals = await res.json();
  const list  = document.getElementById("history-list");
  if (!meals.length) {
    list.innerHTML = "<li class='empty-state'>No meals logged yet.</li>";
    return;
  }
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

// ── Profile tab ───────────────────────────────────────────────────────────
function selectGender(el) {
  document.querySelectorAll(".gender-chips .chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  selectedGenderVal = el.dataset.gender;
}
function selectActivity(el) {
  document.querySelectorAll(".activity-chips .chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  selectedActivityVal = parseFloat(el.dataset.activity);
}
function selectGoalType(el) {
  document.querySelectorAll(".goal-chips .chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  selectedGoalType = el.dataset.goal;
}

function loadProfileForm() {
  const saved = JSON.parse(localStorage.getItem("nutrition_profile") || "null");
  if (!saved) return;
  if (saved.age)    document.getElementById("p-age").value    = saved.age;
  if (saved.weight) document.getElementById("p-weight").value = saved.weight;
  if (saved.height) document.getElementById("p-height").value = saved.height;
  if (saved.gender) {
    document.querySelectorAll(".gender-chips .chip").forEach(c =>
      c.classList.toggle("active", c.dataset.gender === saved.gender));
    selectedGenderVal = saved.gender;
  }
  if (saved.activity) {
    document.querySelectorAll(".activity-chips .chip").forEach(c =>
      c.classList.toggle("active", parseFloat(c.dataset.activity) === saved.activity));
    selectedActivityVal = saved.activity;
  }
  if (saved.goalType) {
    document.querySelectorAll(".goal-chips .chip").forEach(c =>
      c.classList.toggle("active", c.dataset.goal === saved.goalType));
    selectedGoalType = saved.goalType;
  }
}

function calculateGoals() {
  const age    = parseFloat(document.getElementById("p-age").value);
  const weight = parseFloat(document.getElementById("p-weight").value);
  const height = parseFloat(document.getElementById("p-height").value);

  if (!age || !weight || !height) {
    alert("Please fill in age, weight and height.");
    return;
  }

  // Mifflin-St Jeor BMR
  const bmr = selectedGenderVal === "male"
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;

  let tdee = bmr * selectedActivityVal;

  // Adjust for goal
  if (selectedGoalType === "lose") tdee -= 500;
  if (selectedGoalType === "gain") tdee += 300;
  tdee = Math.round(tdee);

  // Protein: 1.6g/kg for active, 0.8g/kg for sedentary
  const proteinMultiplier = selectedActivityVal >= 1.55 ? 1.6 : selectedActivityVal >= 1.375 ? 1.2 : 0.8;
  const protein = Math.round(weight * proteinMultiplier);
  const fat     = Math.round((tdee * 0.28) / 9);
  const carbs   = Math.round((tdee - protein * 4 - fat * 9) / 4);
  const fiber   = selectedGenderVal === "male" ? 38 : 25;

  const goals = { calories: tdee, protein_g: protein, carbs_g: Math.max(0, carbs), fat_g: fat, fiber_g: fiber };

  // Show result
  document.getElementById("g-calories").textContent = tdee + " kcal";
  document.getElementById("g-protein").textContent  = protein + "g";
  document.getElementById("g-carbs").textContent    = Math.max(0, carbs) + "g";
  document.getElementById("g-fat").textContent      = fat + "g";
  document.getElementById("g-fiber").textContent    = fiber + "g";
  document.getElementById("bmr-note").textContent   =
    `BMR: ${Math.round(bmr)} kcal · TDEE: ${Math.round(bmr * selectedActivityVal)} kcal · ` +
    `Adjusted for goal: ${tdee} kcal`;
  document.getElementById("goals-result").style.display = "block";

  // Save temp goals
  window._pendingGoals = goals;

  // Save profile
  localStorage.setItem("nutrition_profile", JSON.stringify({
    age, weight, height,
    gender: selectedGenderVal,
    activity: selectedActivityVal,
    goalType: selectedGoalType,
  }));
}

function applyGoals() {
  if (!window._pendingGoals) return;
  userGoals = window._pendingGoals;
  localStorage.setItem("nutrition_goals", JSON.stringify(userGoals));
  alert("✅ Goals updated! Switch to Today to see your new targets.");
}

// ── Helpers ───────────────────────────────────────────────────────────────
function mealItemHTML(m, showDelete) {
  const type  = (m.meal_type || "snack").toLowerCase();
  const badge = `<span class="meal-type-badge badge-${type}">${type}</span>`;
  const del   = showDelete
    ? `<button class="delete-btn" onclick="deleteMeal(${m.id})">✕</button>` : "";
  return `
    <div class="meal-item">
      ${badge}
      <div class="meal-info">
        <div class="meal-desc">${escHtml(m.description)}</div>
        <div class="meal-macros">P ${(m.protein_g||0).toFixed(0)}g · C ${(m.carbs_g||0).toFixed(0)}g · F ${(m.fat_g||0).toFixed(0)}g</div>
      </div>
      <span class="meal-cal">${Math.round(m.calories||0)} kcal</span>
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

// ── Enter to analyse ──────────────────────────────────────────────────────
document.getElementById("food-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); analyseFood(); }
});
