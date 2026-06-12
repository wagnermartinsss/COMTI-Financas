import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePeriod } from '../contexts/PeriodContext';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { formatCurrency } from '../lib/utils';
import { ArrowDownCircle, ArrowUpCircle, Wallet, RefreshCw, PieChart as PieChartIcon, Lightbulb, TrendingUp, TrendingDown, CalendarRange, Award, Tag, Sparkles } from 'lucide-react';
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
  const { currentDate, startDateISO, endDateISO } = usePeriod();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRecurrences, setProcessingRecurrences] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!ownerId) return;

    let unsubscribe: () => void;

    const init = async () => {
      setProcessingRecurrences(true);

      // Process recurrences in background to not block initial data fetch
      processRecurringTransactions(ownerId)
        .then(() => setProcessingRecurrences(false))
        .catch(err => {
          console.error("Recurrence error:", err);
          setProcessingRecurrences(false);
        });

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
        <div className="bg-white p-2 border border-gray-100 shadow-md rounded-lg text-xs">
          <p className="font-semibold text-gray-900 mb-0.5">{data.name}</p>
          <p className="text-red-600 font-medium">{formatCurrency(data.value)}</p>
          <p className="text-gray-500">{data.percentage.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  const insights = useMemo(() => {
    const expenses = transactions.filter(t => t.type === 'expense' && !t.isPending);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (transactions.length === 0) {
      return {
        largestExpense: null,
        topCategory: null,
        topCategoryAmount: 0,
        savingsRate: 0,
        dailyAverage: 0,
        advisoryMessage: "Inicie cadastrando suas receitas e despesas para obter insights automáticos sobre sua saúde financeira!",
        advisoryIconType: 'info' as const
      };
    }

    // 1. Maior Despesa
    const largestExpense = expenses.length > 0 
      ? expenses.reduce((max, t) => t.amount > max.amount ? t : max, expenses[0])
      : null;

    // 2. Categoria Mais Cara
    let topCategory = null;
    let topCategoryAmount = 0;
    if (Object.keys(expensesByCategory).length > 0) {
      const sortedCats = Object.entries(expensesByCategory).sort((a, b) => (b[1] as number) - (a[1] as number));
      topCategory = sortedCats[0][0];
      topCategoryAmount = sortedCats[0][1] as number;
    }

    // 3. Taxa de Poupança (Savings Rate)
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

    // 4. Média Diária de Gastos
    const dailyAverage = totalExpense / daysInMonth;

    // Dynamic message (Adviser)
    let advisoryMessage = '';
    let advisoryIconType: 'success' | 'warning' | 'danger' | 'info' = 'info';

    if (totalIncome === 0 && totalExpense > 0) {
      advisoryMessage = "Você registrou despesas, mas nenhuma receita ainda neste mês. Adicione seus ganhos para acompanhar seu saldo real.";
      advisoryIconType = 'warning';
    } else if (balance < 0) {
      advisoryMessage = `Atenção: Suas despesas excederam seus ganhos acumulados em ${formatCurrency(Math.abs(balance))}! Revise os gastos da categoria "${topCategory || ''}" para cortar custos supérfluos.`;
      advisoryIconType = 'danger';
    } else if (savingsRate >= 30) {
      advisoryMessage = `Excelente saúde financeira! Você conseguiu poupar ${savingsRate.toFixed(1)}% das suas receitas. Essa reserva pode ser canalizada para investimentos de longo prazo.`;
      advisoryIconType = 'success';
    } else if (savingsRate > 0 && savingsRate < 30) {
      advisoryMessage = `Seu saldo está positivo (${savingsRate.toFixed(1)}% economizado). Tente otimizar os gastos diários para se aproximar da meta ideal de 30% de poupança!`;
      advisoryIconType = 'info';
    } else {
      advisoryMessage = "Seu saldo está no limite neutro neste mês. Tente estabelecer uma pequena meta de poupança para construir sua reserva de emergência.";
      advisoryIconType = 'warning';
    }

    return {
      largestExpense,
      topCategory,
      topCategoryAmount,
      savingsRate,
      dailyAverage,
      advisoryMessage,
      advisoryIconType
    };
  }, [transactions, totalIncome, totalExpense, balance, expensesByCategory, currentDate]);

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

      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-2xl"></div>
            ))}
          </div>
          <div className="h-[400px] bg-gray-200 rounded-2xl"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card icon={<Wallet className="w-6 h-6 text-blue-600" />} label="Saldo Total" value={formatCurrency(balance)} />
            <Card icon={<ArrowUpCircle className="w-6 h-6 text-green-600" />} label="Receitas" value={formatCurrency(totalIncome)} />
            <Card icon={<ArrowDownCircle className="w-6 h-6 text-red-600" />} label="Despesas" value={formatCurrency(totalExpense)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Lado Esquerdo: Despesas por Categoria */}
            <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col justify-between">
              <div>
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
                    <div className="h-[360px] w-full min-h-0 min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy={isMobile ? "35%" : "50%"}
                            innerRadius={isMobile ? 40 : 70}
                            outerRadius={isMobile ? 65 : 110}
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
                            wrapperStyle={isMobile ? { paddingTop: '20px' } : undefined}
                            formatter={(value: string) => {
                              const item = pieData.find(p => p.name === value);
                              return (
                                <span className="text-gray-700 text-sm">
                                  {value} ({item?.percentage.toFixed(1)}%)
                                </span>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState />
                  )}
                </div>
              </div>
            </div>

            {/* Lado Direito: Insights Rápidos / Destaques do Mês */}
            <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-50">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Destaques do Mês</h2>
                    <p className="text-[11px] text-gray-400 font-medium">Insights inteligentes sobre seu orçamento</p>
                  </div>
                </div>

                {transactions.length > 0 && (pieData.length > 0 || totalIncome > 0) ? (
                  <div className="space-y-3.5">
                    {/* Item 1: Maior Despesa */}
                    {insights.largestExpense && (
                      <div className="flex items-center justify-between p-3 bg-gray-55/40 hover:bg-gray-50 rounded-xl border border-gray-100/50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-red-50 text-red-500 rounded-lg shrink-0">
                            <TrendingDown className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Maior despesa única</p>
                            <p className="text-xs font-bold text-gray-700 truncate max-w-[150px] sm:max-w-[180px]">
                              {insights.largestExpense.description}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-black text-red-600 shrink-0">
                          {formatCurrency(insights.largestExpense.amount)}
                        </span>
                      </div>
                    )}

                    {/* Item 2: Categoria Recordista */}
                    {insights.topCategory && (
                      <div className="flex items-center justify-between p-3 bg-gray-55/40 hover:bg-gray-50 rounded-xl border border-gray-100/50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-blue-50 text-blue-500 rounded-lg shrink-0">
                            <Tag className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Categoria recordista</p>
                            <p className="text-xs font-bold text-gray-700 truncate">
                              {insights.topCategory}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-gray-800 shrink-0">
                          {formatCurrency(insights.topCategoryAmount)}
                        </span>
                      </div>
                    )}

                    {/* Item 3: Gasto Diário */}
                    {totalExpense > 0 && (
                      <div className="flex items-center justify-between p-3 bg-gray-55/40 hover:bg-gray-50 rounded-xl border border-gray-100/50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-purple-50 text-purple-500 rounded-lg shrink-0">
                            <CalendarRange className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Gasto médio diário</p>
                            <p className="text-xs font-bold text-gray-700">Média ponderada</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-gray-800 shrink-0">
                          {formatCurrency(insights.dailyAverage)}
                        </span>
                      </div>
                    )}

                    {/* Item 4: Margem de Poupança */}
                    {totalIncome > 0 && (
                      <div className="flex items-center justify-between p-3 bg-gray-55/40 hover:bg-gray-50 rounded-xl border border-gray-100/50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg shrink-0">
                            <Award className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Margem de Poupança</p>
                            <p className="text-xs font-bold text-gray-700 font-sans">Reservado das receitas</p>
                          </div>
                        </div>
                        <span className={`text-xs font-black shrink-0 ${insights.savingsRate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {insights.savingsRate >= 0 ? "+" : ""}{insights.savingsRate.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-10 text-center text-gray-400 flex flex-col items-center justify-center">
                    <Sparkles className="w-7 h-7 text-amber-300 mb-2 animate-bounce" />
                    <p className="text-xs font-medium">Insira transações para ativar os destaques do mês.</p>
                  </div>
                )}
              </div>

              {/* Recomendação Inteligente */}
              <div className={`mt-5 p-3.5 rounded-xl border flex gap-2.5 ${
                insights.advisoryIconType === 'success' 
                  ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
                  : insights.advisoryIconType === 'danger'
                  ? 'bg-rose-50/50 border-rose-100 text-rose-800'
                  : insights.advisoryIconType === 'warning'
                  ? 'bg-amber-50/50 border-amber-100 text-amber-800'
                  : 'bg-blue-50/50 border-blue-100 text-blue-800'
              }`}>
                <div className="shrink-0 mt-0.5">
                  <Sparkles className="w-4.5 h-4.5 text-amber-500" />
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-0.5">Recomendação Inteligente</h4>
                  <p className="text-[11.5px] leading-relaxed font-medium">
                    {insights.advisoryMessage}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        transactionToEdit={selectedTransaction} 
      />
    </div>
  );
}

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