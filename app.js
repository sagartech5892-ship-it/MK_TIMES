import {
  siteRef,
  onSnapshot,
  db,
  doc,
  runTransaction,
  increment
} from "./firebase.js";


/* ================= FALLBACK ================= */

const fallback = {

  live: [],

  next: [],

  records: {}

};


let data = fallback;


/* ================= HTML ESCAPE ================= */

function escapeHtml(value){

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      function(m){

        return {

          "&":"&amp;",
          "<":"&lt;",
          ">":"&gt;",
          '"':"&quot;",
          "'":"&#039;"

        }[m];

      }
    );

}


/* =====================================================
   VIEW COUNTER
   ===================================================== */


/*
  Browser/device identifier.

  Normal refresh:
  same localStorage ID
  = same viewer.

  One result:
  maximum one counted view
  per calendar day.

  Important:
  Browser hardware-level permanent ID
  web browsers provide nahi karte.
*/

function getViewerId(){

  const key =
    "mk_time_viewer_id_v1";

  let id =
    localStorage.getItem(key);


  if(!id){

    id =
      crypto.randomUUID
        ? crypto.randomUUID()
        :
        Date.now().toString(36)
        + "-"
        + Math.random()
          .toString(36)
          .slice(2);

    localStorage.setItem(
      key,
      id
    );

  }


  return id;

}


/* ================= TODAY KEY ================= */

function todayKey(){

  const d =
    new Date();

  return (

    d.getFullYear()
    + "-"
    + String(
        d.getMonth() + 1
      ).padStart(2,"0")
    + "-"
    + String(
        d.getDate()
      ).padStart(2,"0")

  );

}


/* ================= SAFE FIRESTORE ID ================= */

function safeId(value){

  return String(
    value ?? ""
  )
  .replace(
    /[^A-Za-z0-9_-]/g,
    "_"
  )
  .slice(
    0,
    120
  )
  || "unknown";

}


/* ================= HASH ================= */

function hashString(value){

  let h =
    2166136261;


  for(
    let i = 0;
    i < value.length;
    i++
  ){

    h ^=
      value.charCodeAt(i);

    h =
      Math.imul(
        h,
        16777619
      );

  }


  return (
    h >>> 0
  )
  .toString(16)
  .padStart(
    8,
    "0"
  );

}


/* ================= RESULT ID ================= */

function getResultId(result){

  return String(
    result?.id ?? ""
  );

}


/* =====================================================
   COUNT VIEW
   ===================================================== */


/*
  One viewer + one result + one day
  = maximum one count.

  Firestore transaction:
    1. Check daily marker.
    2. If marker exists -> don't count.
    3. Create marker.
    4. Atomic increment counter.
*/

