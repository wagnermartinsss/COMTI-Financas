import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePeriod } from '../contexts/PeriodContext';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { formatCurrency } from '../lib/utils';
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, RefreshCw, CalendarPlus, Lightbulb, Sparkles, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import MonthSelector from '../components/MonthSelector';
import TransactionModal from '../components/TransactionModal';
import ApplyRecurrencesModal from '../components/ApplyRecurrencesModal';
import toast from 'react-hot-toast';
import { getFinancialInsights, AIInsights } from '../services/aiService';
import { motion, AnimatePresence } from 'framer-motion';

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

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      }
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

  const handleGetInsights = async () => {
    if (filteredTransactions.length === 0) {
      toast.error('Nenhuma transação para analisar neste mês.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const insights = await getFinancialInsights(filteredTransactions);
      setAiInsights(insights);
      setShowInsights(true);
      toast.success('Análise concluída!');
    } catch (error) {
      console.error('Erro ao obter insights:', error);
      toast.error('Erro ao processar análise inteligente.');
    } finally {
      setIsAnalyzing(false);
    }
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
            onClick={handleGetInsights}
            disabled={isAnalyzing}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors font-medium shadow-sm disabled:opacity-50"
          >
            {isAnalyzing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Lightbulb className="w-5 h-5" />
            )}
            {isAnalyzing ? 'Analisando...' : 'Onde posso economizar?'}
          </button>
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
          {isMobile ? (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((transaction) => (
                <div 
                  key={transaction.id} 
                  onClick={() => handleTransactionClick(transaction)}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        transaction.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {transaction.type === 'income' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">{transaction.description}</span>
                          {transaction.recurringId && (
                            <RefreshCw className="w-3 h-3 text-blue-500 flex-shrink-0" title="Transação Recorrente" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{transaction.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${
                        transaction.isPending ? 'text-orange-500' : transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.isPending ? (
                          <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold uppercase">A definir</span>
                        ) : (
                          <>{transaction.type === 'income' ? '+' : '-'} {formatCurrency(transaction.amount)}</>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {format(new Date(transaction.date.split('T')[0] + 'T12:00:00'), "dd/MM/yy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => handleDeleteClick(e, transaction)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
              </tbody>
            </table>
          )}
          {filteredTransactions.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              Nenhuma transação encontrada para este período.
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {aiInsights && showInsights && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100 shadow-sm space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-amber-900">Análise Inteligente</h2>
                  <p className="text-xs text-amber-700">Baseado nas transações de {format(currentDate, "MMMM yyyy", { locale: ptBR })}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowInsights(false)}
                className="text-amber-400 hover:text-amber-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/40">
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wider mb-1">Total Gasto</p>
                <p className="text-xl font-bold text-amber-900">{formatCurrency(aiInsights.resumo.totalGasto)}</p>
              </div>
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/40">
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wider mb-1">Maior Categoria</p>
                <p className="text-xl font-bold text-amber-900">{aiInsights.resumo.categoriaPrincipal}</p>
              </div>
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/40">
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wider mb-1">Peso no Orçamento</p>
                <p className="text-xl font-bold text-amber-900">{aiInsights.resumo.percentualPrincipal.toFixed(1)}%</p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-amber-900 leading-relaxed italic">"{aiInsights.mensagemIA}"</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                    <Lightbulb className="w-4 h-4" /> Insights e Alertas
                  </h3>
                  <ul className="space-y-2">
                    {aiInsights.alertas.map((alerta, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        {alerta}
                      </li>
                    ))}
                    {aiInsights.insights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                    <ArrowDownCircle className="w-4 h-4" /> Oportunidades de Economia
                  </h3>
                  <div className="space-y-2">
                    {aiInsights.oportunidades.map((op, i) => (
                      <div key={i} className="bg-white/40 p-3 rounded-lg border border-white/20 flex justify-between items-center">
                        <span className="text-sm text-amber-900">{op.descricao}</span>
                        <span className="text-sm font-bold text-green-700">-{formatCurrency(op.economiaEstimada)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
