import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Load Firebase config
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (err) {
  console.warn('Could not load firebase-applet-config.json', err);
}

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: firebaseConfig.projectId
      });
    } else {
      initializeApp({
        projectId: firebaseConfig.projectId
      });
    }
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

const db = firebaseConfig.firestoreDatabaseId ? getFirestore(firebaseConfig.firestoreDatabaseId) : getFirestore();
const auth = getAuth();

export default async function handler(req: any, res: any) {
  // CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 1. Remove partner links where this user is the owner
    const linkedUsersSnapshot = await db.collection('users').where('partnerId', '==', uid).get();
    if (!linkedUsersSnapshot.empty) {
      const linkedBatch = db.batch();
      linkedUsersSnapshot.docs.forEach((doc) => {
        linkedBatch.update(doc.ref, {
          partnerId: FieldValue.delete(),
          partnerEmail: FieldValue.delete()
        });
      });
      await linkedBatch.commit();
    }

    // 2. Delete user data in collections
    const collectionsToDelete = ['transactions', 'recurringTransactions', 'invites', 'categories'];
    
    for (const collectionName of collectionsToDelete) {
      const snapshot = await db.collection(collectionName).where('ownerId', '==', uid).get();
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }
    }

    // 3. Delete user document
    await db.collection('users').doc(uid).delete();

    // 4. Delete user from Firebase Auth
    await auth.deleteUser(uid);

    res.status(200).json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
