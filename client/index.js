// Set your Firebase API Key and Project ID here
const firebaseConfig = {
  apiKey: "",
  projectId: ""
};

// This should be the same collection as in ../server/index.js
const targetCollection = "firestore-read-spike-testing";
let documentCount = 0;
let lastUpdateTimestamp;

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  document.getElementById("firebase-sdk-field").innerText =
    firebase.SDK_VERSION;
}

function writeListenerChange(changeType, changedDocuments, allDocuments) {
  const rightNow = new Date().toLocaleString();
  const table = document.getElementById("update-data-table");
  const tableRow = document.createElement("tr");

  const timestampCell = document.createElement("td");
  timestampCell.innerText = rightNow;
  tableRow.append(timestampCell);

  const changeTypeCell = document.createElement("td");
  changeTypeCell.innerText = changeType;
  tableRow.append(changeTypeCell);

  const changedDocumentsCell = document.createElement("td");
  changedDocumentsCell.innerText = `${changedDocuments}`;
  tableRow.append(changedDocumentsCell);

  table.append(tableRow);

  document.getElementById("last-update-field").innerText = rightNow;
  document.getElementById(
    "current-document-count"
  ).innerText = `${allDocuments}`;
}

async function fetchInitials() {
  const db = firebase.firestore();
  const allDocuments = await db.collection(targetCollection).get();
  const numDocs = allDocuments.docs.length;
  document.getElementById("expected-document-count").innerText = `${numDocs}`;
  writeListenerChange("initial", numDocs, numDocs);
}

function setupListener() {
  const db = firebase.firestore();
  db.collection(targetCollection).onSnapshot(
    snapshot => {
      const countsByType = {};

      for (const change of snapshot.docChanges()) {
        if (countsByType[change.type] === undefined) {
          countsByType[change.type] = 0;
        }
        countsByType[change.type]++;
      }

      for (const changeType of Object.keys(countsByType)) {
        writeListenerChange(
          changeType,
          countsByType[changeType],
          snapshot.size
        );
      }
    },
    error => {
      writeListenerChange(`error: ${error}`, 0, 0);
    }
  );
}

let networkDisabled = false;

async function toggleNetworkAvailability() {
  const db = firebase.firestore();
  const button = document.getElementById("disable-network-button");
  button.setAttribute("disabled", "yes");
  if (networkDisabled) {
    button.innerText = "Enabling Network";
    await db.enableNetwork();
    networkDisabled = false;
    button.innerText = "Disable Network";
  } else {
    button.innerText = "Disabling Network";
    await db.disableNetwork();
    networkDisabled = true;
    button.innerText = "Enable Network";
  }
  button.removeAttribute("disabled");
}

async function firstRun() {
  initFirebase();
  await fetchInitials();
  setupListener();
  const networkButton = document.getElementById("disable-network-button");
  networkButton.onclick = toggleNetworkAvailability;
  networkButton.removeAttribute("disabled");
}

window.onload = () => {
  firstRun().catch(e => console.error(e));
};
