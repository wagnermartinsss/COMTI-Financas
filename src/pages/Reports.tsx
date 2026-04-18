import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { formatCurrency } from '../lib/utils';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download, FileText, FileSpreadsheet, Filter, X } from 'lucide-react';
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  useEffect(() => {
    if (!ownerId) return;

    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const startDateISO = new Date(startDate + 'T00:00:00Z').toISOString();
        const endDateISO = new Date(endDate + 'T23:59:59Z').toISOString();

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

    fetchTransactions();
  }, [ownerId, startDate, endDate]);

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
        const categoryTxs = txs as Transaction[];
        // Check if we need a new page
        if (currentY > doc.internal.pageSize.getHeight() - 40) {
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
        const tableRows = categoryTxs.map(t => [
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
          margin: { left: 14, right: 14 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 8;
        
        const categoryTotal = categoryTxs.reduce((sum, t) => sum + t.amount, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39); // Almost black
        doc.text(`Total da categoria: ${formatCurrency(categoryTotal)}`, doc.internal.pageSize.getWidth() - 14, currentY, { align: 'right' });
        
        currentY += 16; // Major spacing between categories
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
      });

      // Final total of expenses
      if (currentY > doc.internal.pageSize.getHeight() - 30) {
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
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div className="flex items-center gap-2 text-gray-700 font-semibold mb-4">
          <Filter className="w-5 h-5" />
          <h2>Filtros</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Período</label>
            <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-w-[130px]"
              />
              <span className="text-gray-500 text-center hidden xl:block">até</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-w-[130px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <select 
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">Todos</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Categorias</label>
            <div className="relative">
              <div 
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white cursor-pointer flex justify-between items-center"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              >
                <span className="truncate">
                  {selectedCategories.length === 0 ? 'Todas as categorias' : `${selectedCategories.length} selecionadas`}
                </span>
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
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
