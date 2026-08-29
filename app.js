import {
  siteRef,
  onSnapshot,
  db,
  doc,
  runTransaction
} from "./firebase.js";

const fallback = {
  live: [
    {
      id: "1",
      name: "Morning Update",
      time: "11:50 AM",
      value: "Published",
      locked: false
    },
    {
      id: "2",
      name: "Afternoon Update",
      time: "02:45 PM",
      value: "Published",
      locked: false
    }
  ],

  next: [
    {
      id: "3",
      name: "Evening Update",
      time: "04:15 PM",
      value: "Scheduled",
      locked: false
    }
  ],

  records: {}
};

let data = fallback;


/* =========================
   HTML ESCAPE
========================= */

function escapeHtml(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );
}


/* =========================
   VIEWER ID
========================= */

function getViewerId() {

  const key = "mk_time_viewer_id_v1";

  let id = localStorage.getItem(key);

  if (!id) {

    id =
      (
        typeof crypto !== "undefined" &&
        crypto.randomUUID
      )
        ? crypto.randomUUID()
        : Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2);

    localStorage.setItem(key, id);
  }

  return id;
}


/* =========================
   TODAY KEY
========================= */

function todayKey() {

  const d = new Date();

  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}


/* =========================
   SAFE FIRESTORE ID
========================= */

function safeId(value) {

  return String(value ?? "")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 120) || "unknown";
}


/* =========================
   SIMPLE HASH
========================= */

function hashString(value) {

  let h = 2166136261;

  for (let i = 0; i < value.length; i++) {

    h ^= value.charCodeAt(i);

    h = Math.imul(h, 16777619);
  }

  return (h >>> 0)
    .toString(16)
    .padStart(8, "0");
}


/* =========================
   RESULT ID
========================= */

function getResultId(result) {

  return String(result?.id ?? "");
}


/* =========================
   VIEW COUNTER
========================= */

async function countView(result) {

  const resultId = getResultId(result);

  if (!resultId) return;

  const viewerId = getViewerId();

  const day = todayKey();

  const markerId = hashString(
    viewerId +
    "|" +
    resultId +
    "|" +
    day
  );


  const counterRef = doc(
    db,
    "resultViews",
    safeId(resultId)
  );


  const markerRef = doc(
    db,
    "resultViews",
    safeId(resultId),
    "daily",
    markerId
  );


  try {

    await runTransaction(db, async transaction => {

      const markerSnap =
        await transaction.get(markerRef);


      /*
       * Already counted today.
       */

      if (markerSnap.exists()) {

        return;
      }


      const counterSnap =
        await transaction.get(counterRef);


      const oldCount =
        counterSnap.exists()
          ? Number(
              counterSnap.data().count || 0
            )
          : 0;


      /*
       * Atomic transaction update.
       */

      transaction.set(
        counterRef,
        {
          count: oldCount + 1
        },
        {
          merge: true
        }
      );


      /*
       * Daily view marker.
       */

      transaction.set(
        markerRef,
        {
          day: day,
          createdAt: new Date().toISOString()
        }
      );

    });

  } catch (error) {

    console.error(
      "View counter error:",
      error
    );
  }
}


/* =========================
   RESULT CARDS
========================= */

function cards(id, items) {

  const el =
    document.getElementById(id);

  if (!el) return;


  el.innerHTML =
    (items || [])
      .map(x => {

        const views =
          Number(x.views || 0);


        return `
          <article class="card">

            <div>
              <small>
                ${escapeHtml(x.time)}
              </small>

              <h3>
                ${escapeHtml(x.name)}
              </h3>
            </div>


            <div>

              <strong>
                ${escapeHtml(x.value)}
              </strong>


              <div
                class="views"
                aria-label="${views} views"
              >
                👁️ ${views} Views
              </div>

            </div>

          </article>
        `;

      })
      .join("") ||
    '<p class="empty">No announcements yet.</p>';


  /*
   * Count displayed results.
   */

  (items || []).forEach(x => {

    countView(x);

  });
}


/* =========================
   RENDER
========================= */

function render() {

  cards(
    "live",
    data.live
  );


  cards(
    "next",
    data.next
  );


  const month =
    document.getElementById("month");


  if (month) {

    const current =
      month.value;


    month.innerHTML = "";


    Object.keys(
      data.records || {}
    )
      .sort()
      .reverse()
      .forEach(k => {

        const option =
          document.createElement(
            "option"
          );

        option.value = k;

        option.textContent = k;

        month.appendChild(
          option
        );

      });


    if (
      [...month.options]
        .some(
          option =>
            option.value === current
        )
    ) {

      month.value = current;
    }


    showRecords();
  }
}


/* =========================
   TODAY
========================= */

const today =
  document.getElementById(
    "today"
  );


if (today) {

  today.textContent =
    new Date().toLocaleDateString(
      undefined,
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    );
}


/* =========================
   YEAR
========================= */

const year =
  document.getElementById(
    "year"
  );


if (year) {

  year.textContent =
    new Date().getFullYear();
}


/* =========================
   REFRESH
========================= */

let refreshing = false;


window.refreshResults =
  function () {

    if (refreshing) return;

    refreshing = true;


    const btn =
      document.getElementById(
        "refreshBtn"
      );


    if (btn) {

      btn.disabled = true;

      btn.textContent =
        "↻ Refreshing...";
    }


    setTimeout(
      () => location.reload(),
      150
    );
  };


/* =========================
   PREVIOUS RECORDS
========================= */

window.showRecords =
  function () {

    const month =
      document.getElementById(
        "month"
      );


    const el =
      document.getElementById(
        "records"
      );


    if (!month || !el) return;


    const rows =
      data.records?.[
        month.value
      ] || [];


    el.innerHTML = `
      <table>

        <thead>
          <tr>
            <th>Date</th>
            <th>Status</th>
            <th>Value</th>
          </tr>
        </thead>

        <tbody>

          ${
            rows
              .map(
                r => `
                  <tr>
                    <td>
                      ${escapeHtml(r[0])}
                    </td>

                    <td>
                      ${escapeHtml(r[1])}
                    </td>

                    <td>
                      ${escapeHtml(r[2])}
                    </td>
                  </tr>
                `
              )
              .join("")
          }

        </tbody>

      </table>
    `;
  };


/* =========================
   FIRESTORE REAL-TIME DATA
========================= */

onSnapshot(
  siteRef,

  snap => {

    if (snap.exists()) {

      data = {
        ...fallback,
        ...snap.data()
      };

    }

    render();

  },

  error => {

    console.error(
      error
    );

    render();

  }
);


/* Initial render */

render();
