// Usage:
// 1) Create a Service Account key in Firebase Console (Project Settings -> Service accounts)
// 2) Download JSON and set env:  set GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json
// 3) Run: node tools/bootstrap-admin.js <email>
const admin = require('firebase-admin');
const path = require('path');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Please set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON.');
  process.exit(1);
}
const email = process.argv[2];
if(!email){ console.error('Usage: node tools/bootstrap-admin.js <email>'); process.exit(1); }

admin.initializeApp({});
(async () => {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
  console.log('Set role=admin for', email, 'uid:', user.uid);
  process.exit(0);
})().catch(err=>{ console.error(err); process.exit(1); });
