import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { User, Users, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Onboarding() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const createDefaultCategories = async (uid: string) => {
    try {
      // Check if categories already exist
      const q = query(collection(db, 'categories'), where('ownerId', '==', uid));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        const defaultCategories = [
          { name: 'Salário', type: 'income', color: '#22c55e', ownerId: uid },
          { name: 'Alimentação', type: 'expense', color: '#ef4444', ownerId: uid },
          { name: 'Moradia', type: 'expense', color: '#3b82f6', ownerId: uid },
          { name: 'Transporte', type: 'expense', color: '#f59e0b', ownerId: uid },
          { name: 'Lazer', type: 'expense', color: '#8b5cf6', ownerId: uid },
          { name: 'Saúde', type: 'expense', color: '#ec4899', ownerId: uid },
          { name: 'Outros', type: 'expense', color: '#6b7280', ownerId: uid },
        ];

        for (const cat of defaultCategories) {
          await addDoc(collection(db, 'categories'), cat);
        }
      }
    } catch (error) {
      console.error('Error creating default categories:', error);
    }
  };

  const handleChoice = async (type: 'individual' | 'shared') => {
    if (!user) return;
    setLoading(true);

    try {
      // Create default categories for the user
      await createDefaultCategories(user.uid);

      // Update user profile
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        onboardingCompleted: true,
      });

      if (type === 'shared') {
        toast.success('Tudo pronto! Convide seu parceiro(a) agora.');
        navigate('/settings');
      } else {
        toast.success('Tudo pronto! Bem-vindo ao COMTI Finanças.');
        navigate('/');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error('Ocorreu um erro. Tente novamente.');
      setLoading(false);
    }
  };

  const firstName = userProfile?.name?.split(' ')[0] || 'Usuário';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="p-8 md:p-12 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Bem-vindo, {firstName}! 👋
          </h1>
          <p className="text-lg text-gray-600 mb-12">
            Como você quer usar o COMTI Finanças?
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Individual Option */}
            <button
              onClick={() => handleChoice('individual')}
              disabled={loading}
              className="group relative flex flex-col items-center p-8 border-2 border-gray-100 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left disabled:opacity-50"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <User className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Uso Individual</h3>
              <p className="text-gray-500 text-center mb-6">
                Quero controlar minhas finanças pessoais sozinho.
              </p>
              <div className="mt-auto flex items-center text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Começar <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </button>

            {/* Shared Option */}
            <button
              onClick={() => handleChoice('shared')}
              disabled={loading}
              className="group relative flex flex-col items-center p-8 border-2 border-gray-100 rounded-2xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left disabled:opacity-50"
            >
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Uso Compartilhado</h3>
              <p className="text-gray-500 text-center mb-6">
                Quero dividir e controlar as finanças com meu parceiro(a).
              </p>
              <div className="mt-auto flex items-center text-purple-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Convidar Parceiro(a) <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
