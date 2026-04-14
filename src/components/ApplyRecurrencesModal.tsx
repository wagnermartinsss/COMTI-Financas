import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { X, CheckSquare, Square, AlertCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../lib/utils';
import { startOfMonth, endOfMonth, getDaysInMonth, getDate, setDate, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ApplyRecurrencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDate: Date;
}

interface Recurrence {
  id: string;
  description: string;
  amount: number;
  category: string;
  frequency: string;
  type: 'income' | 'expense';
  startDate: string;
  creatorId: string;
  ownerId: string;
}

export default function ApplyRecurrencesModal({ isOpen, onClose, currentDate }: ApplyRecurrencesModalProps) {
  const { user, ownerId } = useAuth();
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [existingTxRecurringIds, setExistingTxRecurringIds] = useState<Set<string>>(new Set());
  const [skippedRecurringIds, setSkippedRecurringIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recurrenceToDelete, setRecurrenceToDelete] = useState<Recurrence | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!isOpen || !ownerId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all recurrences
        const recQuery = query(collection(db, 'recurringTransactions'), where('ownerId', '==', ownerId));
        const recSnapshot = await getDocs(recQuery);
        const recData = recSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recurrence));
        setRecurrences(recData);

        // Fetch existing transactions for the current month to check what's already applied
        const startIso = startOfMonth(currentDate).toISOString();
        const endIso = endOfMonth(currentDate).toISOString();
        
        const txQuery = query(
          collection(db, 'transactions'),
          where('ownerId', '==', ownerId),
          where('date', '>=', startIso),
          where('date', '<=', endIso)
        );
        const txSnapshot = await getDocs(txQuery);
        
        const appliedIds = new Set<string>();
        txSnapshot.forEach(doc => {
          const data = doc.data();
          if (data.recurringId) {
            appliedIds.add(data.recurringId);
          }
        });
        
        setExistingTxRecurringIds(appliedIds);
        
        // Fetch skips for the current month
        const currentMonthStr = format(currentDate, 'yyyy-MM');
        const skipsQuery = query(
          collection(db, 'recurringSkips'),
          where('ownerId', '==', ownerId),
          where('month', '==', currentMonthStr)
        );
        const skipsSnapshot = await getDocs(skipsQuery);
        const skippedIds = new Set<string>();
        skipsSnapshot.forEach(doc => {
          skippedIds.add(doc.data().recurringId);
        });
        setSkippedRecurringIds(skippedIds);
        
        // Auto-select those that are not applied and not skipped yet
        const toSelect = new Set<string>();
        recData.forEach(r => {
          if (!appliedIds.has(r.id) && !skippedIds.has(r.id)) {
            toSelect.add(r.id);
          }
        });
        setSelectedIds(toSelect);
        
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'recurringTransactions');
        toast.error('Erro ao carregar recorrências.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, ownerId, currentDate]);

  if (!isOpen) return null;

  const toggleSelection = (id: string) => {
    if (existingTxRecurringIds.has(id)) return; // Cannot select already applied
    
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const confirmDeleteRecurrence = async () => {
    if (!recurrenceToDelete) return;
    try {
      await deleteDoc(doc(db, 'recurringTransactions', recurrenceToDelete.id));
      setRecurrences(prev => prev.filter(r => r.id !== recurrenceToDelete.id));
      
      // Also remove from selectedIds if it was selected
      if (selectedIds.has(recurrenceToDelete.id)) {
        const newSelection = new Set(selectedIds);
        newSelection.delete(recurrenceToDelete.id);
        setSelectedIds(newSelection);
      }
      
      toast.success('Molde de recorrência excluído!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `recurringTransactions/${recurrenceToDelete.id}`);
      toast.error('Erro ao excluir recorrência.');
    } finally {
      setRecurrenceToDelete(null);
    }
  };

  const handleApply = async () => {
    if (!user || !ownerId || selectedIds.size === 0) return;
    
    setApplying(true);
    try {
      const batch = writeBatch(db);
      let hasNew = false;
      
      const selectedRecurrences = recurrences.filter(r => selectedIds.has(r.id));
      
      selectedRecurrences.forEach(rec => {
        // Calculate the date for this month
        const originalStartDate = new Date(rec.startDate.split('T')[0]);
        const originalDay = getDate(originalStartDate);
        const daysInCurrentMonth = getDaysInMonth(currentDate);
        
        // Use the original day, or the last day of the month if it exceeds
        const targetDay = Math.min(originalDay, daysInCurrentMonth);
        
        // Create a new date based on currentDate's year and month, but with targetDay
        const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), targetDay);
        
        // Adjust timezone to UTC midnight equivalent string
        const dateStr = targetDate.toISOString().split('T')[0];
        
        const newTxRef = doc(collection(db, 'transactions'));
        batch.set(newTxRef, {
          ownerId: rec.ownerId,
          creatorId: user.uid,
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
      });

      if (hasNew) {
        await batch.commit();
        toast.success(`${selectedIds.size} recorrência(s) aplicada(s) com sucesso!`);
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
      toast.error('Erro ao aplicar recorrências.');
    } finally {
      setApplying(false);
    }
  };

  const translateFrequency = (freq: string) => {
    switch (freq) {
      case 'weekly': return 'Semanal';
      case 'monthly': return 'Mensal';
      case 'yearly': return 'Anual';
      default: return freq;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Aplicar Recorrências</h2>
            <p className="text-sm text-gray-500 mt-1 capitalize">
              Para o mês de {format(currentDate, "MMMM yyyy", { locale: ptBR })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-8 text-gray-500">Carregando...</div>
          ) : recurrences.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhuma transação recorrente encontrada.
            </div>
          ) : (
            <div className="space-y-3">
              {recurrences.map(rec => {
                const isApplied = existingTxRecurringIds.has(rec.id);
                const isSkipped = skippedRecurringIds.has(rec.id);
                const isSelected = selectedIds.has(rec.id);
                
                return (
                  <div 
                    key={rec.id}
                    onClick={() => toggleSelection(rec.id)}
                    className={`p-4 rounded-xl border flex items-center gap-4 transition-colors ${
                      isApplied 
                        ? 'bg-gray-50 border-gray-200 opacity-75 cursor-not-allowed' 
                        : isSkipped
                          ? 'bg-orange-50 border-orange-200 cursor-pointer'
                          : isSelected
                            ? 'bg-blue-50 border-blue-200 cursor-pointer'
                            : 'bg-white border-gray-200 cursor-pointer hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {isApplied ? (
                        <div className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center text-gray-500">
                          <CheckSquare className="w-4 h-4" />
                        </div>
                      ) : isSelected ? (
                        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white">
                          <CheckSquare className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded border-2 border-gray-300 flex items-center justify-center text-transparent">
                          <Square className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`font-medium truncate ${isApplied ? 'text-gray-500' : 'text-gray-900'}`}>
                          {rec.description}
                        </p>
                        <span className={`font-semibold whitespace-nowrap ${
                          isApplied ? 'text-gray-400' : rec.type === 'income' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {rec.isVariableAmount ? 'A definir' : `${rec.type === 'income' ? '+' : '-'} ${formatCurrency(rec.amount)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>{rec.category}</span>
                        <span>•</span>
                        <span>{translateFrequency(rec.frequency)}</span>
                        {isApplied && (
                          <>
                            <span>•</span>
                            <span className="text-green-600 font-medium flex items-center gap-1">
                              <CheckSquare className="w-3 h-3" /> Já aplicado neste mês
                            </span>
                          </>
                        )}
                        {isSkipped && !isApplied && (
                          <>
                            <span>•</span>
                            <span className="text-orange-600 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Ignorado neste mês
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecurrenceToDelete(rec);
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2 flex-shrink-0"
                      title="Excluir molde de recorrência"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || selectedIds.size === 0}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {applying ? 'Aplicando...' : `Aplicar ${selectedIds.size} selecionada(s)`}
          </button>
        </div>
      </div>

      {recurrenceToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Recorrência</h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja excluir a recorrência "{recurrenceToDelete.description}"? Ela não será mais gerada nos próximos meses.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRecurrenceToDelete(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteRecurrence}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
