import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePeriod } from '../contexts/PeriodContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { formatCurrency } from '../lib/utils';
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, RefreshCw, CalendarPlus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MonthSelector from '../components/MonthSelector';
import TransactionModal from '../components/TransactionModal';
import ApplyRecurrencesModal from '../components/ApplyRecurrencesModal';
import toast from 'react-hot-toast';

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string;
  recurringId?: string;
}

export default function Transactions() {
  const { ownerId } = useAuth();
  const { currentDate, startDateISO, endDateISO } = usePeriod();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>();
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [deleteFutureRecurrences, setDeleteFutureRecurrences] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  useEffect(() => {
    if (!ownerId) return;

    const q = query(
      collection(db, 'transactions'),
      where('ownerId', '==', ownerId),
      where('date', '>=', startDateISO),
      where('date', '<=', endDateISO),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Transaction[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      setTransactions(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    return () => unsubscribe();
  }, [ownerId, startDateISO, endDateISO]);

  const handleDeleteClick = (e: React.MouseEvent, transaction: Transaction) => {
    e.stopPropagation();
    setTransactionToDelete(transaction);
    setDeleteFutureRecurrences(false);
  };

  const confirmDelete = async () => {
    if (!transactionToDelete) return;
    try {
      await deleteDoc(doc(db, 'transactions', transactionToDelete.id));
      
      if (transactionToDelete.recurringId) {
        if (deleteFutureRecurrences) {
          try {
            await deleteDoc(doc(db, 'recurringTransactions', transactionToDelete.recurringId));
          } catch (recError) {
            console.warn('Erro ao excluir template recorrente:', recError);
          }
        } else {
          try {
            const txDate = new Date(transactionToDelete.date);
            const monthStr = format(txDate, 'yyyy-MM');
            
            await addDoc(collection(db, 'recurringSkips'), {
              recurringId: transactionToDelete.recurringId,
              ownerId: transactionToDelete.ownerId,
              month: monthStr
            });
          } catch (recError) {
            console.warn('Erro ao registrar skip da recorrência:', recError);
          }
        }
      }
      
      toast.success('Transação excluída!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${transactionToDelete.id}`);
      toast.error('Erro ao excluir transação.');
    } finally {
      setTransactionToDelete(null);
    }
  };

  const handleTransactionClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const filteredTransactions = transactions.filter(t => typeFilter === 'all' || t.type === typeFilter);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Transações</h1>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <MonthSelector />
          <button
            onClick={() => setIsRecurrenceModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium shadow-sm"
          >
            <CalendarPlus className="w-5 h-5 text-blue-600" />
            Aplicar Recorrências
          </button>
          <button
            onClick={() => {
              setSelectedTransaction(undefined);
              setIsModalOpen(true);
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-bold shadow-lg shadow-blue-200"
          >
            <Plus className="w-5 h-5" />
            Nova Transação
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              typeFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setTypeFilter('income')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              typeFilter === 'income' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            Receitas
          </button>
          <button
            onClick={() => setTypeFilter('expense')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              typeFilter === 'expense' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            Despesas
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-medium text-gray-500 text-sm">Descrição</th>
                <th className="p-4 font-medium text-gray-500 text-sm">Categoria</th>
                <th className="p-4 font-medium text-gray-500 text-sm">Data</th>
                <th className="p-4 font-medium text-gray-500 text-sm text-right">Valor</th>
                <th className="p-4 font-medium text-gray-500 text-sm text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTransactions.map((transaction) => (
                <tr 
                  key={transaction.id} 
                  onClick={() => handleTransactionClick(transaction)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        transaction.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {transaction.type === 'income' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{transaction.description}</span>
                        {transaction.recurringId && (
                          <RefreshCw className="w-3 h-3 text-blue-500" title="Transação Recorrente" />
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">{transaction.category}</td>
                  <td className="p-4 text-gray-600">
                    {format(new Date(transaction.date.split('T')[0] + 'T12:00:00'), "dd MMM yyyy", { locale: ptBR })}
                  </td>
                  <td className={`p-4 text-right font-medium ${
                    transaction.isPending ? 'text-orange-500' : transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.isPending ? (
                      <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">A definir</span>
                    ) : (
                      <>{transaction.type === 'income' ? '+' : '-'} {formatCurrency(transaction.amount)}</>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={(e) => handleDeleteClick(e, transaction)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    Nenhuma transação encontrada para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTransaction(undefined);
        }} 
        transactionToEdit={selectedTransaction} 
      />

      <ApplyRecurrencesModal
        isOpen={isRecurrenceModalOpen}
        onClose={() => setIsRecurrenceModalOpen(false)}
        currentDate={currentDate}
      />

      {transactionToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Transação</h3>
            <p className="text-gray-600 mb-2">
              Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.
            </p>
            {transactionToDelete.recurringId && (
              <div className="mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
                <p className="text-blue-800 text-sm font-medium mb-3">
                  Esta é uma transação recorrente. O que deseja fazer?
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteFutureRecurrences}
                    onChange={(e) => setDeleteFutureRecurrences(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-blue-900">
                    <strong className="block">Excluir também a recorrência</strong>
                    Se marcado, esta transação não será mais gerada nos próximos meses.
                  </span>
                </label>
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setTransactionToDelete(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
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
