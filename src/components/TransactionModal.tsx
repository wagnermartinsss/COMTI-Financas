import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { processRecurringTransactions } from '../lib/recurring';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionToEdit?: any;
}

export default function TransactionModal({ isOpen, onClose, transactionToEdit }: TransactionModalProps) {
  const { user, ownerId } = useAuth();
  
  // Form state
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [isVariableAmount, setIsVariableAmount] = useState(false);

  // Categories state
  const [categories, setCategories] = useState<{id: string, name: string, type: string}[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const defaultCategories = [
    { id: 'd1', name: 'Alimentação', type: 'expense' },
    { id: 'd2', name: 'Transporte', type: 'expense' },
    { id: 'd3', name: 'Moradia', type: 'expense' },
    { id: 'd4', name: 'Lazer', type: 'expense' },
    { id: 'd5', name: 'Saúde', type: 'expense' },
    { id: 'd6', name: 'Outros', type: 'expense' },
    { id: 'd7', name: 'Salário', type: 'income' },
    { id: 'd8', name: 'Extra', type: 'income' },
    { id: 'd9', name: 'Outros', type: 'income' },
  ];

  useEffect(() => {
    if (!isOpen || !ownerId) return;

    const fetchCategories = async () => {
      try {
        const q = query(collection(db, 'categories'), where('ownerId', '==', ownerId));
        const snapshot = await getDocs(q);
        const customCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setCategories([...defaultCategories, ...customCats]);
      } catch (error) {
        console.error("Error fetching categories", error);
        setCategories(defaultCategories);
      }
    };

    fetchCategories();

    if (transactionToEdit) {
      setType(transactionToEdit.type);
      setAmountStr((transactionToEdit.amount * 100).toString());
      setCategory(transactionToEdit.category);
      setDescription(transactionToEdit.description);
      setDate(transactionToEdit.date.split('T')[0]);
      setIsRecurring(false); // Can't edit recurrence from a single transaction instance easily here
      setIsVariableAmount(false);
    } else {
      setType('expense');
      setAmountStr('');
      setCategory('');
      setDescription('');
      setDate(new Date().toISOString().split('T')[0]);
      setIsRecurring(false);
      setFrequency('monthly');
      setIsVariableAmount(false);
    }
  }, [isOpen, ownerId, transactionToEdit]);

  if (!isOpen) return null;

  const displayAmount = amountStr ? (parseInt(amountStr, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setAmountStr(value);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !user || !ownerId) return;
    try {
      const docRef = await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        type,
        ownerId: ownerId
      });
      setCategories([...categories, { id: docRef.id, name: newCategoryName.trim(), type }]);
      setCategory(newCategoryName.trim());
      setIsAddingCategory(false);
      setNewCategoryName('');
      toast.success('Categoria adicionada!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
      toast.error('Erro ao adicionar categoria.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !ownerId) return;

    const numericAmount = parseInt(amountStr || '0', 10) / 100;
    if (numericAmount <= 0 && !isVariableAmount) {
      toast.error('O valor deve ser maior que zero.');
      return;
    }

    if (!category) {
      toast.error('Selecione uma categoria.');
      return;
    }

    try {
      // Ensure the date is saved correctly without timezone shifts
      // We append T12:00:00Z to ensure it's treated as midday UTC, avoiding day shifts
      const dateString = `${date}T12:00:00Z`;

      if (transactionToEdit) {
        await updateDoc(doc(db, 'transactions', transactionToEdit.id), {
          type,
          amount: numericAmount,
          category,
          description,
          date: dateString,
          isPending: false, // If it was pending, saving it removes the pending status
        });
        toast.success('Transação atualizada!');
      } else {
        if (isRecurring) {
          await addDoc(collection(db, 'recurringTransactions'), {
            ownerId,
            creatorId: user.uid,
            type,
            amount: isVariableAmount ? 0 : numericAmount,
            category,
            description,
            frequency,
            startDate: dateString,
            isVariableAmount,
            createdAt: new Date().toISOString()
          });
          await processRecurringTransactions(ownerId);
          toast.success('Transação recorrente criada!');
        } else {
          await addDoc(collection(db, 'transactions'), {
            ownerId,
            creatorId: user.uid,
            type,
            amount: numericAmount,
            category,
            description,
            date: dateString,
            isPending: false,
            createdAt: new Date().toISOString()
          });
          toast.success('Transação criada!');
        }
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, transactionToEdit ? OperationType.UPDATE : OperationType.CREATE, 'transactions');
      toast.error('Erro ao salvar transação.');
    }
  };

  const filteredCategories = categories.filter(c => c.type === type);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">
            {transactionToEdit ? 'Editar Transação' : 'Nova Transação'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {/* Type Toggle */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => { setType('expense'); setCategory(''); }}
              className={`flex-1 py-3 px-4 rounded-xl font-medium border-2 transition-all ${
                type === 'expense' 
                  ? 'bg-red-50 border-red-500 text-red-700' 
                  : 'border-gray-100 text-gray-500 hover:bg-gray-50'
              }`}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => { setType('income'); setCategory(''); }}
              className={`flex-1 py-3 px-4 rounded-xl font-medium border-2 transition-all ${
                type === 'income' 
                  ? 'bg-green-50 border-green-500 text-green-700' 
                  : 'border-gray-100 text-gray-500 hover:bg-gray-50'
              }`}
            >
              Receita
            </button>
          </div>

          {/* Amount Input */}
          <div className="text-center">
            <label className="block text-sm font-medium text-gray-500 mb-2">Valor</label>
            <div className={`relative inline-flex items-center justify-center transition-opacity ${isVariableAmount ? 'opacity-30 pointer-events-none' : ''}`}>
              <span className={`text-3xl font-bold mr-2 ${type === 'income' ? 'text-green-600' : 'text-red-600'}`}>R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={displayAmount}
                onChange={handleAmountChange}
                className={`text-4xl font-bold bg-transparent border-none outline-none w-48 text-center ${type === 'income' ? 'text-green-600' : 'text-red-600'}`}
                placeholder="0,00"
                disabled={isVariableAmount}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50"
                placeholder="Ex: Supermercado"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              {isAddingCategory ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50"
                    placeholder="Nome da categoria"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <select
                  required
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') {
                      setIsAddingCategory(true);
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 appearance-none"
                >
                  <option value="" disabled>Selecione uma categoria</option>
                  {filteredCategories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  <option value="ADD_NEW" className="font-semibold text-blue-600">+ Adicionar nova categoria</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50"
              />
            </div>

            {!transactionToEdit && (
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="font-medium text-gray-700">Repetir esta transação</span>
                </label>
              </div>
            )}

            {isRecurring && !transactionToEdit && (
              <div className="pl-4 border-l-2 border-blue-200 ml-2 space-y-4">
                <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={isVariableAmount}
                    onChange={(e) => setIsVariableAmount(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-700">Valor variável</span>
                    <span className="text-xs text-gray-500">O valor será definido a cada mês (ex: conta de luz)</span>
                  </div>
                </label>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-gray-100">
            <button
              type="submit"
              className="w-full py-4 px-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              Salvar Transação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