async function countView(result){

  const resultId =
    getResultId(result);

  if(!resultId)
    return;


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
      viewerId
      + "|"
      + resultId
      + "|"
      + day
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
      async function(transaction){

        const markerSnap =
          await transaction.get(
            markerRef
          );


        if(
          markerSnap.exists()
        ){

          return;

        }


        /*
          Atomic increment.
          Existing count safe rahega.
        */

        transaction.set(

          counterRef,

          {
            count:
              increment(1)
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
              new Date()
                .toISOString()

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


/* =====================================================
   TOTAL VIEW DISPLAY
   ===================================================== */

function updateTotalViews(total){

  const el =
    document.getElementById(
      "totalViews"
    );

  if(!el)
    return;


  el.textContent =
    "👁️ "
    + Number(total || 0)
    + " Views";

}


/* =====================================================
   VIEW COUNT LISTENERS
   ===================================================== */

let viewUnsubscribers = [];


function listenToViewCounts(items){

  viewUnsubscribers
    .forEach(function(unsubscribe){

      try{
        unsubscribe();
      }
      catch(_){}

    });


  viewUnsubscribers = [];


  const results =
    (items || [])
      .filter(function(item){

        return !!getResultId(item);

      });


  if(!results.length){

    updateTotalViews(0);

    return;

  }


  const counts =
    new Map();


  results.forEach(function(result){

    const resultId =
      getResultId(result);


    const ref =
      doc(
        db,
        "resultViews",
        safeId(resultId)
      );


    const unsubscribe =
      onSnapshot(

        ref,

        function(snapshot){

          counts.set(

            resultId,

            snapshot.exists()
              ?
              Number(
                snapshot.data()
                  .count || 0
              )
              :
              0

          );


          const total =
            [...counts.values()]
              .reduce(
                function(sum,value){

                  return (
                    sum + value
                  );

                },
                0
              );


          updateTotalViews(
            total
          );

        },

        function(error){

          console.error(
            "View count read error:",
            error
          );

        }

      );


    viewUnsubscribers.push(
      unsubscribe
    );

  });

}


/* =====================================================
   LIVE / NEXT CARDS
   ===================================================== */

function cards(
  id,
  items
){

  const el =
    document.getElementById(id);

  if(!el)
    return;


  el.innerHTML =

    (items || [])
      .map(function(x){

        return `

          <article class="card">

            <div>

              <small>
                ${escapeHtml(
                  x.time
                )}
              </small>

              <h3>
                ${escapeHtml(
                  x.name
                )}
              </h3>

            </div>

            <div>

              <strong>
                ${escapeHtml(
                  x.value
                )}
              </strong>

            </div>

          </article>

        `;

      })
      .join("")

    ||

    '<p class="empty">No announcements yet.</p>';


  /*
    Count displayed results.

    Daily marker prevents refresh
    from counting again.
  */

  (items || [])
    .forEach(function(x){

      countView(x);

    });

}


/* =====================================================
   RECORD NORMALIZER
   ===================================================== */


/*
  Old record:

  ["01","Status","68"]

  New record:

  {
    id:"...",
    date:"01",
    name:"DELHI BAZAR",
    value:"68"
  }

  Both formats supported.
*/

function normalizeRecord(
  record,
  index
){

  if(
    record &&
    typeof record === "object" &&
    !Array.isArray(record)
  ){

    return {

      id:
        String(
          record.id ??
          ("legacy-" + index)
        ),

      date:
        String(
          record.date ??
          ""
        ),

      name:
        String(
          record.name ??
          record.status ??
          ""
        ),

      value:
        String(
          record.value ??
          ""
        )

    };

  }


  if(
    Array.isArray(record)
  ){

    return {

      id:
        "legacy-" + index,

      date:
        String(
          record[0] ?? ""
        ),

      name:
        String(
          record[1] ?? ""
        ),

      value:
        String(
          record[2] ?? ""
        )

    };

  }


  return {

    id:
      "legacy-" + index,

    date:"",
    name:"",
    value:""

  };

}


/* =====================================================
   PREVIOUS RECORDS
   ===================================================== */

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


  if(!month || !el)
    return;


  const rows =
    data.records?.[
      month.value
    ] || [];


  if(!rows.length){

    el.innerHTML =
      '<p class="empty">No records available.</p>';

    return;

  }


  el.innerHTML = `

    <div style="overflow-x:auto">

      <table>

        <thead>

          <tr>

            <th>Date</th>

            <th>Name</th>

            <th>Value</th>

          </tr>

        </thead>

        <tbody>

          ${
            rows
              .map(function(raw,index){

                const r =
                  normalizeRecord(
                    raw,
                    index
                  );


                return `

                  <tr>

                    <td>
                      ${escapeHtml(
                        r.date
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        r.name
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        r.value
                      )}
                    </td>

                  </tr>

                `;

              })
              .join("")
          }

        </tbody>

      </table>

    </div>

  `;

};


/* =====================================================
   RENDER
   ===================================================== */

function render(){

  cards(
    "live",
    data.live
  );


  cards(
    "next",
    data.next
  );


  /*
    Total view counter:
    LIVE + NEXT displayed results.
  */

  listenToViewCounts(

    [
      ...(data.live || []),
      ...(data.next || [])
    ]

  );


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
    .forEach(function(key){

      const option =
        document.createElement(
          "option"
        );

      option.value =
        key;

      option.textContent =
        key;

      month.appendChild(
        option
      );

    });


    if(
      [...month.options]
        .some(function(option){

          return (
            option.value ===
            current
          );

        })
    ){

      month.value =
        current;

    }


    showRecords();

  }

}


/* =====================================================
   TODAY
   ===================================================== */

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


/* =====================================================
   YEAR
   ===================================================== */

const year =
  document.getElementById(
    "year"
  );


if(year){

  year.textContent =
    new Date()
      .getFullYear();

}


/* =====================================================
   REFRESH
   ===================================================== */

let refreshing =
  false;


window.refreshResults =
function(){

  if(refreshing)
    return;


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


  /*
    Existing refresh behavior
    preserved.
  */

  setTimeout(
    function(){

      location.reload();

    },
    150
  );

};


/* =====================================================
   FIRESTORE REAL-TIME
   ===================================================== */

onSnapshot(

  siteRef,

  function(snapshot){

    if(snapshot.exists()){

      data = {

        ...fallback,

        ...snapshot.data()

      };

    }

    else{

      data = {

        ...fallback

      };

    }


    render();

  },

  function(error){

    console.error(
      "Firebase error:",
      error
    );


    /*
      Existing page still renders
      instead of becoming blank.
    */

    render();

  }

);


/* =====================================================
   INITIAL RENDER
   ===================================================== */

render();
