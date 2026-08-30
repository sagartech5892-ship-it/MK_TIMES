import {
  siteRef,
  onSnapshot,
  db,
  doc,
  runTransaction,
  onSnapshot as firestoreOnSnapshot
} from "./firebase.js";


const fallback = {

  live: [
    {
      id:"1",
      name:"Morning Update",
      time:"11:50 AM",
      value:"Published",
      locked:false
    },
    {
      id:"2",
      name:"Afternoon Update",
      time:"02:45 PM",
      value:"Published",
      locked:false
    }
  ],

  next: [
    {
      id:"3",
      name:"Evening Update",
      time:"04:15 PM",
      value:"Scheduled",
      locked:false
    }
  ],

  records:{}

};


let data = fallback;


/* =================================
   HTML ESCAPE
================================= */

function escapeHtml(v){

  return String(v ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[m])
  );

}


/* =================================
   VIEWER ID
================================= */

function getViewerId(){

  const key =
    "mk_time_viewer_id_v1";

  let id =
    localStorage.getItem(key);


  if(!id){

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


/* =================================
   TODAY KEY
================================= */

function todayKey(){

  const d = new Date();


  return (

    d.getFullYear() +
    "-" +
    String(
      d.getMonth() + 1
    ).padStart(2,"0") +
    "-" +
    String(
      d.getDate()
    ).padStart(2,"0")

  );

}


/* =================================
   SAFE FIRESTORE ID
================================= */

function safeId(value){

  return String(
    value ?? ""
  )
  .replace(
    /[^A-Za-z0-9_-]/g,
    "_"
  )
  .slice(0,120)

  || "unknown";

}


/* =================================
   HASH
================================= */

function hashString(value){

  let hash = 2166136261;


  for(
    let i=0;
    i<value.length;
    i++
  ){

    hash ^= value.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        16777619
      );

  }


  return (
    hash >>> 0
  )
  .toString(16)
  .padStart(8,"0");

}


/* =================================
   RESULT ID
================================= */

function getResultId(result){

  return String(
    result?.id ?? ""
  );

}


/* =================================
   COUNT VIEW
================================= */

async function countView(result){

  const resultId =
    getResultId(result);


  if(!resultId){
    return;
  }


  let viewerId;


  try{

    viewerId =
      getViewerId();

  }

  catch(error){

    console.error(
      "Viewer ID error:",
      error
    );

    return;

  }


  const day =
    todayKey();


  /*
   * Same browser + same result +
   * same day = same marker.
   */

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


  try{

    await runTransaction(
      db,
      async transaction => {

        /*
         * First check daily marker.
         */

        const markerSnap =
          await transaction.get(
            markerRef
          );


        /*
         * Already counted today.
         */

        if(markerSnap.exists()){
          return;
        }


        /*
         * Create/update counter.
         *
         * The Firestore transaction makes
         * concurrent updates safe.
         */

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
            merge:true
          }
        );


        /*
         * Store daily marker.
         */

        transaction.set(
          markerRef,
          {
            day:day,
            createdAt:
              new Date().toISOString()
          }
        );

      }
    );

  }

  catch(error){

    /*
     * Permission/index/network errors
     * must NOT stop the result page.
     */

    console.error(
      "View counter error:",
      error
    );

  }

}


/* =================================
   TOTAL VIEWS
================================= */

function updateTotalViews(total){

  const el =
    document.getElementById(
      "totalViews"
    );


  if(!el){
    return;
  }


  el.textContent =
    "👁️ " +
    Number(total || 0) +
    " Views";

}


/* =================================
   VIEW COUNTS LISTENERS
================================= */

let viewUnsubscribers = [];


function clearViewListeners(){

  viewUnsubscribers
    .forEach(
      unsubscribe => {

        try{
          unsubscribe();
        }
        catch(_){}

      }
    );


  viewUnsubscribers = [];

}


/* =================================
   LIVE VIEW COUNTS
================================= */

