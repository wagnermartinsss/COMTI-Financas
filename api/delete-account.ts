import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// 🔥 Inicialização correta do Firebase Admin (VERSÃO FINAL)
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

const db = getFirestore();
const auth = getAuth();

// 🔥 Função robusta para deletar (suporta +500 docs)
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
  // 🔐 CORS (Vercel)
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
          partnerEmail: FieldValue.delete(),
        });
      });

      await batch.commit();
    }

    // 🧹 3. Deletar TODOS os dados relacionados

    // Transactions
    await deleteCollection('transactions', 'ownerId', uid);
    await deleteCollection('transactions', 'creatorId', uid);

    // Recurring
    await deleteCollection('recurringTransactions', 'ownerId', uid);

    // Categories
    await deleteCollection('categories', 'ownerId', uid);

    // Invites
    await deleteCollection('invites', 'ownerId', uid);
    if (email) {
      await deleteCollection('invites', 'email', email);
    }

    // 🧹 4. Deletar documento do usuário
    await db.collection('users').doc(uid).delete();

    // 🔥 5. Deletar Auth
    await auth.deleteUser(uid);

    console.log('Account deleted successfully:', uid);

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
    });

  } catch (error: any) {
    console.error('Error deleting account:', error);

    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}