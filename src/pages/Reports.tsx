import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { formatCurrency, cn } from '../lib/utils';
import { format, startOfMonth, endOfMonth, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Download, FileText, FileSpreadsheet, Filter, X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Calendar, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';

interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string;
  isPending?: boolean;
}

interface MonthData {
  monthName: string;
  yearMonth: string;
  total: number;
  transactions: Transaction[];
  percentageChange?: number;
}

export default function Reports() {
  const { ownerId } = useAuth();
  
  // Filters
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  
  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPDFExportModal, setShowPDFExportModal] = useState(false);
  
  const chartRef = useRef<HTMLDivElement>(null);
  const pdfChartRef = useRef<HTMLDivElement>(null);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Tabs
  const [activeTab, setActiveTab] = useState<'general' | 'expense_comparison'>('general');

  // Expense Comparison Report States
  const [expenseCategory, setExpenseCategory] = useState<string>('');
  const [expensePeriod, setExpensePeriod] = useState<'3' | '6' | '12' | 'this_year'>('3');
  const [comparisonData, setComparisonData] = useState<MonthData[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (availableCategories.length > 0 && !expenseCategory) {
      const defaultCat = availableCategories.includes('Alimentação') ? 'Alimentação' : availableCategories[0];
      setExpenseCategory(defaultCat);
    }
  }, [availableCategories, expenseCategory]);

  const fetchComparisonData = async () => {
    if (!ownerId || !expenseCategory) return;
    setComparisonLoading(true);
    try {
      const now = new Date();
      let startD: Date;
      const endD = endOfMonth(now);
      
      if (expensePeriod === '3') {
        startD = startOfMonth(subMonths(now, 2));
      } else if (expensePeriod === '6') {
        startD = startOfMonth(subMonths(now, 5));
      } else if (expensePeriod === '12') {
        startD = startOfMonth(subMonths(now, 11));
      } else { // 'this_year'
        startD = startOfMonth(new Date(now.getFullYear(), 0, 1));
      }

      const startISO = startD.toISOString();
      const endISO = endD.toISOString();

      const q = query(
        collection(db, 'transactions'),
        where('ownerId', '==', ownerId),
        where('date', '>=', startISO),
        where('date', '<=', endISO),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      
      const months: MonthData[] = [];
      let currentTemp = new Date(startD);
      while (currentTemp <= endD) {
        const yearMonth = format(currentTemp, 'yyyy-MM');
        const monthLabel = format(currentTemp, 'MMMM', { locale: ptBR });
        const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
        
        months.push({
          monthName: capitalizedMonth,
          yearMonth,
          total: 0,
          transactions: []
        });
        currentTemp = new Date(currentTemp.getFullYear(), currentTemp.getMonth() + 1, 1);
      }

      snapshot.forEach(doc => {
        const data = doc.data() as Transaction;
        if (data.type === 'expense' && data.category === expenseCategory && !data.isPending) {
          const txDate = new Date(data.date);
          const txYearMonth = format(txDate, 'yyyy-MM');
          const mIndex = months.findIndex(m => m.yearMonth === txYearMonth);
          if (mIndex !== -1) {
            months[mIndex].total += data.amount;
            months[mIndex].transactions.push({ id: doc.id, ...data });
          }
        }
      });

      // Sort monthly transactions by date descending
      months.forEach(m => {
        m.transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      // Calculate variations
      for (let i = 0; i < months.length; i++) {
        if (i > 0) {
          const prevTotal = months[i - 1].total;
          if (prevTotal > 0) {
            months[i].percentageChange = ((months[i].total - prevTotal) / prevTotal) * 100;
          } else if (months[i].total > 0) {
            months[i].percentageChange = 100;
          } else {
            months[i].percentageChange = 0;
          }
        }
      }

      setComparisonData(months);
    } catch (error) {
      console.error("Error fetching comparison data", error);
      toast.error("Erro ao carregar dados comparativos");
    } finally {
      setComparisonLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'expense_comparison') {
      fetchComparisonData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, expenseCategory, expensePeriod, activeTab]);

  useEffect(() => {
    if (!ownerId) return;

    const fetchCategories = async () => {
      try {
        const q = query(collection(db, 'categories'), where('ownerId', '==', ownerId));
        const snapshot = await getDocs(q);
        const customCats = snapshot.docs.map(doc => doc.data().name);
        
        const defaultCats = [
          'Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Outros', 'Salário', 'Extra'
        ];
        
        const allCats = Array.from(new Set([...defaultCats, ...customCats]));
        setAvailableCategories(allCats);
      } catch (error) {
        console.error("Error fetching categories", error);
      }
    };

    fetchCategories();
  }, [ownerId]);

  const fetchTransactions = async () => {
    if (!ownerId || !startDate || !endDate) return;
    
    setLoading(true);
    try {
      const startDateISO = new Date(startDate + 'T00:00:00').toISOString();
      const endDateISO = new Date(endDate + 'T23:59:59').toISOString();

      const q = query(
        collection(db, 'transactions'),
        where('ownerId', '==', ownerId),
        where('date', '>=', startDateISO),
        where('date', '<=', endDateISO),
        orderBy('date', 'desc')
      );

      const snapshot = await getDocs(q);
      const data: Transaction[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Transaction);
      });

      setTransactions(data);
    } catch (error) {
      console.error("Error fetching transactions", error);
      toast.error("Erro ao carregar dados do relatório");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // Apply local filters
  const filteredTransactions = transactions.filter(t => {
    if (t.isPending) return false;
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (selectedCategories.length > 0 && !selectedCategories.includes(t.category)) return false;
    return true;
  });

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const balance = totalIncome - totalExpense;

  const expensesByCategory = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, curr) => {
      acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);

  const pieData = Object.entries(expensesByCategory)
    .map(([name, value]) => ({
      name,
      value: value as number,
      percentage: totalExpense > 0 ? ((value as number) / totalExpense) * 100 : 0
    }))
    .sort((a, b) => b.value - a.value);

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

  const exportToCSV = () => {
    const headers = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'];
    const rows = filteredTransactions.map(t => [
      format(new Date(t.date.split('T')[0] + 'T12:00:00'), "dd/MM/yyyy"),
      t.description,
      t.category,
      t.type === 'income' ? 'Receita' : 'Despesa',
      t.amount.toString().replace('.', ',')
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(e => e.join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_${startDate}_a_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV exportado!');
  };

  const exportToPDF = async (reportType: 'simple' | 'complete' = 'simple') => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(31, 41, 55); // Dark gray
    doc.setFont('helvetica', 'bold');
    doc.text(reportType === 'simple' ? 'Relatório Simples' : 'Relatório Completo', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // Medium gray
    doc.setFont('helvetica', 'normal');
    const periodText = `Período: ${format(parseISO(startDate), 'dd/MM/yyyy')} a ${format(parseISO(endDate), 'dd/MM/yyyy')}`;
    doc.text(periodText, 14, 28);
    
    doc.setTextColor(0, 0, 0); // Reset for data
    
    if (reportType === 'simple') {
      // Visual summary cards in the PDF
      let summaryY = 42;
      
      // Receitas
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text('Total Receitas', 14, summaryY);
      doc.setFontSize(14);
      doc.setTextColor(22, 163, 74); 
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(totalIncome), 14, summaryY + 7);

      // Despesas
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text('Total Despesas', 75, summaryY);
      doc.setFontSize(14);
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(totalExpense), 75, summaryY + 7);

      // Saldo
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text('Saldo do Período', 140, summaryY);
      doc.setFontSize(14);
      const isNegative = balance < 0;
      doc.setTextColor(isNegative ? 220 : 59, isNegative ? 38 : 130, isNegative ? 38 : 246);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(balance), 140, summaryY + 7);

      // Border line for elegance
      doc.setDrawColor(243, 244, 246);
      doc.line(14, summaryY + 14, doc.internal.pageSize.getWidth() - 14, summaryY + 14);

      // Prepare fallback for chart positioning
      (doc as any).lastAutoTable = { finalY: summaryY + 20 };
    } else {
      // Complete report: Only expenses grouped by category
      const expenseTxs = filteredTransactions.filter(t => t.type === 'expense');
      const groupedExpenses = expenseTxs.reduce((acc, curr) => {
        if (!acc[curr.category]) acc[curr.category] = [];
        acc[curr.category].push(curr);
        return acc;
      }, {} as Record<string, Transaction[]>);

      let currentY = 40;

      Object.entries(groupedExpenses).forEach(([category, txs]) => {
        const sortedCategoryTxs = [...txs as Transaction[]].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Intelligent, proportional page-breaking algorithm to balance page content distribution
        const estimatedHeight = 15 + 10 + (sortedCategoryTxs.length * 8) + 12;
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxContentY = pageHeight - 20; // Safe bottom margin

        if (currentY > maxContentY - 50 || (estimatedHeight < (maxContentY - 25) && currentY + estimatedHeight > maxContentY)) {
          doc.addPage();
          currentY = 25;
        }

        // Category Title
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55); // Dark gray for professional look
        doc.text(category, 14, currentY);
        currentY += 4;

        const tableColumn = ["Data", "Descrição", "Valor"];
        const tableRows = sortedCategoryTxs.map(t => [
          format(new Date(t.date.split('T')[0] + 'T12:00:00'), "dd/MM/yyyy"),
          t.description,
          formatCurrency(t.amount)
        ]);

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: currentY,
          theme: 'striped',
          styles: { 
            fontSize: 9, 
            cellPadding: 3, 
            lineColor: [243, 244, 246],
            lineWidth: 0.1
          },
          headStyles: { 
            fillColor: [249, 250, 251], 
            textColor: [107, 114, 128], 
            fontStyle: 'bold',
            halign: 'left'
          },
          columnStyles: {
            2: { halign: 'right' }
          },
          didParseCell: (data) => {
            if (data.section === 'body') {
              if (data.column.index === 1) { // Descrição
                data.cell.styles.fontStyle = 'bold';
              }
              if (data.column.index === 2) { // Valor
                data.cell.styles.textColor = [220, 38, 38]; // Red for expenses
              }
            }
          },
          margin: { left: 14, right: 14 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 8;
        
        const categoryTotal = sortedCategoryTxs.reduce((sum, t) => sum + t.amount, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39); // Almost black
        doc.text(`Total da categoria: ${formatCurrency(categoryTotal)}`, doc.internal.pageSize.getWidth() - 14, currentY, { align: 'right' });
        
        currentY += 16; // Major spacing between categories
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
      });

      // Final total of expenses
      if (currentY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        currentY = 25;
      } else {
        currentY += 4;
      }

      // Final summary visually separated
      doc.setDrawColor(229, 231, 235);
      doc.line(14, currentY, doc.internal.pageSize.getWidth() - 14, currentY);
      currentY += 12;

      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38); // Red for emphasis
      doc.text(`Total Geral de Despesas: ${formatCurrency(totalExpense)}`, doc.internal.pageSize.getWidth() - 14, currentY, { align: 'right' });
    }

    let finalY = (doc as any).lastAutoTable?.finalY || 60;

    if (pdfChartRef.current && pieData.length > 0 && reportType === 'simple') {
      try {
        const canvas = await html2canvas(pdfChartRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = 140;
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        if (finalY + pdfHeight > doc.internal.pageSize.getHeight() - 10) {
          doc.addPage();
          finalY = 20;
        } else {
          finalY += 10;
        }
        
        doc.addImage(imgData, 'PNG', 35, finalY, pdfWidth, pdfHeight);
      } catch (err) {
        console.error("Error generating chart image", err);
      }
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      window.location.href = url; // mobile
    } else {
      window.open(url, '_blank'); // desktop
    }
    toast.success('Relatório PDF exportado!');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        {activeTab === 'general' && (
          <div className="flex gap-2">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={() => setShowPDFExportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={cn(
            "px-6 py-3 font-semibold text-sm border-b-2 -mb-[1px] transition-all cursor-pointer",
            activeTab === 'general'
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          )}
        >
          Filtro Geral
        </button>
        <button
          onClick={() => setActiveTab('expense_comparison')}
          className={cn(
            "px-6 py-3 font-semibold text-sm border-b-2 -mb-[1px] transition-all cursor-pointer",
            activeTab === 'expense_comparison'
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          )}
        >
          Relatório - Despesa
        </button>
      </div>

      {activeTab === 'general' ? (
        <>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div className="flex items-center gap-2 text-gray-700 font-semibold mb-2 border-b border-gray-50 pb-3">
          <Filter className="w-5 h-5 text-blue-600" />
          <h2>Filtros de Pesquisa</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
          <div className="md:col-span-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
            <div className="flex items-center gap-2 w-full min-w-0">
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="flex-1 min-w-0 w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-gray-700"
              />
              <span className="text-gray-400 text-[11px] sm:text-xs font-semibold uppercase px-0.5 sm:px-1 shrink-0">até</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="flex-1 min-w-0 w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-gray-700"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <select 
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-gray-700"
            >
              <option value="all">Todos</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">Categorias</label>
            <div className="relative">
              <div 
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white cursor-pointer flex justify-between items-center font-medium text-gray-700"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              >
                <span className="truncate">
                  {selectedCategories.length === 0 ? 'Todas as categorias' : `${selectedCategories.length} selecionadas`}
                </span>
                <span className="text-gray-400 text-[10px] ml-2">▼</span>
              </div>
              {isCategoryDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-0" 
                    onClick={() => setIsCategoryDropdownOpen(false)}
                  ></div>
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto p-2">
                    {availableCategories.map(cat => (
                      <label key={cat} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedCategories.includes(cat)}
                          onChange={() => toggleCategory(cat)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{cat}</span>
                      </label>
                    ))}
                    {selectedCategories.length > 0 && (
                      <button 
                        onClick={() => setSelectedCategories([])}
                        className="w-full text-left p-2 text-sm text-blue-600 hover:bg-blue-50 rounded mt-1 font-medium"
                      >
                        Limpar seleção
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <button
              onClick={fetchTransactions}
              disabled={loading}
              className="w-full h-[38px] flex items-center justify-center bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Carregando...' : 'Filtrar'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Carregando dados...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Total Receitas</p>
              <h3 className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</h3>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Total Despesas</p>
              <h3 className="text-2xl font-bold text-red-600">{formatCurrency(totalExpense)}</h3>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <p className="text-sm font-medium text-gray-500 mb-1">Saldo do Período</p>
              <h3 className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(balance)}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart */}
            <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Despesas por Categoria</h2>
              </div>
              <div className="p-6" ref={chartRef}>
                {pieData.length > 0 ? (
                  <div className="h-[350px] w-full min-h-0 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="40%"
                          innerRadius={isMobile ? 50 : 50}
                          outerRadius={isMobile ? 80 : 80}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend 
                          verticalAlign="bottom" 
                          layout="horizontal"
                          align="center"
                          iconType="circle" 
                          wrapperStyle={{ paddingTop: '10px' }}
                          formatter={(value, entry: any) => {
                            const dataItem = pieData.find(d => d.name === value);
                            const percentage = dataItem ? dataItem.percentage : 0;
                            return (
                              <span className="text-gray-600 text-[11px] whitespace-nowrap">
                                {value} <span className="text-gray-400">({percentage.toFixed(1)}%)</span>
                              </span>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-gray-500 text-center">
                    <p>Nenhuma despesa encontrada para os filtros selecionados.</p>
                  </div>
                )}
              </div>
            </div>

            {/* List */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Transações</h2>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="p-4 font-medium text-gray-500 text-sm">Data</th>
                      <th className="p-4 font-medium text-gray-500 text-sm">Descrição</th>
                      <th className="p-4 font-medium text-gray-500 text-sm">Categoria</th>
                      <th className="p-4 font-medium text-gray-500 text-sm text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 text-gray-600 text-sm">
                          {format(new Date(transaction.date.split('T')[0] + 'T12:00:00'), "dd/MM/yyyy")}
                        </td>
                        <td className="p-4">
                          <span className="font-medium text-gray-900">{transaction.description}</span>
                        </td>
                        <td className="p-4 text-gray-600 text-sm">
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                            {transaction.category}
                          </span>
                        </td>
                        <td className={`p-4 text-right font-medium ${
                          transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.type === 'income' ? '+' : '-'} {formatCurrency(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-gray-500">
                          Nenhuma transação encontrada para os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  ) : (
        /* Relatório de Despesa Tab */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Controls Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Relatório de Despesa Comparativo</h2>
                <p className="text-sm text-gray-500">Compare a evolução de um tipo de despesa específica mês a mês</p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                <div className="flex-1 sm:w-56">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de despesa</label>
                  <select
                    value={expenseCategory}
                    onChange={e => setExpenseCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-gray-700"
                  >
                    {availableCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex-1 sm:w-56">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Período</label>
                  <select
                    value={expensePeriod}
                    onChange={e => setExpensePeriod(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-gray-700"
                  >
                    <option value="3">Últimos 3 meses</option>
                    <option value="6">Últimos 6 meses</option>
                    <option value="12">Últimos 12 meses</option>
                    <option value="this_year">Este ano</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {comparisonLoading ? (
            <div className="text-center py-16 text-gray-500 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium text-gray-600">Buscando histórico de despesas...</span>
            </div>
          ) : (
            <>
              {/* Comparison Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3.5 rounded-xl bg-red-50 text-red-600 shrink-0">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Total gasto ({expenseCategory})</p>
                    <h3 className="text-2xl font-bold text-red-600">
                      {formatCurrency(comparisonData.reduce((acc, curr) => acc + curr.total, 0))}
                    </h3>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Média Mensal</p>
                    <h3 className="text-2xl font-bold text-blue-600">
                      {formatCurrency(
                        comparisonData.length > 0 
                          ? comparisonData.reduce((acc, curr) => acc + curr.total, 0) / comparisonData.length 
                          : 0
                      )}
                    </h3>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="p-3.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Maior gasto mensal</p>
                    <h3 className="text-2xl font-bold text-amber-600">
                      {(() => {
                        const maxMonth = comparisonData.length > 0 
                          ? [...comparisonData].sort((a, b) => b.total - a.total)[0] 
                          : null;
                        return maxMonth && maxMonth.total > 0 ? (
                          <>
                            {formatCurrency(maxMonth.total)}
                            <span className="text-[10px] font-medium text-gray-400 block">
                              em {maxMonth.monthName}
                            </span>
                          </>
                        ) : (
                          'R$ 0,00'
                        );
                      })()}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Graphical Analysis & List Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Trend Chart */}
                <div className="lg:col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col h-[420px]">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Evolução dos Gastos</h3>
                    <p className="text-xs text-gray-500">Histórico de despesas na categoria {expenseCategory} no período selecionado</p>
                  </div>
                  
                  <div className="flex-1 w-full min-h-0">
                    {comparisonData.some(m => m.total > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis 
                            dataKey="monthName" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#6b7280', fontSize: 11 }} 
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#6b7280', fontSize: 11 }}
                            tickFormatter={(val) => formatCurrency(val).replace(',00', '')} 
                          />
                          <Tooltip 
                            formatter={(value: any) => [formatCurrency(value), 'Total Gasto']}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.05)' }}
                            labelStyle={{ fontWeight: 'bold', color: '#111827' }}
                          />
                          <Bar dataKey="total" fill="#f87171" radius={[4, 4, 0, 0]}>
                            {comparisonData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={index === comparisonData.length - 1 ? '#ef4444' : '#f87171'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center space-y-2">
                        <TrendingDown className="w-12 h-12 text-gray-300" />
                        <p className="text-sm font-medium">Nenhum gasto registrado para esta categoria no período selecionado.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Collapsible Month-by-Month comparative list */}
                <div className="lg:col-span-5 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col h-[420px]">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Estatísticas Mensais</h3>
                    <p className="text-xs text-gray-500">Clique em um mês para visualizar as transações detalhadas</p>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {comparisonData.map((item, index) => {
                      const isExpanded = expandedMonth === item.yearMonth;
                      return (
                        <div 
                          key={item.yearMonth}
                          className={cn(
                            "border rounded-xl transition-all overflow-hidden",
                            isExpanded ? "border-blue-200 bg-blue-50/20 shadow-sm" : "border-gray-100 bg-white hover:bg-gray-50"
                          )}
                        >
                          <button
                            onClick={() => setExpandedMonth(isExpanded ? null : item.yearMonth)}
                            className="w-full text-left p-4 flex items-center justify-between gap-2 cursor-pointer text-gray-700"
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900 text-sm">{item.monthName}</span>
                              <span className="text-xs text-gray-400 font-medium">
                                {item.transactions.length === 1 ? '1 transação' : `${item.transactions.length} transações`}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-bold text-gray-900 text-sm block">
                                  {formatCurrency(item.total)}
                                </span>
                                {item.percentageChange !== undefined && (
                                  <span className={cn(
                                    "text-[10px] font-bold flex items-center gap-0.5 justify-end mt-0.5",
                                    item.percentageChange > 0 ? "text-red-600" : item.percentageChange < 0 ? "text-green-600" : "text-gray-500"
                                  )}>
                                    {item.percentageChange > 0 ? (
                                      <>
                                        <TrendingUp className="w-3 h-3 text-red-500" />
                                        +{item.percentageChange.toFixed(1)}%
                                      </>
                                    ) : item.percentageChange < 0 ? (
                                      <>
                                        <TrendingDown className="w-3 h-3 text-green-500" />
                                        {item.percentageChange.toFixed(1)}%
                                      </>
                                    ) : (
                                      "0.0%"
                                    )}
                                  </span>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                              )}
                            </div>
                          </button>

                          {/* Expanded detail section */}
                          {isExpanded && (
                            <div className="border-t border-gray-100 bg-white p-4">
                              {item.transactions.length > 0 ? (
                                <div className="max-h-48 overflow-y-auto">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                        <th className="pb-2 w-16">Data</th>
                                        <th className="pb-2">Descrição</th>
                                        <th className="pb-2 text-right">Valor</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                      {item.transactions.map((tx) => (
                                        <tr key={tx.id} className="text-xs hover:bg-gray-50/50">
                                          <td className="py-2 text-gray-500 font-medium">
                                            {format(new Date(tx.date.split('T')[0] + 'T12:00:00'), "dd/MM")}
                                          </td>
                                          <td className="py-2 font-semibold text-gray-800 truncate max-w-[140px]">
                                            {tx.description}
                                          </td>
                                          <td className="py-2 text-right font-bold text-red-600">
                                            {formatCurrency(tx.amount)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-center py-4 text-gray-400 text-xs font-medium">
                                  Nenhuma despesa para esta categoria neste mês.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal para seleção de tipo de PDF */}
      {showPDFExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-6 h-6 text-red-600" />
                Exportar PDF
              </h3>
              <button 
                onClick={() => setShowPDFExportModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-gray-600 text-sm">Escolha o formato do relatório que deseja exportar:</p>
              
              <div className="space-y-3">
                <button
                  onClick={() => {
                    exportToPDF('simple');
                    setShowPDFExportModal(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-red-100 hover:bg-red-50 group transition-all"
                >
                  <div className="text-left">
                    <p className="font-bold text-gray-900 group-hover:text-red-700 transition-colors">Relatório Simples</p>
                    <p className="text-xs text-gray-500">Resumo visual com os totais de receitas, despesas e saldo do período.</p>
                  </div>
                  <FileText className="w-5 h-5 text-gray-300 group-hover:text-red-500 transition-colors" />
                </button>

                <button
                  onClick={() => {
                    exportToPDF('complete');
                    setShowPDFExportModal(false);
                  }}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-red-100 hover:bg-red-50 group transition-all"
                >
                  <div className="text-left">
                    <p className="font-bold text-gray-900 group-hover:text-red-700 transition-colors">Relatório Completo</p>
                    <p className="text-xs text-gray-500">Agrupado por categoria, com subtotais e total de despesas.</p>
                  </div>
                  <Download className="w-5 h-5 text-gray-300 group-hover:text-red-500 transition-colors" />
                </button>
              </div>
            </div>

            <div className="bg-gray-50 p-4 text-center">
              <button
                onClick={() => setShowPDFExportModal(false)}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden chart for PDF export */}
      <div className="absolute left-[-9999px] top-[-9999px]">
        <div ref={pdfChartRef} className="w-[800px] h-[400px] bg-white p-8 flex items-center justify-center">
          {pieData.length > 0 && (
            <PieChart width={800} height={400}>
              <Pie
                data={pieData}
                cx={300}
                cy={200}
                innerRadius={70}
                outerRadius={120}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend 
                layout="vertical" 
                verticalAlign="middle" 
                align="right"
                iconType="circle"
                wrapperStyle={{ right: 100 }}
                formatter={(value, entry: any) => {
                  const dataItem = pieData.find(d => d.name === value);
                  const percentage = dataItem ? dataItem.percentage : 0;
                  return (
                    <span style={{ color: '#374151', fontWeight: 500, marginLeft: '8px', fontSize: '16px', fontFamily: 'sans-serif' }}>
                      {value} <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '14px', marginLeft: '4px' }}>({percentage.toFixed(1)}%)</span>
                    </span>
                  );
                }}
              />
            </PieChart>
          )}
        </div>
      </div>
    </div>
  );
}
