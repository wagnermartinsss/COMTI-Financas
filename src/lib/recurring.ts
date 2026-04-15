import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { addWeeks, addMonths, addYears, endOfMonth, parseISO, format } from 'date-fns';

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
    
    const today = new Date();
    const currentMonthEnd = endOfMonth(today);

    recurringTxs.forEach(rec => {
      // Manually parse the date string to avoid timezone shifts
      const [year, month, day] = rec.startDate.split('T')[0].split('-').map(Number);
      const startDate = new Date(year, month - 1, day, 12, 0, 0);
      let currentDate = startDate;
      let iteration = 0;

      // Generate up to the end of the current month
      while (currentDate.getTime() <= currentMonthEnd.getTime()) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');

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
            date: `${dateStr}T12:00:00Z`,
            createdAt: new Date().toISOString(),
            recurringId: rec.id,
            isPending: rec.isVariableAmount ? true : false
          });
          hasNew = true;
        }

        // Increment date based on frequency from the ORIGINAL start date to prevent day shifting
        iteration++;
        if (rec.frequency === 'weekly') {
          currentDate = addWeeks(startDate, iteration);
        } else if (rec.frequency === 'yearly') {
          currentDate = addYears(startDate, iteration);
        } else {
          // Default to monthly
          currentDate = addMonths(startDate, iteration);
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
