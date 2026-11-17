# Firebase setup

This dashboard stores Firebase data directly from the browser using the Firebase Web SDK. It signs in anonymously and only allows a client to read or write its own `/users/{uid}` data.

## 1. Create the Firebase project and web app

In the [Firebase console](https://console.firebase.google.com/), create or open a project. Add a Web app and copy its config values. The Web API key is used by the client SDK; database security comes from Authentication and the database rules below, not from hiding that key.

## 2. Create a Realtime Database

In **Build → Realtime Database**, create a database. Copy the database URL shown in the console exactly. It may use either the `firebaseio.com` or `firebasedatabase.app` domain.

## 3. Enable anonymous sign-in

Open **Build → Authentication**. If prompted, click **Get started**. Under **Sign-in method**, enable **Anonymous** and save. The dashboard uses this to create a per-browser identity.

## 4. Publish the database rules

In **Realtime Database → Rules**, paste the contents of [`firebase-database.rules.json`](./firebase-database.rules.json) and click **Publish**. These rules deny access outside each authenticated user's own `users/{uid}` path. Do not enable public read/write rules.

## 5. Add the Web app config to the dashboard

Copy [`.env.example`](./.env.example) to `.env.local` in this `dashboard` folder, then replace each sample value with the corresponding Web app config value. Vite also reads a file named `.env`; both filenames are ignored by Git here.

```dotenv
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-web-app-id
```

Use the actual `databaseURL` from the console rather than assuming the sample domain. `.env.local` is ignored by Git. Restart the dashboard after changing it:

```sh
cd dashboard
npm run dev
```

Start Wokwi as before. The dashboard header should show **Firebase: Connected**. If it shows an error, check the browser console and confirm the Web app config, Anonymous provider, and rules.

If the status reports `auth/configuration-not-found`, open **Authentication** in the same project named by `VITE_FIREBASE_PROJECT_ID`. Click **Get started** if Authentication has not been initialized, then enable **Anonymous**. Also verify that `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, and the other Web app config values all came from that same project. Restart Vite after changing the env file.

## Stored paths

```text
users/{anonymous-uid}/latestTelemetry
users/{anonymous-uid}/telemetry/{push-id}
users/{anonymous-uid}/actions/{push-id}
```

The dashboard stores one telemetry sample per minute and overwrites `latestTelemetry`. Completed corrective-action results are stored as separate records. Telemetry history is append-only; delete old records in the Firebase console if you want to reduce stored data. Anonymous identity is per browser, so another browser/device gets a different data path unless you later add a permanent sign-in provider.

## Documentation

- [Firebase Web setup](https://firebase.google.com/docs/database/web/start)
- [Realtime Database read and write](https://firebase.google.com/docs/database/web/read-and-write)
- [Anonymous sign-in](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Realtime Database security rules](https://firebase.google.com/docs/database/security)
