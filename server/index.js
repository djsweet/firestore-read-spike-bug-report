const process = require("process");
const admin = require("firebase-admin");
const pLimit = require("p-limit");

const firebaseConfig = {
  projectId: "" // Set your Firebase Project ID here
};

// Run `gcloud auth application-default login` and set the resulting file
// as GOOGLE_APPLICATION_CREDENTIALS in your environment.

// Be sure to run this at least once before opening the client HTML.

if (process.env["GOOGLE_APPLICATION_CREDENTIALS"] === undefined) {
  console.error(
    `You should set GOOGLE_APPLICATION_CREDENTIALS to a credential file for this to work`
  );
  return;
}

admin.initializeApp(firebaseConfig);

const transactionBatchLimit = 50;
const concurrencyLimit = 30;
// This should be the same collection as in ../client/index.js
const targetCollection = "firestore-read-spike-testing";
const expectedDocumentCount = 15000;

const alphabet =
  "0123456789abcdefhijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generateRandomString(length) {
  let ret = "";
  for (let i = 0; i < length; i++) {
    ret += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return ret;
}

function generateRandomObject() {
  const ret = {};
  for (let i = 0; i < 4; i++) {
    ret[generateRandomString(20)] = generateRandomString(256);
  }
  return ret;
}

async function deleteAllDocuments() {
  const db = admin.firestore();
  const allDocs = await db.collection(targetCollection).get();

  const limit = pLimit(concurrencyLimit);
  const promises = [];
  const deletes = [];
  const collectionRef = db.collection(targetCollection);

  for (const { id } of allDocs.docs) {
    deletes.push(id);
    if (deletes.length >= transactionBatchLimit) {
      const toDelete = deletes.splice(0, deletes.length);
      promises.push(
        limit(() =>
          db.runTransaction(async txn => {
            for (const id of toDelete) {
              txn.delete(collectionRef.doc(id));
            }
          })
        )
      );
    }
  }

  if (deletes.length > 0) {
    promises.push(
      db.runTransaction(async txn => {
        for (const id of deletes) {
          txn.delete(collectionRef.doc(id));
        }
      })
    );
  }

  await Promise.all(promises);
}

async function generateAllDocuments() {
  const db = admin.firestore();

  const limit = pLimit(concurrencyLimit);
  const promises = [];
  const writes = [];
  const collectionRef = db.collection(targetCollection);

  for (let i = 0; i < expectedDocumentCount; i++) {
    writes.push(generateRandomObject());
    if (writes.length >= transactionBatchLimit) {
      const toWrite = writes.splice(0, writes.length);
      promises.push(
        limit(() =>
          db.runTransaction(async txn => {
            for (const write of toWrite) {
              txn.set(collectionRef.doc(), write);
            }
          })
        )
      );
    }
  }

  if (writes.length > 0) {
    promises.push(
      db.runTransaction(async txn => {
        for (const write of writes) {
          txn.set(collectionRef.doc(), write);
        }
      })
    );
  }

  await Promise.all(promises);
}

function timeDiff(startTime) {
  return Number(process.hrtime.bigint() - startTime) / 1000000;
}

async function main() {
  const startTime = process.hrtime.bigint();
  await deleteAllDocuments();
  console.log(
    `Deleted ${expectedDocumentCount} documents in ${timeDiff(startTime)} ms`
  );
  const createTime = process.hrtime.bigint();
  await generateAllDocuments();
  console.log(
    `Generated ${expectedDocumentCount} documents in ${timeDiff(createTime)} ms`
  );
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
