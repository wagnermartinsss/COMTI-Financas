import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Check, AlertCircle, CreditCard, User } from 'lucide-react';
import Papa from 'papaparse';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  responsible: string;
  isInstallment: boolean;
  installmentNumber?: number;
  totalInstallments?: number;
  installmentId?: string;
  type: 'expense' | 'income';
  source: 'credit_card';
  isValid: boolean;
  selected: boolean;
}

const AmountInput = ({ amount, onChange }: { amount: number, onChange: (val: number) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(amount.toString());

  if (isEditing) {
    return (
      <input
        type="number"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          onChange(parseFloat(tempValue) || 0);
        }}
        autoFocus
        className="w-24 text-right bg-transparent border-b border-blue-500 p-0 focus:ring-0 text-red-600 font-bold"
        step="0.01"
      />
    );
  }

  return (
    <div 
      onClick={() => { setIsEditing(true); setTempValue(amount.toString()); }}
      className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded text-red-600 font-bold"
    >
      {formatCurrency(amount)}
    </div>
  );
};

const DateInput = ({ date, isInstallment, onChange }: { date: string, isInstallment: boolean, onChange: (val: string) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(date.split('T')[0]);

  const handleSetCurrentMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date();
    onChange(now.toISOString());
  }

  if (isEditing) {
    return (
      <input
        type="date"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          if (tempValue) {
            onChange(`${tempValue}T12:00:00.000Z`);
          }
        }}
        autoFocus
        className="w-32 bg-white border border-blue-500 rounded p-1 text-sm focus:ring-0 text-gray-900"
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div 
        onClick={() => { setIsEditing(true); setTempValue(date.split('T')[0]); }}
        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded text-gray-700 font-medium"
        title="Clique para alterar a data"
      >
        {format(new Date(date), "dd/MM/yy", { locale: ptBR })}
      </div>
      {isInstallment && (
        <button 
          onClick={handleSetCurrentMonth}
          className="text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded font-medium"
          title="Mover para o mês atual"
        >
          Mês Atual
        </button>
      )}
    </div>
  );
};

