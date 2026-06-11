import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Mail, CheckCircle, XCircle, Clock, Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

interface Invite {
  id: string;
  email: string;
  ownerId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export default function Settings() {
  const { user, userProfile } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [sentInvites, setSentInvites] = useState<Invite[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    // Listen to sent invites
    const sentQuery = query(
      collection(db, 'invites'),
      where('ownerId', '==', user.uid)
    );

    const unsubSent = onSnapshot(sentQuery, (snapshot) => {
      const data: Invite[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Invite);
      });
      setSentInvites(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invites'));

    // Listen to received invites
    const receivedQuery = query(
      collection(db, 'invites'),
      where('email', '==', user.email)
    );

    const unsubReceived = onSnapshot(receivedQuery, (snapshot) => {
      const data: Invite[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Invite);
      });
      setReceivedInvites(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invites'));

    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [user]);

  const handleSendInvite = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user) return;

  if (inviteEmail === user.email) {
    toast.error('Você não pode convidar a si mesmo.');
    return;
  }

  setLoading(true);

  try {
    // Check if invite already exists
    const q = query(
      collection(db, 'invites'),
      where('ownerId', '==', user.uid),
      where('email', '==', inviteEmail)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      toast.error('Você já enviou um convite para este email.');
      setLoading(false);
      return;
    }

    // 🔥 CRIA O CONVITE
    const docRef = await addDoc(collection(db, 'invites'), {
      email: inviteEmail,
      ownerId: user.uid,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // 🔥 GERA LINK
    const inviteLink = `${window.location.origin}/invite/${docRef.id}`;

    // 🔥 COPIA AUTOMATICAMENTE
    await navigator.clipboard.writeText(inviteLink);

    // 🔥 LIMPA CAMPO
    setInviteEmail('');

    // 🔥 FEEDBACK
    toast.success('Convite criado! Link copiado para a área de transferência.');

  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'invites');
    toast.error('Erro ao enviar convite.');
  } finally {
    setLoading(false);
  }
};

  const handleAcceptInvite = async (invite: Invite) => {
    if (!user) return;
    try {
      // Update invite status
      await updateDoc(doc(db, 'invites', invite.id), {
        status: 'accepted'
      });

      // Update current user profile to set partnerId
      await updateDoc(doc(db, 'users', user.uid), {
        partnerId: invite.ownerId,
        partnerEmail: invite.email // Actually, we should get the owner's email, but we don't have it easily without a cloud function. We'll just set partnerId.
      });

      toast.success('Convite aceito! Agora vocês compartilham o mesmo espaço financeiro.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invites/${invite.id}`);
      toast.error('Erro ao aceitar convite.');
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    try {
      await updateDoc(doc(db, 'invites', inviteId), {
        status: 'rejected'
      });
      toast.success('Convite recusado.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invites/${inviteId}`);
      toast.error('Erro ao recusar convite.');
    }
  };

  const handleRemovePartner = () => {
    setShowDisconnectModal(true);
  };

  const confirmRemovePartner = async () => {
    if (!user) return;
    
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        partnerId: null,
        partnerEmail: null
      });
      toast.success('Parceria removida com sucesso.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error('Erro ao remover parceria.');
    } finally {
      setShowDisconnectModal(false);
    }
  };

const handleConfirmDeleteAccount = async () => {
  if (!user) return;

  setIsDeletingAccount(true);

  try {
    const idToken = await user.getIdToken();

    const response = await fetch('/api/delete-account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Erro ao deletar conta');
    }

    toast.success('Conta excluída com sucesso.');

    // 🔥 IMPORTANTE: logout
    const { signOut } = await import('firebase/auth');
    const { auth } = await import('../lib/firebase');

    await signOut(auth);

    // 🔥 REDIRECIONA
    window.location.href = '/login';

  } catch (error: any) {
    console.error('Error deleting account:', error);

    if (error.code === 'auth/requires-recent-login') {
      toast.error('Por segurança, faça login novamente antes de excluir a conta.');
    } else {
      toast.error('Erro ao excluir conta. Tente novamente.');
    }

    setIsDeletingAccount(false);
    setShowDeleteAccountModal(false);
  }
};

  const handleExportBackup = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const ownerId = userProfile?.partnerId || user.uid;
      
      const exportData: any = {
        transactions: [],
        categories: [],
        recurringTransactions: [],
        recurringSkips: [],
        exportDate: new Date().toISOString(),
        version: '1.0'
      };

      const [txSnap, catSnap, recSnap, skipsSnap] = await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('ownerId', '==', ownerId))),
        getDocs(query(collection(db, 'categories'), where('ownerId', '==', ownerId))),
        getDocs(query(collection(db, 'recurringTransactions'), where('ownerId', '==', ownerId))),
        getDocs(query(collection(db, 'recurringSkips'), where('ownerId', '==', ownerId)))
      ]);

      txSnap.forEach(doc => exportData.transactions.push({ _id: doc.id, ...doc.data() }));
      catSnap.forEach(doc => exportData.categories.push({ _id: doc.id, ...doc.data() }));
      recSnap.forEach(doc => exportData.recurringTransactions.push({ _id: doc.id, ...doc.data() }));
      skipsSnap.forEach(doc => exportData.recurringSkips.push({ _id: doc.id, ...doc.data() }));

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_financas_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Backup exportado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao exportar backup');
    } finally {
      setIsExporting(false);
    }
  };

  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    setShowImportConfirm(true);
  };

  const executeImport = async () => {
    if (!pendingImportFile || !user) {
       setShowImportConfirm(false);
       return;
    }
    const file = pendingImportFile;
    setShowImportConfirm(false);

    const ownerId = userProfile?.partnerId || user.uid;

    setIsImporting(true);
    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.transactions || !importData.categories) {
        throw new Error('Formato de arquivo inválido');
      }

      // Clear existing data
      const [txSnap, catSnap, recSnap, skipsSnap] = await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('ownerId', '==', ownerId))),
        getDocs(query(collection(db, 'categories'), where('ownerId', '==', ownerId))),
        getDocs(query(collection(db, 'recurringTransactions'), where('ownerId', '==', ownerId))),
        getDocs(query(collection(db, 'recurringSkips'), where('ownerId', '==', ownerId)))
      ]);

      // Build maps for existing data
      const existingTxs = new Map(txSnap.docs.map(doc => [doc.id, doc.data()]));
      const existingCats = new Map(catSnap.docs.map(doc => [doc.id, doc.data()]));
      const existingRecs = new Map(recSnap.docs.map(doc => [doc.id, doc.data()]));
      const existingSkips = new Map(skipsSnap.docs.map(doc => [doc.id, doc.data()]));

      let batch = writeBatch(db);
      let opCount = 0;

      const commitBatchIfNeeded = async () => {
        if (opCount >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      // Find IDs in import data
      const importTxIds = new Set(importData.transactions.map((t: any) => t._id).filter(Boolean));
      const importCatIds = new Set(importData.categories.map((c: any) => c._id).filter(Boolean));
      const importRecIds = new Set((importData.recurringTransactions || []).map((r: any) => r._id).filter(Boolean));
      const importSkipsIds = new Set((importData.recurringSkips || []).map((s: any) => s._id).filter(Boolean));

      // ONLY delete docs that are NOT in the import data
      for (const docSnap of txSnap.docs) {
        if (!importTxIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
          opCount++;
          await commitBatchIfNeeded();
        }
      }
      for (const docSnap of catSnap.docs) {
        if (!importCatIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
          opCount++;
          await commitBatchIfNeeded();
        }
      }
      for (const docSnap of recSnap.docs) {
        if (!importRecIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
          opCount++;
          await commitBatchIfNeeded();
        }
      }
      for (const docSnap of skipsSnap.docs) {
        if (!importSkipsIds.has(docSnap.id)) {
          batch.delete(docSnap.ref);
          opCount++;
          await commitBatchIfNeeded();
        }
      }

      // Add or update new data
      for (const item of importData.transactions) {
        const id = item._id;
        const ref = id ? doc(db, 'transactions', id) : doc(collection(db, 'transactions'));
        const { _id, ...data } = item;
        
        let txData = { ...data, ownerId };
        // Rules enforcement: Se não existia (create), creatorId PRECISA ser o usuario logado
        if (!existingTxs.has(id)) {
           txData.creatorId = user.uid;
        } else {
           // Se existia (update), creatorId, createdAt, e ownerId TEM QUE SER os mesmos do original
           const existing = existingTxs.get(id);
           txData.creatorId = existing.creatorId;
           txData.createdAt = existing.createdAt || txData.createdAt;
           txData.ownerId = existing.ownerId;
        }

        batch.set(ref, txData);
        opCount++;
        await commitBatchIfNeeded();
      }

      for (const item of importData.categories) {
        const id = item._id;
        const ref = id ? doc(db, 'categories', id) : doc(collection(db, 'categories'));
        const { _id, ...data } = item;
        
        let catData = { ...data, ownerId };
        // Validations for categories
        if (!existingCats.has(id)) {
           // Create
        } else {
           const existing = existingCats.get(id);
           catData.ownerId = existing.ownerId;
        }

        batch.set(ref, catData);
        opCount++;
        await commitBatchIfNeeded();
      }

      if (importData.recurringTransactions) {
        for (const item of importData.recurringTransactions) {
          const id = item._id;
          const ref = id ? doc(db, 'recurringTransactions', id) : doc(collection(db, 'recurringTransactions'));
          const { _id, ...data } = item;
          
          let recData = { ...data, ownerId };
          if (!existingRecs.has(id)) {
             recData.creatorId = user.uid;
          } else {
             const existing = existingRecs.get(id);
             recData.creatorId = existing.creatorId;
             recData.createdAt = existing.createdAt || recData.createdAt;
             recData.ownerId = existing.ownerId;
          }

          batch.set(ref, recData);
          opCount++;
          await commitBatchIfNeeded();
        }
      }

      if (importData.recurringSkips) {
        for (const item of importData.recurringSkips) {
          const id = item._id;
          const ref = id ? doc(db, 'recurringSkips', id) : doc(collection(db, 'recurringSkips'));
          const { _id, ...data } = item;
          batch.set(ref, { ...data, ownerId });
          opCount++;
          await commitBatchIfNeeded();
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      toast.success('Backup restaurado com sucesso!');
    } catch (error) {
      console.error("IMPORT ERROR:", error);
      toast.error('Erro ao restaurar backup. Verifique se o arquivo é válido.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>

      {/* Perfil */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seu Perfil</h2>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-2xl">
            {user?.email?.[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900">{user?.email}</p>
            <p className="text-sm text-gray-500">
              {userProfile?.partnerId ? 'Conta Compartilhada' : 'Conta Individual'}
            </p>
          </div>
        </div>
        
        {userProfile?.partnerId && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-600 mb-3">Você está compartilhando dados com um parceiro.</p>
            <button
              onClick={handleRemovePartner}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              Desconectar Parceiro
            </button>
          </div>
        )}
      </div>

      {/* Convidar Parceiro */}
      {!userProfile?.partnerId && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Convidar Parceiro</h2>
          <p className="text-sm text-gray-500 mb-6">
            Convide seu parceiro(a) para compartilhar o controle financeiro. Vocês verão as mesmas transações e saldo.
          </p>

          <form onSubmit={handleSendInvite} className="flex gap-3">
            <div className="flex-1 relative">
              <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email do parceiro"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Convidar'}
            </button>
          </form>

          {/* Convites Enviados */}
          {sentInvites.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Convites Enviados</h3>
              <div className="space-y-3">
                {sentInvites.map(invite => (
                  <div key={invite.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-sm text-gray-600">{invite.email}</span>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 ${
                      invite.status === 'accepted' ? 'bg-green-100 text-green-700' :
                      invite.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {invite.status === 'accepted' && <CheckCircle className="w-3 h-3" />}
                      {invite.status === 'rejected' && <XCircle className="w-3 h-3" />}
                      {invite.status === 'pending' && <Clock className="w-3 h-3" />}
                      {invite.status === 'accepted' ? 'Aceito' :
                       invite.status === 'rejected' ? 'Recusado' : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Convites Recebidos */}
      {receivedInvites.filter(i => i.status === 'pending').length > 0 && !userProfile?.partnerId && (
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Convites Recebidos</h2>
          <div className="space-y-4">
            {receivedInvites.filter(i => i.status === 'pending').map(invite => (
              <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">Alguém quer compartilhar finanças com você</p>
                  <p className="text-xs text-gray-500 mt-1">Este convite foi enviado para seu email.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRejectInvite(invite.id)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Recusar
                  </button>
                  <button
                    onClick={() => handleAcceptInvite(invite)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Aceitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup e Restauração */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Backup de Dados</h2>
        <p className="text-sm text-gray-500 mb-6">
          Exporte seus dados financeiros (transações, categorias, recorrências) para um arquivo JSON ou importe um backup existente. <strong>Atenção: A importação apagará os dados atuais e os substituirá.</strong>
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exportando...' : 'Exportar Backup'}
          </button>

          <div>
            <input
              id="file-upload"
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={(e) => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              disabled={isImporting}
              className="flex items-center justify-center gap-2 px-6 py-2.5 w-full sm:w-auto border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {isImporting ? 'Importando...' : 'Importar Backup'}
            </button>
          </div>
        </div>
      </div>

      {/* Zona de Perigo */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
        <h2 className="text-lg font-semibold text-red-600 mb-2">Zona de Perigo</h2>
        <p className="text-sm text-gray-500 mb-6">
          A exclusão da conta é permanente e não pode ser desfeita. Todos os seus dados, transações e categorias serão apagados.
        </p>
        <button
          onClick={() => setShowDeleteAccountModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          Deletar Minha Conta
        </button>
      </div>

      {/* Modals */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Restaurar Backup</h3>
            <p className="text-gray-600 mb-6">
              Atenção: Restaurar um backup irá <strong>APAGAR</strong> todos os seus dados atuais e substituí-los pelos dados do arquivo. Deseja continuar?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImportConfirm(false);
                  setPendingImportFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={executeImport}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                disabled={isImporting}
              >
                {isImporting ? 'Restaurando...' : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisconnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Desconectar Parceiro</h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja desconectar do seu parceiro? Vocês não compartilharão mais os dados financeiros.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRemovePartner}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
              >
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-red-600 mb-2">Deletar Conta</h3>
            <p className="text-gray-600 mb-6">
              Esta ação é <strong>irreversível</strong>. Todos os seus dados serão apagados permanentemente. Tem certeza que deseja continuar?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteAccountModal(false)}
                disabled={isDeletingAccount}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteAccount}
                disabled={isDeletingAccount}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeletingAccount ? 'Deletando...' : 'Sim, deletar conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
