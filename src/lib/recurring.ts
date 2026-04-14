import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { addWeeks, addMonths, addYears, isAfter } from 'date-fns';

export async function processRecurringTransactions(ownerId: string) {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // 1. Fetch recurring transactions
    const recurringQuery = query(collection(db, 'recurringTransactions'), where('ownerId', '==', ownerId));
    const recurringSnapshot = await getDocs(recurringQuery);
    
    if (recurringSnapshot.empty) return;

    const recurringTxs = recurringSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

    // 2. Fetch existing transactions to avoid duplicates
    const txQuery = query(collection(db, 'transactions'), where('ownerId', '==', ownerId));
    const txSnapshot = await getDocs(txQuery);
    const existingTxs = txSnapshot.docs.map(doc => doc.data());

    // 3. Fetch skips to avoid recreating deleted recurring transactions
    const skipsQuery = query(collection(db, 'recurringSkips'), where('ownerId', '==', ownerId));
    const skipsSnapshot = await getDocs(skipsQuery);
    const skips = skipsSnapshot.docs.map(doc => doc.data());

    const batch = writeBatch(db);
    let hasNew = false;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todayDate = new Date(todayStr); // UTC midnight of today

    recurringTxs.forEach(rec => {
      let currentDate = new Date(rec.startDate.split('T')[0]); // UTC midnight of start date

      // While currentDate is <= todayDate
      while (currentDate.getTime() <= todayDate.getTime()) {
        const dateStr = currentDate.toISOString().split('T')[0];

        // Check if transaction already exists for this recurringId and date
        const exists = existingTxs.some(tx => 
          tx.recurringId === rec.id && 
          tx.date.startsWith(dateStr)
        );

        // Check if this specific month was skipped (deleted by user)
        const monthStr = dateStr.substring(0, 7); // YYYY-MM
        const isSkipped = skips.some(skip => 
          skip.recurringId === rec.id && 
          skip.month === monthStr
        );

        if (!exists && !isSkipped) {
          const newTxRef = doc(collection(db, 'transactions'));
          batch.set(newTxRef, {
            ownerId: rec.ownerId,
            creatorId: userId,
            type: rec.type,
            amount: rec.isVariableAmount ? 0 : rec.amount,
            category: rec.category,
            description: rec.description,
            date: new Date(dateStr).toISOString(),
            createdAt: new Date().toISOString(),
            recurringId: rec.id,
            isPending: rec.isVariableAmount ? true : false
          });
          hasNew = true;
        }

        // Increment date based on frequency
        if (rec.frequency === 'weekly') {
          currentDate = addWeeks(currentDate, 1);
        } else if (rec.frequency === 'monthly') {
          currentDate = addMonths(currentDate, 1);
        } else if (rec.frequency === 'yearly') {
          currentDate = addYears(currentDate, 1);
        } else {
          break; // Fallback to avoid infinite loop
        }
      }
    });

    if (hasNew) {
      await batch.commit();
    }
  } catch (error) {
    console.error("Error processing recurring transactions:", error);
  }
}
