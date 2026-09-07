/* Progress Hub app logic */

(function () {
  "use strict";

  var STORAGE_KEY = "progressHubData";
  var THEME_KEY = "progressHubTheme";

  var RACE_STATUSES = ["Confirmed", "Tentative", "Bucket List", "Completed"];
  var STUDY_STATUSES = ["Not Started", "In Progress", "Reviewing", "Mastered"];
  var GUITAR_STATUSES = ["Learning", "In Progress", "Rhythm solid", "Nearly There", "Maintenance"];
  var DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var SPORT_NAMES = ["Swim", "Bike", "Run", "Strength", "Mobility", "Recovery"];
  var ATTENTION_DAYS_THRESHOLD = 7;
  var ATTENTION_VISIBLE_CAP = 5;

  var raceFilter = "All";

  var activeTimer = {
    itemId: null,
    remainingMs: 0,
    running: false,
    intervalId: null,
  };

  var state = loadState();

  // ===================== SEED DATA =====================

  function seedGuitarItems() {
    var now = new Date().toISOString();
    return [
      {
        id: generateId(),
        title: "Sunshine of Your Love",
        type: "Song",
        status: "In Progress",
        confidence: 70,
        goal: "Clean full solo",
        plannedMinutes: 15,
        lastPracticed: null,
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        title: "Whole Lotta Love",
        type: "Song",
        status: "Nearly There",
        confidence: 90,
        goal: "Performance tempo",
        plannedMinutes: 15,
        lastPracticed: null,
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        title: "La Grange",
        type: "Song",
        status: "Rhythm solid",
        confidence: 75,
        goal: "Solo later",
        plannedMinutes: 15,
        lastPracticed: null,
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        title: "Iron Man",
        type: "Song",
        status: "Maintenance",
        confidence: 95,
        goal: "Keep fresh",
        plannedMinutes: 15,
        lastPracticed: null,
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  function seedRaces() {
    return [
      {
        id: generateId(),
        name: "Ironman 70.3 Oman",
        status: "Tentative",
        type: "70.3",
        date: "",
        location: "Muscat, Oman",
        goal: "First 70.3",
        url: "",
      },
      {
        id: generateId(),
        name: "Full Ironman",
        status: "Bucket List",
        type: "Full Ironman",
        date: "",
        location: "TBD",
        goal: "Finish strong",
        url: "",
      },
    ];
  }

  // ===================== STATE =====================

  function defaultState() {
    return {
      guitarItems: [],
      trainingSessions: [],
      races: [],
      studyTopics: [],
    };
  }

  function normalizeState(parsed) {
    parsed = parsed || {};
    return {
      guitarItems: Array.isArray(parsed.guitarItems) ? parsed.guitarItems : [],
      trainingSessions: Array.isArray(parsed.trainingSessions) ? parsed.trainingSessions : [],
      races: Array.isArray(parsed.races) ? parsed.races : [],
      studyTopics: Array.isArray(parsed.studyTopics) ? parsed.studyTopics : [],
    };
  }

  function isValidStateShape(parsed) {
    if (!parsed || typeof parsed !== "object") return false;
    return ["guitarItems", "trainingSessions", "races", "studyTopics"].every(function (key) {
      return Array.isArray(parsed[key]);
    });
  }

  function loadState() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      var seeded = defaultState();
      seeded.guitarItems = seedGuitarItems();
      seeded.races = seedRaces();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    try {
      return normalizeState(JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function findGuitarItem(id) {
    return state.guitarItems.find(function (i) {
      return i.id === id;
    });
  }

  // ===================== HELPERS =====================

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function todayISO() {
    return isoFromDate(new Date());
  }

  function isoFromDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function localDateFromISO(iso) {
    var parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function formatDateNice(iso) {
    if (!iso) return "";
    var d = localDateFromISO(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function daysBetween(aIso, bIso) {
    var a = localDateFromISO(aIso);
    var b = localDateFromISO(bIso);
    return Math.round((b - a) / 86400000);
  }

  function startOfWeek(date) {
    // Monday-based week start.
    var d = new Date(date);
    var day = d.getDay(); // 0 = Sunday
    var diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.hidden = true;
    }, 2600);
  }

  function confidenceLevelClass(value) {
    if (value < 40) return "level-low";
    if (value < 75) return "level-mid";
    return "level-high";
  }

  function confidenceBarHtml(value) {
    value = Number(value) || 0;
    return (
      '<div class="confidence-bar-wrap">' +
      '<div class="confidence-bar-label"><span>Confidence</span><span>' + value + '%</span></div>' +
      '<div class="confidence-bar-track"><div class="confidence-bar-fill ' + confidenceLevelClass(value) + '" style="width:' + value + '%"></div></div>' +
      "</div>"
    );
  }

  // ===================== WEB AUDIO CHIME =====================

  function playChime() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var now = ctx.currentTime;
      var notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        var start = now + i * 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.55);
      });
      setTimeout(function () {
        ctx.close();
      }, 900);
    } catch (e) {
      /* Web Audio unavailable — fail silently */
    }
  }

  // ===================== TABS =====================

  function initTabs() {
    document.querySelectorAll(".tab-button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveTab(btn.getAttribute("data-tab"));
      });
    });
  }

  function setActiveTab(tab) {
    document.querySelectorAll(".tab-button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    document.querySelectorAll(".tab-section").forEach(function (section) {
      section.classList.toggle("active", section.getAttribute("data-section") === tab);
    });
  }

  // ===================== THEME =====================

  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY) || "dark";
    applyTheme(saved);
    var btn = document.getElementById("theme-toggle-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        var current = document.body.getAttribute("data-theme") === "dark" ? "dark" : "light";
        applyTheme(current === "dark" ? "light" : "dark");
      });
    }
  }

  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    var btn = document.getElementById("theme-toggle-btn");
    if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
  }

  // ===================== MODAL =====================

  var modalState = { onSubmit: null };

  function openModal(title, fieldsHtml, onSubmit, afterMount) {
    var overlay = document.getElementById("modal-overlay");
    var titleEl = document.getElementById("modal-title");
    var form = document.getElementById("modal-form");
    titleEl.textContent = title;
    form.innerHTML = fieldsHtml + '<button type="submit" class="button button-primary">Save</button>';
    modalState.onSubmit = onSubmit;
    overlay.hidden = false;
    if (afterMount) afterMount(form);
  }

  function closeModal() {
    var overlay = document.getElementById("modal-overlay");
    overlay.hidden = true;
    modalState.onSubmit = null;
    document.getElementById("modal-form").innerHTML = "";
  }

  function initModal() {
    document.getElementById("modal-close-btn").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById("modal-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (modalState.onSubmit) modalState.onSubmit(new FormData(e.target), e.target);
    });
  }

  // ===================== DASHBOARD =====================

  function computeAttentionItems() {
    var items = [];
    var today = todayISO();

    state.guitarItems.forEach(function (g) {
      if (!g.lastPracticed) {
        // Grace period: don't flag a never-practiced item until it has existed
        // for at least ATTENTION_DAYS_THRESHOLD days (avoids flooding the list
        // with starter items right after first launch).
        var createdDateIso = g.createdAt ? g.createdAt.slice(0, 10) : null;
        var ageDays = createdDateIso ? daysBetween(createdDateIso, today) : ATTENTION_DAYS_THRESHOLD;
        if (ageDays >= ATTENTION_DAYS_THRESHOLD) {
          items.push("🎸 " + g.title + " — never practiced");
        }
      } else {
        var days = daysBetween(g.lastPracticed, today);
        if (days >= ATTENTION_DAYS_THRESHOLD) {
          items.push("🎸 " + g.title + " — last practiced " + days + " days ago");
        }
      }
    });

    state.studyTopics.forEach(function (t) {
      if (!t.lastStudied) {
        items.push("📚 " + t.title + " — never studied");
      } else {
        var days = daysBetween(t.lastStudied, today);
        if (days >= ATTENTION_DAYS_THRESHOLD) {
          items.push("📚 " + t.title + " — last studied " + days + " days ago");
        }
      }
    });

    state.races.forEach(function (r) {
      if (r.status !== "Confirmed") return;
      var missing = [];
      if (!r.date) missing.push("date");
      if (!r.location) missing.push("location");
      if (missing.length) {
        items.push("🏁 " + r.name + " — missing " + missing.join(" and "));
      }
    });

    state.trainingSessions.forEach(function (s) {
      if (!s.completed && s.date < today) {
        items.push("🏋 " + s.title + " (" + formatDateNice(s.date) + ") — incomplete, past due");
      }
    });

    return items;
  }

  function renderAttentionCard() {
    var section = document.querySelector('.tab-section[data-section="dashboard"]');
    if (!section) return;
    var card = document.getElementById("dashboard-attention");
    if (!card) {
      card = document.createElement("div");
      card.id = "dashboard-attention";
      card.className = "card";
      var dataCard = section.querySelector(".data-card");
      section.insertBefore(card, dataCard);
    }

    var items = computeAttentionItems();
    var visible = items.slice(0, ATTENTION_VISIBLE_CAP);
    var extra = items.length - visible.length;

    card.innerHTML =
      '<h3 class="card-title">Items Needing Attention</h3>' +
      (items.length
        ? '<ul class="attention-list">' +
          visible.map(function (text) {
            return "<li>" + escapeHtml(text) + "</li>";
          }).join("") +
          "</ul>" +
          (extra > 0 ? '<p class="hint-text">+' + extra + " more</p>" : "")
        : '<p class="card-subtext">Nothing needs attention right now.</p>');
  }

  function renderDashboard() {
    var el = document.getElementById("dashboard-content");
    var today = todayISO();

    var weekStart = startOfWeek(new Date());
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    var weekStartIso = isoFromDate(weekStart);
    var weekEndIso = isoFromDate(weekEnd);

    var weekSessions = state.trainingSessions.filter(function (s) {
      return s.date >= weekStartIso && s.date <= weekEndIso;
    });
    var weekCompleted = weekSessions.filter(function (s) {
      return s.completed;
    }).length;
    var weekPct = weekSessions.length ? Math.round((weekCompleted / weekSessions.length) * 100) : 0;

    var avgConfidence = function (list) {
      if (!list.length) return "—";
      var sum = list.reduce(function (acc, i) {
        return acc + (Number(i.confidence) || 0);
      }, 0);
      return Math.round(sum / list.length) + "%";
    };

    var raceCounts = { Confirmed: 0, Tentative: 0, "Bucket List": 0, Completed: 0 };
    state.races.forEach(function (r) {
      if (raceCounts.hasOwnProperty(r.status)) raceCounts[r.status]++;
    });

    var nextConfirmed = state.races
      .filter(function (r) {
        return r.status === "Confirmed" && r.date && r.date >= today;
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      })[0];

    var nextConfirmedSub;
    if (nextConfirmed) {
      var diff = daysBetween(today, nextConfirmed.date);
      nextConfirmedSub = diff === 0 ? "Race day!" : diff + " day" + (diff === 1 ? "" : "s") + " to race day";
    } else {
      nextConfirmedSub = "No confirmed races with a date";
    }

    var cards = [
      {
        tab: "guitar",
        label: "Guitar Items",
        value: String(state.guitarItems.length),
        sub: "Avg confidence " + avgConfidence(state.guitarItems),
      },
      {
        tab: "training",
        label: "This Week",
        value: weekCompleted + " / " + weekSessions.length + " (" + weekPct + "%)",
        sub: "sessions completed",
      },
      {
        tab: "races",
        label: "Race Pipeline",
        value: raceCounts.Confirmed + " Confirmed",
        sub: raceCounts.Tentative + " Tentative · " + raceCounts["Bucket List"] + " Bucket List · " + raceCounts.Completed + " Completed",
      },
      {
        tab: "races",
        label: "Next Confirmed Race",
        value: nextConfirmed ? nextConfirmed.name : "None",
        sub: nextConfirmedSub,
      },
      {
        tab: "study",
        label: "Study Topics",
        value: String(state.studyTopics.length),
        sub: "Avg confidence " + avgConfidence(state.studyTopics),
      },
    ];

    el.innerHTML = cards
      .map(function (c) {
        return (
          '<button type="button" class="stat-card" data-goto="' + c.tab + '">' +
          '<div class="stat-card-label">' + escapeHtml(c.label) + "</div>" +
          '<div class="stat-card-value">' + escapeHtml(c.value) + "</div>" +
          '<div class="stat-card-sub">' + escapeHtml(c.sub) + "</div>" +
          "</button>"
        );
      })
      .join("");

    el.querySelectorAll("[data-goto]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveTab(btn.getAttribute("data-goto"));
      });
    });

    renderAttentionCard();
  }

  // ===================== GUITAR =====================

  function plannedMs(item) {
    return Math.max(0, Number(item.plannedMinutes) || 0) * 60000;
  }

  function formatTimer(ms) {
    var totalSeconds = Math.max(0, Math.round(ms / 1000));
    var mins = Math.floor(totalSeconds / 60);
    var secs = totalSeconds % 60;
    return pad2(mins) + ":" + pad2(secs);
  }

  function renderGuitar() {
    var el = document.getElementById("guitar-items-list");
    if (!state.guitarItems.length) {
      el.innerHTML = '<div class="empty-state">No guitar items yet. Add a song, scale, or technique to start tracking progress.</div>';
      updateGlobalTimerUI();
      return;
    }

    var sorted = state.guitarItems.slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });

    el.innerHTML = sorted
      .map(function (item) {
        var isActive = activeTimer.itemId === item.id;
        var running = isActive && activeTimer.running;
        var remaining = isActive ? activeTimer.remainingMs : plannedMs(item);
        var toggleLabel = running ? "⏸ Pause" : isActive ? "▶ Resume" : "▶ Start";

        return (
          '<div class="item-card" data-id="' + item.id + '">' +
          '<div class="item-card-header">' +
          '<div>' +
          '<div class="item-card-title">' + escapeHtml(item.title) + "</div>" +
          '<div class="item-card-meta">' + escapeHtml(item.type) + " · " + escapeHtml(item.status) + "</div>" +
          "</div>" +
          "</div>" +
          (item.goal ? '<div class="item-card-meta">🎯 ' + escapeHtml(item.goal) + "</div>" : "") +
          '<div class="item-card-meta">Planned: ' + (Number(item.plannedMinutes) || 0) + " min · Last practiced: " + (item.lastPracticed ? formatDateNice(item.lastPracticed) : "Never") + "</div>" +
          confidenceBarHtml(item.confidence) +
          (item.notes ? '<div class="item-card-notes">' + escapeHtml(item.notes) + "</div>" : "") +
          '<div class="timer-display" id="timer-display-' + item.id + '">' + formatTimer(remaining) + "</div>" +
          '<div class="button-row">' +
          '<button class="button button-secondary button-small" data-timer-toggle="' + item.id + '" type="button">' + toggleLabel + "</button>" +
          '<button class="button button-secondary button-small" data-timer-reset="' + item.id + '" type="button">↺ Reset</button>' +
          "</div>" +
          '<div class="item-card-actions">' +
          '<button class="button button-primary button-small" data-practiced-today="' + item.id + '" type="button">Practiced Today</button>' +
          '<button class="button button-secondary button-small" data-edit-guitar="' + item.id + '" type="button">Edit</button>' +
          '<button class="button button-danger button-small" data-delete-guitar="' + item.id + '" type="button">Delete</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-timer-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-timer-toggle");
        if (activeTimer.itemId === id && activeTimer.running) {
          pauseTimer();
        } else {
          startTimer(id);
        }
      });
    });
    el.querySelectorAll("[data-timer-reset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        resetTimer(btn.getAttribute("data-timer-reset"));
      });
    });
    el.querySelectorAll("[data-practiced-today]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-practiced-today");
        var item = findGuitarItem(id);
        if (!item) return;
        item.lastPracticed = todayISO();
        item.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(item.title + " marked practiced today");
      });
    });
    el.querySelectorAll("[data-edit-guitar]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openGuitarModal(btn.getAttribute("data-edit-guitar"));
      });
    });
    el.querySelectorAll("[data-delete-guitar]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-guitar");
        if (!confirm("Delete this guitar item?")) return;
        if (activeTimer.itemId === id) {
          stopActiveInterval();
          activeTimer.itemId = null;
        }
        state.guitarItems = state.guitarItems.filter(function (i) {
          return i.id !== id;
        });
        saveState();
        renderAll();
        showToast("Item deleted");
      });
    });

    updateGlobalTimerUI();
  }

  function guitarStatusOptionsHtml(currentStatus) {
    var statuses = GUITAR_STATUSES.slice();
    var hasCurrent = !!currentStatus && statuses.indexOf(currentStatus) !== -1;
    if (currentStatus && !hasCurrent) {
      // Preserve a legacy/custom status value that predates the dropdown.
      statuses.push(currentStatus);
      hasCurrent = true;
    }
    return statuses
      .map(function (s, idx) {
        var isSelected = hasCurrent ? s === currentStatus : idx === 0;
        return '<option value="' + escapeHtml(s) + '"' + (isSelected ? " selected" : "") + ">" + escapeHtml(s) + "</option>";
      })
      .join("");
  }

  function guitarFieldsHtml(item) {
    item = item || { title: "", type: "", status: "", confidence: 50, goal: "", plannedMinutes: 15, notes: "" };
    return (
      '<div class="form-group">' +
      '<label for="gf-title">Title</label>' +
      '<input id="gf-title" name="title" type="text" required value="' + escapeHtml(item.title) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="gf-type">Type</label>' +
      '<input id="gf-type" name="type" type="text" list="guitar-type-suggestions" required value="' + escapeHtml(item.type) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="gf-status">Status</label>' +
      '<select id="gf-status" name="status">' +
      guitarStatusOptionsHtml(item.status) +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="gf-goal">Goal</label>' +
      '<input id="gf-goal" name="goal" type="text" placeholder="e.g. Play at full tempo" value="' + escapeHtml(item.goal) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="gf-planned">Planned Minutes</label>' +
      '<input id="gf-planned" name="plannedMinutes" type="number" min="1" step="1" required value="' + (Number(item.plannedMinutes) || 15) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="gf-confidence">Confidence <span class="range-value" id="gf-confidence-value">' + item.confidence + '%</span></label>' +
      '<input id="gf-confidence" name="confidence" type="range" min="0" max="100" step="5" value="' + item.confidence + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="gf-notes">Notes</label>' +
      '<textarea id="gf-notes" name="notes" rows="3">' + escapeHtml(item.notes) + "</textarea>" +
      "</div>"
    );
  }

  function openGuitarModal(id) {
    var item = id ? findGuitarItem(id) : null;
    openModal(
      item ? "Edit Guitar Item" : "Add Guitar Item",
      guitarFieldsHtml(item),
      function (formData) {
        var data = {
          title: formData.get("title").trim(),
          type: formData.get("type").trim(),
          status: formData.get("status").trim(),
          goal: formData.get("goal").trim(),
          plannedMinutes: Math.max(1, Number(formData.get("plannedMinutes")) || 15),
          confidence: Number(formData.get("confidence")),
          notes: formData.get("notes").trim(),
          updatedAt: new Date().toISOString(),
        };
        if (!data.title) return;
        if (item) {
          data.lastPracticed = item.lastPracticed || null;
          data.createdAt = item.createdAt || item.updatedAt || data.updatedAt;
          Object.assign(item, data);
        } else {
          data.id = generateId();
          data.lastPracticed = null;
          data.createdAt = data.updatedAt;
          state.guitarItems.push(data);
        }
        saveState();
        renderAll();
        closeModal();
        showToast(item ? "Item updated" : "Item added");
      },
      function (form) {
        var range = form.querySelector("#gf-confidence");
        var label = form.querySelector("#gf-confidence-value");
        if (range && label) {
          range.addEventListener("input", function () {
            label.textContent = range.value + "%";
          });
        }
      }
    );
  }

  // ===================== GUITAR TIMER (per-card, single active) =====================

  function stopActiveInterval() {
    if (activeTimer.intervalId) {
      clearInterval(activeTimer.intervalId);
      activeTimer.intervalId = null;
    }
    activeTimer.running = false;
  }

  function startTimer(itemId) {
    var item = findGuitarItem(itemId);
    if (!item) return;

    // Always clear any existing interval first — prevents duplicate intervals
    // if the user clicks quickly or resumes the same item repeatedly.
    stopActiveInterval();

    if (activeTimer.itemId !== itemId) {
      activeTimer.itemId = itemId;
      activeTimer.remainingMs = plannedMs(item);
    }
    if (activeTimer.remainingMs <= 0) {
      activeTimer.remainingMs = plannedMs(item);
    }
    activeTimer.running = true;
    activeTimer.intervalId = setInterval(tickTimer, 1000);
    renderGuitar();
  }

  function pauseTimer() {
    if (!activeTimer.itemId) return;
    stopActiveInterval();
    renderGuitar();
  }

  function resetTimer(itemId) {
    var item = findGuitarItem(itemId);
    if (!item) return;
    if (activeTimer.itemId === itemId) {
      stopActiveInterval();
      activeTimer.remainingMs = plannedMs(item);
      activeTimer.itemId = null;
    }
    renderGuitar();
  }

  function tickTimer() {
    activeTimer.remainingMs -= 1000;
    if (activeTimer.remainingMs <= 0) {
      completeTimer();
      return;
    }
    var span = document.getElementById("timer-display-" + activeTimer.itemId);
    if (span) span.textContent = formatTimer(activeTimer.remainingMs);
    updateGlobalTimerUI();
  }

  function completeTimer() {
    var finishedId = activeTimer.itemId;
    var item = findGuitarItem(finishedId);
    stopActiveInterval();
    activeTimer.remainingMs = 0;
    activeTimer.itemId = null;

    if (item) {
      item.lastPracticed = todayISO();
      item.updatedAt = new Date().toISOString();
      saveState();
      playChime();
      showToast(item.title + " — practice complete! 🎸");
    }
    renderAll();
  }

  function updateGlobalTimerUI() {
    var display = document.getElementById("guitar-timer-display");
    if (!display) return;
    var label = document.getElementById("timer-total-label");
    var startBtn = document.getElementById("timer-start-btn");
    var pauseBtn = document.getElementById("timer-pause-btn");
    var resetBtn = document.getElementById("timer-reset-btn");

    if (startBtn) startBtn.disabled = true;

    if (activeTimer.itemId) {
      var item = findGuitarItem(activeTimer.itemId);
      display.textContent = formatTimer(activeTimer.remainingMs);
      if (label) label.textContent = (activeTimer.running ? "Practicing: " : "Paused: ") + (item ? item.title : "");
      if (pauseBtn) {
        pauseBtn.disabled = false;
        pauseBtn.textContent = activeTimer.running ? "⏸ Pause" : "▶ Resume";
      }
      if (resetBtn) resetBtn.disabled = false;
    } else {
      display.textContent = "00:00";
      if (label) label.textContent = "Start a timer from a guitar item";
      if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.textContent = "⏸ Pause";
      }
      if (resetBtn) resetBtn.disabled = true;
    }
  }

  function initGlobalTimerControls() {
    var startBtn = document.getElementById("timer-start-btn");
    var pauseBtn = document.getElementById("timer-pause-btn");
    var resetBtn = document.getElementById("timer-reset-btn");
    if (!startBtn) return;

    startBtn.addEventListener("click", function () {
      showToast("Start a timer from a guitar item card below.");
    });
    pauseBtn.addEventListener("click", function () {
      if (!activeTimer.itemId) return;
      if (activeTimer.running) {
        pauseTimer();
      } else {
        startTimer(activeTimer.itemId);
      }
    });
    resetBtn.addEventListener("click", function () {
      if (!activeTimer.itemId) return;
      resetTimer(activeTimer.itemId);
    });

    updateGlobalTimerUI();
  }

  // ===================== TRAINING =====================

  function renderTraining() {
    renderTrainingStats();
    renderTrainingSessions();
  }

  function renderTrainingStats() {
    var el = document.getElementById("training-stats");
    var weekStart = startOfWeek(new Date());
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    var weekStartIso = isoFromDate(weekStart);
    var weekEndIso = isoFromDate(weekEnd);

    var weekSessions = state.trainingSessions.filter(function (s) {
      return s.date >= weekStartIso && s.date <= weekEndIso;
    });
    var completed = weekSessions.filter(function (s) {
      return s.completed;
    }).length;
    var pct = weekSessions.length ? Math.round((completed / weekSessions.length) * 100) : 0;

    var bySport = {};
    weekSessions.forEach(function (s) {
      bySport[s.sport] = (bySport[s.sport] || 0) + 1;
    });
    var sportSummary = Object.keys(bySport)
      .map(function (sport) {
        return sport + " " + bySport[sport];
      })
      .join(", ");

    el.innerHTML =
      '<div class="stat-pill"><strong>' + weekSessions.length + "</strong>planned this week</div>" +
      '<div class="stat-pill"><strong>' + completed + " / " + weekSessions.length + " (" + pct + "%)</strong>completed this week</div>" +
      '<div class="stat-pill"><strong>' + (sportSummary || "—") + "</strong>by sport this week</div>";
  }

  function renderTrainingSessions() {
    var el = document.getElementById("training-sessions-list");
    if (!state.trainingSessions.length) {
      el.innerHTML = '<div class="empty-state">No sessions yet. Add one above or paste a weekly plan.</div>';
      return;
    }

    var sorted = state.trainingSessions.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });

    el.innerHTML = sorted
      .map(function (s) {
        return (
          '<div class="session-row' + (s.completed ? " completed" : "") + '" data-id="' + s.id + '">' +
          '<input type="checkbox" data-toggle-session="' + s.id + '" ' + (s.completed ? "checked" : "") + ">" +
          '<div class="session-row-main">' +
          '<div class="session-row-title">' + escapeHtml(s.title) + "</div>" +
          '<div class="session-row-meta">' + formatDateNice(s.date) + " · " + escapeHtml(s.sport) + (s.duration ? " · " + escapeHtml(s.duration) : "") + "</div>" +
          (s.notes ? '<div class="session-row-meta">' + escapeHtml(s.notes) + "</div>" : "") +
          "</div>" +
          '<div class="session-row-actions">' +
          '<button class="button button-danger button-small" data-delete-session="' + s.id + '" type="button">Delete</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-toggle-session]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-toggle-session");
        var session = state.trainingSessions.find(function (s) {
          return s.id === id;
        });
        if (session) {
          session.completed = cb.checked;
          saveState();
          renderTraining();
          renderDashboard();
        }
      });
    });
    el.querySelectorAll("[data-delete-session]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-session");
        state.trainingSessions = state.trainingSessions.filter(function (s) {
          return s.id !== id;
        });
        saveState();
        renderAll();
        showToast("Session deleted");
      });
    });
  }

  function initTrainingForm() {
    var form = document.getElementById("add-session-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var date = document.getElementById("session-date-input").value;
      var sport = document.getElementById("session-sport-input").value;
      var title = document.getElementById("session-title-input").value.trim();
      var duration = document.getElementById("session-duration-input").value.trim();
      var notes = document.getElementById("session-notes-input").value.trim();
      var completed = document.getElementById("session-completed-input").checked;
      if (!date || !title) return;

      state.trainingSessions.push({
        id: generateId(),
        date: date,
        sport: sport,
        title: title,
        duration: duration,
        notes: notes,
        completed: completed,
      });
      saveState();
      form.reset();
      renderAll();
      showToast("Session added");
    });
  }

  function dateForDayName(dayName) {
    var idx = DAY_ORDER.indexOf(dayName);
    if (idx === -1) return null;
    var monday = startOfWeek(new Date());
    var d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return isoFromDate(d);
  }

  function parsePlanText(text) {
    var lines = text
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var sessions = [];
    lines.forEach(function (line) {
      var match = line.match(/^([A-Za-z]+)\s*:\s*(.+)$/);
      if (!match) return;
      var dayName = DAY_ORDER.find(function (d) {
        return d.toLowerCase() === match[1].trim().toLowerCase();
      });
      if (!dayName) return;

      var rest = match[2].trim();
      var sportMatch = rest.match(/^(Swim|Bike|Run|Strength|Mobility|Recovery)/i);
      var sport = "Other";
      if (sportMatch) {
        var found = sportMatch[1].toLowerCase();
        sport = SPORT_NAMES.find(function (s) {
          return s.toLowerCase() === found;
        }) || "Other";
      }
      var durationMatch = rest.match(/(\d+\s*(?:min|minutes|hr|hour|hours|km|mi|miles))/i);

      sessions.push({
        id: generateId(),
        date: dateForDayName(dayName),
        sport: sport,
        title: rest,
        duration: durationMatch ? durationMatch[1] : "",
        notes: "",
        completed: false,
      });
    });
    return sessions;
  }

  function initPlanParser() {
    document.getElementById("parse-plan-btn").addEventListener("click", function () {
      var textarea = document.getElementById("plan-paste-input");
      var parsed = parsePlanText(textarea.value);
      if (!parsed.length) {
        showToast("No sessions found. Check the format.");
        return;
      }
      state.trainingSessions = state.trainingSessions.concat(parsed);
      saveState();
      textarea.value = "";
      renderAll();
      showToast(parsed.length + " session(s) imported");
    });
  }

  // ===================== RACES =====================

  function raceCountdownText(race) {
    if (race.status === "Completed") return "Completed";
    if (!race.date) return "Date TBD";
    var diff = daysBetween(todayISO(), race.date);
    if (diff === 0) return "Race day! 🏁";
    if (diff > 0) return diff + " day" + (diff === 1 ? "" : "s") + " away";
    return "Race date passed";
  }

  function renderRaces() {
    var el = document.getElementById("races-list");
    var filtered = state.races.filter(function (r) {
      return raceFilter === "All" || r.status === raceFilter;
    });

    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No races' + (raceFilter !== "All" ? ' with status "' + escapeHtml(raceFilter) + '"' : "") + " yet.</div>";
      return;
    }

    var sorted = filtered.slice().sort(function (a, b) {
      var ad = a.date || "9999-99-99";
      var bd = b.date || "9999-99-99";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });

    el.innerHTML = sorted
      .map(function (r) {
        var badgeClass = "badge-" + r.status.toLowerCase().replace(/\s+/g, "-");
        return (
          '<div class="item-card" data-id="' + r.id + '">' +
          '<div class="item-card-header">' +
          '<div>' +
          '<div class="item-card-title">' + escapeHtml(r.name) + "</div>" +
          '<div class="item-card-meta">' + escapeHtml(r.type || "") + (r.location ? " · " + escapeHtml(r.location) : "") + "</div>" +
          "</div>" +
          '<span class="badge ' + badgeClass + '">' + escapeHtml(r.status) + "</span>" +
          "</div>" +
          '<div class="item-card-meta">' + (r.date ? formatDateNice(r.date) : "Date TBD") + "</div>" +
          '<div class="badge">' + escapeHtml(raceCountdownText(r)) + "</div>" +
          (r.goal ? '<div class="item-card-notes">🎯 ' + escapeHtml(r.goal) + "</div>" : "") +
          (r.url
            ? '<a class="button button-secondary button-small" href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener noreferrer">Open Race Site</a>'
            : "") +
          '<div class="item-card-actions">' +
          '<button class="button button-secondary button-small" data-edit-race="' + r.id + '" type="button">Edit</button>' +
          '<button class="button button-danger button-small" data-delete-race="' + r.id + '" type="button">Delete</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-edit-race]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openRaceModal(btn.getAttribute("data-edit-race"));
      });
    });
    el.querySelectorAll("[data-delete-race]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-race");
        if (!confirm("Delete this race?")) return;
        state.races = state.races.filter(function (r) {
          return r.id !== id;
        });
        saveState();
        renderAll();
        showToast("Race deleted");
      });
    });
  }

  function raceFieldsHtml(race) {
    race = race || { name: "", status: "Tentative", type: "", date: "", location: "", goal: "", url: "" };
    return (
      '<div class="form-group">' +
      '<label for="rf-name">Race Name</label>' +
      '<input id="rf-name" name="name" type="text" required value="' + escapeHtml(race.name) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="rf-status">Status</label>' +
      '<select id="rf-status" name="status">' +
      RACE_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (race.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="rf-type">Type</label>' +
      '<input id="rf-type" name="type" type="text" placeholder="e.g. Half Marathon" value="' + escapeHtml(race.type) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="rf-date">Date (optional — leave blank for TBD)</label>' +
      '<input id="rf-date" name="date" type="date" value="' + escapeHtml(race.date) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="rf-location">Location</label>' +
      '<input id="rf-location" name="location" type="text" value="' + escapeHtml(race.location) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="rf-goal">Goal</label>' +
      '<input id="rf-goal" name="goal" type="text" placeholder="e.g. Sub 1:45" value="' + escapeHtml(race.goal) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="rf-url">Race Website URL</label>' +
      '<input id="rf-url" name="url" type="url" placeholder="https://..." value="' + escapeHtml(race.url) + '">' +
      "</div>"
    );
  }

  function openRaceModal(id) {
    var race = id ? state.races.find(function (r) { return r.id === id; }) : null;
    openModal(race ? "Edit Race" : "Add Race", raceFieldsHtml(race), function (formData) {
      var data = {
        name: formData.get("name").trim(),
        status: formData.get("status"),
        type: formData.get("type").trim(),
        date: formData.get("date") || "",
        location: formData.get("location").trim(),
        goal: formData.get("goal").trim(),
        url: formData.get("url").trim(),
      };
      if (!data.name) return;
      if (race) {
        Object.assign(race, data);
      } else {
        data.id = generateId();
        state.races.push(data);
      }
      saveState();
      renderAll();
      closeModal();
      showToast(race ? "Race updated" : "Race added");
    });
  }

  function initRaceFilter() {
    document.getElementById("race-status-filter").addEventListener("change", function (e) {
      raceFilter = e.target.value;
      renderRaces();
    });
  }

  // ===================== STUDY =====================

  function renderStudy() {
    var el = document.getElementById("study-topics-list");
    if (!state.studyTopics.length) {
      el.innerHTML = '<div class="empty-state">No study topics yet. Add one to start tracking.</div>';
      return;
    }

    var sorted = state.studyTopics.slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });

    el.innerHTML = sorted
      .map(function (t) {
        return (
          '<div class="item-card" data-id="' + t.id + '">' +
          '<div class="item-card-header">' +
          '<div>' +
          '<div class="item-card-title">' + escapeHtml(t.title) + "</div>" +
          '<div class="item-card-meta">' + escapeHtml(t.status) + "</div>" +
          "</div>" +
          "</div>" +
          (t.goal ? '<div class="item-card-meta">🎯 ' + escapeHtml(t.goal) + "</div>" : "") +
          '<div class="item-card-meta">Last studied: ' + (t.lastStudied ? formatDateNice(t.lastStudied) : "Never") + "</div>" +
          confidenceBarHtml(t.confidence) +
          (t.notes ? '<div class="item-card-notes">' + escapeHtml(t.notes) + "</div>" : "") +
          '<div class="item-card-actions">' +
          '<button class="button button-primary button-small" data-studied-today="' + t.id + '" type="button">Studied Today</button>' +
          '<button class="button button-secondary button-small" data-edit-study="' + t.id + '" type="button">Edit</button>' +
          '<button class="button button-danger button-small" data-delete-study="' + t.id + '" type="button">Delete</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-studied-today]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-studied-today");
        var topic = state.studyTopics.find(function (t) { return t.id === id; });
        if (!topic) return;
        topic.lastStudied = todayISO();
        topic.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(topic.title + " marked studied today");
      });
    });
    el.querySelectorAll("[data-edit-study]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openStudyModal(btn.getAttribute("data-edit-study"));
      });
    });
    el.querySelectorAll("[data-delete-study]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-study");
        if (!confirm("Delete this study topic?")) return;
        state.studyTopics = state.studyTopics.filter(function (t) { return t.id !== id; });
        saveState();
        renderAll();
        showToast("Topic deleted");
      });
    });
  }

  function studyFieldsHtml(topic) {
    topic = topic || { title: "", status: "Not Started", confidence: 50, goal: "", notes: "" };
    return (
      '<div class="form-group">' +
      '<label for="sf-title">Topic</label>' +
      '<input id="sf-title" name="title" type="text" required value="' + escapeHtml(topic.title) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="sf-status">Status</label>' +
      '<select id="sf-status" name="status">' +
      STUDY_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (topic.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="sf-goal">Goal</label>' +
      '<input id="sf-goal" name="goal" type="text" placeholder="e.g. Pass the practice exam" value="' + escapeHtml(topic.goal) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="sf-confidence">Confidence <span class="range-value" id="sf-confidence-value">' + topic.confidence + '%</span></label>' +
      '<input id="sf-confidence" name="confidence" type="range" min="0" max="100" step="5" value="' + topic.confidence + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="sf-notes">Notes</label>' +
      '<textarea id="sf-notes" name="notes" rows="3">' + escapeHtml(topic.notes) + "</textarea>" +
      "</div>"
    );
  }

  function openStudyModal(id) {
    var topic = id ? state.studyTopics.find(function (t) { return t.id === id; }) : null;
    openModal(
      topic ? "Edit Study Topic" : "Add Study Topic",
      studyFieldsHtml(topic),
      function (formData) {
        var data = {
          title: formData.get("title").trim(),
          status: formData.get("status"),
          goal: formData.get("goal").trim(),
          confidence: Number(formData.get("confidence")),
          notes: formData.get("notes").trim(),
          updatedAt: new Date().toISOString(),
        };
        if (!data.title) return;
        if (topic) {
          data.lastStudied = topic.lastStudied || null;
          Object.assign(topic, data);
        } else {
          data.id = generateId();
          data.lastStudied = null;
          state.studyTopics.push(data);
        }
        saveState();
        renderAll();
        closeModal();
        showToast(topic ? "Topic updated" : "Topic added");
      },
      function (form) {
        var range = form.querySelector("#sf-confidence");
        var label = form.querySelector("#sf-confidence-value");
        if (range && label) {
          range.addEventListener("input", function () {
            label.textContent = range.value + "%";
          });
        }
      }
    );
  }

  // ===================== IMPORT / EXPORT =====================

  function initDataButtons() {
    document.getElementById("export-data-btn").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "progress-hub-export-" + todayISO() + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Data exported");
    });

    var importBtn = document.getElementById("import-data-btn");
    var importInput = document.getElementById("import-data-input");
    importBtn.addEventListener("click", function () {
      importInput.click();
    });
    importInput.addEventListener("change", function () {
      var file = importInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(reader.result);
        } catch (e) {
          showToast("Import failed: invalid JSON");
          importInput.value = "";
          return;
        }
        if (!isValidStateShape(parsed)) {
          showToast("Import failed: unrecognized file format");
          importInput.value = "";
          return;
        }
        var ok = confirm("Importing will replace all current data on this device. Continue?");
        if (!ok) {
          importInput.value = "";
          return;
        }
        stopActiveInterval();
        activeTimer.itemId = null;
        state = normalizeState(parsed);
        saveState();
        renderAll();
        showToast("Data imported — existing data replaced");
        importInput.value = "";
      };
      reader.readAsText(file);
    });
  }

  // ===================== ADD BUTTONS =====================

  function initAddButtons() {
    document.getElementById("add-guitar-item-btn").addEventListener("click", function () {
      openGuitarModal(null);
    });
    document.getElementById("add-race-btn").addEventListener("click", function () {
      openRaceModal(null);
    });
    document.getElementById("add-study-topic-btn").addEventListener("click", function () {
      openStudyModal(null);
    });
  }

  // ===================== RENDER ALL =====================

  function renderAll() {
    renderDashboard();
    renderGuitar();
    renderTraining();
    renderRaces();
    renderStudy();
  }

  // ===================== INIT =====================

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initTabs();
    initModal();
    initAddButtons();
    initTrainingForm();
    initPlanParser();
    initRaceFilter();
    initDataButtons();
    initGlobalTimerControls();
    renderAll();
  });
})();
