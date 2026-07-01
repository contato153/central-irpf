import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  updateDoc, 
  addDoc,
  doc, 
  orderBy,
  where,
  setDoc,
  deleteDoc,
  limit,
  getFirestore
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { db, auth } from '../firebase';
import { dbCache } from '../services/dbCache';
import { useAuth } from '../components/FirebaseProvider';
import { 
  User, 
  Shield, 
  Settings as SettingsIcon, 
  Database, 
  History, 
  Plus, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  MoreVertical,
  Edit2,
  Trash2,
  Save,
  FileText,
  X,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  UserProfile, 
  UserRole,
  AuditLog
} from '../types';
import { handleFirestoreError, OperationType } from '../components/FirebaseProvider';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Sub-component for Edit User Modal
const EditUserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  user: UserProfile | null;
}> = ({ isOpen, onClose, onSuccess, user }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('analista');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || user.nome || '');
      setRole(user.role || 'analista');
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await updateDoc(doc(db, 'users', user.id), {
        name,
        nome: name,
        role,
        updatedAt: new Date().toISOString(),
      });

      alert('Usuário atualizado com sucesso!');
      dbCache.clear();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao atualizar usuário:', err);
      setError('Erro ao atualizar usuário. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">Editar Usuário</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
            <input 
              type="text"
              required
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João Silva"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail (Não editável)</label>
            <input 
              type="email"
              disabled
              className="w-full p-2 border border-slate-100 bg-slate-50 text-slate-500 rounded-lg cursor-not-allowed"
              value={user.email}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nível de Acesso</label>
            <select 
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="admin">Administrador (Acesso Total)</option>
              <option value="gestor">Gestor (Acesso Parcial)</option>
              <option value="analista">Analista (Somente Leitura/Envio)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-bold"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-bold disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Sub-component for New User Modal
const NewUserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('analista');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let secondaryApp;
    try {
      // Initialize a secondary Firebase app to create the user without logging out the admin
      secondaryApp = initializeApp(firebaseConfig, 'secondary');
      const secondaryAuth = getAuth(secondaryApp);
      
      // 1. Create the Auth account
      let uid: string;
      try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        uid = userCredential.user.uid;
      } catch (authErr: any) {
        const isEmailInUse = authErr.code === 'auth/email-already-in-use' || 
                             (authErr.message && authErr.message.includes('email-already-in-use')) ||
                             String(authErr).includes('email-already-in-use');
        if (isEmailInUse) {
          // Try to sign in to see if we can "recover" the UID and create the Firestore profile
          try {
            const userCredential = await signInWithEmailAndPassword(secondaryAuth, email, password);
            uid = userCredential.user.uid;
            console.log('User recovered from Auth, proceeding to create Firestore profile');
          } catch (signInErr) {
            // If sign in fails, it means the password is different or account is locked
            throw authErr; // Throw the original email-already-in-use error
          }
        } else {
          throw authErr;
        }
      }

      // 2. Create the Firestore profile
      const newProfile: UserProfile = {
        id: uid,
        email,
        name,
        nome: name,
        role,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // If creating an analista, write using the secondary user's database session
      // to satisfy the Firestore rule: allow create if request.auth.uid == userId && role == 'analista'
      if (role === 'analista') {
        const secondaryDb = getFirestore(secondaryApp);
        await setDoc(doc(secondaryDb, 'users', uid), newProfile);
      } else {
        await setDoc(doc(db, 'users', uid), newProfile);
      }

      // 3. Sign out from the secondary auth and cleanup
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      alert('Usuário cadastrado com sucesso!');
      dbCache.clear();
      if (onSuccess) onSuccess();
      onClose();
      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setRole('analista');
    } catch (err: any) {
      console.error('Erro ao cadastrar usuário:', err);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';
      
      let finalErrorMessage = 'Erro ao cadastrar usuário';
      if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('auth/email-already-in-use') || String(err).includes('email-already-in-use')) {
        finalErrorMessage = 'Este e-mail já está cadastrado. Se o usuário não aparece na lista, tente usar a mesma senha que foi definida anteriormente para recuperar o perfil.';
      } else if (errorCode === 'auth/invalid-email' || errorMessage.includes('auth/invalid-email')) {
        finalErrorMessage = 'O e-mail informado é inválido.';
      } else if (errorCode === 'auth/weak-password' || errorMessage.includes('auth/weak-password')) {
        finalErrorMessage = 'A senha é muito fraca. Use pelo menos 6 caracteres.';
      } else if (errorCode === 'auth/invalid-credential' || errorMessage.includes('auth/invalid-credential')) {
        finalErrorMessage = 'Credenciais inválidas ou erro de autenticação ao tentar recuperar o perfil.';
      } else if (errorMessage) {
        finalErrorMessage = errorMessage;
      }
      
      setError(finalErrorMessage);
      if (secondaryApp) {
        try { await deleteApp(secondaryApp); } catch (e) {}
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">Novo Usuário</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleCreateUser} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
            <input 
              required
              type="text"
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João Silva"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <input 
              required
              type="email"
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha Inicial</label>
            <div className="relative">
              <input 
                required
                type={showPassword ? "text" : "password"}
                minLength={6}
                className="w-full p-2 pr-10 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1 rounded-md hover:bg-slate-100 transition-all"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nível de Acesso</label>
            <select 
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="analista">Analista</option>
              <option value="gestor">Gestor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-bold"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-bold disabled:opacity-50"
            >
              {loading ? 'Cadastrando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Sub-component for Document Templates management
const DocumentTemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  
  const [formData, setFormData] = useState({
    label: '',
    category: 'Renda',
    required: true,
    active: true
  });

  const fetchData = async (force = false) => {
    try {
      setLoading(true);
      const data = await dbCache.getChecklistTemplates(force);
      const sorted = [...data].sort((a: any, b: any) => (a.label || '').localeCompare(b.label || ''));
      setTemplates(sorted);
    } catch (err) {
      console.error('Error loading checklist templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await updateDoc(doc(db, 'document_checklist_templates', editingTemplate.id), {
          ...formData,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'document_checklist_templates'), {
          ...formData,
          name: formData.label.toLowerCase().replace(/\s+/g, '_'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      setEditingTemplate(null);
      setFormData({ label: '', category: 'Renda', required: true, active: true });
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, editingTemplate ? OperationType.UPDATE : OperationType.CREATE, 'document_checklist_templates');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este modelo de documento?')) return;
    try {
      await deleteDoc(doc(db, 'document_checklist_templates', id));
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'document_checklist_templates');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800">Modelos de Documentos para Solicitação</h3>
        <button 
          onClick={() => {
            setEditingTemplate(null);
            setFormData({ label: '', category: 'Renda', required: true, active: true });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm text-sm font-bold"
        >
          <Plus size={18} />
          Novo Modelo
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-bottom border-slate-100">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Documento</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Categoria</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Obrigatório</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Status</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {templates.map((template) => (
              <tr key={template.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-800">{template.label}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{template.category}</td>
                <td className="px-6 py-4">
                  {template.required ? (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">Sim</span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">Não</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {template.active ? (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">Ativo</span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">Inativo</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setEditingTemplate(template);
                        setFormData({
                          label: template.label,
                          category: template.category,
                          required: template.required,
                          active: template.active
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(template.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                  Nenhum modelo de documento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                {editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Documento'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Documento</label>
                <input 
                  type="text"
                  required
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Ex: Comprovante de Rendimentos"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                <select 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="Renda">Renda</option>
                  <option value="Bens e Direitos">Bens e Direitos</option>
                  <option value="Dívidas">Dívidas</option>
                  <option value="Pagamentos">Pagamentos</option>
                  <option value="Dependentes">Dependentes</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    checked={formData.required}
                    onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-700">Obrigatório</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-700">Ativo</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-bold"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold shadow-sm"
                >
                  {editingTemplate ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component for System Settings to isolate input state
const SystemSettingsTab: React.FC<{
  settings: any;
  onUpdate: (newSettings: any) => void;
  onSave: () => void;
}> = ({ settings, onUpdate, onSave }) => {
  const [newYear, setNewYear] = useState('');

  const handleAddYear = () => {
    const year = parseInt(newYear);
    if (isNaN(year)) return;
    if (settings.availableYears.includes(year)) return;
    
    onUpdate({
      ...settings,
      availableYears: [...settings.availableYears, year].sort((a, b) => b - a)
    });
    setNewYear('');
  };

  const handleRemoveYear = (year: number) => {
    onUpdate({
      ...settings,
      availableYears: settings.availableYears.filter((y: number) => y !== year)
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <SettingsIcon size={20} className="text-indigo-600" />
          Parâmetros do Sistema
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Exercício Atual</label>
            <select 
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={settings.currentExercise}
              onChange={(e) => onUpdate({ ...settings, currentExercise: Number(e.target.value) })}
            >
              {settings.availableYears.map((year: number) => (
                <option key={year} value={year}>Exercício {year} (Ano-Calendário {year - 1})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Prazo Padrão (Dias)</label>
            <input 
              type="text"
              inputMode="numeric"
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={settings.defaultDeadlineDays}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                onUpdate({ ...settings, defaultDeadlineDays: Number(val) });
              }}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="block text-sm font-bold text-slate-800 mb-3">Anos de Exercício Disponíveis</label>
          <div className="flex gap-2 mb-4">
            <input 
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="Ex: 2025"
              className="flex-1 p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value.replace(/\D/g, ''))}
            />
            <button 
              onClick={handleAddYear}
              className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-900 transition-colors"
            >
              Adicionar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {settings.availableYears.map((year: number) => (
              <div key={year} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                <span className="text-sm font-bold text-slate-700">Ex {year} (AC {year - 1})</span>
                <button 
                  onClick={() => handleRemoveYear(year)}
                  className="text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800">Backup Automático</p>
              <p className="text-sm text-slate-500">Realizar backup diário dos dados na nuvem.</p>
            </div>
            <button 
              onClick={() => onUpdate({ ...settings, backupEnabled: !settings.backupEnabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${settings.backupEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.backupEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800">Notificações por E-mail</p>
              <p className="text-sm text-slate-500">Enviar alertas de novos documentos e prazos.</p>
            </div>
            <button 
              onClick={() => onUpdate({ ...settings, notificationsEnabled: !settings.notificationsEnabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${settings.notificationsEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.notificationsEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button 
            onClick={onSave}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-bold"
          >
            <Save size={18} />
            Salvar Alterações
          </button>
        </div>
      </div>

      <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
        <h3 className="text-lg font-bold text-rose-800 flex items-center gap-2 mb-2">
          <AlertCircle size={20} />
          Zona de Perigo
        </h3>
        <p className="text-sm text-rose-700 mb-4">Ações irreversíveis que impactam todo o sistema.</p>
        <button className="bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors text-sm font-bold shadow-sm">
          Limpar Cache do Sistema
        </button>
      </div>
    </div>
  );
};

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'system' | 'logs' | 'documents'>('users');
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // System Settings State
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - i);
  const [systemSettings, setSystemSettings] = useState({
    currentExercise: currentYear,
    defaultDeadlineDays: 7,
    backupEnabled: true,
    notificationsEnabled: true,
    availableYears: years
  });

  const fetchAdminData = async (force = false) => {
    try {
      setLoading(true);
      const [usersData, settingsData, logsData] = await Promise.all([
        dbCache.getUsers(force),
        dbCache.getSystemSettings(force),
        dbCache.getAuditLogs(force)
      ]);

      setUsers(usersData);

      if (settingsData) {
        if (settingsData.availableYears && Array.isArray(settingsData.availableYears)) {
          const years = [...settingsData.availableYears];
          const currentYear = new Date().getFullYear();
          if (!years.includes(currentYear)) years.push(currentYear);
          if (!years.includes(currentYear - 1)) years.push(currentYear - 1);
          const uniqueYears = Array.from(new Set(years)).sort((a, b) => b - a);
          setSystemSettings({ ...settingsData, availableYears: uniqueYears });
        } else {
          setSystemSettings(settingsData);
        }
      }

      setAuditLogs(logsData);
    } catch (err) {
      console.error('Error fetching admin settings logic:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchAdminData();
  }, [user]);

  const handleSaveSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'system'), systemSettings);
      await fetchAdminData(true);
      alert('Configurações salvas com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings/system');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
        updatedAt: new Date().toISOString()
      });
      fetchAdminData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Tem certeza que deseja remover este usuário?')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      fetchAdminData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Configurações</h2>
          <p className="text-slate-500">Gerencie usuários, permissões e parâmetros do sistema.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'users' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <User size={18} />
          Usuários
        </button>
        <button 
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'system' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <SettingsIcon size={18} />
          Sistema
        </button>
        <button 
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'documents' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText size={18} />
          Documentos
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'logs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={18} />
          Logs
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800">Gerenciamento de Colaboradores</h3>
            <button 
              onClick={() => setIsNewUserModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm text-sm font-bold"
            >
              <Plus size={18} />
              Novo Usuário
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-bottom border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Usuário</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">E-mail</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Nível de Acesso</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Data de Cadastro</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                          {(user.name || user.nome || user.email || 'U').charAt(0)}
                        </div>
                        <span className="font-medium text-slate-800">{user.name || user.nome || 'Usuário Sem Nome'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                    <td className="px-6 py-4">
                      <select 
                        className={`text-xs font-bold px-2 py-1 rounded-lg border focus:outline-none ${
                          user.role === 'admin' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          user.role === 'gestor' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                        value={user.role}
                        onChange={(e) => handleUpdateRole(user.id, e.target.value as UserRole)}
                        disabled={user.email === 'lucas@lemcontabilidade.com'}
                      >
                        <option value="admin">Administrador</option>
                        <option value="gestor">Gestor</option>
                        <option value="analista">Analista</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {user.createdAt ? format(new Date(user.createdAt), 'dd/MM/yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setSelectedUser(user);
                            setIsEditUserModalOpen(true);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Editar Usuário"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={user.email === 'lucas@lemcontabilidade.com'}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Excluir Usuário"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <SystemSettingsTab 
          settings={systemSettings}
          onUpdate={setSystemSettings}
          onSave={handleSaveSettings}
        />
      )}

      {activeTab === 'documents' && (
        <DocumentTemplatesTab />
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-800">Log de Atividades Recentes</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {auditLogs.slice(0, 50).map((log) => (
              <div key={log.id} className="p-4 flex gap-4 items-start hover:bg-slate-50 transition-colors">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-500 mt-1">
                  <Database size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-800">
                    <span className="font-bold">{log.userName}</span> {log.action}
                    {log.details && typeof log.details === 'string' && (
                      <span className="text-slate-500 ml-1">— {log.details}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {log.timestamp && formatDistanceToNow(
                      log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp), 
                      { addSuffix: true, locale: ptBR }
                    )}
                  </p>
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <div className="p-8 text-center text-slate-500 italic">Nenhum log de atividade encontrado.</div>
            )}
          </div>
        </div>
      )}

      <NewUserModal 
        isOpen={isNewUserModalOpen}
        onClose={() => setIsNewUserModalOpen(false)}
        onSuccess={() => fetchAdminData(true)}
      />

      <EditUserModal 
        isOpen={isEditUserModalOpen}
        onClose={() => {
          setIsEditUserModalOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={() => fetchAdminData(true)}
        user={selectedUser}
      />
    </div>
  );
};
