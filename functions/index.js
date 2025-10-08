const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function assertAdmin(context){
  if(!context.auth) throw new functions.https.HttpsError('unauthenticated','Login erforderlich');
  const token = context.auth.token || {};
  if(token.role !== 'admin') throw new functions.https.HttpsError('permission-denied','Nur Admin erlaubt');
}

// Admin erstellt neuen Benutzer + Rolle + Profil
exports.createManiacUser = functions.https.onCall(async (data, context)=>{
  await assertAdmin(context);
  const { email, password, role='member', displayName='' } = data || {};
  if(!email || !password) throw new functions.https.HttpsError('invalid-argument','email & password erforderlich');

  const user = await admin.auth().createUser({ email, password, displayName, emailVerified: false, disabled: false });
  await admin.auth().setCustomUserClaims(user.uid, { role });

  await db.collection('users').doc(user.uid).set({
    uid: user.uid, email, displayName, role, createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { ok:true, uid:user.uid };
});

// Rolle ändern
exports.setManiacRole = functions.https.onCall(async (data, context)=>{
  await assertAdmin(context);
  const { uid, role } = data || {};
  if(!uid || !role) throw new functions.https.HttpsError('invalid-argument','uid & role erforderlich');
  await admin.auth().setCustomUserClaims(uid, { role });
  await db.collection('users').doc(uid).set({ role }, { merge:true });
  return { ok:true };
});
