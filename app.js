import { siteRef, onSnapshot, setDoc } from "./firebase.js";

const fallback = {
  live: [],
  next: [],
  records: {}
};

let data = fallback;

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}

function getTodayKey() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function getMonthKey() {
  const d = new Date();
  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  });
}

/* Purane din ke LIVE results ko Previous Records me save karega */
async function archiveOldResults() {
  const today = getTodayKey();
  const month = getMonthKey();

  const oldResults = (data.live || []).filter(x => x.date && x.date !== today);

  if (!oldResults.length) return;

  if (!data.records) data.records = {};
  if (!data.records[month]) data.records[month] = [];

  oldResults.forEach(x => {
    data.records[month].push([
      x.date,
      x.value || "Published",
      x.name
    ]);
  });

  data.live = (data.live || []).filter(x => !x.date || x.date === today);

  await setDoc(siteRef, data);
}

function cards(id, items) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerHTML = (items || []).map(x => `
    <article class="card">
      <div>
        <small>${escapeHtml(x.time)}</small>
        <h3>${escapeHtml(x.name)}</h3>
      </div>
      <strong>${escapeHtml(x.value)}</strong>
    </article>
  `).join("") || '<p class="empty">No announcements yet.</p>';
}

function render() {
  cards("live", data.live);
  cards("next", data.next);

  const month = document.getElementById("month");

  if (month) {
    const current = month.value;
    month.innerHTML = "";

    Object.keys(data.records || {})
      .sort()
      .reverse()
      .forEach(k => {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = k;
        month.appendChild(o);
      });

    if ([...month.options].some(o => o.value === current)) {
      month.value = current;
    }

    showRecords();
  }
}

const today = document.getElementById("today");

if (today) {
  today.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

const year = document.getElementById("year");

if (year) {
  year.textContent = new Date().getFullYear();
}

let refreshing = false;

window.refreshResults = function() {
  if (refreshing) return;

  refreshing = true;

  const btn = document.getElementById("refreshBtn");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "↻ Refreshing...";
  }

  setTimeout(() => location.reload(), 150);
};

window.showRecords = function() {
  const month = document.getElementById("month");
  const el = document.getElementById("records");

  if (!month || !el) return;

  const rows = data.records?.[month.value] || [];

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
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r[0])}</td>
            <td>${escapeHtml(r[1])}</td>
            <td>${escapeHtml(r[2])}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
};

onSnapshot(
  siteRef,
  async (snap) => {
    if (snap.exists()) {
      data = {
        ...fallback,
        ...snap.data()
      };
    }

    /*
      Existing old data me date nahi hogi,
      isliye pehle current data ko normally show karenge.
    */
    render();
  },
  (err) => {
    console.error(err);
    render();
  }
);

render();
