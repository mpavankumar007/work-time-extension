// 8-hour target
const DAILY_TARGET_MS = 8 * 60 * 60 * 1000;

// Backend URL (your Spring Boot)
const API_BASE_URL = "http://10.0.0.152:8080/api/time-entries";

function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// NEW: use LOCAL date (not UTC) for workDate
function getLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`; // e.g. 2025-11-28
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const employeeIdInput = document.getElementById("employeeIdInput");
  const clockInBtn = document.getElementById("clockInBtn");
  const clockOutBtn = document.getElementById("clockOutBtn");
  const statusEl = document.getElementById("status");
  const todayTimeEl = document.getElementById("todayTime");
  const remainingEl = document.getElementById("remaining");
  const shiftStatusEl = document.getElementById("shiftStatus");
  const progressBarEl = document.getElementById("progressBar");

  chrome.storage.local.get(
    ["status", "currentSessionStart", "sessions", "employeeId"],
    (data) => {
      const status = data.status || "out";
      const currentSessionStart = data.currentSessionStart || null;
      const sessions = data.sessions || {};
      const employeeId = data.employeeId || "";

      employeeIdInput.value = employeeId;
      updateStatus(status, currentSessionStart);
      updateTodayDisplay(sessions, status, currentSessionStart);
    }
  );

  employeeIdInput.addEventListener("change", () => {
    const employeeId = employeeIdInput.value.trim();
    chrome.storage.local.set({ employeeId });
  });

  clockInBtn.addEventListener("click", () => {
    chrome.storage.local.get(
      ["status", "currentSessionStart", "employeeId"],
      (data) => {
        const employeeId = (data.employeeId || "").trim();
        if (!employeeId) {
          alert("Please enter your Employee ID before clocking in.");
          return;
        }
        if (data.status === "in") return;

        const now = Date.now();
        chrome.storage.local.set({
          status: "in",
          currentSessionStart: now
        }, () => {
          updateStatus("in", now);
        });
      }
    );
  });

  clockOutBtn.addEventListener("click", () => {
    chrome.storage.local.get(
      ["status", "currentSessionStart", "sessions", "employeeId"],
      (data) => {
        const employeeId = (data.employeeId || "").trim();
        if (!employeeId) {
          alert("Please enter your Employee ID before clocking out.");
          return;
        }
        if (data.status !== "in" || !data.currentSessionStart) return;

        const now = Date.now();
        const start = data.currentSessionStart;
        const duration = now - start;

        const sessions = data.sessions || {};
        const today = getTodayKey();
        const previous = sessions[today] || 0;
        sessions[today] = previous + duration;

        chrome.storage.local.set({
          status: "out",
          currentSessionStart: null,
          sessions
        }, () => {
          updateStatus("out", null);
          updateTodayDisplay(sessions, "out", null);
          sendSessionToServer(employeeId, start, now, duration);
        });
      }
    );
  });

  function updateStatus(status, currentSessionStart) {
    if (status === "in") {
      const startTime = new Date(currentSessionStart);
      statusEl.textContent = `Status: Clocked IN since ${startTime.toLocaleTimeString()}`;
    } else {
      statusEl.textContent = "Status: Clocked OUT";
    }
  }

  function updateTodayDisplay(sessions, status, currentSessionStart) {
    const today = getTodayKey();
    const base = sessions[today] || 0;
    let total = base;
    if (status === "in" && currentSessionStart) {
      total += Date.now() - currentSessionStart;
    }

    const remainingMs = Math.max(DAILY_TARGET_MS - total, 0);
    const progress = Math.min((total / DAILY_TARGET_MS) * 100, 100);

    todayTimeEl.textContent = `Today: ${formatDuration(total)}`;
    remainingEl.textContent = `Remaining: ${formatDuration(remainingMs)}`;
    progressBarEl.style.width = `${progress}%`;

    if (total >= DAILY_TARGET_MS) {
      shiftStatusEl.textContent = "Shift complete ✅";
    } else {
      shiftStatusEl.textContent = "Shift in progress…";
    }
  }

  setInterval(() => {
    chrome.storage.local.get(
      ["status", "currentSessionStart", "sessions"],
      (data) => {
        updateTodayDisplay(
          data.sessions || {},
          data.status || "out",
          data.currentSessionStart || null
        );
      }
    );
  }, 5000);
});

function sendSessionToServer(employeeId, startMs, endMs, durationMs) {
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);

  const payload = {
    employeeId: employeeId,
    // CHANGED: use local date instead of UTC slice
    workDate: getLocalDateString(startDate),
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    durationMs: durationMs
  };

  fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }).then((res) => {
    if (!res.ok) {
      console.error("Failed to send time entry", res.status);
    }
  }).catch((err) => {
    console.error("Error sending time entry", err);
  });
}

