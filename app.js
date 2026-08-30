import {
  siteRef,
  onSnapshot,
  db,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  onSnapshot as firestoreOnSnapshot
} from "./firebase.js";


/* =================================
   FALLBACK
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


let data = {
  ...fallback
};


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

  const d =
    new Date();

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

  let hash =
    2166136261;


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

  viewUnsubscribers.forEach(
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


  unique.forEach(
    result => {

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

    }
  );

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

    el.textContent =
      "";

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

    el.textContent =
      "";

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

    el.textContent =
      "";

    return;

  }


  if(
    Number.isNaN(
      date.getTime()
    )
  ){

    el.textContent =
      "";

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

    btn.hidden =
      true;

    return;

  }


  btn.hidden =
    false;


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
          permission ===
          "granted"
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
   RESULT SUMMARY
================================= */

let summaryData = {
  month:"",
  records:{}
};


async function loadResultSummary(){

  try{

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


    if(
      snap.exists()
    ){

      summaryData =
        {
          month:
            snap.data().month || "",

          records:
            snap.data().records || {}

        };

    }

    else{

      summaryData =
        {
          month:"",
          records:{}
        };

    }


    renderResultSummary();

  }

  catch(error){

    console.error(
      "Result summary error:",
      error
    );

  }

}


/* =================================
   RENDER RESULT SUMMARY
================================= */

function renderResultSummary(){

  const box =
    document.getElementById(
      "todayYesterdayResults"
    );


  if(!box){
    return;
  }


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


  const dates =
    Object.keys(records)
      .sort(
        (a,b) =>
          Number(a) -
          Number(b)
      );


  /*
     Agar koi result save nahi hai.
  */

  if(!dates.length){

    box.innerHTML = `
      <div class="summary-table-wrap">

        <h3 class="summary-month">
          ${escapeHtml(
            summaryData.month || ""
          )}
        </h3>

        <table class="summary-table">

          <thead>
            <tr>

              <th>DATE</th>

              ${columns.map(
                x =>
                  `<th>${x}</th>`
              ).join("")}

            </tr>
          </thead>

          <tbody>

            <tr>

              <td>--</td>

              ${columns.map(
                () =>
                  `<td>--</td>`
              ).join("")}

            </tr>

          </tbody>

        </table>

      </div>
    `;

    return;

  }


  /*
     Pure month ki saved rows.
  */

  box.innerHTML = `

    <div class="summary-table-wrap">

      <h2 class="summary-month">
        ${escapeHtml(
          summaryData.month || ""
        )}
      </h2>

      <table class="summary-table">

        <thead>

          <tr>

            <th>DATE</th>

            ${columns.map(
              x =>
                `<th>${x}</th>`
            ).join("")}

          </tr>

        </thead>

        <tbody>

          ${
            dates.map(
              date => {

                const row =
                  records[date] || {};


                return `

                  <tr>

                    <td>
                      ${escapeHtml(date)}
                    </td>

                    ${
                      columns.map(
                        column => `

                          <td>
                            ${escapeHtml(
                              row[column] || "--"
                            )}
                          </td>

                        `
                      ).join("")
                    }

                  </tr>

                `;

              }
            ).join("")
          }

        </tbody>

      </table>

    </div>

  `;

}


/* =================================
   AUTO ARCHIVE
================================= */

function dateKey(){

  const d =
    new Date();


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
    data.archiveDate === today
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

    data.records =
      {};

  }


  const month =
    monthKey(oldDate);


  if(
    !Array.isArray(
      data.records[month]
    )
  ){

    data.records[month] =
      [];

  }


  oldLive.forEach(
    item => {

      data.records[month].push([

        displayDate(oldDate),

        "Published",

        `${item.name || ""}${
          item.value
            ? " — " +
              item.value
            : ""
        }`

      ]);

    }
  );


  data.live =
    [];

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
   RENDER
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


  const month =
    document.getElementById(
      "month"
    );


  if(month){

    const current =
      month.value;


    month.innerHTML =
      "";


    Object.keys(
      data.records || {}
    )
    .sort()
    .reverse()
    .forEach(
      k => {

        const option =
          document.createElement(
            "option"
          );


        option.value =
          k;

        option.textContent =
          k;

        month.appendChild(
          option
        );

      }
    );


    if(
      [...month.options]
        .some(
          option =>
            option.value ===
            current
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
   FIRESTORE SITE DATA
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
   RESULT SUMMARY REAL-TIME LISTENER
================================= */

onSnapshot(

  doc(
    db,
    "resultSummary",
    "current"
  ),

  snap => {

    if(
      snap.exists()
    ){

      summaryData = {

        month:
          snap.data().month || "",

        records:
          snap.data().records || {}

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
      "Result summary listener error:",
      error
    );

  }

);


/* =================================
   START
================================= */
