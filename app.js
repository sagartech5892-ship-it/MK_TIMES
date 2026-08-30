import {
  siteRef,
  onSnapshot,
  db,
  doc,
  setDoc,
  runTransaction,
  onSnapshot as firestoreOnSnapshot
} from "./firebase.js";


/* =================================
   DEFAULT DATA
================================= */

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

        const markerSnap =
          await transaction.get(
            markerRef
          );


        if(markerSnap.exists()){
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
            merge:true
          }
        );


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
   VIEW COUNT LISTENERS
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
   AUTO ARCHIVE
================================= */

function dateKey(){

  const d = new Date();

  return (
    d.getFullYear() +
    "-" +
    String(
      d.getMonth()+1
    ).padStart(2,"0") +
    "-" +
    String(
      d.getDate()
    ).padStart(2,"0")
  );

}


function displayDate(key){

  const [y,m,d] =
    String(key).split("-");

  return d && m && y
    ? `${d}-${m}-${y}`
    : key;

}


function monthKey(key){

  const [y,m] =
    String(key).split("-");


  if(
    !y ||
    !m
  ){

    return new Date()
      .toLocaleString(
        "en-US",
        {
          month:"long",
          year:"numeric"
        }
      );

  }


  return new Date(
    Number(y),
    Number(m)-1,
    1
  )
  .toLocaleString(
    "en-US",
    {
      month:"long",
      year:"numeric"
    }
  );

}


async function archiveOldDayResults(){

  const today =
    dateKey();


  if(!data.archiveDate){

    data.archiveDate =
      today;

    try{

      await setDoc(
        siteRef,
        data
      );

    }

    catch(error){

      console.error(
        "Archive date save error:",
        error
      );

    }

    return;

  }


  if(
    data.archiveDate ===
    today
  ){

    return;

  }


  const oldDate =
    data.archiveDate;


  const oldLive =
    Array.isArray(data.live)
      ? data.live
      : [];


  if(!data.records){

    data.records = {};

  }


  const month =
    monthKey(oldDate);


  if(
    !Array.isArray(
      data.records[month]
    )
  ){

    data.records[month] = [];

  }


  oldLive.forEach(
    item => {

      data.records[month].push(

        [
          displayDate(oldDate),
          "Published",
          `${item.name || ""}${
            item.value
              ? " — " + item.value
              : ""
          }`
        ]

      );

    }
  );


  data.live = [];


  data.archiveDate =
    today;


  try{

    await setDoc(
      siteRef,
      data
    );

  }

  catch(error){

    console.error(
      "Auto archive error:",
      error
    );

  }

}


/* =================================
   RESULT SUMMARY
================================= */

let summaryData = {

  month:"",
  records:{}

};


function renderResultSummary(){

  const box =
    document.getElementById(
      "todayYesterdayResults"
    );


  if(!box){
    return;
  }


  const records =
    summaryData.records || {};


  const days =
    Object.keys(records)

      .map(Number)

      .filter(
        n =>
          Number.isInteger(n) &&
          n >= 1 &&
          n <= 31
      )

      .sort(
        (a,b) =>
          a-b
      );


  if(!days.length){

    box.innerHTML =
      '<p class="result-summary-empty">No result summary available.</p>';

    return;

  }


  const labels = [

    "SM",
    "DB",
    "SG",
    "FB",
    "GB",
    "GL",
    "DS"

  ];


  box.innerHTML = `

    <div
      class="result-summary-card"
      style="grid-column:1/-1;overflow-x:auto;"
    >

      <div class="result-summary-label">

        👑 ${
          escapeHtml(
            summaryData.month ||
            "Result Summary"
          )
        }

      </div>


      <div class="result-summary-date">

        Latest result summary

      </div>


      <table class="result-summary-table">

        <thead>

          <tr>

            <th>
              DATE
            </th>

            ${
              labels
                .map(
                  x =>
                    `<th>${x}</th>`
                )
                .join("")
            }

          </tr>

        </thead>


        <tbody>

          ${
            days
              .map(
                day => {

                  const r =
                    records[
                      String(day)
                    ] || {};


                  return `

                    <tr>

                      <td>
                        ${day}
                      </td>

                      ${
                        labels
                          .map(
                            k =>
                              `<td>${
                                escapeHtml(
                                  r[k] ||
                                  "--"
                                )
                              }</td>`
                          )
                          .join("")
                      }

                    </tr>

                  `;

                }
              )
              .join("")
          }

        </tbody>

      </table>

    </div>

  `;

}


/* =================================
   RESULT SUMMARY LISTENER
================================= */

function listenToResultSummary(){

  const summaryRef =
    doc(
      db,
      "resultSummary",
      "current"
    );


  firestoreOnSnapshot(

    summaryRef,

    snap => {

      if(
        snap.exists()
      ){

        const value =
          snap.data() || {};


        summaryData = {

          month:
            value.month || "",

          records:
            value.records || {}

        };

      }

      else{

        summaryData = {

          month:"",
          records:{}

        };

      }


      renderResultSummary();

    },


    error => {

      console.error(
        "Result summary error:",
        error
      );

      renderResultSummary();

    }

  );

}


/* =================================
   CUSTOM BOX
================================= */

function renderCustomBox(){

  const box =
    document.getElementById(
      "customBox"
    );


  if(!box){
    return;
  }


  const custom =
    data.customBox || {};


  const title =
    document.getElementById(
      "customBoxTitle"
    );


  const text =
    document.getElementById(
      "customBoxText"
    );


  const link =
    document.getElementById(
      "customBoxLink"
    );


  if(title){

    title.textContent =
      custom.title ||
      "📌 Important Information";

  }


  if(text){

    text.textContent =
      custom.text || "";

  }


  if(link){

    const url =
      String(
        custom.url || ""
      ).trim();


    if(url){

      link.href =
        url;

      link.textContent =
        custom.button ||
        "Open Link";

      link.hidden =
        false;

    }

    else{

      link.hidden =
        true;

    }

  }

}


/* =================================
   MAIN RENDER
================================= */

function render(){

  cards(
    "live",
    data.live
  );


  cards(
    "next",
    data.next
  );


  const displayedResults = [

    ...(data.live || []),
    ...(data.next || [])

  ];


  displayedResults.forEach(
    result =>
      countView(result)
  );


  listenToViewCounts(
    displayedResults
  );


  updateVerifiedStatus();

  updateLastUpdated();

  renderResultSummary();

  renderCustomBox();

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

let refreshing =
  false;


window.refreshResults =
  function(){

    if(refreshing){
      return;
    }


    refreshing =
      true;


    const btn =
      document.getElementById(
        "refreshBtn"
      );


    if(btn){

      btn.disabled =
        true;

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
   START RESULT SUMMARY
================================= */

listenToResultSummary();


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


    archiveOldDayResults()
      .then(
        () => {

          render();

        }
      );

  },


  error => {

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
