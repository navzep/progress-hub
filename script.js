/* Progress Hub app logic */

(function () {
  "use strict";

  var STORAGE_KEY = "progressHubData";
  var THEME_KEY = "progressHubTheme";

  // ===================== SUPABASE CONFIG =====================
  // Safe to embed: this is the publishable/anon key, not the secret key.
  // Row Level Security on the "progress_data" table is what actually
  // protects data — not secrecy of this key.
  var SUPABASE_URL = "https://euzhnckmhfyndxefhqpe.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_LH6uBnoGpZeRJACdJnc0Ow_ZUxO2iqA";
  var CLOUD_SYNC_DEBOUNCE_MS = 600;

  var supabaseClient = null;
  if (typeof window !== "undefined" && window.supabase && typeof window.supabase.createClient === "function") {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      supabaseClient = null;
    }
  }

  var currentUser = null; // { id, email } while signed in, else null
  var cloudSyncDebounceTimer = null;
  var realtimeChannel = null;

  var RACE_STATUSES = ["Confirmed", "Tentative", "Bucket List", "Completed"];
  var TASK_STATUSES = ["Not Started", "In Progress", "Reviewing", "Completed"];
  var TASK_PRIORITIES = ["Low", "Medium", "High"];
  var GUITAR_STATUSES = ["Learning", "In Progress", "Rhythm solid", "Nearly There", "Maintenance"];
  var DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var SPORT_NAMES = ["Swim", "Bike", "Run", "Strength", "Mobility", "Recovery"];
  var SPORT_META = {
    Swim: { icon: "🏊", color: "#0891b2" },
    Bike: { icon: "🚴", color: "#16a34a" },
    Run: { icon: "🏃", color: "#ea580c" },
    Strength: { icon: "🏋", color: "#dc2626" },
    Mobility: { icon: "🧘", color: "#7c3aed" },
    Recovery: { icon: "😴", color: "#64748b" },
    Other: { icon: "⚡", color: "#2563eb" },
  };
  var ATTENTION_DAYS_THRESHOLD = 7;
  var ATTENTION_VISIBLE_CAP = 5;
  var LISTENING_STATUSES = ["To Listen", "Listening", "Finished", "Revisit"];
  var CODING_PROJECT_STATUSES = ["Idea", "Planning", "Building", "Testing", "Paused", "Completed", "Parked"];
  var CODING_PROJECT_TYPES = ["Web App", "Python", "Data Science", "Automation", "Work Tool", "Mobile / PWA", "Other"];
  var CODING_TASK_STATUSES = ["To Do", "In Progress", "Blocked", "Testing", "Done"];

  var raceFilter = "All";
  var listeningFilter = "All";
  var codingProjectFilter = "All";
  var expandedCodingProjectIds = {};
  var expandedStudySubjectIds = {};
  var archivedCodingSectionExpanded = false;
  var archivedStudySectionExpanded = false;
  var openManagementMenu = null;

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

  function seedListening() {
    var now = new Date().toISOString();
    var finished = [
      ["B.B. King", "Live at the Regal"],
      ["Albert King", "Born Under a Bad Sign"],
      ["Stevie Ray Vaughan", "Texas Flood"],
      ["Freddie King", "Getting Ready..."],
      ["ZZ Top", "Tres Hombres"],
    ];
    var toListen = [
      ["Muddy Waters", "Hard Again"],
      ["Buddy Guy", "Damn Right, I've Got the Blues"],
      ["John Lee Hooker", "It Serve You Right to Suffer"],
      ["The Allman Brothers Band", "At Fillmore East"],
      ["Cream", "Disraeli Gears"],
      ["Gary Moore", "Still Got the Blues"],
      ["Robin Trower", "Bridge of Sighs"],
      ["The Black Keys", "Thickfreakness"],
    ];
    var albums = [];
    finished.forEach(function (pair) {
      albums.push({
        id: generateId(),
        artist: pair[0],
        album: pair[1],
        status: "Finished",
        rating: null,
        favoriteTrack: "",
        notes: "",
        dateFinished: "",
        createdAt: now,
        updatedAt: now,
      });
    });
    toListen.forEach(function (pair) {
      albums.push({
        id: generateId(),
        artist: pair[0],
        album: pair[1],
        status: "To Listen",
        rating: null,
        favoriteTrack: "",
        notes: "",
        dateFinished: "",
        createdAt: now,
        updatedAt: now,
      });
    });
    return albums;
  }

  function seedCodingProjects() {
    var now = new Date().toISOString();
    return [
      {
        id: generateId(),
        name: "Progress Hub",
        type: "Web App",
        status: "Building",
        priority: "High",
        progress: 90,
        techStack: "HTML, CSS, JavaScript, Supabase, GitHub Pages",
        milestone: "Stabilize v2",
        nextAction: "Run full code review and regression testing",
        githubUrl: "",
        liveUrl: "",
        notes: "",
        archived: false,
        lastWorkedOn: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: generateId(),
        name: "CSV QuickLook",
        type: "Data Science",
        status: "Idea",
        priority: "Medium",
        progress: 0,
        techStack: "",
        milestone: "Define MVP",
        nextAction: "Build CSV upload and basic analysis prototype",
        githubUrl: "",
        liveUrl: "",
        notes: "",
        archived: false,
        lastWorkedOn: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  // A project's legacy free-text `nextAction` becomes exactly one coding
  // task, marked as that project's Next Action. Shared by the one-time
  // state migration, the fresh-install seed path, and the bulk importer, so
  // "legacy next action string -> task" has exactly one implementation.
  function buildNextActionTask(project) {
    var title = (project.nextAction || "").trim();
    if (!title) return null;
    var now = new Date().toISOString();
    var priority = TASK_PRIORITIES.indexOf(project.priority) !== -1 ? project.priority : "Medium";
    return {
      id: generateId(),
      projectId: project.id,
      title: title,
      status: "To Do",
      priority: priority,
      dueDate: "",
      notes: "",
      lastWorkedOn: null,
      isNextAction: true,
      archived: false,
      createdAt: project.updatedAt || project.createdAt || now,
      updatedAt: project.updatedAt || project.createdAt || now,
    };
  }

  // ===================== STATE =====================

  function defaultState() {
    return {
      guitarItems: [],
      trainingSessions: [],
      races: [],
      studyTopics: [],
      listening: [],
      studySubjects: [],
      studyTasks: [],
      codingProjects: [],
      codingTasks: [],
    };
  }

  // One-time migration: the Study tab used to be a flat list of "topics"
  // (state.studyTopics) with a confidence percentage. It's now a
  // Subject -> Tasks hierarchy (state.studySubjects / state.studyTasks).
  // Detects the old shape (no studySubjects/studyTasks arrays present at
  // all) and folds every existing topic into one "General Study" subject,
  // so nothing a user already tracked is lost. Runs at most once per state
  // object: once studySubjects/studyTasks exist (even empty), this is a
  // no-op regardless of what's left in studyTopics.
  function migrateStudyShape(parsed, normalized) {
    var hasNewShape = parsed && (Array.isArray(parsed.studySubjects) || Array.isArray(parsed.studyTasks));
    if (hasNewShape) {
      normalized.studySubjects = Array.isArray(parsed.studySubjects) ? parsed.studySubjects : [];
      normalized.studyTasks = Array.isArray(parsed.studyTasks) ? parsed.studyTasks : [];
      return false;
    }

    normalized.studySubjects = [];
    normalized.studyTasks = [];
    if (!normalized.studyTopics.length) return false;

    var now = new Date().toISOString();
    var subject = { id: generateId(), name: "General Study", createdAt: now, updatedAt: now };
    normalized.studySubjects.push(subject);

    // Old topic "status" was a mastery scale; new task "status" is a
    // lifecycle stage, but now includes Reviewing directly, so it maps
    // straight across. Mastered (done) still folds into Completed.
    var statusMap = {
      "Not Started": "Not Started",
      "In Progress": "In Progress",
      "Reviewing": "Reviewing",
      "Mastered": "Completed",
    };

    normalized.studyTasks = normalized.studyTopics.map(function (t) {
      var noteParts = [];
      if (t.goal) noteParts.push("Goal: " + t.goal);
      if (t.notes) noteParts.push(t.notes);
      return {
        id: generateId(),
        subjectId: subject.id,
        type: "Other",
        title: t.title || "",
        status: statusMap[t.status] || "Not Started",
        priority: "Medium",
        dueDate: "",
        completion: Number(t.confidence) || 0,
        notes: noteParts.join("\n\n"),
        lastWorkedOn: t.lastStudied || null,
        createdAt: t.createdAt || t.updatedAt || now,
        updatedAt: t.updatedAt || now,
      };
    });

    // The data now lives in studyTasks — clear studyTopics so it can't be
    // re-migrated (duplicated) on a future load.
    normalized.studyTopics = [];
    return true;
  }

  // One-time migration: Coding Projects used to carry a single free-text
  // `nextAction` field. It's now Project -> Tasks, with the legacy value
  // folded into exactly one task per project (see buildNextActionTask()).
  // Detects the old shape (no codingTasks array present at all) and runs at
  // most once per state object: once codingTasks exists (even empty), this
  // is a no-op regardless of what's left in any project's nextAction field.
  // project.nextAction itself is deliberately never cleared — unlike
  // studyTopics (a whole array, safe to empty), it's one field on a still-
  // live record, and leaving it in place is strictly safer/non-destructive.
  function migrateCodingProjectTasks(parsed, normalized) {
    var hasNewShape = parsed && Array.isArray(parsed.codingTasks);
    if (hasNewShape) {
      normalized.codingTasks = parsed.codingTasks;
      return false;
    }

    normalized.codingTasks = normalized.codingProjects
      .map(function (p) {
        return buildNextActionTask(p);
      })
      .filter(Boolean);
    return normalized.codingTasks.length > 0;
  }

  function normalizeState(parsed) {
    parsed = parsed || {};
    var normalized = {
      guitarItems: Array.isArray(parsed.guitarItems) ? parsed.guitarItems : [],
      trainingSessions: Array.isArray(parsed.trainingSessions) ? parsed.trainingSessions : [],
      races: Array.isArray(parsed.races) ? parsed.races : [],
      studyTopics: Array.isArray(parsed.studyTopics) ? parsed.studyTopics : [],
      listening: Array.isArray(parsed.listening) ? parsed.listening : [],
      codingProjects: Array.isArray(parsed.codingProjects) ? parsed.codingProjects : [],
    };
    migrateStudyShape(parsed, normalized);
    migrateCodingProjectTasks(parsed, normalized);
    return normalized;
  }

  function isValidStateShape(parsed) {
    if (!parsed || typeof parsed !== "object") return false;
    var coreOk = ["guitarItems", "trainingSessions", "races", "studyTopics"].every(function (key) {
      return Array.isArray(parsed[key]);
    });
    if (!coreOk) return false;
    // These are optional for backward compatibility with exports made
    // before each module existed — but if present, must be arrays.
    var optionalArrayKeys = ["listening", "studySubjects", "studyTasks", "codingProjects", "codingTasks"];
    for (var i = 0; i < optionalArrayKeys.length; i++) {
      var key = optionalArrayKeys[i];
      if (Object.prototype.hasOwnProperty.call(parsed, key) && !Array.isArray(parsed[key])) {
        return false;
      }
    }
    return true;
  }

  function loadState() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      var seeded = defaultState();
      seeded.guitarItems = seedGuitarItems();
      seeded.races = seedRaces();
      seeded.listening = seedListening();
      seeded.codingProjects = seedCodingProjects();
      seeded.codingTasks = seeded.codingProjects.map(buildNextActionTask).filter(Boolean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    try {
      var parsed = JSON.parse(raw);
      var hadListening = parsed && Array.isArray(parsed.listening);
      var hadStudyGrouping = parsed && (Array.isArray(parsed.studySubjects) || Array.isArray(parsed.studyTasks));
      var hadCodingProjects = parsed && Array.isArray(parsed.codingProjects);
      var hadCodingTasks = parsed && Array.isArray(parsed.codingTasks);
      var normalized = normalizeState(parsed);
      if (!hadListening || !hadStudyGrouping || !hadCodingProjects || !hadCodingTasks) {
        // One-time migrations: an existing saved user predating the
        // Listening module (add the starter library), predating the Study
        // Subjects/Tasks grouping (already folded into `normalized` by
        // normalizeState), and/or predating the Coding Projects module (add
        // the starter projects). Persist immediately so the result — not a
        // freshly re-migrated copy with new random ids — is what's read
        // back next time.
        if (!hadListening) normalized.listening = seedListening();
        if (!hadCodingProjects) {
          // normalizeState() already ran migrateCodingProjectTasks() against
          // the pre-seed (empty) codingProjects, so normalized.codingTasks
          // needs regenerating here to match the freshly seeded projects —
          // otherwise their seed nextAction values would have no task.
          normalized.codingProjects = seedCodingProjects();
          normalized.codingTasks = normalized.codingProjects.map(buildNextActionTask).filter(Boolean);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleCloudPush();
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function findGuitarItem(id) {
    return state.guitarItems.find(function (i) {
      return i.id === id;
    });
  }

  function findCodingProject(id) {
    return state.codingProjects.find(function (p) {
      return p.id === id;
    });
  }

  function findCodingTask(id) {
    return state.codingTasks.find(function (t) {
      return t.id === id;
    });
  }

  // Only one task per project should normally be isNextAction:true — this
  // is the single place that enforces it, clearing every sibling task in
  // the same project before setting it on the chosen one. Tasks in other
  // projects are never touched.
  function setNextActionTask(projectId, taskId) {
    state.codingTasks.forEach(function (t) {
      if (t.projectId === projectId) t.isNextAction = t.id === taskId;
    });
  }

  function codingProjectTasks(projectId) {
    return state.codingTasks.filter(function (t) {
      return t.projectId === projectId;
    });
  }

  // Archive is reversible and separate from Delete - archived
  // projects/tasks keep every field, they're just excluded from active
  // calculations and the active grid. isArchived() is the one place that
  // reads the flag so nothing has to special-case a missing/undefined
  // value on legacy records (they read as false, same as archived:false).
  function isArchived(item) {
    return !!(item && item.archived);
  }

  // A task is *effectively* archived - hidden from active views/calcs -
  // if it was archived directly, or if its parent project was archived
  // (archiving a project never rewrites its tasks' own archived flag, so
  // this is the only place that needs to know about the parent). This is
  // also what makes restoring a task always safe: flipping a task's own
  // flag back to false can never make it visible while its parent is
  // still archived, so there's no "invisible active task" edge case to
  // guard against separately - see the archive/restore handlers below.
  function isCodingTaskEffectivelyArchived(task) {
    if (isArchived(task)) return true;
    var project = findCodingProject(task.projectId);
    return isArchived(project);
  }

  function activeCodingProjects() {
    return state.codingProjects.filter(function (p) {
      return !isArchived(p);
    });
  }

  function archivedCodingProjects() {
    return state.codingProjects.filter(isArchived);
  }

  function activeCodingProjectTasks(projectId) {
    return codingProjectTasks(projectId).filter(function (t) {
      return !isCodingTaskEffectivelyArchived(t);
    });
  }

  function computeProjectTaskStats(projectId) {
    var tasks = activeCodingProjectTasks(projectId);
    var completed = tasks.filter(function (t) {
      return t.status === "Done";
    }).length;
    return {
      total: tasks.length,
      completed: completed,
      percent: tasks.length ? Math.round((completed / tasks.length) * 100) : null,
    };
  }

  // Progress is calculated from tasks once a project has any; a project
  // with zero tasks falls back to its legacy manually-entered value so
  // nothing already tracked silently drops to 0%.
  function computeProjectDisplayProgress(project) {
    var stats = computeProjectTaskStats(project.id);
    return stats.total > 0 ? stats.percent : Number(project.progress) || 0;
  }

  // Active task = In Progress or Testing, preferring most-recent
  // lastWorkedOn, falling back to High priority, then a deterministic id
  // comparison so ties never reorder between renders.
  function computeProjectActiveTask(projectId) {
    var active = activeCodingProjectTasks(projectId).filter(function (t) {
      return t.status === "In Progress" || t.status === "Testing";
    });
    if (!active.length) return null;
    var priorityRank = { High: 3, Medium: 2, Low: 1 };
    var sorted = active.slice().sort(function (a, b) {
      var aDate = a.lastWorkedOn || "";
      var bDate = b.lastWorkedOn || "";
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      var pr = (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
      if (pr !== 0) return pr;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return sorted[0];
  }

  function computeProjectNextActionTask(projectId) {
    return (
      activeCodingProjectTasks(projectId).find(function (t) {
        return t.isNextAction;
      }) || null
    );
  }

  // Default task ordering: In Progress, Testing, Blocked, Next Action,
  // High-priority To Do, remaining To Do, Done. Ties broken by id (stable,
  // deterministic — never reorders on its own between renders).
  function codingTaskRank(t) {
    if (t.status === "In Progress") return 0;
    if (t.status === "Testing") return 1;
    if (t.status === "Blocked") return 2;
    if (t.isNextAction) return 3;
    if (t.status === "To Do" && t.priority === "High") return 4;
    if (t.status === "To Do") return 5;
    return 6; // Done
  }

  function codingProjectSortedTasks(projectId) {
    return activeCodingProjectTasks(projectId)
      .slice()
      .sort(function (a, b) {
        var r = codingTaskRank(a) - codingTaskRank(b);
        if (r !== 0) return r;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }

  // Every task that's part of an archived project's history - both tasks
  // archived individually and ones only hidden via the parent - so
  // expanding an archived project shows its full retained task list.
  function codingProjectAllTasksSorted(projectId) {
    return codingProjectTasks(projectId)
      .slice()
      .sort(function (a, b) {
        var r = codingTaskRank(a) - codingTaskRank(b);
        if (r !== 0) return r;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }

  // Excludes archived projects from the "assign to" dropdown - moving an
  // active task into one would immediately hide it via the parent check
  // in isCodingTaskEffectivelyArchived(). The task's *current* project
  // stays listed even if archived, so editing an already-archived task
  // still shows its real assignment instead of silently dropping it.
  function codingProjectOptionsHtml(selectedId) {
    return state.codingProjects
      .filter(function (p) {
        return !isArchived(p) || p.id === selectedId;
      })
      .slice()
      .sort(function (a, b) {
        return (a.name || "").localeCompare(b.name || "");
      })
      .map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === selectedId ? " selected" : "") + ">" + escapeHtml(p.name) + "</option>";
      })
      .join("");
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

  function formatDateWithWeekday(iso) {
    if (!iso) return "";
    var d = localDateFromISO(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function getSportMeta(sport) {
    return SPORT_META[sport] || SPORT_META.Other;
  }

  function parseDurationToMinutes(str) {
    if (!str) return null;
    var total = 0;
    var found = false;
    var hourMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
    if (hourMatch) {
      total += parseFloat(hourMatch[1]) * 60;
      found = true;
    }
    var minMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i);
    if (minMatch) {
      total += parseFloat(minMatch[1]);
      found = true;
    }
    if (!found) {
      var bare = str.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
      if (bare) {
        total += parseFloat(bare[1]);
        found = true;
      }
    }
    return found ? total : null;
  }

  function formatDurationMinutes(mins) {
    if (mins == null) return null;
    mins = Math.round(mins);
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h > 0 && m > 0) return h + "h " + m + "m";
    if (h > 0) return h + "h";
    return m + "m";
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

  function avgFieldPercent(list, field) {
    field = field || "confidence";
    if (!list.length) return "—";
    var sum = list.reduce(function (acc, i) {
      return acc + (Number(i[field]) || 0);
    }, 0);
    return Math.round(sum / list.length) + "%";
  }

  function confidenceLevelClass(value) {
    if (value < 40) return "level-low";
    if (value < 75) return "level-mid";
    return "level-high";
  }

  function confidenceBarHtml(value, label) {
    value = Number(value) || 0;
    label = label || "Confidence";
    return (
      '<div class="confidence-bar-wrap">' +
      '<div class="confidence-bar-label"><span>' + label + '</span><span>' + value + '%</span></div>' +
      '<div class="confidence-bar-track"><div class="confidence-bar-fill ' + confidenceLevelClass(value) + '" style="width:' + value + '%"></div></div>' +
      "</div>"
    );
  }

  // ===================== WEB AUDIO CHIME =====================

  // iOS Safari only allows an AudioContext to start/resume when created (or
  // resumed) synchronously inside a user-gesture handler. The chime actually
  // fires later from a setInterval callback (when the countdown hits zero),
  // which is not a gesture — so we lazily create one shared context and
  // unlock/resume it at Start-click time (a real gesture), then reuse that
  // same context for the chime whenever the timer completes.
  var sharedAudioCtx = null;

  function unlockAudioContext() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
      if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
    } catch (e) {
      /* Web Audio unavailable — fail silently */
    }
  }

  function playChime() {
    try {
      var ctx = sharedAudioCtx;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
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

  function openModal(title, fieldsHtml, onSubmit, afterMount, opts) {
    var overlay = document.getElementById("modal-overlay");
    var titleEl = document.getElementById("modal-title");
    var form = document.getElementById("modal-form");
    titleEl.textContent = title;
    var showSaveButton = !(opts && opts.noSaveButton);
    var saveLabel = (opts && opts.saveLabel) || "Save";
    form.innerHTML = fieldsHtml + (showSaveButton ? '<button type="submit" class="button button-primary">' + saveLabel + "</button>" : "");
    modalState.onSubmit = onSubmit || null;
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

  // Each entry carries stable navigation metadata (module + id, never text)
  // so a click can locate the exact underlying record — see navigateToItem().
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
          items.push({ module: "guitar", itemId: g.id, label: "🎸 " + g.title + " — never practiced" });
        }
      } else {
        var days = daysBetween(g.lastPracticed, today);
        if (days >= ATTENTION_DAYS_THRESHOLD) {
          items.push({ module: "guitar", itemId: g.id, label: "🎸 " + g.title + " — last practiced " + days + " days ago" });
        }
      }
    });

    state.studyTasks.forEach(function (t) {
      if (t.status === "Completed" || isStudyTaskEffectivelyArchived(t)) return;
      var subjectName = studySubjectName(t.subjectId);
      var label = "📚 " + (subjectName ? subjectName + ": " : "") + t.title;
      if (!t.lastWorkedOn) {
        items.push({ module: "study", subjectId: t.subjectId, itemId: t.id, label: label + " — never worked on" });
      } else {
        var studyDays = daysBetween(t.lastWorkedOn, today);
        if (studyDays >= ATTENTION_DAYS_THRESHOLD) {
          items.push({ module: "study", subjectId: t.subjectId, itemId: t.id, label: label + " — last worked on " + studyDays + " days ago" });
        }
      }
    });

    state.races.forEach(function (r) {
      if (r.status !== "Confirmed") return;
      var missing = [];
      if (!r.date) missing.push("date");
      if (!r.location) missing.push("location");
      if (missing.length) {
        items.push({ module: "races", itemId: r.id, label: "🏁 " + r.name + " — missing " + missing.join(" and ") });
      }
    });

    state.trainingSessions.forEach(function (s) {
      if (!s.completed && s.date < today) {
        items.push({ module: "training", itemId: s.id, label: "🏋 " + s.title + " (" + formatDateNice(s.date) + ") — incomplete, past due" });
      }
    });

    // Parked/Completed/Paused and normal Idea-stage projects are never
    // flagged. A project WITH tasks is judged by its tasks (below); a
    // project with zero tasks yet falls back to the exact legacy
    // project-level rule that predates this module's task hierarchy, so
    // nothing regresses for projects that haven't picked up tasks.
    activeCodingProjects().forEach(function (p) {
      if (p.status === "Completed" || p.status === "Parked" || p.status === "Paused" || p.status === "Idea") return;

      var tasks = activeCodingProjectTasks(p.id);

      if (tasks.length) {
        tasks.forEach(function (t) {
          if (t.status === "Done") return;

          var inactiveDays = t.lastWorkedOn
            ? daysBetween(t.lastWorkedOn, today)
            : t.createdAt
            ? daysBetween(t.createdAt.slice(0, 10), today)
            : ATTENTION_DAYS_THRESHOLD;
          var overdue = !!(t.dueDate && t.dueDate < today);

          var reason = null;
          if (overdue) {
            reason = "overdue (due " + formatDateNice(t.dueDate) + ")";
          } else if (t.status === "In Progress" && inactiveDays >= ATTENTION_DAYS_THRESHOLD) {
            reason = "in progress, inactive " + inactiveDays + " days";
          } else if (t.status === "Testing" && inactiveDays >= ATTENTION_DAYS_THRESHOLD) {
            reason = "in testing, inactive " + inactiveDays + " days";
          } else if (t.priority === "High" && inactiveDays >= ATTENTION_DAYS_THRESHOLD) {
            reason = "high priority, inactive " + inactiveDays + " days";
          } else if (t.isNextAction && inactiveDays >= ATTENTION_DAYS_THRESHOLD) {
            reason = "next action, no activity " + inactiveDays + " days";
          }
          if (reason) {
            items.push({ module: "codingProjects", itemId: p.id, taskId: t.id, label: "💻 " + p.name + ": " + t.title + " — " + reason });
          }
        });
        return;
      }

      var inactiveDays;
      if (p.lastWorkedOn) {
        inactiveDays = daysBetween(p.lastWorkedOn, today);
      } else {
        // Grace period: don't flag a never-worked-on project until it has
        // existed for at least ATTENTION_DAYS_THRESHOLD days, same pattern
        // as the guitar "never practiced" grace period above.
        var createdDateIso = p.createdAt ? p.createdAt.slice(0, 10) : null;
        inactiveDays = createdDateIso ? daysBetween(createdDateIso, today) : ATTENTION_DAYS_THRESHOLD;
      }
      if (inactiveDays < ATTENTION_DAYS_THRESHOLD) return;

      var activitySuffix = p.lastWorkedOn ? "last worked on " + inactiveDays + " days ago" : "never worked on";
      var reason = null;
      if (p.status === "Building") {
        reason = activitySuffix;
      } else if (p.status === "Testing") {
        reason = "in testing, " + activitySuffix;
      } else if (p.status === "Planning" && p.priority === "High") {
        reason = "high priority, " + activitySuffix;
      } else if (p.nextAction) {
        reason = "next action pending, " + activitySuffix;
      }
      if (reason) {
        items.push({ module: "codingProjects", itemId: p.id, label: "💻 " + p.name + " — " + reason });
      }
    });

    return items;
  }

  // Opens the target module tab, ensures the record is actually visible
  // (clearing a filter that would hide it), then scrolls it into view and
  // briefly highlights it. Always locates the element by its stable id
  // attribute — never by matching visible text.
  var HIGHLIGHT_MS = 2000;

  function highlightElement(el) {
    if (!el) return;
    el.classList.remove("dashboard-target-highlight");
    // Force reflow so re-adding the class restarts the CSS fade animation
    // even if this same element was highlighted moments ago.
    void el.offsetWidth;
    el.classList.add("dashboard-target-highlight");
    clearTimeout(el._highlightTimer);
    el._highlightTimer = setTimeout(function () {
      el.classList.remove("dashboard-target-highlight");
    }, HIGHLIGHT_MS);
  }

  function scrollAndHighlight(selector) {
    // Two nested rAFs: the first runs after the browser has committed the
    // render triggered just before this call; the second guarantees layout
    // for scrollIntoView is up to date before we measure/scroll.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var el = document.querySelector(selector);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        highlightElement(el);
      });
    });
  }

  function navigateToItem(item) {
    if (!item || !item.module || !item.itemId) return;
    setActiveTab(item.module);

    if (item.module === "guitar") {
      renderGuitar();
      scrollAndHighlight('[data-guitar-id="' + item.itemId + '"]');
    } else if (item.module === "training") {
      renderTraining();
      scrollAndHighlight('[data-training-id="' + item.itemId + '"]');
    } else if (item.module === "races") {
      var race = state.races.find(function (r) { return r.id === item.itemId; });
      if (race && raceFilter !== "All" && raceFilter !== race.status) {
        raceFilter = "All";
        var raceFilterEl = document.getElementById("race-status-filter");
        if (raceFilterEl) raceFilterEl.value = "All";
      }
      renderRaces();
      scrollAndHighlight('[data-race-id="' + item.itemId + '"]');
    } else if (item.module === "study") {
      // Deep-linking into a subject always exposes its task list, whether
      // the target is a specific task or the subject card itself - same
      // rule Coding Projects uses. Looks up the subject by the task's own
      // stable subjectId, never by visible text. Under normal operation
      // an archived task is never the target (Dashboard/Attention already
      // exclude archived content), but reveal it in the Archived section
      // rather than silently failing to find it in the active grid.
      var studyTask = state.studyTasks.find(function (t) { return t.id === item.itemId; });
      if (studyTask) {
        if (isStudyTaskEffectivelyArchived(studyTask)) {
          archivedStudySectionExpanded = true;
        }
        expandedStudySubjectIds[studyTask.subjectId] = true;
      }
      renderStudy();
      scrollAndHighlight('[data-study-task-id="' + item.itemId + '"]');
    } else if (item.module === "listening") {
      var album = state.listening.find(function (a) { return a.id === item.itemId; });
      if (album && listeningFilter !== "All" && listeningFilter !== album.status) {
        listeningFilter = "All";
        var listeningFilterEl = document.getElementById("listening-status-filter");
        if (listeningFilterEl) listeningFilterEl.value = "All";
      }
      renderListening();
      scrollAndHighlight('[data-listening-id="' + item.itemId + '"]');
    } else if (item.module === "codingProjects") {
      var project = findCodingProject(item.itemId);
      var targetTask = item.taskId ? findCodingTask(item.taskId) : null;
      // Under normal operation an archived item is never the deep-link
      // target (Dashboard/Attention already exclude archived content from
      // their selection), but handle it explicitly rather than silently
      // failing to find it in the active grid - reveal it in the Archived
      // section instead, by the same stable ID.
      var targetIsArchived = isArchived(project) || (targetTask && isCodingTaskEffectivelyArchived(targetTask));
      if (targetIsArchived) {
        archivedCodingSectionExpanded = true;
      } else if (project && codingProjectFilter !== "All" && !codingProjectMatchesFilter(project)) {
        codingProjectFilter = "All";
        var codingProjectFilterEl = document.getElementById("coding-project-status-filter");
        if (codingProjectFilterEl) codingProjectFilterEl.value = "All";
      }
      // Deep-linking into a project always exposes its task list, whether
      // the target is a specific task or the project card itself.
      if (project) expandedCodingProjectIds[project.id] = true;
      renderCodingProjects();
      var codingTargetSelector = item.taskId
        ? '[data-coding-task-id="' + item.taskId + '"]'
        : '[data-coding-project-id="' + item.itemId + '"]';
      scrollAndHighlight(codingTargetSelector);
    }
  }

  function renderTodayTrainingCard() {
    var section = document.querySelector('.tab-section[data-section="dashboard"]');
    if (!section) return;
    var card = document.getElementById("dashboard-today-training");
    if (!card) {
      card = document.createElement("div");
      card.id = "dashboard-today-training";
      card.className = "card";
      var dataCard = section.querySelector(".data-card");
      section.insertBefore(card, dataCard);
    }

    var today = todayISO();
    var todaySessions = state.trainingSessions.filter(function (s) {
      return s.date === today;
    });

    var bodyHtml;
    if (!todaySessions.length) {
      bodyHtml = '<p class="card-subtext">No training planned today.</p>';
    } else {
      bodyHtml =
        '<div class="sessions-list">' +
        todaySessions
          .map(function (s) {
            var meta = getSportMeta(s.sport);
            // A real <button> (not a plain div) so each session is a
            // native, keyboard-accessible tap target — matching the
            // "Items Needing Attention" entries. Its own id attribute is
            // deliberately NOT data-training-id: that attribute already
            // uniquely identifies the session's row in the Training tab
            // itself, and this dashboard preview stays in the DOM (just
            // hidden) after switching tabs, so reusing the same attribute
            // here would make navigateToItem's querySelector ambiguous —
            // it could highlight this hidden preview instead of the real
            // row. data-today-training-id is only ever used to look up
            // which session was clicked before handing off to the shared
            // navigateToItem() drill-down.
            return (
              '<button type="button" class="session-row' + (s.completed ? " completed" : "") + '" data-today-training-id="' + s.id + '" style="border-left: 4px solid ' + meta.color + '" aria-label="Open ' + escapeHtml(s.title) + ' in Training">' +
              '<span class="session-sport-icon" title="' + escapeHtml(s.sport) + '">' + meta.icon + "</span>" +
              '<div class="session-row-main">' +
              '<div class="session-row-title">' + escapeHtml(s.title) + "</div>" +
              '<div class="session-row-meta">' + escapeHtml(s.sport) + (s.duration ? " · " + escapeHtml(s.duration) : "") + "</div>" +
              "</div>" +
              '<span class="badge ' + (s.completed ? "badge-completed" : "") + '">' + (s.completed ? "Completed" : "Pending") + "</span>" +
              "</button>"
            );
          })
          .join("") +
        "</div>";
    }

    card.innerHTML = '<h3 class="card-title">Today’s Training</h3>' + bodyHtml;

    card.querySelectorAll("[data-today-training-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        navigateToItem({ module: "training", itemId: btn.getAttribute("data-today-training-id") });
      });
    });
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
          visible.map(function (item, idx) {
            return (
              '<li><button type="button" class="attention-item" data-attention-index="' + idx + '" aria-label="Open ' + escapeHtml(item.label) + '">' +
              escapeHtml(item.label) +
              "</button></li>"
            );
          }).join("") +
          "</ul>" +
          (extra > 0 ? '<p class="hint-text">+' + extra + " more</p>" : "")
        : '<p class="card-subtext">Nothing needs attention right now.</p>');

    card.querySelectorAll("[data-attention-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = visible[Number(btn.getAttribute("data-attention-index"))];
        if (item) navigateToItem(item);
      });
    });
  }

  // Picks the single Coding Project the user is most likely mid-way
  // through right now: Building or Testing, preferring whichever was
  // worked on most recently, falling back to High priority on a tie (or
  // when neither candidate has a lastWorkedOn date at all). Mirrors
  // computeCurrentStudyFocus()'s selection logic exactly.
  function computeCurrentCodingFocus() {
    var active = activeCodingProjects().filter(function (p) {
      return p.status === "Building" || p.status === "Testing";
    });
    if (!active.length) return null;

    var priorityRank = { High: 3, Medium: 2, Low: 1 };
    var sorted = active.slice().sort(function (a, b) {
      var aDate = a.lastWorkedOn || "";
      var bDate = b.lastWorkedOn || "";
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
    });
    return { primary: sorted[0], extraCount: sorted.length - 1 };
  }

  // Picks the single Study task the user is most likely mid-way through
  // right now: In Progress or Reviewing, preferring whichever was worked
  // on most recently, falling back to High priority on a tie (or when
  // neither candidate has a lastWorkedOn date at all).
  function computeCurrentStudyFocus() {
    var active = state.studyTasks.filter(function (t) {
      return (t.status === "In Progress" || t.status === "Reviewing") && !isStudyTaskEffectivelyArchived(t);
    });
    if (!active.length) return null;

    var priorityRank = { High: 3, Medium: 2, Low: 1 };
    var sorted = active.slice().sort(function (a, b) {
      var aDate = a.lastWorkedOn || "";
      var bDate = b.lastWorkedOn || "";
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
    });
    return { primary: sorted[0], extraCount: sorted.length - 1 };
  }

  // Picks the guitar item practiced most recently, if any. Guitar has no
  // active/status concept to filter by first (unlike Study/Coding tasks),
  // so this is just recency - deterministic id tie-break keeps it stable
  // between renders, same convention as computeCurrentStudyFocus().
  function computeCurrentGuitarFocus() {
    var practiced = state.guitarItems.filter(function (g) {
      return !!g.lastPracticed;
    });
    if (!practiced.length) return null;
    var sorted = practiced.slice().sort(function (a, b) {
      if (a.lastPracticed !== b.lastPracticed) return a.lastPracticed < b.lastPracticed ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return sorted[0];
  }

  // Builds a plain (label/value/sub) grid tile — the shape shared by
  // Training, Race Pipeline, Next Confirmed Race, and Listening.
  function simpleStatCardHtml(c) {
    return (
      '<button type="button" class="stat-card" data-goto="' + c.tab + '" data-color="' + c.color + '">' +
      '<div class="stat-card-label">' + escapeHtml(c.label) + "</div>" +
      '<div class="stat-card-value">' + escapeHtml(c.value) + "</div>" +
      '<div class="stat-card-sub">' + escapeHtml(c.sub) + "</div>" +
      "</button>"
    );
  }

  // Builds the Guitar grid tile: the most recently practiced item's
  // lastPracticed/notes (see computeCurrentGuitarFocus() and the matching
  // block in renderGuitar()) as primary content, item count/avg confidence
  // demoted to a secondary line. Same wording/semantics as the Guitar
  // module card - "Practice note" not "Worked on", date-only when there's
  // no note, "Not practiced yet" when there's neither. Same
  // whole-tile-is-one-button click behavior as Study/Coding.
  function guitarStatCardHtml() {
    var focus = computeCurrentGuitarFocus();
    var itemCount = state.guitarItems.length;
    var focusHtml;
    var ariaLabel;
    var itemIdAttr = "";

    if (focus) {
      focusHtml =
        '<div class="stat-card-focus-title">' + escapeHtml(focus.title) + "</div>" +
        '<div class="stat-card-focus-meta">Last practiced: ' + formatDateNice(focus.lastPracticed) + "</div>" +
        (focus.notes ? '<div class="stat-card-focus-note">Practice note: “' + escapeHtml(focus.notes) + '”</div>' : "");
      ariaLabel = "Open " + focus.title + " in Guitar";
      itemIdAttr = ' data-guitar-focus-item-id="' + focus.id + '"';
    } else {
      focusHtml = '<div class="stat-card-focus-empty">Not practiced yet</div>';
      ariaLabel = "Open Guitar";
    }

    return (
      '<button type="button" class="stat-card" data-color="guitar" data-guitar-summary-card' + itemIdAttr + ' aria-label="' + escapeHtml(ariaLabel) + '">' +
      '<div class="stat-card-label">Guitar Items</div>' +
      focusHtml +
      '<div class="stat-card-sub">' + itemCount + " item" + (itemCount === 1 ? "" : "s") + " · Avg confidence " + avgFieldPercent(state.guitarItems) + "</div>" +
      "</button>"
    );
  }

  // Builds the Study grid tile: the active task (see
  // computeCurrentStudyFocus()) as primary content, task count/overall
  // completion demoted to a secondary line. The whole tile is one button —
  // clicking it deep-links to the active task via navigateToItem() when
  // there is one, or just opens the Study tab when there isn't.
  function studyStatCardHtml() {
    var focus = computeCurrentStudyFocus();
    var activeTasks = state.studyTasks.filter(function (t) {
      return !isStudyTaskEffectivelyArchived(t);
    });
    var taskCount = activeTasks.length;
    var focusHtml;
    var ariaLabel;
    var taskIdAttr = "";

    if (focus) {
      var t = focus.primary;
      var subjectName = studySubjectName(t.subjectId);
      var titleText = subjectName ? subjectName + " — " + t.title : t.title;
      focusHtml =
        (subjectName ? '<div class="stat-card-focus-subject">' + escapeHtml(subjectName) + "</div>" : "") +
        '<div class="stat-card-focus-title">' + escapeHtml(t.title) + "</div>" +
        '<div class="stat-card-focus-meta">' + escapeHtml(t.status) + " · " + (Number(t.completion) || 0) + "%</div>" +
        (focus.extraCount > 0 ? '<div class="stat-card-focus-more">+' + focus.extraCount + " more active</div>" : "");
      ariaLabel = "Open " + titleText + " in Study";
      taskIdAttr = ' data-study-focus-task-id="' + t.id + '"';
    } else {
      focusHtml = '<div class="stat-card-focus-empty">No active study task</div>';
      ariaLabel = "Open Study";
    }

    return (
      '<button type="button" class="stat-card" data-color="study" data-study-summary-card' + taskIdAttr + ' aria-label="' + escapeHtml(ariaLabel) + '">' +
      '<div class="stat-card-label">Study</div>' +
      focusHtml +
      '<div class="stat-card-sub">' + taskCount + " task" + (taskCount === 1 ? "" : "s") + " · " + avgFieldPercent(activeTasks, "completion") + " overall</div>" +
      "</button>"
    );
  }

  // Builds the Coding Projects grid tile: the active project (see
  // computeCurrentCodingFocus()) as primary content with its next action
  // underneath, project counts demoted to a secondary line. Same
  // whole-tile-is-one-button click behavior as the Study tile.
  function codingProjectsStatCardHtml() {
    var focus = computeCurrentCodingFocus();
    var nonArchived = activeCodingProjects();
    var totalCount = nonArchived.length;
    var activeCount = nonArchived.filter(function (p) {
      return p.status === "Building" || p.status === "Testing";
    }).length;
    var plannedCount = nonArchived.filter(function (p) {
      return p.status === "Idea" || p.status === "Planning";
    }).length;

    var focusHtml;
    var ariaLabel;
    var projectIdAttr = "";
    var taskIdAttr = "";

    if (focus) {
      var p = focus.primary;
      var displayProgress = computeProjectDisplayProgress(p);
      var activeTask = computeProjectActiveTask(p.id);
      var nextActionTask = computeProjectNextActionTask(p.id);
      focusHtml =
        '<div class="stat-card-focus-title">' + escapeHtml(p.name) + "</div>" +
        '<div class="stat-card-focus-meta">' + escapeHtml(p.status) + " · " + displayProgress + "%</div>" +
        (focus.extraCount > 0 ? '<div class="stat-card-focus-more">+' + focus.extraCount + " more active</div>" : "") +
        (activeTask ? '<div class="stat-card-focus-next-action">Working on: ' + escapeHtml(activeTask.title) + "</div>" : "") +
        (nextActionTask ? '<div class="stat-card-focus-next-action">Next: ' + escapeHtml(nextActionTask.title) + "</div>" : "");
      ariaLabel = activeTask ? "Open " + activeTask.title + " in Coding Projects" : "Open " + p.name + " in Coding Projects";
      projectIdAttr = ' data-coding-focus-project-id="' + p.id + '"';
      taskIdAttr = activeTask ? ' data-coding-focus-task-id="' + activeTask.id + '"' : "";
    } else {
      focusHtml = '<div class="stat-card-focus-empty">No active coding project</div>';
      ariaLabel = "Open Coding Projects";
    }

    return (
      '<button type="button" class="stat-card" data-color="coding-projects" data-coding-summary-card' + projectIdAttr + taskIdAttr + ' aria-label="' + escapeHtml(ariaLabel) + '">' +
      '<div class="stat-card-label">Coding Projects</div>' +
      focusHtml +
      '<div class="stat-card-sub">' + totalCount + " project" + (totalCount === 1 ? "" : "s") + " · " + activeCount + " active · " + plannedCount + " planned</div>" +
      "</button>"
    );
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

    var currentlyListening = state.listening.find(function (a) {
      return a.status === "Listening";
    });
    var upNextAlbum = state.listening
      .filter(function (a) {
        return a.status === "To Listen";
      })
      .sort(function (a, b) {
        return (a.createdAt || "").localeCompare(b.createdAt || "");
      })[0];
    var totalFinishedAlbums = state.listening.filter(function (a) {
      return a.status === "Finished";
    }).length;
    var listeningValue = currentlyListening ? currentlyListening.album : "Nothing currently playing";
    var listeningSub = (upNextAlbum ? "Up next: " + upNextAlbum.album : "Listening queue empty") + " · " + totalFinishedAlbums + " finished";

    var cards = [
      {
        tab: "training",
        color: "training",
        label: "Training This Week",
        value: weekCompleted + " / " + weekSessions.length + " (" + weekPct + "%)",
        sub: "sessions completed",
      },
      {
        tab: "races",
        color: "race-pipeline",
        label: "Race Pipeline",
        value: raceCounts.Confirmed + " Confirmed",
        sub: raceCounts.Tentative + " Tentative · " + raceCounts["Bucket List"] + " Bucket List · " + raceCounts.Completed + " Completed",
      },
      {
        tab: "races",
        color: "next-race",
        label: "Next Confirmed Race",
        value: nextConfirmed ? nextConfirmed.name : "None",
        sub: nextConfirmedSub,
      },
      {
        tab: "listening",
        color: "listening",
        label: "Listening",
        value: listeningValue,
        sub: listeningSub,
      },
    ];

    // Guitar, Study, and Coding Projects render as richer tiles (active-item
    // focus) rather than the plain label/value/sub shape, but stay in the
    // same grid alongside everything else — same position they held before.
    el.innerHTML =
      guitarStatCardHtml() +
      simpleStatCardHtml(cards[0]) + // Training This Week
      simpleStatCardHtml(cards[1]) + // Race Pipeline
      simpleStatCardHtml(cards[2]) + // Next Confirmed Race
      studyStatCardHtml() +
      simpleStatCardHtml(cards[3]) + // Listening
      codingProjectsStatCardHtml();

    el.querySelectorAll("[data-goto]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveTab(btn.getAttribute("data-goto"));
      });
    });

    var guitarCardBtn = el.querySelector("[data-guitar-summary-card]");
    if (guitarCardBtn) {
      guitarCardBtn.addEventListener("click", function () {
        var itemId = guitarCardBtn.getAttribute("data-guitar-focus-item-id");
        if (itemId) {
          navigateToItem({ module: "guitar", itemId: itemId });
        } else {
          setActiveTab("guitar");
        }
      });
    }

    var studyCardBtn = el.querySelector("[data-study-summary-card]");
    if (studyCardBtn) {
      studyCardBtn.addEventListener("click", function () {
        var taskId = studyCardBtn.getAttribute("data-study-focus-task-id");
        if (taskId) {
          navigateToItem({ module: "study", itemId: taskId });
        } else {
          setActiveTab("study");
        }
      });
    }

    var codingCardBtn = el.querySelector("[data-coding-summary-card]");
    if (codingCardBtn) {
      codingCardBtn.addEventListener("click", function () {
        var projectId = codingCardBtn.getAttribute("data-coding-focus-project-id");
        var taskId = codingCardBtn.getAttribute("data-coding-focus-task-id");
        if (projectId) {
          navigateToItem({ module: "codingProjects", itemId: projectId, taskId: taskId || null });
        } else {
          setActiveTab("codingProjects");
        }
      });
    }

    renderTodayTrainingCard();
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

        // Reuses the item's existing lastPracticed date and single notes
        // field (no separate practice-log data exists for Guitar) - notes
        // is a standing per-item note rather than a dated session entry, so
        // it's labeled "Practice note" (not "Worked on") to avoid implying
        // it describes the specific session lastPracticed refers to.
        var practiceHtml;
        if (item.lastPracticed || item.notes) {
          practiceHtml =
            '<div class="guitar-practice-group">' +
            '<div class="item-card-meta">Last practiced: ' + (item.lastPracticed ? formatDateNice(item.lastPracticed) : "Never") + "</div>" +
            (item.notes ? '<div class="item-card-meta guitar-practice-notes">Practice note: “' + escapeHtml(item.notes) + '”</div>' : "") +
            "</div>";
        } else {
          practiceHtml = '<p class="hint-text">Not practiced yet</p>';
        }

        return (
          '<div class="item-card" data-id="' + item.id + '" data-guitar-id="' + item.id + '">' +
          '<div class="item-card-header">' +
          '<div>' +
          '<div class="item-card-title">' + escapeHtml(item.title) + "</div>" +
          '<div class="item-card-meta">' + escapeHtml(item.type) + " · " + escapeHtml(item.status) + "</div>" +
          "</div>" +
          "</div>" +
          (item.goal ? '<div class="item-card-meta">🎯 ' + escapeHtml(item.goal) + "</div>" : "") +
          '<div class="item-card-meta">Planned: ' + (Number(item.plannedMinutes) || 0) + " min</div>" +
          confidenceBarHtml(item.confidence) +
          practiceHtml +
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

    // Runs inside a real click handler, so this is a valid place to
    // create/resume the shared AudioContext for iOS Safari's autoplay policy.
    unlockAudioContext();

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

    var totalPlannedMinutes = null;
    var hasParseableDuration = false;
    weekSessions.forEach(function (s) {
      var mins = parseDurationToMinutes(s.duration);
      if (mins != null) {
        hasParseableDuration = true;
        totalPlannedMinutes = (totalPlannedMinutes || 0) + mins;
      }
    });
    var totalPlannedLabel = hasParseableDuration ? formatDurationMinutes(totalPlannedMinutes) : "—";

    el.innerHTML =
      '<div class="stat-pill"><strong>' + weekSessions.length + "</strong>planned this week</div>" +
      '<div class="stat-pill"><strong>' + completed + " / " + weekSessions.length + " (" + pct + "%)</strong>completed this week</div>" +
      '<div class="stat-pill"><strong>' + (sportSummary || "—") + "</strong>by sport this week</div>" +
      '<div class="stat-pill"><strong>' + totalPlannedLabel + "</strong>total planned time this week</div>";
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
        var meta = getSportMeta(s.sport);
        return (
          '<div class="session-row' + (s.completed ? " completed" : "") + '" data-id="' + s.id + '" data-training-id="' + s.id + '" style="border-left: 4px solid ' + meta.color + '">' +
          '<input type="checkbox" data-toggle-session="' + s.id + '" ' + (s.completed ? "checked" : "") + ">" +
          '<span class="session-sport-icon" title="' + escapeHtml(s.sport) + '">' + meta.icon + "</span>" +
          '<div class="session-row-main">' +
          '<div class="session-row-title">' + escapeHtml(s.title) + "</div>" +
          '<div class="session-row-meta">' + formatDateWithWeekday(s.date) + " · " + escapeHtml(s.sport) + (s.duration ? " · " + escapeHtml(s.duration) : "") + "</div>" +
          (s.notes ? '<div class="session-row-meta">' + escapeHtml(s.notes) + "</div>" : "") +
          "</div>" +
          '<span class="badge ' + (s.completed ? "badge-completed" : "") + '">' + (s.completed ? "Completed" : "Pending") + "</span>" +
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
          '<div class="item-card" data-id="' + r.id + '" data-race-id="' + r.id + '">' +
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

  function studySubjectName(subjectId) {
    var subject = state.studySubjects.find(function (s) {
      return s.id === subjectId;
    });
    return subject ? subject.name : "";
  }

  function studySubjectSortedTasks(subjectId) {
    return state.studyTasks
      .filter(function (t) {
        return t.subjectId === subjectId;
      })
      .slice()
      .sort(function (a, b) {
        var ad = a.dueDate || "9999-99-99";
        var bd = b.dueDate || "9999-99-99";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return (a.title || "").localeCompare(b.title || "");
      });
  }

  // A task is *effectively* archived - hidden from active views/calcs -
  // if it was archived directly, or if its parent subject was archived
  // (archiving a subject never rewrites its tasks' own archived flag, so
  // this is the only place that needs to know about the parent). Mirrors
  // isCodingTaskEffectivelyArchived() exactly; restoring a task is always
  // just flipping its own flag back to false, which can never make it
  // visible while the parent subject is still archived.
  function isStudyTaskEffectivelyArchived(task) {
    if (isArchived(task)) return true;
    var subject = state.studySubjects.find(function (s) {
      return s.id === task.subjectId;
    });
    return isArchived(subject);
  }

  function activeStudySubjects() {
    return state.studySubjects.filter(function (s) {
      return !isArchived(s);
    });
  }

  function archivedStudySubjects() {
    return state.studySubjects.filter(isArchived);
  }

  function activeStudySubjectTasks(subjectId) {
    return studySubjectSortedTasks(subjectId).filter(function (t) {
      return !isStudyTaskEffectivelyArchived(t);
    });
  }

  // Task count + overall completion for one subject's Progress group.
  // Percent reuses the exact same "average of each task's completion
  // field" formula the Dashboard Study card already applies across all
  // subjects (see avgFieldPercent) - just scoped to this subject's own
  // tasks instead of the whole study module.
  function computeSubjectTaskStats(subjectId) {
    var tasks = activeStudySubjectTasks(subjectId);
    var completed = tasks.filter(function (t) {
      return t.status === "Completed";
    }).length;
    var percent = tasks.length
      ? Math.round(
          tasks.reduce(function (acc, t) {
            return acc + (Number(t.completion) || 0);
          }, 0) / tasks.length
        )
      : 0;
    return { total: tasks.length, completed: completed, percent: percent };
  }

  // Active task = In Progress or Reviewing, preferring most-recent
  // lastWorkedOn, falling back to High priority, then a deterministic id
  // comparison so ties never reorder between renders. Mirrors
  // computeProjectActiveTask()'s selection rule exactly, scoped to one
  // subject instead of one coding project.
  function computeSubjectActiveTask(subjectId) {
    var active = activeStudySubjectTasks(subjectId).filter(function (t) {
      return t.status === "In Progress" || t.status === "Reviewing";
    });
    if (!active.length) return null;
    var priorityRank = { High: 3, Medium: 2, Low: 1 };
    var sorted = active.slice().sort(function (a, b) {
      var aDate = a.lastWorkedOn || "";
      var bDate = b.lastWorkedOn || "";
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      var pr = (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
      if (pr !== 0) return pr;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return sorted[0];
  }

  // Nearest not-yet-completed due date in the subject, if any. Purely a
  // display computation over the existing dueDate field (studySubjectSortedTasks
  // already orders by dueDate ascending) - no new data, no schema change.
  function computeSubjectNextDueTask(subjectId) {
    var withDue = activeStudySubjectTasks(subjectId).filter(function (t) {
      return t.dueDate && t.status !== "Completed";
    });
    return withDue.length ? withDue[0] : null;
  }

  function taskStatusBadgeClass(status) {
    return "badge-" + String(status).toLowerCase().replace(/\s+/g, "-");
  }

  function taskPriorityBadgeClass(priority) {
    return "badge-priority-" + String(priority).toLowerCase();
  }

  function studyTaskStatusOptionsHtml(selected) {
    return TASK_STATUSES.map(function (s) {
      return '<option value="' + s + '"' + (s === selected ? " selected" : "") + ">" + s + "</option>";
    }).join("");
  }

  function renderStudy() {
    var el = document.getElementById("study-subjects-list");
    var activeSubjects = activeStudySubjects();

    if (!activeSubjects.length) {
      el.innerHTML = '<div class="empty-state">No study subjects yet. Add one, or paste tasks above to create subjects automatically.</div>';
    } else {
      renderActiveStudySubjectsGrid(el, activeSubjects);
    }

    renderArchivedStudySection();

    // Edit/Delete/Archive/Restore/expand-toggle are shared across the
    // active grid and the Archived section, so they're wired once,
    // document-wide, after both have rendered.
    document.querySelectorAll("[data-toggle-study-tasks]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-toggle-study-tasks");
        expandedStudySubjectIds[id] = !expandedStudySubjectIds[id];
        renderStudy();
      });
    });
    document.querySelectorAll("[data-edit-subject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openStudySubjectModal(btn.getAttribute("data-edit-subject"));
      });
    });
    document.querySelectorAll("[data-delete-subject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-subject");
        var subject = state.studySubjects.find(function (s) {
          return s.id === id;
        });
        if (!subject) return;
        var taskCount = state.studyTasks.filter(function (t) {
          return t.subjectId === id;
        }).length;
        var msg = taskCount
          ? 'Delete "' + subject.name + '" and its ' + taskCount + " task" + (taskCount === 1 ? "" : "s") + "?"
          : 'Delete "' + subject.name + '"?';
        if (!confirm(msg)) return;
        state.studySubjects = state.studySubjects.filter(function (s) {
          return s.id !== id;
        });
        state.studyTasks = state.studyTasks.filter(function (t) {
          return t.subjectId !== id;
        });
        delete expandedStudySubjectIds[id];
        saveState();
        renderAll();
        showToast("Subject deleted");
      });
    });
    document.querySelectorAll("[data-archive-study-subject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-archive-study-subject");
        var subject = state.studySubjects.find(function (s) {
          return s.id === id;
        });
        if (!subject) return;
        // Archiving never touches child tasks - isStudyTaskEffectivelyArchived()
        // hides them from active views via this parent flag alone.
        subject.archived = true;
        subject.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(subject.name + " archived");
      });
    });
    document.querySelectorAll("[data-restore-study-subject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-restore-study-subject");
        var subject = state.studySubjects.find(function (s) {
          return s.id === id;
        });
        if (!subject) return;
        subject.archived = false;
        subject.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(subject.name + " restored");
      });
    });
    document.querySelectorAll("[data-edit-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-edit-task");
        var task = state.studyTasks.find(function (t) {
          return t.id === id;
        });
        if (task) openStudyTaskModal(id, task.subjectId);
      });
    });
    document.querySelectorAll("[data-delete-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-task");
        if (!confirm("Delete this task?")) return;
        state.studyTasks = state.studyTasks.filter(function (t) {
          return t.id !== id;
        });
        saveState();
        renderAll();
        showToast("Task deleted");
      });
    });
    document.querySelectorAll("[data-archive-study-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-archive-study-task");
        var task = state.studyTasks.find(function (t) {
          return t.id === id;
        });
        if (!task) return;
        // Fields (status, priority, due date, notes, completion,
        // lastWorkedOn) are left exactly as-is - archiving only ever
        // toggles this one flag.
        task.archived = true;
        task.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(task.title + " archived");
      });
    });
    document.querySelectorAll("[data-restore-study-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-restore-study-task");
        var task = state.studyTasks.find(function (t) {
          return t.id === id;
        });
        if (!task) return;
        // Always safe: if the parent subject is still archived, this task
        // stays invisible via isStudyTaskEffectivelyArchived()'s parent
        // check - restoring the subject later reveals it automatically.
        task.archived = false;
        task.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(task.title + " restored");
      });
    });
  }

  function renderActiveStudySubjectsGrid(el, activeSubjects) {
    var today = todayISO();
    var sortedSubjects = activeSubjects.slice().sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });

    el.innerHTML = sortedSubjects
      .map(function (subj) {
        var stats = computeSubjectTaskStats(subj.id);
        var activeTask = computeSubjectActiveTask(subj.id);
        var nextDueTask = computeSubjectNextDueTask(subj.id);
        var expanded = !!expandedStudySubjectIds[subj.id];

        var progressGroupHtml =
          '<div class="study-subject-progress-group">' +
          confidenceBarHtml(stats.percent, "Progress") +
          '<div class="item-card-meta">' + (stats.total ? stats.completed + " / " + stats.total + " tasks complete" : "No tasks yet") + "</div>" +
          "</div>";

        // If the active task is also the nearest due task, show it once
        // ("Working on" takes precedence) rather than repeating its title -
        // same rule Coding Projects uses for Working on / Next.
        var showNextDueLine = nextDueTask && (!activeTask || activeTask.id !== nextDueTask.id);
        var focusGroupHtml = "";
        if (activeTask || showNextDueLine) {
          focusGroupHtml =
            '<div class="study-subject-focus-group">' +
            (activeTask ? '<div class="item-card-meta">▶ Working on: ' + escapeHtml(activeTask.title) + "</div>" : "") +
            (showNextDueLine ? '<div class="item-card-meta">➡ Next due: ' + escapeHtml(nextDueTask.title) + " (" + formatDateNice(nextDueTask.dueDate) + ")</div>" : "") +
            "</div>";
        }

        var tasksBlockHtml = "";
        if (expanded) {
          var tasks = activeStudySubjectTasks(subj.id);
          tasksBlockHtml =
            '<div class="study-tasks-list">' +
            (tasks.length
              ? tasks
                  .map(function (t) {
                    var overdue = !!(t.dueDate && t.dueDate < today && t.status !== "Completed");
                    return (
                      '<div class="study-task-row' + (t.status === "Completed" ? " completed" : "") + '" data-id="' + t.id + '" data-study-task-id="' + t.id + '">' +
                      '<div class="study-task-main">' +
                      '<div class="study-task-title">' + escapeHtml(t.title) + "</div>" +
                      '<div class="study-task-badges">' +
                      '<select class="badge badge-select ' + taskStatusBadgeClass(t.status) + '" data-set-study-task-status="' + t.id + '" aria-label="Status for ' + escapeHtml(t.title) + '">' +
                      studyTaskStatusOptionsHtml(t.status) +
                      "</select>" +
                      '<span class="badge ' + taskPriorityBadgeClass(t.priority) + '">' + escapeHtml(t.priority) + "</span>" +
                      "</div>" +
                      '<div class="study-task-meta' + (overdue ? " overdue" : "") + '">' +
                      escapeHtml(t.type || "Other") +
                      (t.dueDate ? " · Due " + formatDateNice(t.dueDate) : "") +
                      " · Last worked on: " + (t.lastWorkedOn ? formatDateNice(t.lastWorkedOn) : "Never") +
                      "</div>" +
                      (t.notes ? '<div class="item-card-notes">' + escapeHtml(t.notes) + "</div>" : "") +
                      "</div>" +
                      '<div class="study-task-actions">' +
                      '<button class="button button-secondary button-small" data-edit-task="' + t.id + '" type="button">Edit</button>' +
                      '<button class="button button-secondary button-small" data-archive-study-task="' + t.id + '" type="button">Archive</button>' +
                      '<button class="button button-danger button-small" data-delete-task="' + t.id + '" type="button">Delete</button>' +
                      "</div>" +
                      "</div>"
                    );
                  })
                  .join("")
              : '<div class="empty-state">No tasks yet.</div>') +
            "</div>";
        }

        var toggleLabel = "Tasks (" + stats.total + ") " + (expanded ? "▴" : "▾");

        return (
          '<div class="item-card study-subject-card' + (expanded ? " is-expanded" : "") + '" data-id="' + subj.id + '" data-study-subject-id="' + subj.id + '">' +
          '<div class="item-card-header">' +
          '<div>' +
          '<div class="item-card-title">' + escapeHtml(subj.name) + "</div>" +
          "</div>" +
          "</div>" +
          progressGroupHtml +
          focusGroupHtml +
          '<button class="coding-tasks-toggle study-tasks-toggle" data-toggle-study-tasks="' + subj.id + '" type="button" aria-expanded="' + (expanded ? "true" : "false") + '">' + toggleLabel + "</button>" +
          '<div class="study-subject-actions">' +
          '<button class="button button-primary button-small" data-add-task-to="' + subj.id + '" type="button">+ Task</button>' +
          '<button class="button button-secondary button-small" data-edit-subject="' + subj.id + '" type="button">Rename</button>' +
          '<button class="button button-secondary button-small" data-archive-study-subject="' + subj.id + '" type="button">Archive</button>' +
          '<button class="button button-danger button-small" data-delete-subject="' + subj.id + '" type="button">Delete</button>' +
          "</div>" +
          tasksBlockHtml +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-add-task-to]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openStudyTaskModal(null, btn.getAttribute("data-add-task-to"));
      });
    });
    el.querySelectorAll("[data-set-study-task-status]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.getAttribute("data-set-study-task-status");
        var task = state.studyTasks.find(function (t) {
          return t.id === id;
        });
        if (!task) return;
        // Mirrors the exact rule openStudyTaskModal() already applies on
        // save - completion snaps to 100 only when reaching Completed, and
        // is otherwise left as-is (no forced reset when leaving it).
        task.status = sel.value;
        if (sel.value === "Completed") task.completion = 100;
        task.lastWorkedOn = todayISO();
        task.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(task.title + " marked " + sel.value);
      });
    });
  }

  // One archived task row - reused for a standalone listing (task
  // archived, parent subject still active - shows which subject it
  // belongs to) and nested inside an expanded archived subject (no
  // subject name needed). Restore only shows when the task's own flag is
  // what's archiving it - a task only swept up via an archived parent has
  // nothing to restore at the task level; restoring the subject (its own
  // visible action) is what brings it back. No overflow menu for Study -
  // plain visible buttons, per the simpler action model.
  function archivedStudyTaskRowHtml(t, subject, nested) {
    var contextLine = !nested && subject ? '<div class="study-task-meta">In ' + escapeHtml(subject.name) + "</div>" : "";
    var showRestore = isArchived(t);
    return (
      '<div class="study-task-row' + (t.status === "Completed" ? " completed" : "") + ' coding-archived-card" data-id="' + t.id + '" data-study-task-id="' + t.id + '">' +
      '<div class="study-task-main">' +
      '<div class="study-task-title">' + escapeHtml(t.title) + "</div>" +
      '<div class="study-task-badges">' +
      '<span class="badge ' + taskStatusBadgeClass(t.status) + '">' + escapeHtml(t.status) + "</span>" +
      '<span class="badge ' + taskPriorityBadgeClass(t.priority) + '">' + escapeHtml(t.priority) + "</span>" +
      "</div>" +
      '<div class="study-task-meta">' +
      escapeHtml(t.type || "Other") +
      (t.dueDate ? " · Due " + formatDateNice(t.dueDate) : "") +
      " · Last worked on: " + (t.lastWorkedOn ? formatDateNice(t.lastWorkedOn) : "Never") +
      "</div>" +
      contextLine +
      (t.notes ? '<div class="item-card-notes">' + escapeHtml(t.notes) + "</div>" : "") +
      "</div>" +
      '<div class="study-task-actions">' +
      '<button class="button button-secondary button-small" data-edit-task="' + t.id + '" type="button">Edit</button>' +
      (showRestore ? '<button class="button button-secondary button-small" data-restore-study-task="' + t.id + '" type="button">Restore</button>' : "") +
      '<button class="button button-danger button-small" data-delete-task="' + t.id + '" type="button">Delete</button>' +
      "</div>" +
      "</div>"
    );
  }

  // Archived subject card: compact by design (no progress bar / focus
  // group - a Subject has no status/priority of its own to show anyway)
  // but still expandable to inspect its full retained task history,
  // including tasks that were never individually archived (they're only
  // hidden via this parent).
  function archivedStudySubjectCardHtml(subj) {
    var allTasks = studySubjectSortedTasks(subj.id);
    var completedCount = allTasks.filter(function (t) {
      return t.status === "Completed";
    }).length;
    var expanded = !!expandedStudySubjectIds[subj.id];

    var tasksBlockHtml = "";
    if (expanded) {
      tasksBlockHtml =
        '<div class="study-tasks-list">' +
        (allTasks.length
          ? allTasks
              .map(function (t) {
                return archivedStudyTaskRowHtml(t, subj, true);
              })
              .join("")
          : '<div class="empty-state">No tasks yet.</div>') +
        "</div>";
    }

    var toggleLabel = "Tasks (" + allTasks.length + ") " + (expanded ? "▴" : "▾");

    return (
      '<div class="item-card study-subject-card coding-archived-card" data-id="' + subj.id + '" data-study-subject-id="' + subj.id + '">' +
      '<div class="item-card-header">' +
      '<div>' +
      '<div class="item-card-title">' + escapeHtml(subj.name) + "</div>" +
      '<div class="item-card-meta">' + (allTasks.length ? completedCount + " / " + allTasks.length + " tasks complete" : "No tasks") + "</div>" +
      "</div>" +
      "</div>" +
      '<button class="coding-tasks-toggle study-tasks-toggle" data-toggle-study-tasks="' + subj.id + '" type="button" aria-expanded="' + (expanded ? "true" : "false") + '">' + toggleLabel + "</button>" +
      '<div class="study-subject-actions">' +
      '<button class="button button-secondary button-small" data-edit-subject="' + subj.id + '" type="button">Rename</button>' +
      '<button class="button button-secondary button-small" data-restore-study-subject="' + subj.id + '" type="button">Restore</button>' +
      '<button class="button button-danger button-small" data-delete-subject="' + subj.id + '" type="button">Delete</button>' +
      "</div>" +
      tasksBlockHtml +
      "</div>"
    );
  }

  function renderArchivedStudySection() {
    var toggleBtn = document.getElementById("study-archived-toggle");
    var container = document.getElementById("study-archived-section");
    if (!toggleBtn || !container) return;

    var archivedSubjects = archivedStudySubjects().slice().sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    // Archived tasks whose subject is still active - a task archived
    // inside an archived subject is reached by expanding that subject
    // instead, so it isn't duplicated here.
    var standaloneArchivedTasks = state.studyTasks
      .filter(function (t) {
        var subject = state.studySubjects.find(function (s) {
          return s.id === t.subjectId;
        });
        return isArchived(t) && !isArchived(subject);
      })
      .sort(function (a, b) {
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });

    var totalCount = archivedSubjects.length + standaloneArchivedTasks.length;
    toggleBtn.textContent = "Archived (" + totalCount + ") " + (archivedStudySectionExpanded ? "▴" : "▾");
    toggleBtn.setAttribute("aria-expanded", archivedStudySectionExpanded ? "true" : "false");

    if (!archivedStudySectionExpanded) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    container.hidden = false;

    if (!totalCount) {
      container.innerHTML = '<div class="empty-state">Nothing archived yet.</div>';
      return;
    }

    var subjectsHtml = archivedSubjects
      .map(function (subj) {
        return archivedStudySubjectCardHtml(subj);
      })
      .join("");

    var tasksHtml = standaloneArchivedTasks.length
      ? '<div class="study-tasks-list">' +
        standaloneArchivedTasks
          .map(function (t) {
            var subject = state.studySubjects.find(function (s) {
              return s.id === t.subjectId;
            });
            return archivedStudyTaskRowHtml(t, subject, false);
          })
          .join("") +
        "</div>"
      : "";

    container.innerHTML = subjectsHtml + tasksHtml;
  }

  function studySubjectFieldsHtml(subject) {
    subject = subject || { name: "" };
    return (
      '<div class="form-group">' +
      '<label for="ssf-name">Subject Name</label>' +
      '<input id="ssf-name" name="name" type="text" required placeholder="e.g. Psychology" value="' + escapeHtml(subject.name) + '">' +
      "</div>"
    );
  }

  function openStudySubjectModal(id) {
    var subject = id ? state.studySubjects.find(function (s) { return s.id === id; }) : null;
    openModal(
      subject ? "Rename Subject" : "Add Subject",
      studySubjectFieldsHtml(subject),
      function (formData) {
        var name = formData.get("name").trim();
        if (!name) return;
        var now = new Date().toISOString();
        if (subject) {
          subject.name = name;
          subject.updatedAt = now;
        } else {
          state.studySubjects.push({ id: generateId(), name: name, archived: false, createdAt: now, updatedAt: now });
        }
        saveState();
        renderAll();
        closeModal();
        showToast(subject ? "Subject renamed" : "Subject added");
      }
    );
  }

  // Excludes archived subjects from the "assign to" dropdown - moving an
  // active task into one would immediately hide it via the parent check
  // in isStudyTaskEffectivelyArchived(). The task's *current* subject
  // stays listed even if archived, so editing an already-archived task
  // still shows its real assignment instead of silently dropping it.
  function studySubjectOptionsHtml(selectedId) {
    return state.studySubjects
      .filter(function (s) {
        return !isArchived(s) || s.id === selectedId;
      })
      .slice()
      .sort(function (a, b) {
        return (a.name || "").localeCompare(b.name || "");
      })
      .map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === selectedId ? " selected" : "") + ">" + escapeHtml(s.name) + "</option>";
      })
      .join("");
  }

  function studyTaskFieldsHtml(task, defaultSubjectId) {
    task = task || {
      subjectId: defaultSubjectId || (state.studySubjects[0] && state.studySubjects[0].id) || "",
      type: "Other",
      title: "",
      status: "Not Started",
      priority: "Medium",
      dueDate: "",
      completion: 0,
      notes: "",
    };
    return (
      '<div class="form-group">' +
      '<label for="stf-subject">Subject</label>' +
      '<select id="stf-subject" name="subjectId" required>' + studySubjectOptionsHtml(task.subjectId) + "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="stf-title">Task Title</label>' +
      '<input id="stf-title" name="title" type="text" required value="' + escapeHtml(task.title) + '">' +
      "</div>" +
      '<div class="form-row">' +
      '<div class="form-group">' +
      '<label for="stf-type">Type</label>' +
      '<input id="stf-type" name="type" type="text" list="study-type-suggestions" value="' + escapeHtml(task.type) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="stf-status">Status</label>' +
      '<select id="stf-status" name="status">' +
      TASK_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (task.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      "</div>" +
      '<div class="form-row">' +
      '<div class="form-group">' +
      '<label for="stf-priority">Priority</label>' +
      '<select id="stf-priority" name="priority">' +
      TASK_PRIORITIES.map(function (p) {
        return '<option value="' + p + '"' + (task.priority === p ? " selected" : "") + ">" + p + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="stf-due">Due Date</label>' +
      '<input id="stf-due" name="dueDate" type="date" value="' + escapeHtml(task.dueDate) + '">' +
      "</div>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="stf-completion">Completion <span class="range-value" id="stf-completion-value">' + (Number(task.completion) || 0) + '%</span></label>' +
      '<input id="stf-completion" name="completion" type="range" min="0" max="100" step="5" value="' + (Number(task.completion) || 0) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="stf-notes">Notes</label>' +
      '<textarea id="stf-notes" name="notes" rows="3">' + escapeHtml(task.notes) + "</textarea>" +
      "</div>"
    );
  }

  function openStudyTaskModal(id, defaultSubjectId) {
    if (!state.studySubjects.length) {
      showToast("Add a subject first");
      return;
    }
    var task = id ? state.studyTasks.find(function (t) { return t.id === id; }) : null;
    openModal(
      task ? "Edit Task" : "Add Task",
      studyTaskFieldsHtml(task, defaultSubjectId),
      function (formData) {
        var data = {
          subjectId: formData.get("subjectId"),
          type: (formData.get("type") || "").trim() || "Other",
          title: formData.get("title").trim(),
          status: formData.get("status"),
          priority: formData.get("priority"),
          dueDate: formData.get("dueDate") || "",
          completion: Number(formData.get("completion")) || 0,
          notes: formData.get("notes").trim(),
          updatedAt: new Date().toISOString(),
        };
        if (!data.title || !data.subjectId) return;
        if (data.status === "Completed") data.completion = 100;
        if (task) {
          data.createdAt = task.createdAt || task.updatedAt || data.updatedAt;
          data.lastWorkedOn = task.lastWorkedOn || null;
          Object.assign(task, data);
        } else {
          data.id = generateId();
          data.createdAt = data.updatedAt;
          data.lastWorkedOn = null;
          data.archived = false;
          state.studyTasks.push(data);
        }
        saveState();
        renderAll();
        closeModal();
        showToast(task ? "Task updated" : "Task added");
      },
      function (form) {
        var range = form.querySelector("#stf-completion");
        var label = form.querySelector("#stf-completion-value");
        if (range && label) {
          range.addEventListener("input", function () {
            label.textContent = range.value + "%";
          });
        }
      }
    );
  }

  function studyTaskDupKey(subjectName, title) {
    return (subjectName || "").trim().toLowerCase() + " :: " + (title || "").trim().toLowerCase();
  }

  function parseStudyPasteText(text) {
    var lines = text
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var rows = [];
    var invalidStatusCount = 0;
    var invalidPriorityCount = 0;

    lines.forEach(function (line) {
      var parts = line.split("|").map(function (p) {
        return p.trim();
      });
      if (parts.length < 2) return;

      var subject = parts[0];
      var type, title, statusRaw, priorityRaw, dueDateRaw;
      if (parts.length === 2) {
        // Simple format: Subject | Task Title
        type = "Other";
        title = parts[1];
        statusRaw = "";
        priorityRaw = "";
        dueDateRaw = "";
      } else {
        // Full format: Subject | Type | Task Title | Status | Priority | Due Date
        type = parts[1] || "Other";
        title = parts[2] || "";
        statusRaw = parts[3] || "";
        priorityRaw = parts[4] || "";
        dueDateRaw = parts[5] || "";
      }
      if (!subject || !title) return;

      var status = "Not Started";
      if (statusRaw) {
        if (TASK_STATUSES.indexOf(statusRaw) !== -1) {
          status = statusRaw;
        } else {
          invalidStatusCount++;
        }
      }

      var priority = "Medium";
      if (priorityRaw) {
        if (TASK_PRIORITIES.indexOf(priorityRaw) !== -1) {
          priority = priorityRaw;
        } else {
          invalidPriorityCount++;
        }
      }

      var dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : "";

      rows.push({ subject: subject, type: type, title: title, status: status, priority: priority, dueDate: dueDate });
    });

    return { rows: rows, invalidStatusCount: invalidStatusCount, invalidPriorityCount: invalidPriorityCount };
  }

  function initStudyArchivedToggle() {
    document.getElementById("study-archived-toggle").addEventListener("click", function () {
      archivedStudySectionExpanded = !archivedStudySectionExpanded;
      renderStudy();
    });
  }

  function initStudyPasteImporter() {
    document.getElementById("parse-study-btn").addEventListener("click", function () {
      var textarea = document.getElementById("study-paste-input");
      var result = parseStudyPasteText(textarea.value);
      if (!result.rows.length) {
        showToast("No tasks found. Check the format.");
        return;
      }

      var now = new Date().toISOString();

      // Name-matching only searches active subjects - a pasted name that
      // matches only an archived subject creates a fresh active subject
      // with the same name instead of silently attaching new tasks to
      // hidden content (and never auto-restores the archived one).
      var subjectsByName = {};
      activeStudySubjects().forEach(function (s) {
        subjectsByName[s.name.trim().toLowerCase()] = s;
      });

      var existingDupKeys = {};
      state.studyTasks.forEach(function (t) {
        existingDupKeys[studyTaskDupKey(studySubjectName(t.subjectId), t.title)] = true;
      });

      var added = 0;
      var duplicates = 0;
      var subjectsCreated = 0;

      result.rows.forEach(function (row) {
        var subjectKey = row.subject.trim().toLowerCase();
        var subject = subjectsByName[subjectKey];
        if (!subject) {
          subject = { id: generateId(), name: row.subject, archived: false, createdAt: now, updatedAt: now };
          state.studySubjects.push(subject);
          subjectsByName[subjectKey] = subject;
          subjectsCreated++;
        }

        var dupKey = studyTaskDupKey(subject.name, row.title);
        if (existingDupKeys[dupKey]) {
          duplicates++;
          return;
        }
        existingDupKeys[dupKey] = true;

        state.studyTasks.push({
          id: generateId(),
          subjectId: subject.id,
          type: row.type,
          title: row.title,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate,
          completion: row.status === "Completed" ? 100 : 0,
          notes: "",
          archived: false,
          lastWorkedOn: null,
          createdAt: now,
          updatedAt: now,
        });
        added++;
      });

      saveState();
      textarea.value = "";
      renderAll();

      var msg = result.rows.length + " task(s) detected — " + added + " imported";
      if (subjectsCreated > 0) msg += ", " + subjectsCreated + " new subject(s) created";
      if (duplicates > 0) msg += ", " + duplicates + " duplicate(s) skipped";
      if (result.invalidStatusCount > 0) msg += ", " + result.invalidStatusCount + " unrecognized status defaulted";
      if (result.invalidPriorityCount > 0) msg += ", " + result.invalidPriorityCount + " unrecognized priority defaulted";
      showToast(msg);
    });
  }

  // ===================== LISTENING =====================

  function ratingStarsHtml(rating) {
    var r = Number(rating);
    if (!r) return "";
    return "★".repeat(r) + "☆".repeat(5 - r);
  }

  function listeningBadgeClass(status) {
    return "badge-" + String(status).toLowerCase().replace(/\s+/g, "-");
  }

  function listeningDupKey(artist, album) {
    return (artist || "").trim().toLowerCase() + " " + (album || "").trim().toLowerCase();
  }

  function renderListening() {
    var el = document.getElementById("listening-list");
    var filtered = state.listening.filter(function (a) {
      return listeningFilter === "All" || a.status === listeningFilter;
    });

    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No albums' + (listeningFilter !== "All" ? ' with status "' + escapeHtml(listeningFilter) + '"' : "") + " yet.</div>";
      return;
    }

    var sorted = filtered.slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });

    el.innerHTML = sorted
      .map(function (a) {
        return (
          '<div class="item-card" data-id="' + a.id + '" data-listening-id="' + a.id + '">' +
          '<div class="item-card-header">' +
          '<div>' +
          '<div class="item-card-title">' + escapeHtml(a.album) + "</div>" +
          '<div class="item-card-meta">' + escapeHtml(a.artist) + "</div>" +
          "</div>" +
          '<span class="badge ' + listeningBadgeClass(a.status) + '">' + escapeHtml(a.status) + "</span>" +
          "</div>" +
          (a.rating ? '<div class="rating-stars">' + ratingStarsHtml(a.rating) + "</div>" : "") +
          (a.favoriteTrack ? '<div class="item-card-meta">🎵 ' + escapeHtml(a.favoriteTrack) + "</div>" : "") +
          (a.status === "Finished" && a.dateFinished ? '<div class="item-card-meta">Finished: ' + formatDateNice(a.dateFinished) + "</div>" : "") +
          (a.notes ? '<div class="item-card-notes">' + escapeHtml(a.notes) + "</div>" : "") +
          '<div class="item-card-actions">' +
          '<button class="button button-secondary button-small" data-edit-listening="' + a.id + '" type="button">Edit</button>' +
          '<button class="button button-danger button-small" data-delete-listening="' + a.id + '" type="button">Delete</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-edit-listening]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openListeningModal(btn.getAttribute("data-edit-listening"));
      });
    });
    el.querySelectorAll("[data-delete-listening]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-listening");
        if (!confirm("Delete this album?")) return;
        state.listening = state.listening.filter(function (a) {
          return a.id !== id;
        });
        saveState();
        renderAll();
        showToast("Album deleted");
      });
    });
  }

  function listeningRatingOptionsHtml(currentRating) {
    var current = currentRating ? Number(currentRating) : null;
    var options = ['<option value=""' + (!current ? " selected" : "") + ">Not Rated</option>"];
    for (var i = 1; i <= 5; i++) {
      options.push('<option value="' + i + '"' + (current === i ? " selected" : "") + ">" + i + "</option>");
    }
    return options.join("");
  }

  function listeningFieldsHtml(album) {
    album = album || { artist: "", album: "", status: "To Listen", rating: null, favoriteTrack: "", notes: "", dateFinished: "" };
    return (
      '<div class="form-group">' +
      '<label for="lf-artist">Artist</label>' +
      '<input id="lf-artist" name="artist" type="text" required value="' + escapeHtml(album.artist) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="lf-album">Album</label>' +
      '<input id="lf-album" name="album" type="text" required value="' + escapeHtml(album.album) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="lf-status">Status</label>' +
      '<select id="lf-status" name="status">' +
      LISTENING_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (album.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="lf-rating">Rating</label>' +
      '<select id="lf-rating" name="rating">' + listeningRatingOptionsHtml(album.rating) + "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="lf-favorite">Favorite Track</label>' +
      '<input id="lf-favorite" name="favoriteTrack" type="text" placeholder="e.g. track name" value="' + escapeHtml(album.favoriteTrack) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="lf-notes">Notes / Reaction</label>' +
      '<textarea id="lf-notes" name="notes" rows="3">' + escapeHtml(album.notes) + "</textarea>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="lf-date-finished">Date Finished</label>' +
      '<input id="lf-date-finished" name="dateFinished" type="date" value="' + escapeHtml(album.dateFinished) + '">' +
      "</div>"
    );
  }

  function openListeningModal(id) {
    var album = id ? state.listening.find(function (a) { return a.id === id; }) : null;
    openModal(album ? "Edit Album" : "Add Album", listeningFieldsHtml(album), function (formData) {
      var ratingRaw = formData.get("rating");
      var data = {
        artist: formData.get("artist").trim(),
        album: formData.get("album").trim(),
        status: formData.get("status"),
        rating: ratingRaw ? Number(ratingRaw) : null,
        favoriteTrack: formData.get("favoriteTrack").trim(),
        notes: formData.get("notes").trim(),
        dateFinished: formData.get("dateFinished") || "",
        updatedAt: new Date().toISOString(),
      };
      if (!data.artist || !data.album) return;
      // Auto-default Date Finished to today when moving to Finished with no
      // date set yet — but never overwrite a date that's already there.
      if (data.status === "Finished" && !data.dateFinished) {
        data.dateFinished = todayISO();
      }
      if (album) {
        data.createdAt = album.createdAt || album.updatedAt || data.updatedAt;
        Object.assign(album, data);
      } else {
        data.id = generateId();
        data.createdAt = data.updatedAt;
        state.listening.push(data);
      }
      saveState();
      renderAll();
      closeModal();
      showToast(album ? "Album updated" : "Album added");
    });
  }

  function initListeningFilter() {
    document.getElementById("listening-status-filter").addEventListener("change", function (e) {
      listeningFilter = e.target.value;
      renderListening();
    });
  }

  function parseListeningPasteText(text) {
    var lines = text
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var albums = [];
    var invalidStatusCount = 0;
    lines.forEach(function (line) {
      var parts = line.split("|").map(function (p) {
        return p.trim();
      });
      if (parts.length < 2) return;
      var artist = parts[0];
      var albumTitle = parts[1];
      if (!artist || !albumTitle) return;

      var statusRaw = parts[2] || "";
      var status = "To Listen";
      if (statusRaw) {
        if (LISTENING_STATUSES.indexOf(statusRaw) !== -1) {
          status = statusRaw;
        } else {
          invalidStatusCount++;
        }
      }
      albums.push({ artist: artist, album: albumTitle, status: status });
    });
    return { albums: albums, invalidStatusCount: invalidStatusCount };
  }

  function initListeningPasteImporter() {
    document.getElementById("parse-listening-btn").addEventListener("click", function () {
      var textarea = document.getElementById("listening-paste-input");
      var result = parseListeningPasteText(textarea.value);
      if (!result.albums.length) {
        showToast("No albums found. Check the format.");
        return;
      }

      var existingKeys = {};
      state.listening.forEach(function (a) {
        existingKeys[listeningDupKey(a.artist, a.album)] = true;
      });

      var now = new Date().toISOString();
      var added = 0;
      var duplicates = 0;
      result.albums.forEach(function (a) {
        var key = listeningDupKey(a.artist, a.album);
        if (existingKeys[key]) {
          duplicates++;
          return;
        }
        existingKeys[key] = true;
        state.listening.push({
          id: generateId(),
          artist: a.artist,
          album: a.album,
          status: a.status,
          rating: null,
          favoriteTrack: "",
          notes: "",
          dateFinished: a.status === "Finished" ? todayISO() : "",
          createdAt: now,
          updatedAt: now,
        });
        added++;
      });

      saveState();
      textarea.value = "";
      renderAll();

      var msg = result.albums.length + " album(s) detected — " + added + " imported";
      if (duplicates > 0) msg += ", " + duplicates + " duplicate(s) skipped";
      if (result.invalidStatusCount > 0) msg += ", " + result.invalidStatusCount + " unrecognized status defaulted to To Listen";
      showToast(msg);
    });
  }

  // ===================== CODING PROJECTS =====================

  function codingProjectMatchesFilter(p) {
    if (codingProjectFilter === "All") return true;
    if (codingProjectFilter === "Active") return p.status === "Building";
    if (codingProjectFilter === "Planned") return p.status === "Idea" || p.status === "Planning";
    return p.status === codingProjectFilter;
  }

  function codingTaskStatusOptionsHtml(selected) {
    return CODING_TASK_STATUSES.map(function (s) {
      return '<option value="' + s + '"' + (s === selected ? " selected" : "") + ">" + s + "</option>";
    }).join("");
  }

  // Compact "⋯" trigger + popover used for a card/row's less-frequent
  // actions. Generic by design - itemsHtml is just a list of .menu-item
  // buttons - but Coding Projects is its only user: Study keeps its
  // actions plain and always visible instead.
  function managementMenuHtml(itemsHtml, ariaLabel) {
    return (
      '<div class="menu-wrap">' +
      '<button class="icon-button menu-trigger" type="button" data-menu-trigger aria-haspopup="true" aria-expanded="false" aria-label="' + escapeHtml(ariaLabel) + '">⋯</button>' +
      '<div class="menu-panel" role="menu" hidden>' + itemsHtml + "</div>" +
      "</div>"
    );
  }

  function closeOpenManagementMenu() {
    if (!openManagementMenu) return;
    openManagementMenu.hidden = true;
    openManagementMenu.style.left = "";
    openManagementMenu.style.right = "";
    openManagementMenu.style.top = "";
    openManagementMenu.style.bottom = "";
    var trigger = openManagementMenu.previousElementSibling;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    openManagementMenu = null;
  }

  // Positions an already-visible menu panel (absolutely positioned inside
  // its .menu-wrap, which is the offsetParent) so it stays fully on-screen
  // regardless of where its trigger sits. Computed fresh from
  // getBoundingClientRect() on every open rather than via breakpoint CSS,
  // since the trigger's actual position (wrap/flex-wrap can put it
  // anywhere) is what determines whether it needs to flip, not viewport
  // width alone.
  function positionManagementMenu(wrap, panel) {
    var margin = 8;
    var wrapRect = wrap.getBoundingClientRect();
    var panelWidth = panel.offsetWidth;
    var panelHeight = panel.offsetHeight;
    var viewportWidth = document.documentElement.clientWidth;
    var viewportHeight = document.documentElement.clientHeight;

    // Horizontal: default is right-aligned to the trigger. If that would
    // push the panel past the left edge, flip to left-aligned instead;
    // then clamp so it can never sit past either edge.
    var left = wrapRect.right - panelWidth;
    if (left < margin) left = wrapRect.left;
    if (left + panelWidth > viewportWidth - margin) left = viewportWidth - margin - panelWidth;
    if (left < margin) left = margin;

    // Vertical: default is below the trigger. If there isn't room, open
    // upward instead.
    var top = wrapRect.bottom + 4;
    if (top + panelHeight > viewportHeight - margin) {
      var above = wrapRect.top - 4 - panelHeight;
      top = above < margin ? margin : above;
    }

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = (left - wrapRect.left) + "px";
    panel.style.top = (top - wrapRect.top) + "px";
  }

  // Document-level close-on-outside-click / close-on-Escape, registered
  // once at startup (not per-render, since `document` itself is never
  // recreated). wireManagementMenuTriggers() below is the per-render half
  // that only has to (re)bind each trigger button's own click.
  function initManagementMenus() {
    document.addEventListener("click", function (e) {
      if (openManagementMenu && !openManagementMenu.parentElement.contains(e.target)) {
        closeOpenManagementMenu();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && openManagementMenu) {
        var trigger = openManagementMenu.previousElementSibling;
        closeOpenManagementMenu();
        if (trigger) trigger.focus();
      }
    });
  }

  function wireManagementMenuTriggers(root) {
    root.querySelectorAll("[data-menu-trigger]").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var panel = trigger.nextElementSibling;
        var wasOpen = !panel.hidden;
        closeOpenManagementMenu();
        if (!wasOpen) {
          panel.hidden = false;
          positionManagementMenu(trigger.parentElement, panel);
          trigger.setAttribute("aria-expanded", "true");
          openManagementMenu = panel;
        }
      });
    });
  }

  function renderCodingProjects() {
    var el = document.getElementById("coding-projects-list");
    var filtered = activeCodingProjects().filter(codingProjectMatchesFilter);

    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No coding projects' + (codingProjectFilter !== "All" ? ' matching "' + escapeHtml(codingProjectFilter) + '"' : "") + ". Add one to start tracking.</div>";
    } else {
      renderActiveCodingProjectsGrid(el, filtered);
    }

    renderArchivedCodingSection();
    wireManagementMenuTriggers(document);

    // Edit/Delete/Archive/Restore/expand-toggle are shared across the
    // active grid and the Archived section, so they're wired once,
    // document-wide, after both have rendered - rather than duplicating
    // each handler per container.
    document.querySelectorAll("[data-toggle-coding-tasks]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-toggle-coding-tasks");
        expandedCodingProjectIds[id] = !expandedCodingProjectIds[id];
        renderCodingProjects();
      });
    });
    document.querySelectorAll("[data-edit-coding-project]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openCodingProjectModal(btn.getAttribute("data-edit-coding-project"));
      });
    });
    document.querySelectorAll("[data-delete-coding-project]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-coding-project");
        var project = findCodingProject(id);
        if (!project) return;
        var taskCount = codingProjectTasks(id).length;
        var msg = taskCount
          ? 'Delete "' + project.name + '" and its ' + taskCount + " task" + (taskCount === 1 ? "" : "s") + "?"
          : 'Delete "' + project.name + '"?';
        if (!confirm(msg)) return;
        state.codingProjects = state.codingProjects.filter(function (p) {
          return p.id !== id;
        });
        state.codingTasks = state.codingTasks.filter(function (t) {
          return t.projectId !== id;
        });
        delete expandedCodingProjectIds[id];
        saveState();
        renderAll();
        showToast("Project deleted");
      });
    });
    document.querySelectorAll("[data-archive-coding-project]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-archive-coding-project");
        var project = findCodingProject(id);
        if (!project) return;
        // Archiving never touches child tasks - they keep whatever
        // archived value they already had; isCodingTaskEffectivelyArchived()
        // is what hides them from active views via the parent check.
        project.archived = true;
        project.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(project.name + " archived");
      });
    });
    document.querySelectorAll("[data-restore-coding-project]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-restore-coding-project");
        var project = findCodingProject(id);
        if (!project) return;
        project.archived = false;
        project.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(project.name + " restored");
      });
    });
    document.querySelectorAll("[data-edit-coding-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openCodingTaskModal(btn.getAttribute("data-edit-coding-task"), null);
      });
    });
    document.querySelectorAll("[data-delete-coding-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-coding-task");
        if (!confirm("Delete this task?")) return;
        state.codingTasks = state.codingTasks.filter(function (t) {
          return t.id !== id;
        });
        saveState();
        renderAll();
        showToast("Task deleted");
      });
    });
    document.querySelectorAll("[data-archive-coding-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-archive-coding-task");
        var task = findCodingTask(id);
        if (!task) return;
        // Fields (status, priority, due date, notes, lastWorkedOn,
        // isNextAction) are left exactly as-is - archiving only ever
        // toggles this one flag, so restoring brings everything back
        // unchanged, including whether it was the project's Next Action.
        task.archived = true;
        task.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(task.title + " archived");
      });
    });
    document.querySelectorAll("[data-restore-coding-task]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-restore-coding-task");
        var task = findCodingTask(id);
        if (!task) return;
        // Always safe: if the parent project is still archived, this task
        // stays invisible via isCodingTaskEffectivelyArchived()'s parent
        // check - restoring the project later reveals it automatically.
        task.archived = false;
        task.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(task.title + " restored");
      });
    });
  }

  function renderActiveCodingProjectsGrid(el, filtered) {
    var sorted = filtered.slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });

    el.innerHTML = sorted
      .map(function (p) {
        var linksHtml = "";
        if (p.githubUrl || p.liveUrl) {
          linksHtml =
            '<div class="button-row">' +
            (p.githubUrl ? '<a class="button button-secondary button-small" href="' + escapeHtml(p.githubUrl) + '" target="_blank" rel="noopener noreferrer">GitHub</a>' : "") +
            (p.liveUrl ? '<a class="button button-secondary button-small" href="' + escapeHtml(p.liveUrl) + '" target="_blank" rel="noopener noreferrer">Live App</a>' : "") +
            "</div>";
        }

        var stats = computeProjectTaskStats(p.id);
        var displayProgress = computeProjectDisplayProgress(p);
        var activeTask = computeProjectActiveTask(p.id);
        var nextActionTask = computeProjectNextActionTask(p.id);
        var expanded = !!expandedCodingProjectIds[p.id];

        var progressGroupHtml =
          '<div class="coding-project-progress-group">' +
          confidenceBarHtml(displayProgress, "Progress") +
          '<div class="item-card-meta">' + (stats.total ? stats.completed + " / " + stats.total + " tasks complete" : "No tasks yet") + "</div>" +
          "</div>";

        // If the same task is both the active task and the Next Action, show
        // it once ("Working on" takes precedence - it reflects what's
        // actually happening right now) rather than repeating its title.
        var showNextLine = nextActionTask && (!activeTask || activeTask.id !== nextActionTask.id);
        var focusGroupHtml = "";
        if (activeTask || showNextLine) {
          focusGroupHtml =
            '<div class="coding-project-focus-group">' +
            (activeTask ? '<div class="item-card-meta">▶ Working on: ' + escapeHtml(activeTask.title) + "</div>" : "") +
            (showNextLine ? '<div class="item-card-meta">➡ Next: ' + escapeHtml(nextActionTask.title) + "</div>" : "") +
            "</div>";
        }

        var detailsGroupHtml =
          '<div class="coding-project-details-group">' +
          (p.milestone ? '<div class="item-card-meta">🎯 ' + escapeHtml(p.milestone) + "</div>" : "") +
          '<div class="item-card-meta">Last worked on: ' + (p.lastWorkedOn ? formatDateNice(p.lastWorkedOn) : "Never") + "</div>" +
          (p.techStack ? '<div class="item-card-meta">🛠 ' + escapeHtml(p.techStack) + "</div>" : "") +
          "</div>";

        var tasksBlockHtml = "";
        if (expanded) {
          var tasks = codingProjectSortedTasks(p.id);
          tasksBlockHtml =
            '<div class="coding-tasks-list">' +
            (tasks.length
              ? tasks
                  .map(function (t) {
                    var overdue = !!(t.dueDate && t.dueDate < todayISO() && t.status !== "Done");
                    return (
                      '<div class="coding-task-row' + (t.status === "Done" ? " completed" : "") + '" data-id="' + t.id + '" data-coding-task-id="' + t.id + '">' +
                      '<div class="coding-task-main">' +
                      '<div class="coding-task-title">' + escapeHtml(t.title) + (t.isNextAction ? ' <span class="badge badge-next-action">Next Action</span>' : "") + "</div>" +
                      '<div class="coding-task-badges">' +
                      '<select class="badge badge-select ' + taskStatusBadgeClass(t.status) + '" data-set-coding-task-status="' + t.id + '" aria-label="Status for ' + escapeHtml(t.title) + '">' +
                      codingTaskStatusOptionsHtml(t.status) +
                      "</select>" +
                      '<span class="badge ' + taskPriorityBadgeClass(t.priority) + '">' + escapeHtml(t.priority) + "</span>" +
                      "</div>" +
                      '<div class="coding-task-meta' + (overdue ? " overdue" : "") + '">' +
                      (t.dueDate ? "Due " + formatDateNice(t.dueDate) + " · " : "") +
                      "Last worked on: " + (t.lastWorkedOn ? formatDateNice(t.lastWorkedOn) : "Never") +
                      "</div>" +
                      (t.notes ? '<div class="item-card-notes">' + escapeHtml(t.notes) + "</div>" : "") +
                      '<div class="coding-task-actions">' +
                      (t.isNextAction
                        ? '<span class="hint-text">★ Next Action</span>'
                        : '<button class="button button-secondary button-small" data-set-next-action="' + t.id + '" type="button">Set as Next Action</button>') +
                      '<button class="button button-secondary button-small" data-coding-task-worked-today="' + t.id + '" type="button">Worked On Today</button>' +
                      managementMenuHtml(
                        '<button class="menu-item" role="menuitem" data-edit-coding-task="' + t.id + '" type="button">Edit</button>' +
                        '<button class="menu-item" role="menuitem" data-archive-coding-task="' + t.id + '" type="button">Archive</button>' +
                        '<button class="menu-item menu-item-danger" role="menuitem" data-delete-coding-task="' + t.id + '" type="button">Delete</button>',
                        "More actions for " + t.title
                      ) +
                      "</div>" +
                      "</div>" +
                      "</div>"
                    );
                  })
                  .join("")
              : '<div class="empty-state">No tasks yet.</div>') +
            "</div>";
        }

        var toggleLabel = "Tasks (" + stats.total + ") " + (expanded ? "▴" : "▾");

        return (
          '<div class="item-card coding-project-card' + (expanded ? " is-expanded" : "") + '" data-id="' + p.id + '" data-coding-project-id="' + p.id + '">' +
          '<div class="item-card-header">' +
          '<div>' +
          '<div class="item-card-title">' + escapeHtml(p.name) + "</div>" +
          '<div class="item-card-meta">' + escapeHtml(p.type) + " · " + escapeHtml(p.priority) + " priority</div>" +
          "</div>" +
          '<span class="badge ' + taskStatusBadgeClass(p.status) + '">' + escapeHtml(p.status) + "</span>" +
          "</div>" +
          progressGroupHtml +
          focusGroupHtml +
          detailsGroupHtml +
          (p.notes ? '<div class="item-card-notes">' + escapeHtml(p.notes) + "</div>" : "") +
          linksHtml +
          '<button class="coding-tasks-toggle" data-toggle-coding-tasks="' + p.id + '" type="button" aria-expanded="' + (expanded ? "true" : "false") + '">' + toggleLabel + "</button>" +
          '<div class="coding-project-actions">' +
          '<button class="button button-primary button-small" data-add-coding-task-to="' + p.id + '" type="button">+ Task</button>' +
          '<button class="button button-secondary button-small" data-import-coding-tasks-to="' + p.id + '" type="button">Import Tasks</button>' +
          '<button class="button button-secondary button-small" data-worked-today="' + p.id + '" type="button">Worked On Today</button>' +
          managementMenuHtml(
            '<button class="menu-item" role="menuitem" data-edit-coding-project="' + p.id + '" type="button">Edit</button>' +
            '<button class="menu-item" role="menuitem" data-archive-coding-project="' + p.id + '" type="button">Archive</button>' +
            '<button class="menu-item menu-item-danger" role="menuitem" data-delete-coding-project="' + p.id + '" type="button">Delete</button>',
            "More actions for " + p.name
          ) +
          "</div>" +
          tasksBlockHtml +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-worked-today]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-worked-today");
        var project = findCodingProject(id);
        if (!project) return;
        // Project-level "Worked On Today" is intentionally one-directional:
        // it never touches any individual task's lastWorkedOn.
        project.lastWorkedOn = todayISO();
        project.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(project.name + " marked worked on today");
      });
    });
    el.querySelectorAll("[data-add-coding-task-to]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openCodingTaskModal(null, btn.getAttribute("data-add-coding-task-to"));
      });
    });
    el.querySelectorAll("[data-import-coding-tasks-to]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openImportCodingTasksModal(btn.getAttribute("data-import-coding-tasks-to"));
      });
    });
    el.querySelectorAll("[data-set-coding-task-status]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.getAttribute("data-set-coding-task-status");
        var task = findCodingTask(id);
        if (!task) return;
        // Mirrors the exact rule openCodingTaskModal() already applies on
        // save: completing the current Next Action clears the flag rather
        // than silently reassigning it - the user picks the next one
        // explicitly via "Set as Next Action".
        task.status = sel.value;
        if (sel.value === "Done") task.isNextAction = false;
        task.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
        showToast(task.title + " marked " + sel.value);
      });
    });
    el.querySelectorAll("[data-set-next-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-set-next-action");
        var task = findCodingTask(id);
        if (!task) return;
        setNextActionTask(task.projectId, task.id);
        saveState();
        renderAll();
        showToast(task.title + " set as Next Action");
      });
    });
    el.querySelectorAll("[data-coding-task-worked-today]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-coding-task-worked-today");
        var task = findCodingTask(id);
        if (!task) return;
        // Working on a task counts as working on its project: both get
        // stamped together. This does not run in reverse - see the
        // project-level Worked On Today handler above.
        var today = todayISO();
        var now = new Date().toISOString();
        task.lastWorkedOn = today;
        task.updatedAt = now;
        var project = findCodingProject(task.projectId);
        if (project) {
          project.lastWorkedOn = today;
          project.updatedAt = now;
        }
        saveState();
        renderAll();
        showToast(task.title + " marked worked on today");
      });
    });
  }

  // One archived task row, reused for both a standalone listing (task
  // archived, parent project still active - shows which project it
  // belongs to) and nested inside an expanded archived project (no
  // project name needed, already implied by the parent card). Restore
  // only shows when the task's own flag is what's archiving it - a task
  // only swept up via an archived parent has nothing to restore at the
  // task level, so only Edit/Delete appear; restoring the project (its
  // own visible action) is what brings it back.
  function archivedCodingTaskRowHtml(t, project, nested) {
    var contextLine = !nested && project ? '<div class="coding-task-meta">In ' + escapeHtml(project.name) + "</div>" : "";
    var showRestore = isArchived(t);
    return (
      '<div class="coding-task-row' + (t.status === "Done" ? " completed" : "") + ' coding-archived-card" data-id="' + t.id + '" data-coding-task-id="' + t.id + '">' +
      '<div class="coding-task-main">' +
      '<div class="coding-task-title">' + escapeHtml(t.title) + (t.isNextAction ? ' <span class="badge badge-next-action">Next Action</span>' : "") + "</div>" +
      '<div class="coding-task-badges">' +
      '<span class="badge ' + taskStatusBadgeClass(t.status) + '">' + escapeHtml(t.status) + "</span>" +
      '<span class="badge ' + taskPriorityBadgeClass(t.priority) + '">' + escapeHtml(t.priority) + "</span>" +
      "</div>" +
      '<div class="coding-task-meta">' +
      (t.dueDate ? "Due " + formatDateNice(t.dueDate) + " · " : "") +
      "Last worked on: " + (t.lastWorkedOn ? formatDateNice(t.lastWorkedOn) : "Never") +
      "</div>" +
      contextLine +
      (t.notes ? '<div class="item-card-notes">' + escapeHtml(t.notes) + "</div>" : "") +
      '<div class="coding-task-actions">' +
      (showRestore ? '<button class="button button-secondary button-small" data-restore-coding-task="' + t.id + '" type="button">Restore</button>' : "") +
      managementMenuHtml(
        '<button class="menu-item" role="menuitem" data-edit-coding-task="' + t.id + '" type="button">Edit</button>' +
        '<button class="menu-item menu-item-danger" role="menuitem" data-delete-coding-task="' + t.id + '" type="button">Delete</button>',
        "More actions for " + t.title
      ) +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // Archived project card: compact by design (no progress bar / focus
  // group - those are active-workspace concepts) but still expandable to
  // inspect its full retained task history, including tasks that were
  // never individually archived (they're only hidden via this parent).
  function archivedCodingProjectCardHtml(p) {
    var allTasks = codingProjectTasks(p.id);
    var doneCount = allTasks.filter(function (t) {
      return t.status === "Done";
    }).length;
    var expanded = !!expandedCodingProjectIds[p.id];

    var tasksBlockHtml = "";
    if (expanded) {
      var tasks = codingProjectAllTasksSorted(p.id);
      tasksBlockHtml =
        '<div class="coding-tasks-list">' +
        (tasks.length
          ? tasks
              .map(function (t) {
                return archivedCodingTaskRowHtml(t, p, true);
              })
              .join("")
          : '<div class="empty-state">No tasks yet.</div>') +
        "</div>";
    }

    var toggleLabel = "Tasks (" + allTasks.length + ") " + (expanded ? "▴" : "▾");

    return (
      '<div class="item-card coding-project-card coding-archived-card" data-id="' + p.id + '" data-coding-project-id="' + p.id + '">' +
      '<div class="item-card-header">' +
      '<div>' +
      '<div class="item-card-title">' + escapeHtml(p.name) + "</div>" +
      '<div class="item-card-meta">' + escapeHtml(p.type) + " · " + escapeHtml(p.priority) + " priority</div>" +
      "</div>" +
      '<span class="badge ' + taskStatusBadgeClass(p.status) + '">' + escapeHtml(p.status) + "</span>" +
      "</div>" +
      '<div class="item-card-meta">' + (allTasks.length ? doneCount + " / " + allTasks.length + " tasks complete" : "No tasks") + " · Last worked on: " + (p.lastWorkedOn ? formatDateNice(p.lastWorkedOn) : "Never") + "</div>" +
      '<button class="coding-tasks-toggle" data-toggle-coding-tasks="' + p.id + '" type="button" aria-expanded="' + (expanded ? "true" : "false") + '">' + toggleLabel + "</button>" +
      '<div class="coding-project-actions">' +
      '<button class="button button-secondary button-small" data-restore-coding-project="' + p.id + '" type="button">Restore</button>' +
      managementMenuHtml(
        '<button class="menu-item" role="menuitem" data-edit-coding-project="' + p.id + '" type="button">Edit</button>' +
        '<button class="menu-item menu-item-danger" role="menuitem" data-delete-coding-project="' + p.id + '" type="button">Delete</button>',
        "More actions for " + p.name
      ) +
      "</div>" +
      tasksBlockHtml +
      "</div>"
    );
  }

  function renderArchivedCodingSection() {
    var toggleBtn = document.getElementById("coding-archived-toggle");
    var container = document.getElementById("coding-archived-section");
    if (!toggleBtn || !container) return;

    var archivedProjects = archivedCodingProjects().slice().sort(function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    // Archived tasks whose project is still active - a task archived
    // inside an archived project is reached by expanding that project
    // instead, so it isn't duplicated here.
    var standaloneArchivedTasks = state.codingTasks
      .filter(function (t) {
        return isArchived(t) && !isArchived(findCodingProject(t.projectId));
      })
      .sort(function (a, b) {
        return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      });

    var totalCount = archivedProjects.length + standaloneArchivedTasks.length;
    toggleBtn.textContent = "Archived (" + totalCount + ") " + (archivedCodingSectionExpanded ? "▴" : "▾");
    toggleBtn.setAttribute("aria-expanded", archivedCodingSectionExpanded ? "true" : "false");

    if (!archivedCodingSectionExpanded) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    container.hidden = false;

    if (!totalCount) {
      container.innerHTML = '<div class="empty-state">Nothing archived yet.</div>';
      return;
    }

    var projectsHtml = archivedProjects
      .map(function (p) {
        return archivedCodingProjectCardHtml(p);
      })
      .join("");

    var tasksHtml = standaloneArchivedTasks.length
      ? '<div class="coding-tasks-list">' +
        standaloneArchivedTasks
          .map(function (t) {
            return archivedCodingTaskRowHtml(t, findCodingProject(t.projectId), false);
          })
          .join("") +
        "</div>"
      : "";

    container.innerHTML = projectsHtml + tasksHtml;
  }

  function codingProjectFieldsHtml(project) {
    project = project || {
      name: "",
      type: "Other",
      status: "Idea",
      priority: "Medium",
      progress: 0,
      techStack: "",
      milestone: "",
      nextAction: "",
      githubUrl: "",
      liveUrl: "",
      notes: "",
    };
    return (
      '<div class="form-group">' +
      '<label for="cpf-name">Project Name</label>' +
      '<input id="cpf-name" name="name" type="text" required value="' + escapeHtml(project.name) + '">' +
      "</div>" +
      '<div class="form-row">' +
      '<div class="form-group">' +
      '<label for="cpf-type">Type</label>' +
      '<select id="cpf-type" name="type">' +
      CODING_PROJECT_TYPES.map(function (t) {
        return '<option value="' + t + '"' + (project.type === t ? " selected" : "") + ">" + t + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="cpf-status">Status</label>' +
      '<select id="cpf-status" name="status">' +
      CODING_PROJECT_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (project.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      "</div>" +
      '<div class="form-row">' +
      '<div class="form-group">' +
      '<label for="cpf-priority">Priority</label>' +
      '<select id="cpf-priority" name="priority">' +
      TASK_PRIORITIES.map(function (p) {
        return '<option value="' + p + '"' + (project.priority === p ? " selected" : "") + ">" + p + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="cpf-progress">Progress <span class="range-value" id="cpf-progress-value">' + (Number(project.progress) || 0) + '%</span></label>' +
      '<input id="cpf-progress" name="progress" type="range" min="0" max="100" step="5" value="' + (Number(project.progress) || 0) + '">' +
      "</div>" +
      "</div>" +
      '<p class="hint-text">Progress is calculated automatically once this project has tasks. This value is only used before then.</p>' +
      '<div class="form-group">' +
      '<label for="cpf-techstack">Tech Stack</label>' +
      '<input id="cpf-techstack" name="techStack" type="text" placeholder="e.g. HTML, CSS, JavaScript" value="' + escapeHtml(project.techStack) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="cpf-milestone">Current Milestone</label>' +
      '<input id="cpf-milestone" name="milestone" type="text" value="' + escapeHtml(project.milestone) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="cpf-github">GitHub Repository URL</label>' +
      '<input id="cpf-github" name="githubUrl" type="url" placeholder="https://github.com/..." value="' + escapeHtml(project.githubUrl) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="cpf-live">Live App URL</label>' +
      '<input id="cpf-live" name="liveUrl" type="url" placeholder="https://..." value="' + escapeHtml(project.liveUrl) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="cpf-notes">Notes</label>' +
      '<textarea id="cpf-notes" name="notes" rows="3">' + escapeHtml(project.notes) + "</textarea>" +
      "</div>"
    );
  }

  function openCodingProjectModal(id) {
    var project = id ? findCodingProject(id) : null;
    openModal(
      project ? "Edit Coding Project" : "Add Coding Project",
      codingProjectFieldsHtml(project),
      function (formData) {
        var status = formData.get("status");
        var progress = Math.max(0, Math.min(100, Number(formData.get("progress")) || 0));

        // Completed defaults to 100% — but only auto-applies when progress
        // wasn't deliberately changed away from the prior saved value in
        // this same edit; otherwise ask before overwriting what was typed.
        if (status === "Completed" && progress !== 100) {
          var progressUnchanged = !project || Number(project.progress) === progress;
          if (progressUnchanged) {
            progress = 100;
          } else if (confirm("Status is Completed but progress is " + progress + "%. Set progress to 100%?")) {
            progress = 100;
          }
        }

        var data = {
          name: formData.get("name").trim(),
          type: formData.get("type"),
          status: status,
          priority: formData.get("priority"),
          progress: progress,
          techStack: formData.get("techStack").trim(),
          milestone: formData.get("milestone").trim(),
          githubUrl: formData.get("githubUrl").trim(),
          liveUrl: formData.get("liveUrl").trim(),
          notes: formData.get("notes").trim(),
          updatedAt: new Date().toISOString(),
        };
        if (!data.name) return;
        if (project) {
          data.lastWorkedOn = project.lastWorkedOn || null;
          data.createdAt = project.createdAt || project.updatedAt || data.updatedAt;
          Object.assign(project, data);
        } else {
          data.id = generateId();
          data.lastWorkedOn = null;
          data.createdAt = data.updatedAt;
          data.archived = false;
          state.codingProjects.push(data);
        }
        saveState();
        renderAll();
        closeModal();
        showToast(project ? "Project updated" : "Project added");
      },
      function (form) {
        var range = form.querySelector("#cpf-progress");
        var label = form.querySelector("#cpf-progress-value");
        if (range && label) {
          range.addEventListener("input", function () {
            label.textContent = range.value + "%";
          });
        }
      }
    );
  }

  function codingTaskFieldsHtml(task, defaultProjectId) {
    task = task || {
      projectId: defaultProjectId || (state.codingProjects[0] && state.codingProjects[0].id) || "",
      title: "",
      status: "To Do",
      priority: "Medium",
      dueDate: "",
      notes: "",
    };
    return (
      '<div class="form-group">' +
      '<label for="ctf-project">Project</label>' +
      '<select id="ctf-project" name="projectId" required>' + codingProjectOptionsHtml(task.projectId) + "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="ctf-title">Task Title</label>' +
      '<input id="ctf-title" name="title" type="text" required value="' + escapeHtml(task.title) + '">' +
      "</div>" +
      '<div class="form-row">' +
      '<div class="form-group">' +
      '<label for="ctf-status">Status</label>' +
      '<select id="ctf-status" name="status">' +
      CODING_TASK_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (task.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="ctf-priority">Priority</label>' +
      '<select id="ctf-priority" name="priority">' +
      TASK_PRIORITIES.map(function (p) {
        return '<option value="' + p + '"' + (task.priority === p ? " selected" : "") + ">" + p + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      "</div>" +
      '<div class="form-group">' +
      '<label for="ctf-due">Due Date</label>' +
      '<input id="ctf-due" name="dueDate" type="date" value="' + escapeHtml(task.dueDate) + '">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="ctf-notes">Notes</label>' +
      '<textarea id="ctf-notes" name="notes" rows="3">' + escapeHtml(task.notes) + "</textarea>" +
      "</div>"
    );
  }

  function openCodingTaskModal(id, defaultProjectId) {
    if (!state.codingProjects.length) {
      showToast("Add a project first");
      return;
    }
    var task = id ? findCodingTask(id) : null;
    openModal(task ? "Edit Task" : "Add Task", codingTaskFieldsHtml(task, defaultProjectId), function (formData) {
      var data = {
        projectId: formData.get("projectId"),
        title: formData.get("title").trim(),
        status: formData.get("status"),
        priority: formData.get("priority"),
        dueDate: formData.get("dueDate") || "",
        notes: formData.get("notes").trim(),
        updatedAt: new Date().toISOString(),
      };
      if (!data.title || !data.projectId) return;
      if (task) {
        var projectChanged = task.projectId !== data.projectId;
        data.createdAt = task.createdAt || task.updatedAt || data.updatedAt;
        data.lastWorkedOn = task.lastWorkedOn || null;
        // Next Action rule: completing the current Next Action task clears
        // the flag rather than silently reassigning it to another task -
        // the user picks the next one explicitly via "Set as Next Action".
        data.isNextAction = data.status === "Done" ? false : task.isNextAction;
        Object.assign(task, data);
        // Moving a task to a different project could otherwise leave that
        // project with two isNextAction:true tasks - re-enforce uniqueness
        // in the destination project when that's the case.
        if (projectChanged && task.isNextAction) {
          setNextActionTask(task.projectId, task.id);
        }
      } else {
        data.id = generateId();
        data.createdAt = data.updatedAt;
        data.lastWorkedOn = null;
        data.isNextAction = false;
        data.archived = false;
        state.codingTasks.push(data);
      }
      saveState();
      renderAll();
      closeModal();
      showToast(task ? "Task updated" : "Task added");
    });
  }

  function codingTaskDupKey(title) {
    return (title || "").trim().toLowerCase();
  }

  // Parses pasted task lines for the bulk task importer (scoped to one
  // existing project - see openImportCodingTasksModal()). Mirrors
  // parseCodingProjectsPasteText()'s simple/rich-format and
  // invalid-value-defaults conventions, but for the task fields.
  function parseCodingTasksPasteText(text) {
    var lines = text
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var rows = [];
    var invalidStatusCount = 0;
    var invalidPriorityCount = 0;
    var invalidDueDateCount = 0;
    var dueDatePattern = /^\d{4}-\d{2}-\d{2}$/;

    lines.forEach(function (line) {
      var parts = line.split("|").map(function (p) {
        return p.trim();
      });
      var title = parts[0];
      if (!title) return;

      var status = "To Do";
      var statusRaw = parts[1] || "";
      if (statusRaw) {
        if (CODING_TASK_STATUSES.indexOf(statusRaw) !== -1) {
          status = statusRaw;
        } else {
          invalidStatusCount++;
        }
      }

      var priority = "Medium";
      var priorityRaw = parts[2] || "";
      if (priorityRaw) {
        if (TASK_PRIORITIES.indexOf(priorityRaw) !== -1) {
          priority = priorityRaw;
        } else {
          invalidPriorityCount++;
        }
      }

      var dueDate = "";
      var dueDateRaw = parts[3] || "";
      if (dueDateRaw) {
        if (dueDatePattern.test(dueDateRaw)) {
          dueDate = dueDateRaw;
        } else {
          invalidDueDateCount++;
        }
      }

      rows.push({ title: title, status: status, priority: priority, dueDate: dueDate });
    });

    return {
      rows: rows,
      invalidStatusCount: invalidStatusCount,
      invalidPriorityCount: invalidPriorityCount,
      invalidDueDateCount: invalidDueDateCount,
    };
  }

  // Bulk-imports tasks into one specific, already-existing project - never
  // creates a project. Duplicate titles (trimmed, case-insensitive) are
  // only checked against tasks already in that project, so the same title
  // is allowed to exist in a different project.
  function openImportCodingTasksModal(projectId) {
    var project = findCodingProject(projectId);
    if (!project) return;

    var fieldsHtml =
      '<div class="form-group">' +
      '<label for="cti-paste">Paste tasks - one per line, or Title | Status | Priority | Due Date</label>' +
      '<textarea id="cti-paste" name="pasteText" rows="8" placeholder="Add global search\nRun final regression | Testing | High | 2026-09-20"></textarea>' +
      "</div>";

    openModal("Import Tasks — " + project.name, fieldsHtml, function (formData) {
      var result = parseCodingTasksPasteText(formData.get("pasteText") || "");
      if (!result.rows.length) {
        showToast("No tasks found. Check the format.");
        return;
      }

      var existingKeys = {};
      codingProjectTasks(project.id).forEach(function (t) {
        existingKeys[codingTaskDupKey(t.title)] = true;
      });

      var now = new Date().toISOString();
      var added = 0;
      var duplicates = 0;
      result.rows.forEach(function (row) {
        var key = codingTaskDupKey(row.title);
        if (existingKeys[key]) {
          duplicates++;
          return;
        }
        existingKeys[key] = true;
        state.codingTasks.push({
          id: generateId(),
          projectId: project.id,
          title: row.title,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate,
          notes: "",
          isNextAction: false,
          archived: false,
          lastWorkedOn: null,
          createdAt: now,
          updatedAt: now,
        });
        added++;
      });

      expandedCodingProjectIds[project.id] = true;
      saveState();
      renderAll();
      closeModal();

      var msg = result.rows.length + " task(s) detected — " + added + " imported";
      if (duplicates > 0) msg += ", " + duplicates + " duplicate(s) skipped";
      if (result.invalidStatusCount > 0) msg += ", " + result.invalidStatusCount + " unrecognized status defaulted";
      if (result.invalidPriorityCount > 0) msg += ", " + result.invalidPriorityCount + " unrecognized priority defaulted";
      if (result.invalidDueDateCount > 0) msg += ", " + result.invalidDueDateCount + " invalid due date cleared";
      showToast(msg);
    });
  }

  function initCodingProjectFilter() {
    document.getElementById("coding-project-status-filter").addEventListener("change", function (e) {
      codingProjectFilter = e.target.value;
      renderCodingProjects();
    });
  }

  function initCodingArchivedToggle() {
    document.getElementById("coding-archived-toggle").addEventListener("click", function () {
      archivedCodingSectionExpanded = !archivedCodingSectionExpanded;
      renderCodingProjects();
    });
  }

  function codingProjectDupKey(name) {
    return (name || "").trim().toLowerCase();
  }

  function parseCodingProjectsPasteText(text) {
    var lines = text
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var rows = [];
    var invalidTypeCount = 0;
    var invalidStatusCount = 0;
    var invalidPriorityCount = 0;
    var invalidProgressCount = 0;

    lines.forEach(function (line) {
      var parts = line.split("|").map(function (p) {
        return p.trim();
      });
      if (parts.length < 2) return;

      var name = parts[0];
      var type, status, priority, progress, nextAction;

      if (parts.length === 2) {
        // Simple format: Project Name | Next Action
        type = "Other";
        status = "Idea";
        priority = "Medium";
        progress = 0;
        nextAction = parts[1];
      } else {
        // Full format: Project Name | Type | Status | Priority | Progress | Next Action
        var typeRaw = parts[1] || "";
        var statusRaw = parts[2] || "";
        var priorityRaw = parts[3] || "";
        var progressRaw = parts[4] || "";
        nextAction = parts[5] || "";

        type = "Other";
        if (typeRaw) {
          if (CODING_PROJECT_TYPES.indexOf(typeRaw) !== -1) {
            type = typeRaw;
          } else {
            invalidTypeCount++;
          }
        }

        status = "Idea";
        if (statusRaw) {
          if (CODING_PROJECT_STATUSES.indexOf(statusRaw) !== -1) {
            status = statusRaw;
          } else {
            invalidStatusCount++;
          }
        }

        priority = "Medium";
        if (priorityRaw) {
          if (TASK_PRIORITIES.indexOf(priorityRaw) !== -1) {
            priority = priorityRaw;
          } else {
            invalidPriorityCount++;
          }
        }

        progress = 0;
        if (progressRaw !== "") {
          var n = Number(progressRaw.replace("%", ""));
          if (!isNaN(n)) {
            progress = Math.max(0, Math.min(100, Math.round(n)));
          } else {
            invalidProgressCount++;
          }
        }
      }

      if (!name) return;
      rows.push({ name: name, type: type, status: status, priority: priority, progress: progress, nextAction: nextAction });
    });

    return {
      rows: rows,
      invalidTypeCount: invalidTypeCount,
      invalidStatusCount: invalidStatusCount,
      invalidPriorityCount: invalidPriorityCount,
      invalidProgressCount: invalidProgressCount,
    };
  }

  function initCodingProjectsPasteImporter() {
    document.getElementById("parse-coding-projects-btn").addEventListener("click", function () {
      var textarea = document.getElementById("coding-projects-paste-input");
      var result = parseCodingProjectsPasteText(textarea.value);
      if (!result.rows.length) {
        showToast("No projects found. Check the format.");
        return;
      }

      var existingKeys = {};
      state.codingProjects.forEach(function (p) {
        existingKeys[codingProjectDupKey(p.name)] = true;
      });

      var now = new Date().toISOString();
      var added = 0;
      var duplicates = 0;
      result.rows.forEach(function (row) {
        var key = codingProjectDupKey(row.name);
        if (existingKeys[key]) {
          duplicates++;
          return;
        }
        existingKeys[key] = true;
        var newProject = {
          id: generateId(),
          name: row.name,
          type: row.type,
          status: row.status,
          priority: row.priority,
          progress: row.progress,
          techStack: "",
          milestone: "",
          nextAction: row.nextAction,
          githubUrl: "",
          liveUrl: "",
          notes: "",
          archived: false,
          lastWorkedOn: null,
          createdAt: now,
          updatedAt: now,
        };
        state.codingProjects.push(newProject);
        var nextActionTask = buildNextActionTask(newProject);
        if (nextActionTask) state.codingTasks.push(nextActionTask);
        added++;
      });

      saveState();
      textarea.value = "";
      renderAll();

      var msg = result.rows.length + " project(s) detected — " + added + " imported";
      if (duplicates > 0) msg += ", " + duplicates + " duplicate(s) skipped";
      if (result.invalidTypeCount > 0) msg += ", " + result.invalidTypeCount + " unrecognized type defaulted";
      if (result.invalidStatusCount > 0) msg += ", " + result.invalidStatusCount + " unrecognized status defaulted";
      if (result.invalidPriorityCount > 0) msg += ", " + result.invalidPriorityCount + " unrecognized priority defaulted";
      if (result.invalidProgressCount > 0) msg += ", " + result.invalidProgressCount + " invalid progress defaulted to 0";
      showToast(msg);
    });
  }

  // ===================== AUTH / CLOUD SYNC =====================

  function stateHasAnyData(s) {
    if (!s) return false;
    return !!(
      (s.guitarItems && s.guitarItems.length) ||
      (s.trainingSessions && s.trainingSessions.length) ||
      (s.races && s.races.length) ||
      (s.studyTopics && s.studyTopics.length) ||
      (s.studyTasks && s.studyTasks.length) ||
      (s.listening && s.listening.length) ||
      (s.codingProjects && s.codingProjects.length) ||
      (s.codingTasks && s.codingTasks.length)
    );
  }

  function setSyncStatus(status) {
    var el = document.getElementById("sync-status");
    if (!el) return;
    if (!currentUser) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var dot = el.querySelector(".sync-status-dot");
    var label = el.querySelector(".sync-status-label");
    var map = {
      synced: { text: "Synced", cls: "sync-dot-ok" },
      syncing: { text: "Syncing…", cls: "sync-dot-syncing" },
      offline: { text: "Offline", cls: "sync-dot-offline" },
      error: { text: "Sync error", cls: "sync-dot-error" },
    };
    var info = map[status] || map.offline;
    if (label) label.textContent = info.text;
    if (dot) dot.className = "sync-status-dot " + info.cls;
  }

  function updateAccountUI() {
    var signInBtn = document.getElementById("sign-in-btn");
    var accountIndicator = document.getElementById("account-indicator");
    var accountEmail = document.getElementById("account-email");
    if (!signInBtn || !accountIndicator || !accountEmail) return;
    if (currentUser) {
      signInBtn.hidden = true;
      accountIndicator.hidden = false;
      accountEmail.textContent = currentUser.email;
    } else {
      signInBtn.hidden = false;
      accountIndicator.hidden = true;
      setSyncStatus("offline");
    }
  }

  async function fetchCloudRow(userId) {
    var result = await supabaseClient
      .from("progress_data")
      .select("data, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }

  async function upsertCloudRow(userId, stateObj) {
    var result = await supabaseClient
      .from("progress_data")
      .upsert({ user_id: userId, data: stateObj, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (result.error) throw result.error;
  }

  function scheduleCloudPush() {
    if (!currentUser || !supabaseClient) return;
    clearTimeout(cloudSyncDebounceTimer);
    cloudSyncDebounceTimer = setTimeout(function () {
      pushStateToCloud();
    }, CLOUD_SYNC_DEBOUNCE_MS);
  }

  async function pushStateToCloud() {
    if (!currentUser || !supabaseClient) return;
    setSyncStatus("syncing");
    try {
      await upsertCloudRow(currentUser.id, state);
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus(navigator.onLine ? "error" : "offline");
    }
  }

  function subscribeRealtime(userId) {
    if (!supabaseClient) return;
    unsubscribeRealtime();
    realtimeChannel = supabaseClient
      .channel("progress_data_changes_" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "progress_data", filter: "user_id=eq." + userId },
        function (payload) {
          if (payload && payload.new && payload.new.data) {
            state = normalizeState(payload.new.data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            // If the incoming cloud row predated a local one-time migration
            // (e.g. Study Subjects/Tasks), push the migrated shape back so
            // the cloud copy doesn't stay stuck on the old shape.
            scheduleCloudPush();
            renderAll();
            setSyncStatus("synced");
          }
        }
      )
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
    }
    realtimeChannel = null;
  }

  function stopCloudSync() {
    unsubscribeRealtime();
    clearTimeout(cloudSyncDebounceTimer);
  }

  function openMigrationModal(opts) {
    var bodyHtml;
    if (opts.mode === "local-only") {
      bodyHtml =
        '<p class="card-subtext">We found data on this device but your account is empty.</p>' +
        '<div class="button-row">' +
        '<button id="migrate-yes-btn" class="button button-primary" type="button">Migrate to my account</button>' +
        '<button id="migrate-skip-btn" class="button button-secondary" type="button">Skip</button>' +
        "</div>";
    } else {
      bodyHtml =
        '<p class="card-subtext">Both this device and your account already have data. Choose carefully — this can’t be undone automatically.</p>' +
        '<div class="button-row">' +
        '<button id="use-cloud-btn" class="button button-primary" type="button">Use cloud data</button>' +
        '<button id="replace-cloud-btn" class="button button-danger" type="button">Replace cloud with this device’s data</button>' +
        "</div>" +
        '<p class="hint-text">Tip: use Export Data first if you want a backup of what’s on this device.</p>' +
        '<div class="button-row">' +
        '<button id="cancel-migration-btn" class="button button-secondary" type="button">Decide later</button>' +
        "</div>";
    }

    openModal(
      opts.mode === "local-only" ? "Migrate Local Data?" : "Local & Cloud Data Both Exist",
      bodyHtml,
      null,
      function (form) {
        if (opts.mode === "local-only") {
          form.querySelector("#migrate-yes-btn").addEventListener("click", function () {
            closeModal();
            opts.onMigrate();
          });
          form.querySelector("#migrate-skip-btn").addEventListener("click", function () {
            closeModal();
            opts.onSkip();
          });
        } else {
          form.querySelector("#use-cloud-btn").addEventListener("click", function () {
            closeModal();
            opts.onUseCloud();
          });
          form.querySelector("#replace-cloud-btn").addEventListener("click", function () {
            if (!confirm("This will overwrite your cloud data with what's on this device. Continue?")) return;
            closeModal();
            opts.onReplaceCloud();
          });
          form.querySelector("#cancel-migration-btn").addEventListener("click", function () {
            closeModal();
            opts.onCancel();
          });
        }
      },
      { noSaveButton: true }
    );
  }

  async function startCloudSync(user) {
    setSyncStatus("syncing");
    var migrationKey = "progressHubMigrated:" + user.id;
    var alreadyMigrated = localStorage.getItem(migrationKey) === "true";

    try {
      var cloudRow = await fetchCloudRow(user.id);
      var localHasData = stateHasAnyData(state);
      var cloudHasData = cloudRow && stateHasAnyData(cloudRow.data);

      if (!cloudHasData && localHasData && !alreadyMigrated) {
        setSyncStatus("synced");
        openMigrationModal({
          mode: "local-only",
          onMigrate: async function () {
            try {
              await upsertCloudRow(user.id, state);
              localStorage.setItem(migrationKey, "true");
              setSyncStatus("synced");
              showToast("Local data migrated to your account");
            } catch (e) {
              setSyncStatus(navigator.onLine ? "error" : "offline");
              showToast("Migration failed — your local data is unchanged");
            }
          },
          onSkip: function () {
            localStorage.setItem(migrationKey, "true");
            showToast("Skipped migration — this device stays local-only for now");
          },
        });
      } else if (cloudHasData && localHasData && !alreadyMigrated) {
        setSyncStatus("synced");
        openMigrationModal({
          mode: "both",
          onUseCloud: function () {
            state = normalizeState(cloudRow.data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            localStorage.setItem(migrationKey, "true");
            scheduleCloudPush();
            renderAll();
            showToast("Loaded your account's cloud data");
          },
          onReplaceCloud: async function () {
            try {
              await upsertCloudRow(user.id, state);
              localStorage.setItem(migrationKey, "true");
              showToast("Cloud data replaced with this device's data");
            } catch (e) {
              setSyncStatus(navigator.onLine ? "error" : "offline");
              showToast("Replace failed — nothing was changed");
            }
          },
          onCancel: function () {
            showToast("No changes made — you'll be asked again next sign-in");
          },
        });
      } else if (cloudHasData) {
        state = normalizeState(cloudRow.data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        scheduleCloudPush();
        renderAll();
        setSyncStatus("synced");
      } else {
        await upsertCloudRow(user.id, state);
        localStorage.setItem(migrationKey, "true");
        setSyncStatus("synced");
      }

      subscribeRealtime(user.id);
    } catch (e) {
      setSyncStatus(navigator.onLine ? "error" : "offline");
    }
  }

  var AUTH_MIN_PASSWORD_LENGTH = 6;

  function validateAuthInput(email, password) {
    if (!email) return "Enter your email.";
    if (!password) return "Enter your password.";
    if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
      return "Password must be at least " + AUTH_MIN_PASSWORD_LENGTH + " characters.";
    }
    return null;
  }

  function setAuthButtonBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = label;
  }

  async function signInWithPassword(email, password) {
    if (!supabaseClient) {
      return { ok: false, error: "Cloud sync isn't available right now (couldn't load Supabase)." };
    }
    try {
      var result = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (result.error) return { ok: false, error: result.error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Network error — check your connection and try again." };
    }
  }

  async function signUpWithPassword(email, password) {
    if (!supabaseClient) {
      return { ok: false, error: "Cloud sync isn't available right now (couldn't load Supabase)." };
    }
    try {
      var result = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: { emailRedirectTo: window.location.href },
      });
      if (result.error) return { ok: false, error: result.error.message };

      // Supabase deliberately returns a fake "success" (no error, no session)
      // for an email that's already registered, to avoid leaking which
      // emails have accounts. It signals this via an empty identities array
      // on the returned user — detect that so we don't tell an existing user
      // "Account created!".
      var user = result.data && result.data.user;
      var alreadyRegistered = !!(user && Array.isArray(user.identities) && user.identities.length === 0);
      if (alreadyRegistered) {
        return { ok: false, error: "An account with this email already exists. Try signing in instead." };
      }

      // If the project requires email confirmation, signUp succeeds but no
      // session is returned yet (and no SIGNED_IN event will fire) until the
      // confirmation link is clicked.
      var needsConfirmation = !(result.data && result.data.session);
      return { ok: true, needsConfirmation: needsConfirmation };
    } catch (e) {
      return { ok: false, error: "Network error — check your connection and try again." };
    }
  }

  function openSignInModal() {
    // Shared across the Sign In submit handler and the Create Account click
    // handler below, so the two mutually exclusive actions can't both be
    // in flight at once and race to overwrite auth-status-msg / each other's
    // button state.
    var authBusy = false;

    var fieldsHtml =
      '<div class="form-group">' +
      '<label for="auth-email">Email</label>' +
      '<input id="auth-email" name="email" type="email" placeholder="you@example.com" required autocomplete="email">' +
      "</div>" +
      '<div class="form-group">' +
      '<label for="auth-password">Password</label>' +
      '<input id="auth-password" name="password" type="password" placeholder="••••••••" required minlength="' + AUTH_MIN_PASSWORD_LENGTH + '" autocomplete="current-password">' +
      "</div>" +
      '<p class="hint-text">At least ' + AUTH_MIN_PASSWORD_LENGTH + " characters.</p>" +
      '<p id="auth-status-msg" class="hint-text"></p>' +
      '<div class="button-row">' +
      '<button id="signup-btn" class="button button-secondary" type="button">Create Account</button>' +
      "</div>" +
      '<p class="hint-text">Don’t want an account? Just close this — Progress Hub keeps working on this device only, and your data won’t sync anywhere.</p>';

    // Sign In uses the standard form-submit pattern (like every other modal
    // in the app), so pressing Enter after typing the password submits it
    // naturally. Create Account is a secondary explicit button — signing up
    // and signing in are different actions and shouldn't share one trigger.
    openModal(
      "Sign In",
      fieldsHtml,
      async function (formData, formEl) {
        if (authBusy) return;
        var email = formData.get("email").trim();
        var password = formData.get("password");
        var statusMsg = formEl.querySelector("#auth-status-msg");
        var validationError = validateAuthInput(email, password);
        if (validationError) {
          if (statusMsg) statusMsg.textContent = validationError;
          return;
        }
        var submitBtn = formEl.querySelector('button[type="submit"]');
        var signUpBtn = formEl.querySelector("#signup-btn");
        authBusy = true;
        setAuthButtonBusy(submitBtn, true, "Signing in…");
        setAuthButtonBusy(signUpBtn, true, "Create Account");
        var result = await signInWithPassword(email, password);
        authBusy = false;
        setAuthButtonBusy(submitBtn, false, "Sign In");
        setAuthButtonBusy(signUpBtn, false, "Create Account");
        if (statusMsg) statusMsg.textContent = result.ok ? "" : "Error: " + result.error;
        // On success, onAuthStateChange fires SIGNED_IN and handleAuthChange
        // closes this modal itself — nothing further needed here.
      },
      function (form) {
        var signUpBtn = form.querySelector("#signup-btn");
        signUpBtn.addEventListener("click", async function () {
          if (authBusy) return;
          var email = form.querySelector("#auth-email").value.trim();
          var password = form.querySelector("#auth-password").value;
          var statusMsg = form.querySelector("#auth-status-msg");
          var submitBtn = form.querySelector('button[type="submit"]');
          var validationError = validateAuthInput(email, password);
          if (validationError) {
            if (statusMsg) statusMsg.textContent = validationError;
            return;
          }
          authBusy = true;
          setAuthButtonBusy(signUpBtn, true, "Creating…");
          setAuthButtonBusy(submitBtn, true, "Sign In");
          var result = await signUpWithPassword(email, password);
          authBusy = false;
          setAuthButtonBusy(signUpBtn, false, "Create Account");
          setAuthButtonBusy(submitBtn, false, "Sign In");
          if (!result.ok) {
            if (statusMsg) statusMsg.textContent = "Error: " + result.error;
            return;
          }
          if (statusMsg) {
            statusMsg.textContent = result.needsConfirmation
              ? "Account created! Check your email to confirm it, then sign in above."
              : "Account created — signing you in…";
          }
          // If confirmation isn't required, onAuthStateChange fires SIGNED_IN
          // and handleAuthChange takes it from here (closes modal, syncs).
        });
      },
      { saveLabel: "Sign In" }
    );
  }

  function handleAuthChange(session) {
    var user = session && session.user ? { id: session.user.id, email: session.user.email } : null;

    // Re-entrant guard: if this is the same user we already have loaded
    // (e.g. a duplicate INITIAL_SESSION firing, or any other spurious
    // re-notification), just refresh the email and stop — don't re-run the
    // migration flow, don't yank an open modal out from under the user, and
    // don't overwrite in-memory edits with the last-synced cloud copy.
    if (user && currentUser && user.id === currentUser.id) {
      currentUser = user;
      updateAccountUI();
      return;
    }

    currentUser = user;
    updateAccountUI();
    if (user) {
      var overlay = document.getElementById("modal-overlay");
      if (overlay && !overlay.hidden) closeModal();
      startCloudSync(user);
    } else {
      stopCloudSync();
    }
  }

  function initAuth() {
    var signInBtn = document.getElementById("sign-in-btn");
    var signOutBtn = document.getElementById("sign-out-btn");
    if (signInBtn) signInBtn.addEventListener("click", openSignInModal);

    if (!supabaseClient) {
      updateAccountUI();
      return;
    }

    if (signOutBtn) {
      signOutBtn.addEventListener("click", async function () {
        // onAuthStateChange (below) is the single source of truth for the
        // SIGNED_OUT transition and already updates the UI — this handler
        // only triggers the sign-out and surfaces an error if it fails.
        try {
          await supabaseClient.auth.signOut();
        } catch (e) {
          showToast("Sign out failed — check your connection and try again.");
        }
      });
    }

    // Supabase v2 fires INITIAL_SESSION through onAuthStateChange on setup,
    // so that (plus SIGNED_IN/SIGNED_OUT) is the single source of truth here.
    // We deliberately do NOT also call getSession().then(...) — doing both
    // caused handleAuthChange to run twice for the same session on load.
    // Events like TOKEN_REFRESHED are intentionally ignored: they fire
    // periodically for the same signed-in user and must not re-trigger the
    // migration flow or overwrite in-progress local edits.
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        handleAuthChange(session);
      } else if (event === "SIGNED_OUT") {
        handleAuthChange(null);
      }
    });

    window.addEventListener("online", function () {
      if (currentUser) pushStateToCloud();
    });
    window.addEventListener("offline", function () {
      if (currentUser) setSyncStatus("offline");
    });
    window.addEventListener("pagehide", function () {
      // Best-effort flush: don't leave an edit sitting in the debounce
      // window if the tab is closing right after a save.
      if (currentUser && cloudSyncDebounceTimer) {
        clearTimeout(cloudSyncDebounceTimer);
        pushStateToCloud();
      }
    });
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
    document.getElementById("add-study-subject-btn").addEventListener("click", function () {
      openStudySubjectModal(null);
    });
    document.getElementById("add-study-task-btn").addEventListener("click", function () {
      openStudyTaskModal(null, null);
    });
    document.getElementById("add-listening-album-btn").addEventListener("click", function () {
      openListeningModal(null);
    });
    document.getElementById("add-coding-project-btn").addEventListener("click", function () {
      openCodingProjectModal(null);
    });
  }

  // ===================== RENDER ALL =====================

  function renderAll() {
    renderDashboard();
    renderGuitar();
    renderTraining();
    renderRaces();
    renderStudy();
    renderListening();
    renderCodingProjects();
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
    initListeningFilter();
    initListeningPasteImporter();
    initStudyPasteImporter();
    initStudyArchivedToggle();
    initCodingProjectFilter();
    initCodingProjectsPasteImporter();
    initCodingArchivedToggle();
    initManagementMenus();
    initDataButtons();
    initGlobalTimerControls();
    initAuth();
    renderAll();
  });
})();
