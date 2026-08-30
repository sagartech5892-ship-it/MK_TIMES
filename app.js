import {
  siteRef,
  onSnapshot,
  db,
  doc,
  getDoc,
  runTransaction,
  onSnapshot as firestoreOnSnapshot,
  setDoc
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


let data = {
  ...fallback
};


function escapeHtml(value) {

  return String(value ?? "").replace(
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


function getViewerId() {

  const key =
    "mk_time_viewer_id_v1";

  let id =
    localStorage.getItem(key);

  if (!id) {

    id =
      (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      )
        ? crypto.randomUUID()
        : Date.now().toString(36) +
          "-" +
          Math.random()
            .toString(36)
            .slice(2);

    localStorage.setItem(
      key,
      id
    );

  }

  return id;

}


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


function safeId(value) {

  return String(value ?? "")
    .replace(
      /[^A-Za-z0-9_-]/g,
      "_"
    )
    .slice(0, 120) || "unknown";

}


function hashString(value) {

  let hash = 2166136261;

  for (
    let i = 0;
    i < value.length;
    i++
  ) {

    hash ^= value.charCodeAt(i);

    hash = Math.imul(
      hash,
      16777619
    );

  }

  return (
    hash >>> 0
  )
    .toString(16)
    .padStart(8, "0");

}


function getResultId(result) {

  return String(
    result?.id ?? ""
  );

}


async function countView(result) {

  const resultId =
    getResultId(result);

  if (!resultId) return;

  let viewerId;

  try {

    viewerId =
      getViewerId();

  } catch (error) {

    console.error(
      "Viewer ID error:",
      error
    );

    return;

  }

  const day =
    todayKey();

  const markerId =
    hashString(
      viewerId +
      "|" +
      resultId +
      "|" +
      day
    );

  const counterRef =
    doc(
      db,
      "resultViews",
      safeId(resultId)
    );

  const markerRef =
    doc(
      db,
      "resultViews",
      safeId(resultId),
      "daily",
      markerId
    );

  try {

    await runTransaction(
      db,
      async transaction => {

        const markerSnap =
          await transaction.get(
            markerRef
          );

        if (markerSnap.exists()) {
          return;
        }

        const counterSnap =
          await transaction.get(
            counterRef
          );

        const currentCount =
          counterSnap.exists()
            ? Number(
                counterSnap.data().count || 0
              )
            : 0;

        transaction.set(
          counterRef,
          {
            count:
              currentCount + 1
          },
          {
            merge: true
          }
        );

        transaction.set(
          markerRef,
          {
            day: day,
            createdAt:
              new Date().toISOString()
          }
        );

      }
    );

  } catch (error) {

    console.error(
      "View counter error:",
      error
    );

  }

}
/* =================================
   TOTAL VIEWS
================================= */

function updateTotalViews(total) {

  const el =
    document.getElementById("totalViews");

  if (!el) return;

  el.textContent =
    "👁️ " +
    Number(total || 0) +
    " Views";

}


/* =================================
   VIEW COUNT LISTENERS
================================= */

let viewUnsubscribers = [];


function clearViewListeners() {

  viewUnsubscribers.forEach(
    unsubscribe => {

      try {
        unsubscribe();
      } catch (_) {}

    }
  );

  viewUnsubscribers = [];

}


/* =================================
   LIVE VIEW COUNTS
================================= */

function listenToViewCounts(results) {

  clearViewListeners();

  const items =
    (results || [])
      .filter(
        item =>
          getResultId(item)
      );

  if (!items.length) {

    updateTotalViews(0);

    return;

  }


  const unique =
    Array.from(
      new Map(
        items.map(
          item => [
            getResultId(item),
            item
          ]
        )
      ).values()
    );


  const counts =
    new Map();


  unique.forEach(result => {

    const resultId =
      getResultId(result);


    const counterRef =
      doc(
        db,
        "resultViews",
        safeId(resultId)
      );


    const unsubscribe =
      firestoreOnSnapshot(

        counterRef,

        snap => {

          const count =
            snap.exists()
              ? Number(
                  snap.data().count || 0
                )
              : 0;


          counts.set(
            resultId,
            count
          );


          const total =
            Array.from(
              counts.values()
            ).reduce(
              (sum, value) =>
                sum + value,
              0
            );


          updateTotalViews(total);

        },

        error => {

          console.error(
            "View count read error:",
            error
          );


          if (
            !counts.has(resultId)
          ) {

            counts.set(
              resultId,
              0
            );

          }


          const total =
            Array.from(
              counts.values()
            ).reduce(
              (sum, value) =>
                sum + value,
              0
            );


          updateTotalViews(total);

        }

      );


    viewUnsubscribers.push(
      unsubscribe
    );

  });

}


/* =================================
   CARDS
================================= */

function cards(id, items) {

  const el =
    document.getElementById(id);

  if (!el) return;


  el.innerHTML =
    (items || [])
      .map(
        x => `

          <article class="card">

            <div>

              <small>
                ${escapeHtml(x.time)}
              </small>

              <h3>
                ${escapeHtml(x.name)}
              </h3>

            </div>

            <strong>
              ${escapeHtml(x.value)}
            </strong>

          </article>

        `
      )
      .join("")

    ||

    '<p class="empty">No announcements yet.</p>';

}


/* =================================
   VERIFIED STATUS
================================= */

function updateVerifiedStatus() {

  const el =
    document.getElementById(
      "verifiedStatus"
    );

  if (!el) return;


  const allResults = [

    ...(data.live || []),
    ...(data.next || [])

  ];


  if (
    allResults.length &&
    allResults.every(
      item =>
        item.verified === true
    )
  ) {

    el.textContent =
      "✓ Verified";

  } else {

    el.textContent =
      "";

  }

}


/* =================================
   LAST UPDATED
================================= */

function updateLastUpdated() {

  const el =
    document.getElementById(
      "lastUpdated"
    );

  if (!el) return;


  const value =
    data.updatedAt ||
    data.lastUpdated;


  if (!value) {

    el.textContent =
      "";

    return;

  }


  let date;


  try {

    date =
      value?.toDate
        ? value.toDate()
        : new Date(value);

  } catch (_) {

    el.textContent =
      "";

    return;

  }


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    el.textContent =
      "";

    return;

  }


  el.textContent =
    "Updated " +
    date.toLocaleTimeString(
      undefined,
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

}


/* =================================
   NOTIFICATIONS
================================= */

function setupNotifications() {

  const btn =
    document.getElementById(
      "notifyBtn"
    );

  if (!btn) return;


  if (
    !("Notification" in window)
  ) {

    btn.hidden =
      true;

    return;

  }


  btn.hidden =
    false;


  if (
    Notification.permission ===
    "granted"
  ) {

    btn.textContent =
      "🔔 Notifications On";

  }


  btn.onclick =
    async function() {

      try {

        const permission =
          await Notification.requestPermission();


        if (
          permission ===
          "granted"
        ) {

          btn.textContent =
            "🔔 Notifications On";


          new Notification(
            "MK Time",
            {
              body:
                "Result notifications enabled."
            }
          );

        }

      } catch (error) {

        console.error(
          "Notification error:",
          error
        );

      }

    };

}


/* =================================
   RESULT SUMMARY DATA
================================= */

let summaryData = {

  month: "",

  year: "",

  records: {}

};
/* =================================
   LOAD RESULT SUMMARY
================================= */

async function loadResultSummary() {

  try {

    const resultRef =
      doc(
        db,
        "resultSummary",
        "current"
      );


    const snap =
      await getDoc(
        resultRef
      );


    if (snap.exists()) {

      const saved =
        snap.data();


      summaryData = {

        month:
          saved.month || "",

        year:
          saved.year || "",

        records:
          saved.records || {}

      };

    } else {

      summaryData = {

        month: "",

        year: "",

        records: {}

      };

    }


    renderResultSummary();

  } catch (error) {

    console.error(
      "Result summary error:",
      error
    );

  }

}


/* =================================
   MONTH DAYS
================================= */

function getDaysInMonth(month, year) {

  if (!month || !year) {
    return 31;
  }


  const monthNumber = {

    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12

  }[month];


  if (!monthNumber) {
    return 31;
  }


  return new Date(
    Number(year),
    monthNumber,
    0
  ).getDate();

}


/* =================================
   RESULT SUMMARY TABLE
================================= */

function renderResultSummary() {

  const box =
    document.getElementById(
      "todayYesterdayResults"
    );


  if (!box) return;


  const columns = [

    "SM",
    "DB",
    "SG",
    "FB",
    "GB",
    "GL",
    "DS"

  ];


  const records =
    summaryData.records || {};


  const month =
    summaryData.month || "";


  const year =
    summaryData.year || "";


  const monthTitle =
    month
      ? `${month}${year ? " " + year : ""}`
      : "";


  /*
     Month ke total days
  */

  const totalDays =
    getDaysInMonth(
      month,
      year
    );


  /*
     Har date ki row banegi.
     
     Example:
     29
     30
     31
     
     Aur agar month August hai
     to 1 se 31 tak sab rows.
  */

  const dates =
    Array.from(
      {
        length: totalDays
      },
      (_, index) =>
        String(index + 1)
    );


  box.innerHTML = `

    <div class="summary-table-wrap">

      <div class="summary-month-box">

        <span class="summary-month-icon">
          📅
        </span>

        <div>

          <div class="summary-month-title">
            ${escapeHtml(
              monthTitle || "RESULT"
            )}
          </div>

          <div class="summary-month-subtitle">
            Monthly Result
          </div>

        </div>

      </div>


      <div class="summary-table-scroll">

        <table class="summary-table">

          <thead>

            <tr>

              <th>
                DATE
              </th>

              ${columns.map(
                column => `
                  <th>
                    ${column}
                  </th>
                `
              ).join("")}

            </tr>

          </thead>


          <tbody>

            ${dates.map(
              date => {

                const row =
                  records[date] || {};


                return `

                  <tr>

                    <td class="date-cell">

                      <span class="date-number">
                        ${escapeHtml(date)}
                      </span>

                    </td>


                    ${columns.map(
                      column => {

                        const value =
                          row[column] || "--";


                        return `

                          <td>

                            <span class="result-value">
                              ${escapeHtml(value)}
                            </span>

                          </td>

                        `;

                      }
                    ).join("")}

                  </tr>

                `;

              }
            ).join("")}

          </tbody>

        </table>

      </div>

    </div>

  `;

}


/* =================================
   SUMMARY TABLE FALLBACK STYLE
================================= */

const summaryStyle =
  document.createElement("style");


summaryStyle.textContent = `

  .summary-table-wrap {
    width: 100%;
    max-width: 100%;
    margin: 18px auto;
    box-sizing: border-box;
  }


  .summary-month-box {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    margin-bottom: 12px;

    border-radius: 16px;

    background:
      linear-gradient(
        135deg,
        rgba(255,255,255,.98),
        rgba(240,244,255,.98)
      );

    border: 1px solid
      rgba(0,0,0,.08);

    box-shadow:
      0 8px 24px
      rgba(0,0,0,.08);

    box-sizing: border-box;
  }


  .summary-month-icon {
    width: 42px;
    height: 42px;

    display: flex;
    align-items: center;
    justify-content: center;

    border-radius: 12px;

    background:
      linear-gradient(
        135deg,
        #111827,
        #374151
      );

    color: white;

    font-size: 21px;

    flex-shrink: 0;
  }


  .summary-month-title {
    font-size: 20px;
    font-weight: 800;
    line-height: 1.15;
  }


  .summary-month-subtitle {
    margin-top: 3px;
    font-size: 12px;
    opacity: .6;
  }


  .summary-table-scroll {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;

    border-radius: 16px;

    box-shadow:
      0 8px 25px
      rgba(0,0,0,.08);

    -webkit-overflow-scrolling: touch;
  }


  .summary-table {
    width: 100%;
    min-width: 620px;

    border-collapse: separate;
    border-spacing: 0;

    overflow: hidden;

    background: white;
  }


  .summary-table th {

    padding: 11px 7px;

    background:
      linear-gradient(
        135deg,
        #111827,
        #374151
      );

    color: white;

    font-size: 11px;
    font-weight: 800;

    text-align: center;

    white-space: nowrap;

    border-right:
      1px solid
      rgba(255,255,255,.15);
  }


  .summary-table th:first-child {
    position: sticky;
    left: 0;
    z-index: 3;
  }


  .summary-table td {

    padding: 9px 6px;

    text-align: center;

    font-size: 13px;
    font-weight: 700;

    border-right:
      1px solid
      rgba(0,0,0,.06);

    border-bottom:
      1px solid
      rgba(0,0,0,.06);

    white-space: nowrap;
  }


  .summary-table tbody tr:nth-child(even) td {
    background: #f8fafc;
  }


  .summary-table tbody tr:hover td {
    background: #eef2ff;
  }


  .summary-table td:first-child {

    position: sticky;
    left: 0;

    z-index: 2;

    background: white;

    font-weight: 900;
  }


  .summary-table tbody tr:nth-child(even)
  td:first-child {
    background: #f8fafc;
  }


  .date-number {

    display: inline-flex;

    min-width: 30px;
    height: 30px;

    align-items: center;
    justify-content: center;

    border-radius: 9px;

    background:
      linear-gradient(
        135deg,
        #111827,
        #4b5563
      );

    color: white;

    font-weight: 800;
  }


  .result-value {

    display: inline-flex;

    min-width: 34px;
    min-height: 28px;

    padding: 4px 7px;

    align-items: center;
    justify-content: center;

    box-sizing: border-box;

    border-radius: 8px;

    background: #f1f5f9;

    border: 1px solid
      rgba(0,0,0,.06);
  }


  @media (max-width: 600px) {

    .summary-month-box {
      padding: 12px;
      border-radius: 14px;
    }


    .summary-month-title {
      font-size: 17px;
    }


    .summary-table th {
      padding: 9px 5px;
      font-size: 10px;
    }


    .summary-table td {
      padding: 7px 4px;
      font-size: 12px;
    }


    .date-number {
      min-width: 27px;
      height: 27px;
      font-size: 11px;
    }


    .result-value {
      min-width: 31px;
      min-height: 26px;
      padding: 3px 5px;
    }

  }

`;


document.head.appendChild(
  summaryStyle
);
/* =================================
   START
================================= */

setupNotifications();

loadResultSummary();

render();

/* =================================
   FINAL SAFETY CHECK
================================= */

window.addEventListener("load", function(){

  try {
    render();
    renderResultSummary();
  } catch(error) {
    console.error(
      "Final render error:",
      error
    );
  }

});

/* =================================
   END APP.JS
================================= */
/* =================================
   PART 5 + 6
   RESULT SUMMARY TABLE DESIGN
================================= */

const tableThemeStyle =
  document.createElement("style");

tableThemeStyle.id =
  "mk-summary-table-theme";

tableThemeStyle.textContent = `

/* MAIN BOX */
.summary-table-wrap {

  width: 100%;
  max-width: 100%;

  margin: 18px auto;

  padding: 14px;

  box-sizing: border-box;

  border-radius: 18px;

  background:
    linear-gradient(
      145deg,
      #111b31,
      #0b1426
    );

  border: 1px solid
    rgba(99,102,241,.65);

  box-shadow:
    0 10px 35px
    rgba(0,0,0,.35);

}


/* MONTH TITLE */
.summary-month-box {

  display: flex;

  align-items: center;

  justify-content: center;

  gap: 10px;

  margin-bottom: 14px;

  padding: 10px;

  text-align: center;

}


.summary-month-icon {

  font-size: 25px;

}


.summary-month-title {

  color: #ffffff;

  font-size: 24px;

  font-weight: 900;

  letter-spacing: .5px;

}


.summary-month-subtitle {

  color: #aab7d4;

  font-size: 11px;

  margin-top: 3px;

}


/* TABLE OUTER BOX */
.summary-table-scroll {

  width: 100%;

  max-width: 100%;

  overflow-x: auto;

  overflow-y: hidden;

  border-radius: 14px;

  border: 1px solid
    rgba(100,140,200,.55);

  box-sizing: border-box;

  -webkit-overflow-scrolling:
    touch;

}


/* TABLE */
.summary-table {

  width: 100%;

  min-width: 0;

  border-collapse: separate;

  border-spacing: 0;

  table-layout: fixed;

  background:
    #0c172a;

}


/* HEADER */
.summary-table th {

  height: 48px;

  padding: 6px 3px;

  box-sizing: border-box;

  background:
    linear-gradient(
      180deg,
      #243b63,
      #172a49
    );

  color: #f8fafc;

  font-size: 13px;

  font-weight: 900;

  text-align: center;

  white-space: nowrap;

  border-right:
    1px solid
    rgba(148,163,184,.35);

  border-bottom:
    1px solid
    rgba(148,163,184,.45);

}


/* FIRST HEADER */
.summary-table th:first-child {

  width: 15%;

}


/* OTHER HEADERS */
.summary-table th:not(:first-child) {

  width: 12.14%;

}


/* BODY CELLS */
.summary-table td {

  height: 54px;

  padding: 5px 2px;

  box-sizing: border-box;

  color: #f8fafc;

  font-size: 15px;

  font-weight: 800;

  text-align: center;

  border-right:
    1px solid
    rgba(96,125,170,.40);

  border-bottom:
    1px solid
    rgba(96,125,170,.40);

}


/* ROW COLORS */
.summary-table tbody tr:nth-child(odd) td {

  background:
    linear-gradient(
      90deg,
      #101d32,
      #0d192b
    );

}


.summary-table tbody tr:nth-child(even) td {

  background:
    linear-gradient(
      90deg,
      #14233b,
      #102039
    );

}


/* DATE CELL */
.summary-table td:first-child {

  color: #ffffff;

  font-weight: 900;

}


/* DATE NUMBER BOX */
.date-number {

  display: inline-flex;

  align-items: center;

  justify-content: center;

  width: 34px;

  height: 34px;

  border-radius: 9px;

  background:
    linear-gradient(
      135deg,
      #8b5cf6,
      #6d28d9
    );

  color: white;

  font-size: 15px;

  font-weight: 900;

  box-shadow:
    0 4px 12px
    rgba(124,58,237,.35);

}


/* RESULT BOX */
.result-value {

  display: inline-flex;

  align-items: center;

  justify-content: center;

  min-width: 30px;

  min-height: 30px;

  padding: 3px 5px;

  box-sizing: border-box;

  border-radius: 7px;

  background:
    rgba(255,255,255,.06);

  color: #f8fafc;

  font-weight: 900;

}


/* REAL RESULT */
.summary-table td:not(:first-child)
.result-value:not(:empty) {

  color: #67e878;

}


/* MOBILE */
@media (max-width: 600px) {

  .summary-table-wrap {

    padding: 8px;

    margin: 12px 0;

    border-radius: 15px;

  }


  .summary-month-box {

    margin-bottom: 9px;

    padding: 7px;

  }


  .summary-month-icon {

    font-size: 20px;

  }


  .summary-month-title {

    font-size: 19px;

  }


  .summary-month-subtitle {

    font-size: 9px;

  }


  .summary-table th {

    height: 40px;

    padding: 3px 1px;

    font-size: 10px;

  }


  .summary-table td {

    height: 45px;

    padding: 3px 1px;

    font-size: 12px;

  }


  .date-number {

    width: 27px;

    height: 27px;

    border-radius: 7px;

    font-size: 12px;

  }


  .result-value {

    min-width: 25px;

    min-height: 25px;

    padding: 2px;

    border-radius: 6px;

    font-size: 11px;

  }

}


/* VERY SMALL PHONES */
@media (max-width: 380px) {

  .summary-table-wrap {

    padding: 5px;

  }


  .summary-table th {

    font-size: 9px;

  }


  .summary-table td {

    font-size: 11px;

  }


  .date-number {

    width: 24px;

    height: 24px;

    font-size: 11px;

  }


  .result-value {

    min-width: 22px;

    min-height: 22px;

    font-size: 10px;

  }

}

`;


/* OLD THEME HO TO REMOVE KARO */
const oldTheme =
  document.getElementById(
    "mk-summary-table-theme"
  );

if (oldTheme) {
  oldTheme.remove();
}


/* NEW THEME ADD */
document.head.appendChild(
  tableThemeStyle
);


/* =================================
   FORCE TABLE REFRESH
================================= */

setTimeout(
  function () {

    try {

      renderResultSummary();

    }

    catch (error) {

      console.error(
        "Table theme refresh error:",
        error
      );

    }

  },
  100
);


/* =================================
   END PART 5 + 6
================================= */
