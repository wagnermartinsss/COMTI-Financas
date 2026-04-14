import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePeriod } from '../contexts/PeriodContext';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { formatCurrency } from '../lib/utils';
import { ArrowDownCircle, ArrowUpCircle, Wallet, RefreshCw, PieChart as PieChartIcon } from 'lucide-react';
import { processRecurringTransactions } from '../lib/recurring';
import MonthSelector from '../components/MonthSelector';
import TransactionModal from '../components/TransactionModal';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string;
  recurringId?: string;
  isPending?: boolean;
}

export default function Dashboard() {
  const { ownerId, userProfile } = useAuth();
  const { startDateISO, endDateISO } = usePeriod();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRecurrences, setProcessingRecurrences] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>();

  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    if (!ownerId) return;

    let unsubscribe: () => void;

    const init = async () => {
      setProcessingRecurrences(true);
      await processRecurringTransactions(ownerId);
      setProcessingRecurrences(false);

      const q = query(
        collection(db, 'transactions'),
        where('ownerId', '==', ownerId),
        where('date', '>=', startDateISO),
        where('date', '<=', endDateISO),
        orderBy('date', 'desc')
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
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
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [ownerId, startDateISO, endDateISO]);

  // ✅ MEMOIZAÇÃO
  const totalIncome = useMemo(() =>
    transactions
      .filter(t => t.type === 'income' && !t.isPending)
      .reduce((acc, curr) => acc + curr.amount, 0)
  , [transactions]);

  const totalExpense = useMemo(() =>
    transactions
      .filter(t => t.type === 'expense' && !t.isPending)
      .reduce((acc, curr) => acc + curr.amount, 0)
  , [transactions]);

  const balance = totalIncome - totalExpense;

  const expensesByCategory = useMemo(() => {
    return transactions
      .filter(t => t.type === 'expense' && !t.isPending)
      .reduce((acc, curr) => {
        acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
        return acc;
      }, {} as Record<string, number>);
  }, [transactions]);

  const pieData = useMemo(() => {
    return Object.entries(expensesByCategory)
      .map(([name, value]) => ({
        name,
        value: value as number,
        percentage: totalExpense > 0 ? ((value as number) / totalExpense) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [expensesByCategory, totalExpense]);

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6', '#6366f1', '#a855f7'];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-xl">
          <p className="font-semibold text-gray-900 mb-1">{data.name}</p>
          <p className="text-red-600 font-medium">{formatCurrency(data.value)}</p>
          <p className="text-sm text-gray-500">{data.percentage.toFixed(1)}% das despesas</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {userProfile?.name ? `Bem-vindo, ${userProfile.name.split(' ')[0]}!` : 'Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Aqui está o resumo das suas finanças.</p>
        </div>
        <MonthSelector />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card icon={<Wallet className="w-6 h-6 text-blue-600" />} label="Saldo Total" value={formatCurrency(balance)} />
        <Card icon={<ArrowUpCircle className="w-6 h-6 text-green-600" />} label="Receitas" value={formatCurrency(totalIncome)} />
        <Card icon={<ArrowDownCircle className="w-6 h-6 text-red-600" />} label="Despesas" value={formatCurrency(totalExpense)} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Despesas por Categoria</h2>
          {processingRecurrences && (
            <span className="text-sm text-gray-500 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Atualizando...
            </span>
          )}
        </div>

        <div className="p-6">
          {pieData.length > 0 ? (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 50 : 70}
                    outerRadius={isMobile ? 90 : 110}
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>

                  <Tooltip content={<CustomTooltip />} />

                  <Legend
                    layout={isMobile ? "horizontal" : "vertical"}
                    verticalAlign={isMobile ? "bottom" : "middle"}
                    align={isMobile ? "center" : "right"}
                    iconType="circle"
                    formatter={(value) => (
                      <span className="text-gray-700 text-sm">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        transactionToEdit={selectedTransaction} 
      />
    </div>
  );
}

// COMPONENTES AUXILIARES (mantém layout limpo)
function Card({ icon, label, value }: any) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <h3 className="text-xl font-bold text-gray-900">{value}</h3>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <PieChartIcon className="w-8 h-8 mb-3" />
      <p>Nenhuma despesa registrada.</p>
    </div>
  );
}