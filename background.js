// background.js - auto logout after 15 minutes idle AND send session to backend

const IDLE_LIMIT_MINUTES = 1; // change to 15 in real usage
const API_BASE_URL = "https://timetracker-backend-fyqb.onrender.com/api/time-entries";

// Machine's IANA time zone (Asia/Kolkata, America/Chicago, etc.)
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

chrome.idle.setDetectionInterval(IDLE_LIMIT_MINUTES * 60);

// Helper: LOCAL date -> yyyy-MM-dd
function getLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`; // e.g. 2025-11-28
}

// Today key using local date
function getTodayKey() {
  return getLocalDateString(new Date());
}

chrome.idle.onStateChanged.addListener((state) => {
  if (state === "idle" || state === "locked") {
    chrome.storage.local.get(
      ["status", "currentSessionStart", "sessions", "employeeId"],
      (data) => {
        if (data.status !== "in" || !data.currentSessionStart) {
          return; // nothing to close
        }

        const employeeId = (data.employeeId || "").trim();
        if (!employeeId) {
          return;
        }

        const now = Date.now();
        const start = data.currentSessionStart;
        const duration = now - start;

        const sessions = data.sessions || {};
        const today = getTodayKey();
        const previous = sessions[today] || 0;
        sessions[today] = previous + duration;

        chrome.storage.local.set(
          {
            status: "out",
            currentSessionStart: null,
            sessions
          },
          () => {
            sendSessionToServerAuto(employeeId, start, now, duration);

            chrome.notifications.create({
              type: "basic",
              iconUrl: "icon.png",
              title: "You were logged out",
              message: "You were inactive for 15 minutes. Please Clock In again."
            });
          }
        );
      }
    );
  }
});

function sendSessionToServerAuto(employeeId, startMs, endMs, durationMs) {
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);

  const payload = {
    employeeId: employeeId,
    // LOCAL calendar date
    workDate: getLocalDateString(startDate),
    // UTC instants
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    durationMs: durationMs,
    // Same timezone field as popup.js
    timeZone: TIME_ZONE
  };

  fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }).catch((err) => {
    console.error("Auto-logout send failed", err);
  });
}
