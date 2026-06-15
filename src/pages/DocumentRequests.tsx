import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, orderBy, where, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { dbCache } from '../services/dbCache';
import { logAction } from '../services/auditService';
import { 
  Plus, 
  Search, 
  Filter, 
  Link as LinkIcon, 
  Copy, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  User,
  Calendar,
  X,
  ExternalLink,
  Trash2,
  Mail,
  MessageCircle
} from 'lucide-react';
import { 
  DocumentRequest, 
  Client, 
  Declaration,
  UserProfile
} from '../types';
import { handleFirestoreError, OperationType, useAuth } from '../components/FirebaseProvider';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const DocumentRequests: React.FC = () => {
  const { isAdmin, profile } = useAuth();
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<DocumentRequest | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    clientId: '',
    declarationId: '',
    dueDate: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    validityDays: 7,
    items: [
      { item: 'Comprovante de Rendimentos (Empresa)', status: 'pending' as const },
      { item: 'Extratos Bancários (Informe de Rendimentos)', status: 'pending' as const },
      { item: 'Recibos de Despesas Médicas', status: 'pending' as const },
      { item: 'Recibos de Educação', status: 'pending' as const },
      { item: 'Comprovante de Aluguel', status: 'pending' as const },
    ],
    questions: [] as { id: string; text: string; answer?: string }[]
  });

  const fetchData = async (force = false) => {
    try {
      setLoading(true);
      const [
        requestsData,
        clientsData,
        declarationsData,
        templatesData
      ] = await Promise.all([
        dbCache.getDocumentRequests(force),
        dbCache.getClients(force),
        dbCache.getDeclarations(force),
        dbCache.getChecklistTemplates(force)
      ]);

      setRequests(requestsData);
      setClients(clientsData);
      setDeclarations(declarationsData);

      const activeTemplates = templatesData.filter((t: any) => t.active === true);
      setTemplates(activeTemplates);

      if (activeTemplates.length > 0) {
        setFormData(prev => ({
          ...prev,
          items: activeTemplates.map((t: any) => ({ item: t.label, status: 'pending' as const }))
        }));
      }
    } catch (err) {
      console.error('Error loading data in DocumentRequests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date(Date.now() + formData.validityDays * 24 * 60 * 60 * 1000).toISOString();
      
      const client = clients.find(c => c.id === formData.clientId);
      const declaration = declarations.find(d => d.id === formData.declarationId);

      const newRequest = {
        clientId: formData.clientId,
        clientName: client?.name || 'Cliente',
        declarationId: formData.declarationId,
        exerciseYear: declaration?.exerciseYear || 2026,
        dueDate: formData.dueDate,
        items: formData.items,
        questions: formData.questions.map(q => ({ ...q, id: Math.random().toString(36).substring(2, 9) })),
        token,
        expiresAt,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      const requestRef = doc(db, 'document_requests', token);
      await setDoc(requestRef, newRequest);
      
      // Audit Log
      await logAction('create', 'document_requests', token, {
        clientId: formData.clientId,
        declarationId: formData.declarationId
      });

      setIsModalOpen(false);
      resetForm();
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'document_requests');
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    console.log('Deleting request:', requestId);
    try {
      await deleteDoc(doc(db, 'document_requests', requestId));
      console.log('Request deleted successfully');
      
      // Audit Log
      await logAction('delete', 'document_requests', requestId, {});
      setRequestToDelete(null);
      fetchData(true);
    } catch (err) {
      console.error('Error deleting request:', err);
      handleFirestoreError(err, OperationType.DELETE, `document_requests/${requestId}`);
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: '',
      declarationId: '',
      dueDate: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      validityDays: 7,
      items: templates.length > 0 
        ? templates.map(t => ({ item: t.label, status: 'pending' as const }))
        : [
            { item: 'Comprovante de Rendimentos (Empresa)', status: 'pending' as const },
            { item: 'Extratos Bancários (Informe de Rendimentos)', status: 'pending' as const },
            { item: 'Recibos de Despesas Médicas', status: 'pending' as const },
            { item: 'Recibos de Educação', status: 'pending' as const },
            { item: 'Comprovante de Aluguel', status: 'pending' as const },
          ],
      questions: []
    });
  };

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente não encontrado';
  };

  const getDeclarationInfo = (declarationId: string) => {
    const dec = declarations.find(d => d.id === declarationId);
    return dec ? `IRPF ${dec.exerciseYear}` : 'Declaração não encontrada';
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url);
    alert('Link copiado para a área de transferência!');
  };

  const filteredRequests = requests.filter(req => {
    // Visibility restriction: only restrict analysts to what they created or are assigned to
    if (profile?.role === 'analista') {
      const declaration = declarations.find(d => d.id === req.declarationId);
      const client = clients.find(c => c.id === req.clientId);
      
      const isDeclOwner = declaration?.createdByUserId === profile.id || declaration?.assignedToUserId === profile.id;
      const isClientOwner = client?.createdByUserId === profile.id || client?.internalManagerId === profile.id;
      
      if (!isDeclOwner && !isClientOwner) return false;
    }

    const clientName = getClientName(req.clientId).toLowerCase();
    return clientName.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Solicitação de Documentos</h2>
          <p className="text-slate-500">Gere links exclusivos para seus clientes enviarem documentos.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus size={20} />
          Nova Solicitação
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Requests List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12 text-slate-500">Carregando solicitações...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">Nenhuma solicitação encontrada.</div>
        ) : (
          filteredRequests.map((req) => (
            <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{getClientName(req.clientId)}</h3>
                    <p className="text-sm text-slate-500">{getDeclarationInfo(req.declarationId)}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    req.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    req.status === 'partially_received' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {req.status === 'completed' ? 'Concluído' :
                     req.status === 'partially_received' ? 'Parcial' : 'Pendente'}
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Calendar size={16} className="text-slate-400" />
                    <span>Prazo: {format(new Date(req.dueDate), 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle2 size={16} className="text-slate-400" />
                    <span>{req.items.filter(i => i.status === 'received').length} de {req.items.length} documentos recebidos</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
                  <button 
                    onClick={() => copyLink(req.token)}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium"
                  >
                    <Copy size={16} />
                    Copiar Link
                  </button>
                  <button 
                    onClick={() => setSelectedRequest(req)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Detalhes da Solicitação"
                  >
                    <FileText size={18} />
                  </button>
                  <a 
                    href={`/portal/${req.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Visualizar Portal"
                  >
                    <ExternalLink size={18} />
                  </a>
                  <button 
                    onClick={() => {
                      console.log('Trash button clicked for:', req.id);
                      setRequestToDelete(req.id);
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-3 flex justify-between items-center border-t border-slate-100">
                <div className="flex gap-2">
                  <button className="text-emerald-600 hover:text-emerald-700 transition-colors" title="Enviar via WhatsApp">
                    <MessageCircle size={18} />
                  </button>
                  <button className="text-indigo-600 hover:text-indigo-700 transition-colors" title="Enviar via E-mail">
                    <Mail size={18} />
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  Criado em {format(new Date(req.createdAt), 'dd/MM/yy')}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">Nova Solicitação de Documentos</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateRequest} className="p-6 space-y-4">
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
                    {clients
                      .filter(c => {
                        if (isAdmin) return true;
                        return c.createdByUserId === profile?.id || c.internalManagerId === profile?.id;
                      })
                      .map(client => (
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
                    onChange={(e) => setFormData({ ...formData, declarationId: e.target.value })}
                  >
                    <option value="">Selecione uma declaração</option>
                    {declarations
                      .filter(d => d.clientId === formData.clientId)
                      .filter(d => {
                        if (isAdmin) return true;
                        return d.createdByUserId === profile?.id || d.assignedToUserId === profile?.id;
                      })
                      .map(dec => (
                        <option key={dec.id} value={dec.id}>IRPF {dec.exerciseYear} - {dec.declarationType}</option>
                      ))}
                    {formData.clientId && declarations.filter(d => d.clientId === formData.clientId).length === 0 && (
                      <option disabled value="">Nenhuma declaração encontrada para este cliente</option>
                    )}
                  </select>
                  {formData.clientId && declarations.filter(d => d.clientId === formData.clientId).length === 0 && (
                    <p className="text-xs text-rose-500 mt-1">
                      Este cliente não possui declarações cadastradas. Cadastre uma declaração antes de solicitar documentos.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prazo para Envio</label>
                  <input
                    type="date"
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Validade do Link (Dias)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.validityDays}
                    onChange={(e) => setFormData({ ...formData, validityDays: Number(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Checklist de Documentos</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto p-2 border border-slate-100 rounded-lg bg-slate-50">
                    {formData.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-slate-100">
                        <input
                          type="text"
                          className="flex-1 text-sm border-none focus:ring-0 p-0"
                          value={item.item}
                          onChange={(e) => {
                            const newItems = [...formData.items];
                            newItems[idx].item = e.target.value;
                            setFormData({ ...formData, items: newItems });
                          }}
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newItems = formData.items.filter((_, i) => i !== idx);
                            setFormData({ ...formData, items: newItems });
                          }}
                          className="text-slate-300 hover:text-rose-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button 
                      type="button"
                      onClick={() => setFormData({ ...formData, items: [...formData.items, { item: '', status: 'pending' }] })}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-2"
                    >
                      <Plus size={14} />
                      Adicionar Item
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Perguntas ao Cliente (Bens/Dúvidas)</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto p-2 border border-slate-100 rounded-lg bg-slate-50">
                    {formData.questions.map((q, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-slate-100">
                        <input
                          type="text"
                          placeholder="Ex: Qual o valor de venda do veículo placa ABC-1234?"
                          className="flex-1 text-sm border-none focus:ring-0 p-0"
                          value={q.text}
                          onChange={(e) => {
                            const newQuestions = [...formData.questions];
                            newQuestions[idx].text = e.target.value;
                            setFormData({ ...formData, questions: newQuestions });
                          }}
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newQuestions = formData.questions.filter((_, i) => i !== idx);
                            setFormData({ ...formData, questions: newQuestions });
                          }}
                          className="text-slate-300 hover:text-rose-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button 
                      type="button"
                      onClick={() => setFormData({ ...formData, questions: [...formData.questions, { id: '', text: '' }] })}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-2"
                    >
                      <Plus size={14} />
                      Adicionar Pergunta
                    </button>
                  </div>
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
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Gerar Solicitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Details Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Detalhes da Solicitação</h3>
                <p className="text-xs text-slate-500">{getClientName(selectedRequest.clientId)} - {getDeclarationInfo(selectedRequest.declarationId)}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              {/* General Observation */}
              {selectedRequest.generalObservation && (
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <h4 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                    <MessageCircle size={16} />
                    Observação Geral do Cliente
                  </h4>
                  <p className="text-sm text-indigo-700 italic">"{selectedRequest.generalObservation}"</p>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-indigo-600" />
                  Checklist de Documentos
                </h4>
                <div className="grid gap-3">
                  {selectedRequest.items.map((item, idx) => (
                    <div key={idx} className={`p-4 rounded-xl border ${
                      item.status === 'received' ? 'bg-emerald-50 border-emerald-100' :
                      item.status === 'refused' ? 'bg-rose-50 border-rose-100' :
                      'bg-slate-50 border-slate-100'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-slate-800">{item.item}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          item.status === 'received' ? 'bg-emerald-100 text-emerald-700' :
                          item.status === 'refused' ? 'bg-rose-100 text-rose-700' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {item.status === 'received' ? 'Recebido' :
                           item.status === 'refused' ? 'Recusado' : 'Pendente'}
                        </span>
                      </div>
                      
                      {item.clientObservation && (
                        <div className="mt-2 text-xs text-slate-600 bg-white/50 p-2 rounded border border-slate-200/50 italic">
                          <strong>Obs. do Cliente:</strong> {item.clientObservation}
                        </div>
                      )}

                      {item.status === 'received' && (
                        <div className="mt-3 flex gap-2">
                          <button 
                            onClick={async () => {
                              const newItems = [...selectedRequest.items];
                              newItems[idx].status = 'refused';
                              const comment = prompt('Motivo da recusa:');
                              if (comment) {
                                newItems[idx].comment = comment;
                                await updateDoc(doc(db, 'document_requests', selectedRequest.id), { items: newItems });
                                setSelectedRequest({ ...selectedRequest, items: newItems });
                              }
                            }}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 uppercase tracking-wider"
                          >
                            Recusar Documento
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Questions Section */}
              {selectedRequest.questions && selectedRequest.questions.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <MessageCircle size={18} className="text-indigo-600" />
                    Perguntas e Respostas
                  </h4>
                  <div className="grid gap-3">
                    {selectedRequest.questions.map((q, idx) => (
                      <div key={idx} className="p-4 rounded-xl border bg-indigo-50/30 border-indigo-100">
                        <div className="text-sm font-bold text-slate-800 mb-2">P: {q.text}</div>
                        {q.answer ? (
                          <div className="text-sm text-indigo-700 bg-white p-3 rounded-lg border border-indigo-100 italic">
                            <strong>R:</strong> {q.answer}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 italic">Aguardando resposta do cliente...</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors font-bold text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {requestToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} className="text-rose-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Excluir Solicitação?</h3>
              <p className="text-slate-500 mb-6">
                Tem certeza que deseja excluir esta solicitação? Esta ação não pode ser desfeita e o link enviado ao cliente deixará de funcionar.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setRequestToDelete(null)}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-bold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteRequest(requestToDelete)}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-bold text-sm"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