export default function ImportCSVModal({ isOpen, onClose, onSuccess }: ImportCSVModalProps) {
  const { ownerId, user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string, type: string}[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [addingCategoryForTxId, setAddingCategoryForTxId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultCategories = [
    { id: 'd1', name: 'Alimentação', type: 'expense' },
    { id: 'd2', name: 'Transporte', type: 'expense' },
    { id: 'd3', name: 'Moradia', type: 'expense' },
    { id: 'd4', name: 'Lazer', type: 'expense' },
    { id: 'd5', name: 'Saúde', type: 'expense' },
    { id: 'd6', name: 'Outros', type: 'expense' },
  ];

  const [existingTransactions, setExistingTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || !ownerId) return;

    const fetchCategories = async () => {
      try {
        const q = query(collection(db, 'categories'), where('ownerId', '==', ownerId), where('type', '==', 'expense'));
        const snapshot = await getDocs(q);
        const customCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setCategories([...defaultCategories, ...customCats]);
      } catch (error) {
        console.error("Error fetching categories", error);
        setCategories(defaultCategories);
      }
    };

    const fetchExistingTransactions = async () => {
      try {
        const q = query(collection(db, 'transactions'), where('ownerId', '==', ownerId));
        const snapshot = await getDocs(q);
        const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setExistingTransactions(txs);
      } catch (error) {
        console.error("Error fetching existing transactions", error);
      }
    };

    fetchCategories();
    fetchExistingTransactions();
    setStep(1);
    setTransactions([]);
  }, [isOpen, ownerId]);

  if (!isOpen) return null;

  const suggestCategory = (description: string) => {
    const desc = description.toLowerCase();
    if (desc.includes('uber') || desc.includes('99') || desc.includes('posto') || desc.includes('combustivel')) return 'Transporte';
    if (desc.includes('ifood') || desc.includes('rappi') || desc.includes('restaurante') || desc.includes('padaria') || desc.includes('mercado') || desc.includes('supermercado')) return 'Alimentação';
    if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('cinema') || desc.includes('ingresso')) return 'Lazer';
    if (desc.includes('farmacia') || desc.includes('droga') || desc.includes('hospital') || desc.includes('clinica')) return 'Saúde';
    return 'Outros';
  };

  const parseInstallments = (description: string, installmentStr?: string) => {
    // Try to parse from explicit column first
    if (installmentStr && installmentStr.toLowerCase() !== 'única' && installmentStr.toLowerCase() !== 'unica') {
      const regex = /(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i;
      const match = installmentStr.match(regex);
      if (match) {
        const current = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        if (current > 0 && total >= current) {
          return {
            isInstallment: true,
            installmentNumber: current,
            totalInstallments: total,
            installmentId: description.trim().toLowerCase()
          };
        }
      }
    }

    // Fallback to description
    const regex = /(?:parcela\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i;
    const match = description.match(regex);
    
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      if (current > 0 && total >= current) {
        return {
          isInstallment: true,
          installmentNumber: current,
          totalInstallments: total,
          // Generate a pseudo-ID based on description without the installment part
          installmentId: description.replace(regex, '').trim().toLowerCase()
        };
      }
    }
    return { isInstallment: false };
  };

  const checkDuplicate = (parsedTx: ParsedTransaction, existingTxs: any[]) => {
    const txDate = parsedTx.date.split('T')[0];
    return existingTxs.some(existing => {
      const existingDate = existing.date.split('T')[0];
      return existingDate === txDate && 
             existing.amount === parsedTx.amount && 
             existing.description.toLowerCase() === parsedTx.description.toLowerCase();
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData: ParsedTransaction[] = [];
        
        results.data.forEach((row: any, index) => {
          // Find columns tolerating variations
          const keys = Object.keys(row);
          const dateKey = keys.find(k => k.toLowerCase().includes('data') || k.toLowerCase().includes('date'));
          const descKey = keys.find(k => k.toLowerCase().includes('descri') || k.toLowerCase().includes('historico') || k.toLowerCase().includes('estabelecimento'));
          
          // Prefer "Valor (em R$)" over "Valor (em US$)"
          let amountKey = keys.find(k => k.toLowerCase().includes('valor (em r$)'));
          if (!amountKey) {
            amountKey = keys.find(k => (k.toLowerCase().includes('valor') || k.toLowerCase().includes('amount')) && !k.toLowerCase().includes('us$'));
          }
          if (!amountKey) {
            amountKey = keys.find(k => k.toLowerCase().includes('valor') || k.toLowerCase().includes('amount'));
          }

          const respKey = keys.find(k => k.toLowerCase().includes('responsavel') || k.toLowerCase().includes('titular') || k.toLowerCase().includes('usuario') || k.toLowerCase().includes('nome'));
          const installmentKey = keys.find(k => k.toLowerCase() === 'parcela' || k.toLowerCase() === 'parcelas');

          if (dateKey && descKey && amountKey) {
            let amountStr = row[amountKey].toString().replace('R$', '').replace(/\s/g, '');
            // Handle brazilian format (1.234,56) vs US format (1,234.56)
            if (amountStr.includes(',') && amountStr.includes('.')) {
              if (amountStr.lastIndexOf(',') > amountStr.lastIndexOf('.')) {
                amountStr = amountStr.replace(/\./g, '').replace(',', '.');
              } else {
                amountStr = amountStr.replace(/,/g, '');
              }
            } else if (amountStr.includes(',')) {
              amountStr = amountStr.replace(',', '.');
            }
            
            const rawAmount = parseFloat(amountStr);
            const description = row[descKey].trim();
            const responsible = respKey ? row[respKey].trim() : '';
            const installmentStr = installmentKey ? row[installmentKey].trim() : undefined;
            
            // Parse date (assuming DD/MM/YYYY or YYYY-MM-DD)
            let dateStr = row[dateKey].trim();
            let isoDate = new Date().toISOString();
            if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                if (parts[2].length === 4) {
                  isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T12:00:00.000Z`;
                }
              }
            } else if (dateStr.includes('-')) {
              isoDate = `${dateStr}T12:00:00.000Z`;
            }

            if (!isNaN(rawAmount) && rawAmount !== 0) {
              const amount = Math.abs(rawAmount);
              const type = rawAmount < 0 ? 'income' : 'expense';
              const installmentInfo = parseInstallments(description, installmentStr);
              
              const newTx: ParsedTransaction = {
                id: `import-${index}`,
                date: isoDate,
                description,
                amount,
                category: suggestCategory(description),
                responsible,
                type,
                source: 'credit_card',
                isValid: true,
                selected: true,
                ...installmentInfo
              };

              const isDuplicate = checkDuplicate(newTx, existingTransactions);
              if (isDuplicate) {
                newTx.selected = false;
                newTx.description = `[DUPLICADA] ${newTx.description}`;
              }

              parsedData.push(newTx);
            }
          }
        });

        if (parsedData.length > 0) {
          setTransactions(parsedData);
          setStep(2);
        } else {
          toast.error('Não foi possível encontrar transações válidas no arquivo.');
        }
      },
      error: (error) => {
        console.error('CSV Parse Error:', error);
        toast.error('Erro ao ler o arquivo CSV.');
      }
    });
  };

  const handleTransactionChange = (id: string, field: keyof ParsedTransaction, value: any) => {
    setTransactions(prev => {
      const currentTx = prev.find(t => t.id === id);
      
      // Auto-update other identical descriptions when category changes
      if (field === 'category' && currentTx) {
        return prev.map(t => 
          (t.id === id || t.description === currentTx.description) 
            ? { ...t, [field]: value } 
            : t
        );
      }

      return prev.map(t => t.id === id ? { ...t, [field]: value } : t);
    });
  };

  const handleAddCategory = async (txId: string) => {
    if (!newCategoryName.trim() || !ownerId) return;
    try {
      const docRef = await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        type: 'expense',
        ownerId: ownerId
      });
      const newCat = { id: docRef.id, name: newCategoryName.trim(), type: 'expense' };
      setCategories([...categories, newCat]);
      handleTransactionChange(txId, 'category', newCat.name);
      setAddingCategoryForTxId(null);
      setNewCategoryName('');
      toast.success('Categoria adicionada!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
      toast.error('Erro ao adicionar categoria.');
    }
  };

  const handleSave = async () => {
    if (!ownerId || !user) return;
    setIsSaving(true);

    const selectedTransactions = transactions.filter(t => t.selected && t.isValid);
    
    try {
      for (const t of selectedTransactions) {
        const txData: any = {
          ownerId,
          creatorId: user.uid,
          amount: t.amount,
          type: t.type,
          category: t.category,
          description: t.description,
          date: t.date,
          source: t.source,
          createdAt: new Date().toISOString()
        };

        if (t.responsible) txData.responsible = t.responsible;
        if (t.isInstallment) {
          txData.isInstallment = true;
          txData.installmentNumber = t.installmentNumber;
          txData.totalInstallments = t.totalInstallments;
          txData.installmentId = t.installmentId;
        }

        await addDoc(collection(db, 'transactions'), txData);
      }
      
      toast.success(`${selectedTransactions.length} transações importadas com sucesso!`);
      onSuccess();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
      toast.error('Erro ao salvar transações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" />
            Importar Fatura de Cartão (CSV)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 ? (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
              <Upload className="w-12 h-12 text-blue-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Faça upload do seu CSV</h3>
              <p className="text-gray-500 text-center max-w-md mb-6">
                O arquivo deve conter colunas para data, descrição e valor. O sistema tentará identificar automaticamente parcelas e responsáveis.
              </p>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Selecionar Arquivo
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-gray-600">
                  <strong className="text-gray-900">{transactions.length}</strong> transações encontradas. Revise antes de importar.
                </p>
                <button
                  onClick={() => setTransactions(prev => prev.map(t => ({ ...t, selected: !transactions.every(tx => tx.selected) })))}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {transactions.every(tx => tx.selected) ? 'Desmarcar todas' : 'Selecionar todas'}
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="p-3 w-10"></th>
                      <th className="p-3 font-medium text-gray-500">Data</th>
                      <th className="p-3 font-medium text-gray-500">Descrição</th>
                      <th className="p-3 font-medium text-gray-500">Categoria</th>
                      <th className="p-3 font-medium text-gray-500">Responsável</th>
                      <th className="p-3 font-medium text-gray-500 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.map((t) => (
                      <tr key={t.id} className={t.selected ? 'bg-white' : 'bg-gray-50 opacity-60'}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={t.selected}
                            onChange={(e) => handleTransactionChange(t.id, 'selected', e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </td>
                        <td className="p-3 text-gray-600 whitespace-nowrap">
                          <DateInput 
                            date={t.date} 
                            isInstallment={t.isInstallment}
                            onChange={(newDate) => handleTransactionChange(t.id, 'date', newDate)}
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={t.description}
                            onChange={(e) => handleTransactionChange(t.id, 'description', e.target.value)}
                            className="w-full bg-transparent border-none p-0 focus:ring-0 text-gray-900 font-medium"
                          />
                          {t.isInstallment && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                              Parcela {t.installmentNumber}/{t.totalInstallments}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {addingCategoryForTxId === t.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                className="w-full bg-white border border-gray-300 rounded p-1 text-sm focus:ring-2 focus:ring-blue-500"
                                placeholder="Nova categoria"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddCategory(t.id);
                                  if (e.key === 'Escape') setAddingCategoryForTxId(null);
                                }}
                              />
                              <button onClick={() => handleAddCategory(t.id)} className="p-1 text-green-600 hover:text-green-800 bg-green-50 rounded">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setAddingCategoryForTxId(null)} className="p-1 text-gray-400 hover:text-gray-600 bg-gray-100 rounded">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <select
                              value={t.category}
                              onChange={(e) => {
                                if (e.target.value === 'ADD_NEW') {
                                  setAddingCategoryForTxId(t.id);
                                  setNewCategoryName('');
                                } else {
                                  handleTransactionChange(t.id, 'category', e.target.value);
                                }
                              }}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Selecionar...</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                              <option value="ADD_NEW" className="font-semibold text-blue-600">+ Adicionar nova categoria</option>
                            </select>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              value={t.responsible}
                              onChange={(e) => handleTransactionChange(t.id, 'responsible', e.target.value)}
                              placeholder="Titular"
                              className="w-full bg-transparent border-none p-0 focus:ring-0 text-gray-600 text-sm"
                            />
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <AmountInput 
                            amount={t.amount} 
                            onChange={(newAmount) => handleTransactionChange(t.id, 'amount', newAmount)} 
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-700 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            disabled={isSaving}
          >
            Cancelar
          </button>
          {step === 2 && (
            <button
              onClick={handleSave}
              disabled={isSaving || !transactions.some(t => t.selected)}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                'Salvando...'
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Importar {transactions.filter(t => t.selected).length} transações
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
