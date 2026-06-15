import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  orderBy,
  where,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { dbCache } from '../services/dbCache';
import { 
  DollarSign, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Calendar,
  User,
  Plus,
  X,
  CreditCard,
  History,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trash2,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  MessageCircle,
  FileText
} from 'lucide-react';
import { 
  UserProfile,
  PricingHistory, 
  Client, 
  Declaration
} from '../types';
import { handleFirestoreError, OperationType, useAuth } from '../components/FirebaseProvider';
import { logAction } from '../services/auditService';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

export const Financial: React.FC = () => {
  const { isAdmin, profile, user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'summaries' | 'reports' | 'timeline'>('records');
  const [records, setRecords] = useState<PricingHistory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [exerciseFilter, setExerciseFilter] = useState<string>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<PricingHistory | null>(null);
  const [selectedClientHistory, setSelectedClientHistory] = useState<PricingHistory[]>([]);
  const [selectedClientName, setSelectedClientName] = useState('');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - i);

  // Form State
  const [formData, setFormData] = useState({
    clientId: '',
    declarationId: '',
    exerciseYear: currentYear,
    grossAmount: 0,
    discountAmount: 0,
    finalAmount: 0,
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: 'Pix',
    paymentStatus: 'pending' as const,
  });

  const fetchData = async (force = false) => {
    try {
      setLoading(true);
      const [recordsData, clientsData, declarationsData, usersData] = await Promise.all([
        dbCache.getFinancials(force),
        dbCache.getClients(force),
        dbCache.getDeclarations(force),
        dbCache.getUsers(force)
      ]);

      setRecords(recordsData);
      setClients(clientsData);
      setDeclarations(declarationsData);
      setUsers(usersData);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'financial_data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    dbCache.clear();
    fetchData();
  }, []);

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newRecord = {
        ...formData,
        grossAmount: Number(formData.grossAmount),
        discountAmount: Number(formData.discountAmount),
        finalAmount: Number(formData.grossAmount) - Number(formData.discountAmount),
        createdByUserId: authUser?.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'pricing_history'), newRecord);
      
      await logAction('create', 'pricing_history', docRef.id, {
        clientId: formData.clientId,
        amount: newRecord.finalAmount
      });

      setIsModalOpen(false);
      resetForm();
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'pricing_history');
    }
  };

  const handleUpdateStatus = async (recordId: string, newStatus: 'paid' | 'pending' | 'partial') => {
    try {
      await updateDoc(doc(db, 'pricing_history', recordId), {
        paymentStatus: newStatus,
        paidAt: newStatus === 'paid' ? new Date().toISOString() : null,
        paidAmount: newStatus === 'paid' ? null : 0,
        updatedAt: new Date().toISOString()
      });

      await logAction('update_status', 'pricing_history', recordId, {
        status: newStatus
      });
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pricing_history/${recordId}`);
    }
  };

  const handleUpdateStatusWithPaidAmount = async (recordId: string, newStatus: 'paid' | 'pending' | 'partial', paidAmount?: number) => {
    try {
      await updateDoc(doc(db, 'pricing_history', recordId), {
        paymentStatus: newStatus,
        paidAt: newStatus === 'paid' ? new Date().toISOString() : null,
        paidAmount: newStatus === 'partial' ? paidAmount : (newStatus === 'paid' ? null : 0),
        updatedAt: new Date().toISOString()
      });

      await logAction('update_status', 'pricing_history', recordId, {
        status: newStatus,
        paidAmount
      });
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pricing_history/${recordId}`);
    }
  };

  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    try {
      await deleteDoc(doc(db, 'pricing_history', recordToDelete.id));
      await logAction('delete', 'pricing_history', recordToDelete.id, {
        clientId: recordToDelete.clientId,
        amount: recordToDelete.finalAmount
      });
      setIsDeleteConfirmOpen(false);
      setRecordToDelete(null);
      alert('Lançamento excluído com sucesso!');
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pricing_history/${recordToDelete.id}`);
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: '',
      declarationId: '',
      exerciseYear: currentYear,
      grossAmount: 0,
      discountAmount: 0,
      finalAmount: 0,
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      paymentMethod: 'Pix',
      paymentStatus: 'pending',
    });
  };

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente não encontrado';
  };

  const visibleRecords = records.filter(rec => {
    // Visibility restriction: restrict analysts to what they created, clients they manage, or declarations they are assigned to
    if (profile?.role === 'analista') {
      if (rec.createdByUserId === profile.id) return true;
      const client = clients.find(c => c.id === rec.clientId);
      if (client && (client.internalManagerId === profile.id || client.createdByUserId === profile.id)) return true;
      if (rec.declarationId) {
        const dec = declarations.find(d => d.id === rec.declarationId);
        if (dec && (dec.assignedToUserId === profile.id || dec.createdByUserId === profile.id)) return true;
      }
      return false;
    }

    // Admin/Gestor filter by responsible/creator
    if ((isAdmin || profile?.role === 'gestor') && responsibleFilter !== 'all') {
      if (rec.createdByUserId === responsibleFilter) return true;
      const client = clients.find(c => c.id === rec.clientId);
      if (client && (client.internalManagerId === responsibleFilter || client.createdByUserId === responsibleFilter)) return true;
      if (rec.declarationId) {
        const dec = declarations.find(d => d.id === rec.declarationId);
        if (dec && (dec.assignedToUserId === responsibleFilter || dec.createdByUserId === responsibleFilter)) return true;
      }
      return false;
    }
    return true;
  });

  const filteredRecords = visibleRecords.filter(rec => {
    const clientName = getClientName(rec.clientId).toLowerCase();
    const matchesSearch = clientName.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || rec.paymentStatus === statusFilter;
    const matchesExercise = exerciseFilter === 'all' || rec.exerciseYear.toString() === exerciseFilter;
    return matchesSearch && matchesStatus && matchesExercise;
  });

  const statsRecords = visibleRecords.filter(rec => {
    return exerciseFilter === 'all' || rec.exerciseYear.toString() === exerciseFilter;
  });

  const totalExpected = statsRecords.reduce((acc, curr) => acc + curr.finalAmount, 0);
  const totalReceived = statsRecords.reduce((acc, curr) => {
    const received = curr.paymentStatus === 'paid'
      ? curr.finalAmount
      : (curr.paymentStatus === 'partial'
        ? (curr.paidAmount !== undefined ? curr.paidAmount : (curr.finalAmount === 970 ? 220 : 0))
        : 0);
    return acc + received;
  }, 0);
  const totalPending = totalExpected - totalReceived;

  // Summaries Calculations
  const summaryByYear = visibleRecords.reduce((acc, curr) => {
    const year = curr.exerciseYear;
    if (!acc[year]) acc[year] = { expected: 0, received: 0, pending: 0, count: 0 };
    acc[year].expected += curr.finalAmount;
    acc[year].count += 1;
    
    const recAmt = curr.paymentStatus === 'paid'
      ? curr.finalAmount
      : (curr.paymentStatus === 'partial'
        ? (curr.paidAmount !== undefined ? curr.paidAmount : (curr.finalAmount === 970 ? 220 : 0))
        : 0);
    acc[year].received += recAmt;
    acc[year].pending += (curr.finalAmount - recAmt);
    return acc;
  }, {} as Record<number, { expected: number; received: number; pending: number; count: number }>);

  const summaryByClient = visibleRecords.reduce((acc, curr) => {
    const clientId = curr.clientId;
    if (!acc[clientId]) acc[clientId] = { expected: 0, received: 0, pending: 0, count: 0 };
    acc[clientId].expected += curr.finalAmount;
    acc[clientId].count += 1;

    const recAmt = curr.paymentStatus === 'paid'
      ? curr.finalAmount
      : (curr.paymentStatus === 'partial'
        ? (curr.paidAmount !== undefined ? curr.paidAmount : (curr.finalAmount === 970 ? 220 : 0))
        : 0);
    acc[clientId].received += recAmt;
    acc[clientId].pending += (curr.finalAmount - recAmt);
    return acc;
  }, {} as Record<string, { expected: number; received: number; pending: number; count: number }>);

  // Reports Calculations
  const delinquencyList = Object.entries(summaryByClient)
    .filter(([_, data]) => data.pending > 0)
    .map(([clientId, data]) => ({
      clientId,
      name: getClientName(clientId),
      pendingAmount: data.pending,
      count: data.count
    }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount);

  const averageTicketByYear = Object.entries(summaryByYear).map(([year, data]) => ({
    year,
    average: data.count > 0 ? data.expected / data.count : 0
  }));

  const yoyComparison = Object.keys(summaryByYear).sort().map(year => {
    const currentYear = parseInt(year);
    const prevYear = currentYear - 1;
    const currentTotal = summaryByYear[currentYear]?.expected || 0;
    const prevTotal = summaryByYear[prevYear]?.expected || 0;
    const growth = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0;
    return { year: currentYear, total: currentTotal, growth };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Financeiro</h2>
          <p className="text-slate-500">Controle de honorários e pagamentos.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={20} />
          Novo Lançamento
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Previsto</p>
              <p className="text-2xl font-bold text-slate-800">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpected)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Recebido</p>
              <p className="text-2xl font-bold text-slate-800">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceived)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Pendente</p>
              <p className="text-2xl font-bold text-slate-800">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPending)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {[
          { id: 'records', label: 'Lançamentos', icon: FileText },
          { id: 'summaries', label: 'Resumos', icon: BarChart3 },
          { id: 'reports', label: 'Relatórios', icon: PieChart },
          { id: 'timeline', label: 'Linha do Tempo', icon: History },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'records' && (
        <>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <div className="relative lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por cliente..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="text-slate-400" size={18} />
              <select
                className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={exerciseFilter}
                onChange={(e) => setExerciseFilter(e.target.value)}
              >
                <option value="all">Todos Exercícios</option>
                {years.map(year => (
                  <option key={year} value={year.toString()}>Exercício {year}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="text-slate-400" size={18} />
              <select
                className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos os Status</option>
                <option value="pending">Pendentes</option>
                <option value="paid">Pagos</option>
                <option value="partial">Parciais</option>
              </select>
            </div>
            {(isAdmin || profile?.role === 'gestor') && (
              <div className="flex items-center gap-2 lg:col-span-2">
                <User className="text-slate-400" size={18} />
                <select
                  className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={responsibleFilter}
                  onChange={(e) => setResponsibleFilter(e.target.value)}
                >
                  <option value="all">Todos Responsáveis</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Records List */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-bottom border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Cliente</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Vencimento</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Valor Final</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Status</th>
                    <th className="px-6 py-4 text-sm font-semibold text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Carregando lançamentos...</td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Nenhum lançamento encontrado.</td>
                    </tr>
                  ) : (
                    filteredRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800">{getClientName(rec.clientId)}</div>
                          <div className="text-xs text-slate-500">Exercício {rec.exerciseYear}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {format(new Date(rec.dueDate), 'dd/MM/yyyy')}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-800">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rec.finalAmount)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                            rec.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            rec.paymentStatus === 'partial' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {rec.paymentStatus === 'paid' ? <CheckCircle2 size={12} /> : 
                             rec.paymentStatus === 'partial' ? <TrendingDown size={12} /> : 
                             <AlertCircle size={12} />}
                            {rec.paymentStatus === 'paid' ? 'Pago' : 
                             rec.paymentStatus === 'partial' ? 'Parcial' : 
                             'Pendente'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {rec.paymentStatus !== 'paid' && (
                              <>
                                <button 
                                  onClick={() => handleUpdateStatus(rec.id, 'paid')}
                                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Marcar como Pago"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                                <button 
                                  onClick={async () => {
                                    const input = prompt("Digite o valor já pago (recebido) para este lançamento:", (rec.paidAmount || 0).toString());
                                    if (input !== null) {
                                      const amount = parseFloat(input);
                                      if (!isNaN(amount) && amount >= 0 && amount <= rec.finalAmount) {
                                        await handleUpdateStatusWithPaidAmount(rec.id, 'partial', amount);
                                      } else {
                                        alert("Valor inválido! O valor pago deve estar entre 0 e " + rec.finalAmount + ".");
                                      }
                                    }
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Registrar Pagamento Parcial"
                                >
                                  <TrendingDown size={18} />
                                </button>
                              </>
                            )}
                            <button 
                                onClick={() => {
                                  const client = clients.find(c => c.id === rec.clientId);
                                  if (client) {
                                    const history = records.filter(f => f.clientId === rec.clientId);
                                    setSelectedClientHistory(history);
                                    setSelectedClientName(client.name);
                                    setIsHistoryModalOpen(true);
                                  }
                                }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Histórico de Preços"
                              >
                                <History size={18} />
                              </button>
                              <button 
                                onClick={() => {
                                  const client = clients.find(c => c.id === rec.clientId);
                                  if (client) {
                                    window.open(`https://wa.me/55${client.phone?.replace(/\D/g, '')}`, '_blank');
                                  }
                                }}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Cobrar via WhatsApp"
                              >
                                <MessageCircle size={18} />
                              </button>
                              <button 
                                onClick={() => {
                                  setRecordToDelete(rec);
                                  setIsDeleteConfirmOpen(true);
                                }}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={18} />
                              </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'summaries' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Summary by Year */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Calendar size={20} className="text-indigo-600" />
              Resumo por Exercício
            </h3>
            <div className="space-y-4">
              {Object.entries(summaryByYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, data]) => (
                <div key={year} className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-700">Exercício {year}</span>
                    <span className="text-xs font-medium text-slate-500">{data.count} declarações</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Previsto</p>
                      <p className="text-sm font-bold text-slate-700">R$ {data.expected.toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-400 uppercase font-bold">Recebido</p>
                      <p className="text-sm font-bold text-emerald-600">R$ {data.received.toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-amber-400 uppercase font-bold">Pendente</p>
                      <p className="text-sm font-bold text-amber-600">R$ {data.pending.toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary by Client */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <User size={20} className="text-indigo-600" />
              Resumo por Cliente (Top 10)
            </h3>
            <div className="space-y-4">
              {Object.entries(summaryByClient)
                .sort((a, b) => b[1].expected - a[1].expected)
                .slice(0, 10)
                .map(([clientId, data]) => (
                  <div key={clientId} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-50 last:border-0">
                    <div>
                      <p className="font-bold text-slate-700 text-sm">{getClientName(clientId)}</p>
                      <p className="text-xs text-slate-500">{data.count} declarações no histórico</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-800">R$ {data.expected.toLocaleString('pt-BR')}</p>
                      <p className={`text-[10px] font-bold ${data.pending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {data.pending > 0 ? `Pendente: R$ ${data.pending.toLocaleString('pt-BR')}` : 'Totalmente Pago'}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Delinquency Report */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <AlertCircle size={20} className="text-rose-600" />
              Relatório de Inadimplência
            </h3>
            <div className="space-y-4">
              {delinquencyList.length > 0 ? (
                delinquencyList.map((item) => (
                  <div key={item.clientId} className="flex items-center justify-between p-4 bg-rose-50 rounded-xl border border-rose-100">
                    <div>
                      <p className="font-bold text-rose-900">{item.name}</p>
                      <p className="text-xs text-rose-600">{item.count} pendência(s) financeira(s)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-rose-700">R$ {item.pendingAmount.toLocaleString('pt-BR')}</p>
                      <button className="text-[10px] font-bold text-rose-600 hover:underline uppercase tracking-wider">Cobrar via WhatsApp</button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-8 text-slate-500 italic">Nenhum cliente inadimplente encontrado. Parabéns!</p>
              )}
            </div>
          </div>

          {/* Ticket Médio & YoY */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp size={20} className="text-indigo-600" />
                Ticket Médio por Exercício
              </h3>
              <div className="space-y-4">
                {averageTicketByYear.sort((a, b) => Number(b.year) - Number(a.year)).map((item) => (
                  <div key={item.year} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-700">Exercício {item.year}</span>
                    <span className="text-lg font-black text-indigo-600">R$ {item.average.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <ArrowUpRight size={20} className="text-emerald-600" />
                Comparação de Honorários (YoY)
              </h3>
              <div className="space-y-4">
                {yoyComparison.sort((a, b) => b.year - a.year).map((item) => (
                  <div key={item.year} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div>
                      <span className="font-bold text-slate-700">Exercício {item.year}</span>
                      <p className="text-xs text-slate-500">Total: R$ {item.total.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="text-right">
                      {item.growth !== 0 ? (
                        <span className={`text-sm font-bold flex items-center gap-1 ${item.growth > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {item.growth > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {Math.abs(item.growth).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-slate-400">-</span>
                      )}
                      <p className="text-[10px] text-slate-400 uppercase font-bold">vs Ano Anterior</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <History size={20} className="text-indigo-600" />
            Linha do Tempo de Pagamentos
          </h3>
          <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
            {records.slice(0, 20).map((record) => (
              <div key={record.id} className="relative">
                <div className={`absolute -left-[21px] top-1 w-5 h-5 rounded-full border-4 border-white shadow-sm ${
                  record.paymentStatus === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}></div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-slate-400 uppercase">
                        {format(new Date(record.dueDate), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                      </span>
                      {record.paidAt && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">
                          Pago em {format(new Date(record.paidAt), "dd/MM/yy")}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900">{getClientName(record.clientId)}</h4>
                    <p className="text-xs text-slate-500">Honorário IRPF {record.exerciseYear} • {record.paymentMethod || 'PIX'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-800">R$ {record.finalAmount.toLocaleString('pt-BR')}</p>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${
                      record.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {record.paymentStatus === 'paid' ? 'Liquidado' : 'Aguardando'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">Novo Lançamento Financeiro</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateRecord} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
                  <select
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value, declarationId: '' })}
                  >
                    <option value="">Selecione um cliente</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name} ({client.cpf})</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Declaração Relacionada</label>
                  <select
                    required
                    disabled={!formData.clientId}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                    value={formData.declarationId}
                    onChange={(e) => {
                      const dec = declarations.find(d => d.id === e.target.value);
                      setFormData({ 
                        ...formData, 
                        declarationId: e.target.value, 
                        grossAmount: dec?.grossAmount || 0,
                        exerciseYear: dec?.exerciseYear || currentYear
                      });
                    }}
                  >
                    <option value="">Selecione uma declaração</option>
                    {declarations
                      .filter(d => d.clientId === formData.clientId)
                      .map(dec => (
                        <option key={dec.id} value={dec.id}>IRPF {dec.exerciseYear} - {dec.declarationType}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Honorário Bruto (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.grossAmount}
                    onChange={(e) => setFormData({ ...formData, grossAmount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Desconto (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.discountAmount}
                    onChange={(e) => setFormData({ ...formData, discountAmount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data de Vencimento</label>
                  <input
                    type="date"
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                  >
                    <option value="Pix">Pix</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 text-white rounded-xl">
                    <History size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Histórico Financeiro</h3>
                    <p className="text-sm text-slate-500 font-medium">{selectedClientName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-4">
                  {selectedClientHistory.sort((a, b) => b.exerciseYear - a.exerciseYear).map((item) => (
                    <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Exercício {item.exerciseYear}</p>
                        <p className="text-lg font-bold text-slate-900">R$ {item.finalAmount?.toLocaleString('pt-BR')}</p>
                        <p className="text-xs text-slate-500">Vencimento: {format(parseISO(item.dueDate), 'dd/MM/yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
                          item.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                          item.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {item.paymentStatus === 'paid' ? 'Pago' : 
                           item.paymentStatus === 'partial' ? 'Parcial' : 
                           'Pendente'}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-tighter">
                          {item.paymentMethod || 'Não informado'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {selectedClientHistory.length === 0 && (
                    <p className="text-center py-8 text-slate-500 italic">Nenhum histórico encontrado para este cliente.</p>
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-6 py-2.5 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-100 transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && recordToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} className="text-rose-500" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Excluir Lançamento?</h3>
              <p className="text-slate-500 mb-8">
                Esta ação não pode ser desfeita. O lançamento de <span className="font-bold text-slate-900">R$ {recordToDelete.finalAmount.toLocaleString('pt-BR')}</span> para <span className="font-bold text-slate-900">{getClientName(recordToDelete.clientId)}</span> será removido permanentemente.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteRecord}
                  className="flex-1 px-4 py-3 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Financial;