function listenToViewCounts(results){

  clearViewListeners();


  const items =
    (results || [])
      .filter(
        item =>
          getResultId(item)
      );


  if(!items.length){

    updateTotalViews(0);

    return;

  }


  /*
   * Avoid duplicate result IDs.
   */

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
            )
            .reduce(
              (sum,value) =>
                sum + value,
              0
            );


          updateTotalViews(
            total
          );

        },

        error => {

          console.error(
            "View count read error:",
            error
          );


          if(
            !counts.has(
              resultId
            )
          ){

            counts.set(
              resultId,
              0
            );

          }


          const total =
            Array.from(
              counts.values()
            )
            .reduce(
              (sum,value) =>
                sum + value,
              0
            );


          updateTotalViews(
            total
          );

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

function cards(id,items){

  const el =
    document.getElementById(id);


  if(!el){
    return;
  }


  /*
   * IMPORTANT:
   * Views are NOT shown on cards.
   */

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

function updateVerifiedStatus(){

  const el =
    document.getElementById(
      "verifiedStatus"
    );


  if(!el){
    return;
  }


  /*
   * Existing result data में verified:true
   * होने पर ही badge दिखेगा.
   *
   * इससे fake verification नहीं दिखाई जाएगी.
   */

  const allResults = [

    ...(data.live || []),
    ...(data.next || [])

  ];


  if(
    allResults.length &&
    allResults.every(
      item =>
        item.verified === true
    )
  ){

    el.textContent =
      "✓ Verified";

  }

  else{

    el.textContent = "";

  }

}


/* =================================
   LAST UPDATED
================================= */

function updateLastUpdated(){

  const el =
    document.getElementById(
      "lastUpdated"
    );


  if(!el){
    return;
  }


  /*
   * Only use timestamp if it already
   * exists in existing Firestore data.
   */

  const value =
    data.updatedAt ||
    data.lastUpdated;


  if(!value){

    el.textContent = "";

    return;

  }


  let date;


  try{

    date =
      value?.toDate
        ? value.toDate()
        : new Date(value);

  }

  catch(_){

    el.textContent = "";

    return;

  }


  if(
    Number.isNaN(
      date.getTime()
    )
  ){

    el.textContent = "";

    return;

  }


  el.textContent =
    "Updated " +
    date.toLocaleTimeString(
      undefined,
      {
        hour:"2-digit",
        minute:"2-digit"
      }
    );

}


/* =================================
   NOTIFICATIONS
================================= */

function setupNotifications(){

  const btn =
    document.getElementById(
      "notifyBtn"
    );


  if(!btn){
    return;
  }


  /*
   * Browser notification support.
   * It does NOT affect Firebase/results.
   */

  if(
    !("Notification" in window)
  ){

    btn.hidden = true;

    return;

  }


  btn.hidden = false;


  if(
    Notification.permission ===
    "granted"
  ){

    btn.textContent =
      "🔔 Notifications On";

  }


  btn.onclick =
    async function(){

      try{

        const permission =
          await Notification.requestPermission();


        if(
          permission === "granted"
        ){

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

      }

      catch(error){

        console.error(
          "Notification error:",
          error
        );

      }

    };

}


/* =================================
   RENDER
================================= */

function render(){

  /*
   * Existing LIVE.
   */

  cards(
    "live",
    data.live
  );


  /*
   * Existing NEXT.
   */

  cards(
    "next",
    data.next
  );


  /*
   * Views are counted for the
   * results displayed on this page.
   */

  const displayedResults = [

    ...(data.live || []),
    ...(data.next || [])

  ];


  displayedResults.forEach(
    result =>
      countView(result)
  );


  /*
   * One total Views number at top.
   */

  listenToViewCounts(
    displayedResults
  );


  updateVerifiedStatus();

  updateLastUpdated();


  /*
   * Existing Previous Records.
   */

  const month =
    document.getElementById(
      "month"
    );


  if(month){

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


    if(
      [...month.options]
        .some(
          option =>
            option.value === current
        )
    ){

      month.value =
        current;

    }


    showRecords();

  }

}


/* =================================
   TODAY
================================= */

const today =
  document.getElementById(
    "today"
  );


if(today){

  today.textContent =
    new Date()
      .toLocaleDateString(
        undefined,
        {
          weekday:"long",
          year:"numeric",
          month:"long",
          day:"numeric"
        }
      );

}


/* =================================
   YEAR
================================= */

const year =
  document.getElementById(
    "year"
  );


if(year){

  year.textContent =
    new Date()
      .getFullYear();

}


/* =================================
   REFRESH
================================= */

let refreshing = false;


window.refreshResults =
  function(){

    if(refreshing){
      return;
    }


    refreshing = true;


    const btn =
      document.getElementById(
        "refreshBtn"
      );


    if(btn){

      btn.disabled = true;

      btn.textContent =
        "↻ Refreshing...";

    }


    setTimeout(
      () =>
        location.reload(),
      150
    );

  };


/* =================================
   PREVIOUS RECORDS
================================= */

window.showRecords =
  function(){

    const month =
      document.getElementById(
        "month"
      );


    const el =
      document.getElementById(
        "records"
      );


    if(
      !month ||
      !el
    ){

      return;

    }


    const rows =
      data.records?.[
        month.value
      ] || [];


    el.innerHTML = `

      <table>

        <thead>

          <tr>

            <th>
              Date
            </th>

            <th>
              Status
            </th>

            <th>
              Value
            </th>

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


/* =================================
   FIRESTORE
================================= */

onSnapshot(

  siteRef,

  snap => {

    if(
      snap.exists()
    ){

      data = {

        ...fallback,
        ...snap.data()

      };

    }


    render();

  },

  error => {

    /*
     * Firebase error होने पर भी
     * page को blank नहीं करेंगे.
     */

    console.error(
      "Site data error:",
      error
    );


    render();

  }

);


/* =================================
   START
================================= */

setupNotifications();

render();

/* =================================
   TODAY / YESTERDAY RESULT SUMMARY
   NEW FEATURE — EXISTING LOGIC SAFE
================================= */

function summaryDateKey(date){
  return (
    date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2,"0") + "-" +
    String(date.getDate()).padStart(2,"0")
  );
}

function parseSummaryDate(value){
  const text = String(value || "").trim();

  if(!text) return null;

  // YYYY-MM-DD
  let m = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if(m){
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3])
    );

    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY
  m = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if(m){
    const d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1])
    );

    return isNaN(d.getTime()) ? null : d;
  }

  // DD-MM-YYYY
  m = text.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/
  );

  if(m){
    const d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1])
    );

    return isNaN(d.getTime()) ? null : d;
  }

  // DD Mon YYYY
  m = text.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/
  );

  if(m){
    const d = new Date(
      m[1] + " " + m[2] + " " + m[3]
    );

    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}


function getAllPreviousRecords(){

  const records = [];

  const source =
    data &&
    data.records &&
    typeof data.records === "object"
      ? data.records
      : {};

  Object.keys(source).forEach(function(month){

    const rows = Array.isArray(source[month])
      ? source[month]
      : [];

    rows.forEach(function(row){

      if(!Array.isArray(row)){
        return;
      }

      const date = parseSummaryDate(row[0]);

      if(!date){
        return;
      }

      records.push({
        date: date,
        dateKey: summaryDateKey(date),
        status: String(row[1] || ""),
        value: String(row[2] || "")
      });

    });

  });

  return records;
}


function renderTodayYesterday(){

  const container =
    document.getElementById(
      "todayYesterdayResults"
    );

  if(!container){
    return;
  }

  const now = new Date();

  const yesterdayDate =
    new Date(now);

  yesterdayDate.setDate(
    now.getDate() - 1
  );


  const todayKey =
    summaryDateKey(now);

  const yesterdayKey =
    summaryDateKey(yesterdayDate);


  const records =
    getAllPreviousRecords();


  const todayRecords =
    records.filter(function(item){

      return item.dateKey === todayKey;

    });


  const yesterdayRecords =
    records.filter(function(item){

      return item.dateKey === yesterdayKey;

    });


  /*
    If today's previous record is not available,
    use the existing LIVE results.
  */

  if(
    todayRecords.length === 0 &&
    Array.isArray(data.live)
  ){

    data.live.forEach(function(item){

      if(
        item &&
        String(item.value || "").trim()
      ){

        todayRecords.push({

          value:
            String(item.name || "") +
            (
              item.name
                ? " — "
                : ""
            ) +
            String(item.value || ""),

          status: "LIVE"

        });

      }

    });

  }


  function escapeText(value){

    return String(value || "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");

  }


  function createCard(
    title,
    date,
    rows
  ){

    let content = "";

    if(rows.length){

      content =
        rows.map(function(row){

          return `
            <div class="result-summary-value">
              ${escapeText(row.value)}
            </div>

            ${
              row.status
                ? `
                  <div class="result-summary-date">
                    ${escapeText(row.status)}
                  </div>
                `
                : ""
            }
          `;

        }).join("");

    }
    else{

      content = `
        <div class="result-summary-empty">
          Result not available
        </div>
      `;

    }


    const formattedDate =
      date.toLocaleDateString(
        "en-IN",
        {
          day:"2-digit",
          month:"short",
          year:"numeric"
        }
      );


    return `
      <div class="result-summary-card">

        <div class="result-summary-label">
          ${title}
        </div>

        <div class="result-summary-date">
          ${formattedDate}
        </div>

        ${content}

      </div>
    `;

  }


  container.innerHTML =

    createCard(
      "🟢 AAJ KA RESULT",
      now,
      todayRecords
    )

    +

    createCard(
      "📅 KAL KA RESULT",
      yesterdayDate,
      yesterdayRecords
    );

}


/* =================================
   AUTO UPDATE SUMMARY
================================= */

function startTodayYesterdayFeature(){

  renderTodayYesterday();

  /*
    Refresh every 30 seconds so
    the display stays current.
  */

  setInterval(
    renderTodayYesterday,
    30000
  );

}


/* Start feature after page is ready */

if(
  document.readyState === "loading"
){

  document.addEventListener(
    "DOMContentLoaded",
    startTodayYesterdayFeature
  );

}
else{

  startTodayYesterdayFeature();

}
