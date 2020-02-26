This is in service of an upcoming [Firebase JavaScriptSDK](https://github.com/firebase/firebase-js-sdk) bug report.

## Background

We use [Cloud Firestore](https://cloud.google.com/firestore) to power [Glide](https://www.glideapps.com), which
lets anyone create amazing apps without a single line of code. Our data infrastructure uses the realtime update
capabilities of Cloud Firestore to supply apps with their data. Since early January 2020, we have encountered
periods of quadrupled document read rates. This problem always began at 7:00 AM PST, and always went away when
we forced all apps to reload due to software upgrades.

We have narrowed down the cause to a single app developer's workflow. This user maintains a very heavily used
app, with hundreds of thousands of monthly users and tens of thousands of rows in their Google Sheet. They have scripts
that run at 7:00 AM PST that migrate data into their Google Sheet, but recently the script timed out during execution.
The observable result was that 15,000 documents were deleted, followed by 15,000 documents being created.

Following this series of events, we experienced a read rate of 20 million rows per hour, 15 million rows per hour over
what we expect under normal conditions. This elevated read rate continued until we forced all clients to reload due
to a software update.

This project simulates the sequence of events in the most minimal way possible. A simple "server" script deletes 15,000
documents, then creates 15,000 new documents. These are performed in up to 30 concurrent transactions servicing 50
create/delete operations each. Each document consists of four key-value pairs, where each key is 20 characters long
and each value is a 256 character string. We anticipate that 15MiB of new data is read each time the "server" script is run.
The "client" merely listens to the collection, but has the ability to disable and enable the network connection to Firestore
to facilitate additional setup.

## The Bug

A Firestore Client on a slow connection, e.g. Google Chrome with the Slow 3G throttling preset enabled, will enter an
uncontrollable long-polling loop when attempting to listen to a collection in which large changesets are occurring. This
long-polling loop will cause document reads to be metered as if they were actually performed by the end client, but the
results are not always realized by consumers of the Firebase SDK. This results in extremely financially expensive and
functionally useless Firestore connections, which cannot be easily terminated unless special care has been taken by
developers to terminate these connections out-of-band.

## Caveats

This project does not verify that all expected document changes are transmitted to the Firebase SDK consumer. While we have
seen the Firebase SDK report that all new documents were added in a slow network environment, we have not verified that this
reported number is accurate. We have seen that the document removals have never been reported in this scenario. The local Firestore
cache seems to expect that documents have been added, but not removed.

We believe this issue exists in Firebase SDK 7.9.1, Firebase SDK 7.6.2, and Firebase SDK 7.2.3, but have only tested against
Firebase SDK 7.9.1.

## Prerequisites

You need to have a Firebase App with a Cloud Firestore instance in order to run this demonstration. Please consult the
[Firebase Documentation](https://firebase.google.com/docs/web/setup/)
for more information on how to create these instances if you do not already have them prepared.

You should also have the [`gcloud` Command Line Tool](https://cloud.google.com/sdk/gcloud)
installed. You will need it to obtain credentials to run the server script.

## Setup

### Step 1: Hard code the relevant credentials

Update
[the server]()
with your Firebase Project ID, and
[the client]()
with both your Firebase Project ID and your
Web API Key.

### Step 2: Install server dependencies

In `server/`, run `npm install`. This will give you the necessary dependencies to run this demonstration. Note that
the server dependencies should remain constant throughout the demonstration.

### Step 3: Acquire GCP Default Application Credentials

Run `gcloud auth application-default login` in an interactive shell and follow the prompts in your web browser. Once you
have followed the prompts in the browser, you will see a line in the interactive shell similar to this:

```
Credentials saved to file: [ ... ]
```

You will need to expose this file as an environment variable called `GOOGLE_APPLICATION_CREDENTIALS` for the server script.
Ensure that you always execute the server script with this environment variable set.

### Step 4: Prime the database

In order for the demonstration to execute correctly, all documents in the target collection must already exist. Running the
server script once before opening the client to ensures that they are created.

Simply run `node server/index.js` from the top-level directory of this repository to execute the server script.

## Testing

## Step 1: Open the client

Open `client/index.html` from the top-level directory of this repository in your web browser. You can do so without
involving a web server; all code can run directly from your local filesystem.

On first load, you should see a table with rows for the Firebase SDK version, the number of expected documents,
the number of documents that the local Firestore cache expects, and the last time that the Firebase SDK triggered
the listening handler. Below this table is a button that says "Disable Network".

The initial value for "Expected documents", "Current documents", and "Last update at" will be "Wait". These will be
populated when the initial connection is performed.

Below this button is a table with "Timestamp", "Change type", and "Affected documents" columns. Page setup is complete
when two rows are present in this table. The first row will have a "Change type" of "initial", and the second row will
have a "Change type" of "added". Both rows should have "Affected documents" equal to "Current documents" in the first table.

As soon as the "initial" and "added" rows appear in the second table, proceed to step 2.

## Step 2: Prepare the network environment

Click on "Disable Network", and wait for the button to be enabled and read "Enable Network". Doing so disables the
Firestore network connection so that the backend mutations can occur without being prematurely read.

Throttle the page's network connection to an extremely slow value, e.g. 200Kb/s or 20KB/s. This is necessary to reproduce
the pathological long-polling loop behavior. On Google Chrome, this is done through the Network tab of the Developer Console.
We are able to reproduce the behavior with Chrome's "Slow 3G" preset.

## Step 3: Run the server scripts again

This invocation of the server script will simulate the exact conditions that result in this bug.

## Step 4: Re-enable the network connection in the client

Click the "Enable Network" button. This will re-enable the Firestore network connection.

## Step 5: Monitor the network connections within the page

Our testing indicates that we should expect a very long download session, lasting approximately 270 seconds with
the Slow 3G throttling preset in Google Chrome, followed by a perpetual loop of 70 second download sessions.

## Step 6: Monitor the document reads in the Firestore Console

Every 70 seconds, you should see that the read metrics increase by the number of documents removed from the database.
