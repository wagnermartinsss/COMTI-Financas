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

      // 🔥 CORREÇÃO IMPORTANTE (quebra de linha da private key)
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

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

const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(firebaseConfig.firestoreDatabaseId)
  : getFirestore();

const auth = getAuth();

// 🔥 Função robusta para deletar coleções (com limite de 500)
async function deleteCollection(collectionName: string, field: string, value: string) {
  const snapshot = await db.collection(collectionName).where(field, '==', value).get();

  if (snapshot.empty) return;

  let batch = db.batch();
  let count = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;

    if (count === 500) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

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
    // 🔐 1. Validar token
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    console.log('Deleting account for UID:', uid);

    // 👥 2. Remover vínculo de parceiros
    const linkedUsersSnapshot = await db.collection('users').where('partnerId', '==', uid).get();

    if (!linkedUsersSnapshot.empty) {
      let batch = db.batch();

      linkedUsersSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          partnerId: FieldValue.delete(),
          partnerEmail: FieldValue.delete()
        });
      });

      await batch.commit();
    }

    // 🧹 3. Deletar dados COMPLETOS

    // Transactions (duas possibilidades)
    await deleteCollection('transactions', 'ownerId', uid);
    await deleteCollection('transactions', 'creatorId', uid);

    // Recorrentes
    await deleteCollection('recurringTransactions', 'ownerId', uid);

    // Categorias
    await deleteCollection('categories', 'ownerId', uid);

    // Convites (mais completo)
    await deleteCollection('invites', 'ownerId', uid);
    if (email) {
      await deleteCollection('invites', 'email', email);
    }

    // 🧹 4. Deletar usuário
    await db.collection('users').doc(uid).delete();

    // 🔥 5. Deletar Auth
    await auth.deleteUser(uid);

    console.log('Account deleted successfully:', uid);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting account:', error);

    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
}