import React, { useEffect, useState } from 'react';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  Mail, 
  Phone, 
  ExternalLink,
  Filter,
  User,
  UserPlus,
  X,
  ChevronRight,
  FileText,
  DollarSign,
  Users as UsersIcon,
  Paperclip,
  Calendar,
  MapPin,
  Briefcase,
  MessageSquare,
  CheckCircle2,
  Clock,
  PlusCircle,
  Trash2,
  Pencil
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { dbCache } from '../services/dbCache';
import { logAction } from '../services/auditService';
import { Client, Declaration, PricingHistory, ClientDependent, UserProfile } from '../types';
import { handleFirestoreError, OperationType, useAuth } from '../components/FirebaseProvider';

type ClientTab = 'data' | 'dependents' | 'declarations' | 'financial' | 'notes' | 'docs';

export const Clients: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, profile, user: authUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters from URL
  const searchTerm = searchParams.get('q') || '';
  const filterStatus = searchParams.get('status') || 'all';
  const filterResponsible = searchParams.get('responsible') || 'all';

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<ClientTab>('data');
  const [clientDeclarations, setClientDeclarations] = useState<Declaration[]>([]);
  const [clientFinancials, setClientFinancials] = useState<PricingHistory[]>([]);
  const [clientDependents, setClientDependents] = useState<ClientDependent[]>([]);
  const [clientDocs, setClientDocs] = useState<any[]>([]);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: '', category: 'personal', fileUrl: '', description: '' });

  const updateFilters = (newFilters: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    setSearchParams(params);
  };
  
  const [newClient, setNewClient] = useState({
    code: '',
    name: '',
    cpf: '',
    email: '',
    phone: '',
    whatsapp: '',
    birthDate: '',
    maritalStatus: '',
    profession: '',
    internalManagerId: '',
    notes: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressDistrict: '',
    addressCity: '',
    addressState: '',
    addressZipCode: ''
  });

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        dbCache.clear();
        setLoading(true);
        const [clientsData, usersData] = await Promise.all([
          dbCache.getClients(),
          dbCache.getUsers()
        ]);
        setClients(clientsData);
        setUsers(usersData);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'clients');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const fetchClientDetails = async (client: Client) => {
    setSelectedClient(client);
    setActiveTab('data');
    try {
      const declQuery = query(collection(db, 'declarations'), where('clientId', '==', client.id));
      const finQuery = query(collection(db, 'pricing_history'), where('clientId', '==', client.id));
      const depQuery = query(collection(db, 'client_dependents'), where('clientId', '==', client.id));
      const docsQuery = query(collection(db, 'client_documents'), where('clientId', '==', client.id));
      
      const [declSnap, finSnap, depSnap, docsSnap] = await Promise.all([
        getDocs(declQuery), 
        getDocs(finQuery),
        getDocs(depQuery),
        getDocs(docsQuery)
      ]);
      
      setClientDeclarations(declSnap.docs.map(d => ({ id: d.id, ...d.data() } as Declaration)));
      setClientFinancials(finSnap.docs.map(d => ({ id: d.id, ...d.data() } as PricingHistory)));
      setClientDependents(depSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClientDependent)));
      setClientDocs(docsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'client_details');
    }
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    try {
      const docRef = await addDoc(collection(db, 'client_documents'), {
        ...newDoc,
        clientId: selectedClient.id,
        createdAt: new Date().toISOString()
      });
      setClientDocs([...clientDocs, { id: docRef.id, ...newDoc, createdAt: new Date().toISOString() }]);
      setIsDocModalOpen(false);
      setNewDoc({ title: '', category: 'personal', fileUrl: '', description: '' });
      await logAction('create', 'client_documents', docRef.id, { title: newDoc.title });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'client_documents');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      await deleteDoc(doc(db, 'client_documents', id));
      setClientDocs(clientDocs.filter(d => d.id !== id));
      await logAction('delete', 'client_documents', id, {});
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `client_documents/${id}`);
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient) return;
    const id = selectedClient.id;
    const clientName = selectedClient.name;
    
    try {
      console.log(`Attempting to delete client: ${id} (${clientName})`);
      
      // Check if user is admin (frontend check for safety)
      if (!isAdmin) {
        alert('Apenas administradores podem excluir clientes.');
        return;
      }

      await deleteDoc(doc(db, 'clients', id));
      const updatedList = clients.filter(c => c.id !== id);
      setClients(updatedList);
      dbCache.setClientsCache(updatedList);
      
      setSelectedClient(null);
      setIsDeleteConfirmOpen(false);
      
      // Log action
      await logAction('delete', 'clients', id, { name: clientName });
      
      alert('Cliente excluído com sucesso!');
    } catch (err) {
      console.error('Error deleting client:', err);
      // Provide more specific feedback if possible
      if (err instanceof Error && err.message.includes('permission-denied')) {
        alert('Erro: Permissão negada. Verifique se você é um administrador.');
      } else {
        alert('Erro ao excluir cliente. Tente novamente mais tarde.');
      }
      handleFirestoreError(err, OperationType.DELETE, `clients/${id}`);
    }
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setNewClient({
      code: client.code || '',
      name: client.name || '',
      cpf: client.cpf || '',
      email: client.email || '',
      phone: client.phone || '',
      whatsapp: client.whatsapp || '',
      birthDate: client.birthDate || '',
      maritalStatus: client.maritalStatus || '',
      profession: client.profession || '',
      internalManagerId: client.internalManagerId || '',
      notes: client.notes || '',
      addressStreet: client.addressStreet || '',
      addressNumber: client.addressNumber || '',
      addressComplement: client.addressComplement || '',
      addressDistrict: client.addressDistrict || '',
      addressCity: client.addressCity || '',
      addressState: client.addressState || '',
      addressZipCode: client.addressZipCode || ''
    });
    setIsAddModalOpen(true);
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), {
          ...newClient,
          updatedAt: new Date().toISOString(),
        });

        // Audit Log
        await logAction('update', 'clients', editingClient.id, {
          name: newClient.name,
          cpf: newClient.cpf
        });

        const updatedList = clients.map(c => c.id === editingClient.id ? { ...c, ...newClient, updatedAt: new Date().toISOString() } as Client : c);
        setClients(updatedList);
        dbCache.setClientsCache(updatedList);

        if (selectedClient?.id === editingClient.id) {
          setSelectedClient({ ...selectedClient, ...newClient, updatedAt: new Date().toISOString() } as Client);
        }
      } else {
        // Rule: No duplicate CPF for active clients
        const duplicate = clients.find(c => c.cpf === newClient.cpf && c.status === 'active');
        if (duplicate) {
          alert('Já existe um cliente ativo com este CPF.');
          return;
        }

        const docRef = await addDoc(collection(db, 'clients'), {
          ...newClient,
          status: 'active',
          createdByUserId: authUser?.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Audit Log
        await logAction('create', 'clients', docRef.id, {
          name: newClient.name,
          cpf: newClient.cpf
        });

        const addedClient = { id: docRef.id, ...newClient, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as Client;
        const updatedList = [...clients, addedClient];
        setClients(updatedList);
        dbCache.setClientsCache(updatedList);
      }

      setIsAddModalOpen(false);
      setEditingClient(null);
      
      // Reset form
      setNewClient({
        code: '',
        name: '',
        cpf: '',
        email: '',
        phone: '',
        whatsapp: '',
        birthDate: '',
        maritalStatus: '',
        profession: '',
        internalManagerId: '',
        notes: '',
        addressStreet: '',
        addressNumber: '',
        addressComplement: '',
        addressDistrict: '',
        addressCity: '',
        addressState: '',
        addressZipCode: ''
      });
    } catch (err) {
      handleFirestoreError(err, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
    }
  };

  const handleRegisterPayment = async (id: string) => {
    try {
      await updateDoc(doc(db, 'pricing_history', id), {
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Update local state
      setClientFinancials(prev => prev.map(f => f.id === id ? { ...f, paymentStatus: 'paid', paidAt: new Date().toISOString() } : f));
      
      await logAction('update', 'pricing_history', id, {
        action: 'payment_registered'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pricing_history/${id}`);
    }
  };

  const filteredClients = clients.filter(client => {
    // Visibility restriction: only restrict analysts to what they created or manage
    if (profile?.role === 'analista') {
      const isOwner = client.createdByUserId === profile.id;
      const isManager = client.internalManagerId === profile.id;
      if (!isOwner && !isManager) return false;
    }

    // Admin filter by responsible/creator
    if (isAdmin && filterResponsible !== 'all') {
      if (client.createdByUserId !== filterResponsible && client.internalManagerId !== filterResponsible) return false;
    }

    const matchesSearch = (client.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.cpf || '').includes(searchTerm) ||
      (client.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.phone || '').includes(searchTerm);
    
    const matchesStatus = filterStatus === 'all' || client.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const responsibles = Array.from(new Set(clients.map(c => c.internalManagerId).filter(Boolean)));

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Clientes</h2>
          <p className="text-slate-500">Gerencie a base de contribuintes do escritório</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
        >
          <UserPlus size={20} />
          <span>Novo Cliente</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Nome, CPF, E-mail ou Telefone..." 
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={searchTerm}
                  onChange={(e) => updateFilters({ q: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select 
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={filterStatus}
                  onChange={(e) => updateFilters({ status: e.target.value })}
                >
                  <option key="all" value="all">Todos Status</option>
                  <option key="active" value="active">Ativos</option>
                  <option key="inactive" value="inactive">Inativos</option>
                </select>
                {isAdmin && (
                  <select 
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={filterResponsible}
                    onChange={(e) => updateFilters({ responsible: e.target.value })}
                  >
                    <option key="all" value="all">Todos Responsáveis</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                  </select>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">CPF</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Responsável</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center">
                        <div className="flex justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                      </td>
                    </tr>
                  ) : filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        Nenhum cliente encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
                      <tr 
                        key={client.id} 
                        onClick={() => fetchClientDetails(client)}
                        className={`hover:bg-slate-50/50 transition-colors group cursor-pointer ${selectedClient?.id === client.id ? 'bg-blue-50/50' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
                              {(client.name || 'C').charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{client.name}</p>
                              <p className="text-xs text-slate-500">{client.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono">{client.cpf}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {users.find(u => u.id === client.internalManagerId)?.name || users.find(u => u.id === client.internalManagerId)?.email || client.internalManagerId || '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            client.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {client.status === 'active' ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <ChevronRight size={18} className="inline text-slate-300 group-hover:text-blue-500 transition-colors" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {selectedClient ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden sticky top-8">
              <div className="p-6 bg-slate-50 border-b border-slate-100">
                <div className="flex justify-between items-start">
                  <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-100">
                    {(selectedClient.name || 'C').charAt(0)}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEditClient(selectedClient)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                      title="Editar Cliente"
                    >
                      <Pencil size={20} />
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={() => setIsDeleteConfirmOpen(true)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-all"
                        title="Excluir Cliente"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                    <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all">
                      <ExternalLink size={20} />
                    </button>
                    <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-all">
                      <MoreVertical size={20} />
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-4">{selectedClient.name}</h3>
                <p className="text-sm text-slate-500">{selectedClient.cpf}</p>
                
                <div className="flex gap-1 mt-6 overflow-x-auto pb-2 scrollbar-hide">
                  {[
                    { id: 'data', label: 'Dados', icon: <UserPlus size={14} /> },
                    { id: 'dependents', label: 'Dep.', icon: <UsersIcon size={14} /> },
                    { id: 'declarations', label: 'Decl.', icon: <FileText size={14} /> },
                    { id: 'financial', label: 'Fin.', icon: <DollarSign size={14} /> },
                    { id: 'notes', label: 'Obs.', icon: <MessageSquare size={14} /> },
                    { id: 'docs', label: 'Docs', icon: <Paperclip size={14} /> },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as ClientTab)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                        activeTab === tab.id 
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                          : 'bg-white text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 max-h-[600px] overflow-y-auto">
                {activeTab === 'data' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nascimento</p>
                        <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          {selectedClient.birthDate || '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estado Civil</p>
                        <p className="text-sm font-medium text-slate-700">{selectedClient.maritalStatus || '-'}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Profissão</p>
                      <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <Briefcase size={14} className="text-slate-400" />
                        {selectedClient.profession || '-'}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        <Mail size={16} className="text-slate-400" />
                        <span>{selectedClient.email}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                        <Phone size={16} className="text-slate-400" />
                        <span>{selectedClient.phone}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Responsável Interno</p>
                      <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <User size={14} className="text-slate-400" />
                        {users.find(u => u.id === selectedClient.internalManagerId)?.name || users.find(u => u.id === selectedClient.internalManagerId)?.email || selectedClient.internalManagerId || 'Não atribuído'}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Endereço</p>
                      <p className="text-sm text-slate-600 flex items-start gap-2">
                        <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0" />
                        <span>
                          {selectedClient.addressStreet ? (
                            `${selectedClient.addressStreet}, ${selectedClient.addressNumber}${selectedClient.addressComplement ? ` - ${selectedClient.addressComplement}` : ''}, ${selectedClient.addressDistrict}, ${selectedClient.addressCity}/${selectedClient.addressState}`
                          ) : 'Não informado'}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'dependents' && (
                  <div className="space-y-3">
                    {clientDependents.length > 0 ? clientDependents.map((dep) => (
                      <div key={dep.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="font-bold text-slate-700">{dep.name}</p>
                        <div className="flex justify-between mt-1 text-xs text-slate-500">
                          <span>{dep.relationship}</span>
                          <span className="font-mono">{dep.cpf}</span>
                        </div>
                      </div>
                    )) : <p className="text-sm text-slate-400 text-center py-8 italic">Nenhum dependente registrado.</p>}
                  </div>
                )}

                {activeTab === 'declarations' && (
                  <div className="space-y-3">
                    <button 
                      onClick={() => navigate(`/declarations?clientId=${selectedClient.id}`)}
                      className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-blue-200 rounded-xl text-blue-600 font-bold hover:bg-blue-50 transition-all mb-4"
                    >
                      <PlusCircle size={18} />
                      Nova Declaração
                    </button>
                    {clientDeclarations.length > 0 ? clientDeclarations.map(d => (
                      <div key={d.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-700">IRPF {d.exerciseYear}</p>
                          <p className="text-xs text-slate-500">{d.declarationType}</p>
                        </div>
                        <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          {d.kanbanStage.replace('_', ' ')}
                        </span>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-400 text-center py-8 italic">Nenhuma declaração registrada.</p>
                    )}
                  </div>
                )}

                {activeTab === 'financial' && (
                  <div className="space-y-3">
                    {clientFinancials.length > 0 ? clientFinancials.map(f => (
                      <div key={f.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-slate-500 uppercase">Exercício {f.exerciseYear}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            f.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {f.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-lg font-bold text-slate-900">R$ {f.finalAmount.toLocaleString('pt-BR')}</p>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              <Clock size={12} /> Vencimento: {new Date(f.dueDate).toLocaleDateString('pt-BR')}
                            </p>
                            {f.paidAt && (
                              <p className="text-[10px] text-emerald-600 font-bold mt-1 uppercase tracking-wider">
                                Pago em: {new Date(f.paidAt).toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </div>
                          {f.paymentStatus !== 'paid' && (
                            <button 
                              onClick={() => handleRegisterPayment(f.id)}
                              className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-emerald-700 transition-all shadow-sm"
                            >
                              Registrar Pagamento
                            </button>
                          )}
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-400 text-center py-8 italic">Nenhum registro financeiro.</p>
                    )}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-800 leading-relaxed">
                      {selectedClient.notes || 'Nenhuma observação interna registrada para este cliente.'}
                    </div>
                  </div>
                )}

                {activeTab === 'docs' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Documentos Permanentes</p>
                      <button 
                        onClick={() => setIsDocModalOpen(true)}
                        className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1"
                      >
                        <PlusCircle size={14} />
                        Adicionar
                      </button>
                    </div>
                    
                    {clientDocs.length > 0 ? (
                      <div className="space-y-2">
                        {clientDocs.map((doc) => (
                          <div key={doc.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-400 border border-slate-100">
                                <FileText size={16} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-700">{doc.title}</p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{doc.category}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a 
                                href={doc.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-md transition-all"
                              >
                                <ExternalLink size={14} />
                              </a>
                              <button 
                                onClick={() => handleDeleteDoc(doc.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-md transition-all"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <Paperclip size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm italic">Nenhum documento permanente.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-dashed border-slate-200 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                <UsersIcon size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-400">Selecione um cliente</h3>
              <p className="text-sm text-slate-400 mt-1">Clique em um cliente da lista para ver os detalhes completos</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Document Modal */}
      {isDocModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Adicionar Documento</h3>
              <button onClick={() => setIsDocModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddDoc} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Título</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  value={newDoc.title}
                  onChange={(e) => setNewDoc({...newDoc, title: e.target.value})}
                  placeholder="Ex: RG, CPF, Comprovante de Residência"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Categoria</label>
                <select 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  value={newDoc.category}
                  onChange={(e) => setNewDoc({...newDoc, category: e.target.value})}
                >
                  <option value="personal">Pessoal</option>
                  <option value="address">Residencial</option>
                  <option value="professional">Profissional</option>
                  <option value="other">Outros</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">URL do Arquivo</label>
                <input 
                  type="url" 
                  required
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  value={newDoc.fileUrl}
                  onChange={(e) => setNewDoc({...newDoc, fileUrl: e.target.value})}
                  placeholder="https://exemplo.com/arquivo.pdf"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Descrição (Opcional)</label>
                <textarea 
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  value={newDoc.description}
                  onChange={(e) => setNewDoc({...newDoc, description: e.target.value})}
                  rows={2}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button 
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingClient(null);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome Completo</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.name}
                    onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">CPF</label>
                  <input 
                    type="text" 
                    required
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.cpf}
                    onChange={(e) => setNewClient({...newClient, cpf: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Data de Nascimento</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.birthDate}
                    onChange={(e) => setNewClient({...newClient, birthDate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Estado Civil</label>
                  <select 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.maritalStatus}
                    onChange={(e) => setNewClient({...newClient, maritalStatus: e.target.value})}
                  >
                    <option value="">Selecione...</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Profissão</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.profession}
                    onChange={(e) => setNewClient({...newClient, profession: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-mail</label>
                  <input 
                    type="email" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.email}
                    onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Telefone</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.phone}
                    onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">WhatsApp</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.whatsapp}
                    onChange={(e) => setNewClient({...newClient, whatsapp: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Responsável Interno</label>
                  <select 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.internalManagerId}
                    onChange={(e) => setNewClient({...newClient, internalManagerId: e.target.value})}
                  >
                    <option value="">Selecione um responsável...</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-800 mb-4">Endereço Completo</h4>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Logradouro</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.addressStreet}
                    onChange={(e) => setNewClient({...newClient, addressStreet: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Número</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.addressNumber}
                    onChange={(e) => setNewClient({...newClient, addressNumber: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Complemento</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.addressComplement}
                    onChange={(e) => setNewClient({...newClient, addressComplement: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Bairro</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.addressDistrict}
                    onChange={(e) => setNewClient({...newClient, addressDistrict: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Cidade</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.addressCity}
                    onChange={(e) => setNewClient({...newClient, addressCity: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">UF</label>
                  <input 
                    type="text" 
                    maxLength={2}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.addressState}
                    onChange={(e) => setNewClient({...newClient, addressState: e.target.value.toUpperCase()})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">CEP</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={newClient.addressZipCode}
                    onChange={(e) => setNewClient({...newClient, addressZipCode: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingClient(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                  {editingClient ? 'Salvar Alterações' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && selectedClient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Excluir Cliente?</h3>
              <p className="text-slate-500 mt-2">
                Tem certeza que deseja excluir <strong>{selectedClient.name}</strong>? 
                Esta ação é irreversível e apagará todos os dados básicos do cliente.
              </p>
              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteClient}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all shadow-md shadow-rose-100"
                >
                  Excluir Permanentemente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
