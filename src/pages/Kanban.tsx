import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  orderBy,
  addDoc,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { dbCache } from '../services/dbCache';
import { logAction } from '../services/auditService';
import { Declaration, DeclarationStatus, Client, UserProfile } from '../types';
import { handleFirestoreError, OperationType, useAuth } from '../components/FirebaseProvider';
import { 
  Clock, 
  Search, 
  Edit2, 
  Eye, 
  FileText, 
  CheckCircle2,
  MoreHorizontal,
  User,
  Calendar,
  DollarSign,
  AlertCircle,
  FileWarning,
  Trash2,
  X,
  ArrowRight,
  History,
  Tag,
  Info,
  ChevronRight,
  Filter as FilterIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isAfter, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_COLUMNS: { id: DeclarationStatus; label: string; icon: any; color: string; border: string }[] = [
  { id: 'waiting_docs', label: 'Aguardando Docs', icon: Clock, color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
  { id: 'screening', label: 'Triagem', icon: Search, color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  { id: 'in_progress', label: 'Em Elaboração', icon: Edit2, color: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200' },
  { id: 'review', label: 'Em Revisão', icon: Eye, color: 'bg-purple-50 text-purple-700', border: 'border-purple-200' },
  { id: 'transmitted', label: 'Transmitida', icon: FileText, color: 'bg-cyan-50 text-cyan-700', border: 'border-cyan-200' },
  { id: 'finalized', label: 'Finalizada', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
];

export const Kanban: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [docRequests, setDocRequests] = useState<Record<string, any>>({});
  const [financials, setFinancials] = useState<Record<string, any>>({});
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  
  // Side Drawer State
  const [selectedDeclarationId, setSelectedDeclarationId] = useState<string | null>(null);
  const [movementHistory, setMovementHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [allHistory, setAllHistory] = useState<any[]>([]);

  // Filters from URL
  const filterResponsible = searchParams.get('responsible') || 'all';
  const filterExercise = searchParams.get('exercise') || 'all';
  const filterFinancial = searchParams.get('financial') || 'all';
  const filterPriority = searchParams.get('priority') || 'all';

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

  const fetchData = async (force = false) => {
    try {
      setLoading(true);
      const [
        declarationsData,
        clientsData,
        usersData,
        requestsData,
        financialsData,
        systemSettings,
        historyData
      ] = await Promise.all([
        dbCache.getDeclarations(force),
        dbCache.getClients(force),
        dbCache.getUsers(force),
        dbCache.getDocumentRequests(force),
        dbCache.getFinancials(force),
        dbCache.getSystemSettings(force),
        dbCache.getKanbanHistory(force)
      ]);

      setDeclarations(declarationsData);

      const clientsMap: Record<string, Client> = {};
      clientsData.forEach(c => {
        clientsMap[c.id] = c;
      });
      setClients(clientsMap);

      const usersMap: Record<string, UserProfile> = {};
      usersData.forEach(u => {
        usersMap[u.id] = u;
      });
      setUsers(usersMap);

      const requestsMap: Record<string, any> = {};
      requestsData.forEach(doc => {
        if (!requestsMap[doc.declarationId] || isAfter(parseISO(doc.createdAt), parseISO(requestsMap[doc.declarationId].createdAt))) {
          requestsMap[doc.declarationId] = doc;
        }
      });
      setDocRequests(requestsMap);

      const finMap: Record<string, any> = {};
      financialsData.forEach(data => {
        finMap[data.declarationId] = data;
      });
      setFinancials(finMap);

      if (systemSettings && systemSettings.availableYears) {
        setAvailableYears(systemSettings.availableYears);
      }

      setAllHistory(historyData);
    } catch (err) {
      console.error('Error fetching Kanban lookup lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    dbCache.clear();
    fetchData();
  }, []);

  // Fetch movement history when a declaration is selected
  useEffect(() => {
    if (!selectedDeclarationId) {
      setMovementHistory([]);
      return;
    }
    const history = allHistory.filter((h: any) => h.declarationId === selectedDeclarationId);
    setMovementHistory(history);
  }, [selectedDeclarationId, allHistory]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStatus: DeclarationStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDraggedId(null);

    const declaration = declarations.find(d => d.id === id);
    if (!declaration || declaration.kanbanStage === newStatus) return;

    try {
      const oldStatus = declaration.kanbanStage;
      
      await updateDoc(doc(db, 'declarations', id), {
        kanbanStage: newStatus,
        updatedAt: new Date().toISOString()
      });

      // Audit Log
      await logAction('move', 'declarations', id, {
        fromStage: oldStatus,
        toStage: newStatus
      });

      // Kanban History
      await addDoc(collection(db, 'kanban_history'), {
        declarationId: id,
        fromStage: oldStatus,
        toStage: newStatus,
        userId: auth.currentUser?.uid || 'system',
        userName: auth.currentUser?.displayName || 'Sistema',
        timestamp: new Date().toISOString()
      });

      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `declarations/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta declaração? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'declarations', id));
      
      // Audit Log
      await logAction('delete', 'declarations', id, {});

      setSelectedDeclarationId(null);
      fetchData(true);
      alert('Declaração excluída com sucesso.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `declarations/${id}`);
    }
  };

  const filteredDeclarations = declarations.filter(dec => {
    // Visibility restriction: only restrict analysts to their own creations or assignments
    if (profile?.role === 'analista') {
      const isOwner = dec.createdByUserId === profile.id;
      const isAssigned = dec.assignedToUserId === profile.id;
      if (!isOwner && !isAssigned) return false;
    }

    const matchesResponsible = filterResponsible === 'all' || dec.assignedToUserId === filterResponsible;
    const matchesExercise = filterExercise === 'all' || dec.exerciseYear.toString() === filterExercise;
    const matchesPriority = filterPriority === 'all' || dec.priorityLabel === filterPriority;
    
    const fin = financials[dec.id];
    const matchesFinancial = filterFinancial === 'all' || (fin && fin.paymentStatus === filterFinancial);
    
    return matchesResponsible && matchesExercise && matchesPriority && matchesFinancial;
  });

  const selectedDeclaration = declarations.find(d => d.id === selectedDeclarationId);
  const selectedClient = selectedDeclaration ? clients[selectedDeclaration.clientId] : null;
  const selectedResponsible = selectedDeclaration?.assignedToUserId ? users[selectedDeclaration.assignedToUserId] : null;
  const selectedFinancial = selectedDeclaration ? financials[selectedDeclaration.id] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Fluxo de Trabalho</h2>
          <p className="text-slate-500 font-medium">Gestão visual das declarações IRPF L&M.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-100">
              <User size={16} className="text-slate-400" />
              <select 
                className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
                value={filterResponsible}
                onChange={(e) => updateFilters({ responsible: e.target.value })}
              >
                <option key="all" value="all">Responsáveis</option>
                {Object.values(users).map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-100">
            <Calendar size={16} className="text-slate-400" />
            <select 
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
              value={filterExercise}
              onChange={(e) => updateFilters({ exercise: e.target.value })}
            >
              <option key="all" value="all">Exercícios</option>
              {availableYears.map(year => (
                <option key={year} value={year.toString()}>Exercício {year}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-100">
            <DollarSign size={16} className="text-slate-400" />
            <select 
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
              value={filterFinancial}
              onChange={(e) => updateFilters({ financial: e.target.value })}
            >
              <option key="all" value="all">Financeiro</option>
              <option key="paid" value="paid">Pago</option>
              <option key="pending" value="pending">Pendente</option>
              <option key="partial" value="partial">Parcial</option>
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5">
            <Tag size={16} className="text-slate-400" />
            <select 
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
              value={filterPriority}
              onChange={(e) => updateFilters({ priority: e.target.value })}
            >
              <option key="all" value="all">Prioridade</option>
              <option key="high" value="high">Alta</option>
              <option key="medium" value="medium">Média</option>
              <option key="low" value="low">Baixa</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-6 min-w-max h-full p-2">
          {STATUS_COLUMNS.map((column) => (
            <div 
              key={column.id} 
              className="w-80 flex flex-col gap-4"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg border ${column.color} ${column.border}`}>
                    <column.icon size={16} />
                  </div>
                  <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">{column.label}</h3>
                </div>
                <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {filteredDeclarations.filter(d => d.kanbanStage === column.id).length}
                </span>
              </div>

              <div className={`flex-1 rounded-2xl p-3 space-y-3 border-2 border-dashed transition-colors ${
                draggedId ? 'bg-slate-50 border-slate-200' : 'bg-slate-100/30 border-transparent'
              } overflow-y-auto`}>
                <AnimatePresence>
                  {filteredDeclarations
                    .filter(d => d.kanbanStage === column.id)
                    .map((declaration) => {
                      const client = clients[declaration.clientId];
                      const responsible = declaration.assignedToUserId ? users[declaration.assignedToUserId] : null;
                      const docRequest = docRequests[declaration.id];
                      
                      const isOverdue = docRequest && 
                                       docRequest.status === 'pending' && 
                                       isAfter(new Date(), parseISO(docRequest.dueDate));
                      
                      const hasPendingDocs = docRequest && 
                                            docRequest.items?.some((item: any) => item.status === 'pending' || item.status === 'refused');

                      return (
                        <motion.div 
                          key={declaration.id}
                          layoutId={declaration.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e as any, declaration.id)}
                          onClick={() => setSelectedDeclarationId(declaration.id)}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={`bg-white p-4 rounded-2xl shadow-sm border-2 transition-all cursor-grab active:cursor-grabbing group relative overflow-hidden ${
                            draggedId === declaration.id ? 'opacity-50' : ''
                          } ${
                            isOverdue ? 'border-rose-300 bg-rose-50/30' : 
                            hasPendingDocs ? 'border-amber-300 bg-amber-50/30' : 
                            'border-slate-100 hover:border-blue-300 hover:shadow-lg'
                          }`}
                        >
                          {/* Overdue highlight bar */}
                          {isOverdue && <div className="absolute top-0 left-0 w-full h-1 bg-rose-500"></div>}
                          
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex flex-col gap-1">
                              <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors leading-tight">
                                {client?.name || 'Cliente Desconhecido'}
                              </h4>
                              <div className="flex flex-wrap gap-1">
                                {declaration.priorityLabel && (
                                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                    declaration.priorityLabel === 'high' ? 'bg-rose-100 text-rose-700' :
                                    declaration.priorityLabel === 'medium' ? 'bg-blue-100 text-blue-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {declaration.priorityLabel === 'high' ? 'Alta' : 
                                     declaration.priorityLabel === 'medium' ? 'Média' : 'Baixa'}
                                  </span>
                                )}
                                {isOverdue && (
                                  <span className="flex items-center gap-1 text-[9px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded uppercase">
                                    <Clock size={10} /> Vencido
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="p-1.5 text-slate-300 group-hover:text-slate-500 transition-colors">
                              <MoreHorizontal size={16} />
                            </div>
                          </div>
                          
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={12} className="text-slate-400" />
                                <span className="font-medium">Exercício {declaration.exerciseYear}</span>
                              </div>
                              {hasPendingDocs && (
                                <div className="flex items-center gap-1 text-amber-600 font-bold">
                                  <FileWarning size={12} />
                                  <span>{docRequest.items.filter((i: any) => i.status === 'pending').length} pend.</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 overflow-hidden shadow-inner">
                                {responsible ? (
                                  (responsible.name || responsible.email || 'U').charAt(0)
                                ) : (
                                  <User size={12} />
                                )}
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 truncate max-w-[80px]">
                                {responsible ? (responsible.name ? responsible.name.split(' ')[0] : responsible.email?.split('@')[0]) : 'Livre'}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              {declaration.taxToPay > 0 && (
                                <div className="text-[9px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                  PAGAR
                                </div>
                              )}
                              {declaration.refundAmount > 0 && (
                                <div className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                  REST.
                                </div>
                              )}
                              {financials[declaration.id]?.paymentStatus === 'paid' && (
                                <div className="p-1 bg-emerald-100 text-emerald-600 rounded-full" title="Honorários Pagos">
                                  <DollarSign size={10} />
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
                
                {declarations.filter(d => d.kanbanStage === column.id).length === 0 && (
                  <div className="h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 text-xs italic">
                    Nenhum item
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Side Drawer for Declaration Details */}
      <AnimatePresence>
        {selectedDeclarationId && selectedDeclaration && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDeclarationId(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Detalhes da Declaração</h3>
                    <p className="text-xs text-slate-500 font-medium">Exercício {selectedDeclaration.exerciseYear}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedDeclarationId(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Client Info */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <User size={16} />
                    <h4 className="text-xs font-black uppercase tracking-widest">Contribuinte</h4>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="font-bold text-slate-900 mb-1">{selectedClient?.name}</p>
                    <p className="text-sm text-slate-500 mb-3">{selectedClient?.cpf}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        selectedClient?.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {selectedClient?.status === 'active' ? 'ATIVO' : 'INATIVO'}
                      </span>
                      {selectedDeclaration.priorityLabel && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          selectedDeclaration.priorityLabel === 'high' ? 'bg-rose-100 text-rose-700' :
                          selectedDeclaration.priorityLabel === 'medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          PRIORIDADE {selectedDeclaration.priorityLabel === 'high' ? 'ALTA' : 
                                     selectedDeclaration.priorityLabel === 'medium' ? 'MÉDIA' : 'BAIXA'}
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {/* Process Summary */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Info size={16} />
                    <h4 className="text-xs font-black uppercase tracking-widest">Resumo do Processo</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Etapa Atual</p>
                      <p className="text-sm font-bold text-blue-600">
                        {STATUS_COLUMNS.find(c => c.id === selectedDeclaration.kanbanStage)?.label}
                      </p>
                    </div>
                    <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Responsável</p>
                      <p className="text-sm font-bold text-slate-700 truncate">
                        {selectedResponsible?.name || 'Não atribuído'}
                      </p>
                    </div>
                    <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Resultado IRPF</p>
                      {selectedDeclaration.taxToPay > 0 ? (
                        <p className="text-sm font-bold text-rose-600">Pagar: R$ {selectedDeclaration.taxToPay.toLocaleString('pt-BR')}</p>
                      ) : selectedDeclaration.refundAmount > 0 ? (
                        <p className="text-sm font-bold text-emerald-600">Rest.: R$ {selectedDeclaration.refundAmount.toLocaleString('pt-BR')}</p>
                      ) : (
                        <p className="text-sm font-bold text-slate-400">Não calculado</p>
                      )}
                    </div>
                    <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Honorários</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-700">
                          R$ {selectedFinancial?.finalAmount?.toLocaleString('pt-BR') || '0,00'}
                        </p>
                        {selectedFinancial?.paymentStatus === 'paid' ? (
                          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1 rounded">PAGO</span>
                        ) : (
                          <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1">PEND.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Movement History */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-slate-400">
                    <History size={16} />
                    <h4 className="text-xs font-black uppercase tracking-widest">Histórico de Movimentação</h4>
                  </div>
                  <div className="relative pl-4 space-y-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                    {loadingHistory ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 italic">
                        <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                        Carregando histórico...
                      </div>
                    ) : movementHistory.length > 0 ? (
                      movementHistory.map((log: any, idx) => (
                        <div key={log.id} className="relative">
                          <div className="absolute -left-[13px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase">
                                {format(parseISO(log.timestamp), "dd MMM, HH:mm", { locale: ptBR })}
                              </span>
                              <span className="text-[10px] font-bold text-slate-900">por {log.userName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                              <span className="font-medium">{STATUS_COLUMNS.find(c => c.id === log.fromStage)?.label}</span>
                              <ArrowRight size={12} className="text-slate-300" />
                              <span className="font-bold text-blue-600">{STATUS_COLUMNS.find(c => c.id === log.toStage)?.label}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400 italic">Nenhuma movimentação registrada.</p>
                    )}
                  </div>
                </section>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={() => navigate(`/declarations?id=${selectedDeclaration.id}`)}
                  className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  <Edit2 size={18} /> Editar Declaração
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => handleDelete(selectedDeclaration.id)}
                    className="p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl hover:bg-rose-100 transition-all"
                    title="Excluir Declaração"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button 
                  onClick={() => navigate(`/clients?id=${selectedDeclaration.clientId}`)}
                  className="p-3 bg-white text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all"
                  title="Ver Cliente"
                >
                  <User size={20} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
