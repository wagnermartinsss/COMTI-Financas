import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Wallet, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Invite() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [invite, setInvite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInvite = async () => {
      if (!inviteId) return;
      
      try {
        const inviteDoc = await getDoc(doc(db, 'invites', inviteId));
        if (inviteDoc.exists()) {
          setInvite({ id: inviteDoc.id, ...inviteDoc.data() });
        } else {
          setError('Convite não encontrado ou já expirou.');
        }
      } catch (err) {
        console.error('Error fetching invite:', err);
        setError('Erro ao carregar o convite.');
      } finally {
        setLoading(false);
      }
    };

    fetchInvite();
  }, [inviteId]);

  const handleAccept = async () => {
    if (!user || !invite) return;
    
    if (user.email !== invite.email) {
      toast.error('Este convite foi enviado para outro email.');
      return;
    }

    setLoading(true);
    try {
      // Update invite status
      await updateDoc(doc(db, 'invites', invite.id), {
        status: 'accepted'
      });

      // Update current user profile to set partnerId
      await updateDoc(doc(db, 'users', user.uid), {
        partnerId: invite.ownerId,
        partnerEmail: invite.email
      });

      toast.success('Convite aceito! Agora vocês compartilham o mesmo espaço financeiro.');
      navigate('/');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `invites/${invite.id}`);
      toast.error('Erro ao aceitar convite.');
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!user || !invite) return;
    
    if (user.email !== invite.email) {
      toast.error('Este convite foi enviado para outro email.');
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'invites', invite.id), {
        status: 'rejected'
      });
      toast.success('Convite recusado.');
      navigate('/');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `invites/${invite.id}`);
      toast.error('Erro ao recusar convite.');
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ops!</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/" className="text-blue-600 font-medium hover:underline">
            Voltar para o início
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Convite Recebido</h1>
          <p className="text-gray-600 mb-6">
            Você foi convidado para compartilhar o controle financeiro no COMTI Finanças.
          </p>
          <div className="bg-blue-50 p-4 rounded-lg mb-8">
            <p className="text-sm text-blue-800">
              Para aceitar o convite, você precisa criar uma conta ou fazer login com o email <strong>{invite?.email}</strong>.
            </p>
          </div>
          <div className="space-y-3">
            <Link
              to="/register"
              className="block w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Criar Conta
            </Link>
            <Link
              to="/login"
              className="block w-full py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
            >
              Fazer Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (invite?.status !== 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-gray-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Convite já processado</h1>
          <p className="text-gray-600 mb-6">Este convite já foi aceito ou recusado anteriormente.</p>
          <Link to="/" className="text-blue-600 font-medium hover:underline">
            Ir para o Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
          <Wallet className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Convite de Parceria</h1>
        <p className="text-gray-600 mb-8">
          Você foi convidado para compartilhar o controle financeiro. Ao aceitar, vocês verão as mesmas transações e saldo.
        </p>
        
        {user.email !== invite.email && (
          <div className="bg-red-50 p-4 rounded-lg mb-6 text-left">
            <p className="text-sm text-red-800 font-medium mb-1">Atenção:</p>
            <p className="text-sm text-red-700">
              Este convite foi enviado para <strong>{invite.email}</strong>, mas você está logado como <strong>{user.email}</strong>.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleAccept}
            disabled={user.email !== invite.email}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Aceitar Convite
          </button>
          <button
            onClick={handleReject}
            disabled={user.email !== invite.email}
            className="w-full py-2.5 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}
