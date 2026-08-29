# MK TIME — Shared Database Version

This version uses Firebase Authentication + Cloud Firestore so admin changes can be shared with all visitors.

## One-time Firebase setup
1. Create a Firebase project.
2. Add a Web App and copy its config into `firebase-config.js`.
3. Enable Authentication → Email/Password.
4. Create exactly one admin user in Authentication → Users. Do not enable public sign-up.
5. Create a Cloud Firestore database.
6. In Firestore Rules, paste the contents of `firestore.rules` and publish.
7. Upload all files to the GitHub repository. Keep the files in the same folder.

## Admin
Open `admin.html`, sign in with the Firebase admin email/password, then add/edit/lock/delete announcement boxes. The Change Password form updates the Firebase account password.

## Important
The Firebase config is intentionally left as placeholders until you create your own project. Do not put a Firebase service-account private key in GitHub.
