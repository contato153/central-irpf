import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  updateDoc, 
  doc, 
  orderBy,
  where,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { dbCache } from '../services/dbCache';
import { 
  File, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Download, 
  Eye, 
  Trash2,
  User,
  FileText,
  MoreVertical,
  ExternalLink,
  Check,
  X
} from 'lucide-react';
import { 
  UploadedFile, 
  Client, 
  Declaration,
  UserProfile
} from '../types';
import { handleFirestoreError, OperationType, useAuth } from '../components/FirebaseProvider';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Uploads: React.FC = () => {
  const { isAdmin, profile } = useAuth();
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [declarations, setDeclarations] = useState<Record<string, Declaration>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refuseModal, setRefuseModal] = useState<{ id: string; note: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchData = async (force = false) => {
    try {
      setLoading(true);
      const [uploadsSnap, clientsData, declarationsData, usersData] = await Promise.all([
        getDocs(query(collection(db, 'uploaded_files'), orderBy('createdAt', 'desc'))),
        dbCache.getClients(force),
        dbCache.getDeclarations(force),
        dbCache.getUsers(force)
      ]);

      const docs = uploadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UploadedFile));
      setUploads(docs);

      const clientsMap: Record<string, Client> = {};
      clientsData.forEach(c => {
        clientsMap[c.id] = c;
      });
      setClients(clientsMap);

      const declarationsMap: Record<string, Declaration> = {};
      declarationsData.forEach(d => {
        declarationsMap[d.id] = d;
      });
      setDeclarations(declarationsMap);

      setUsers(usersData);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'uploads_data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateStatus = async (uploadId: string, newStatus: 'approved' | 'refused', reviewNote?: string) => {
    setProcessingId(uploadId);
    try {
      const upload = uploads.find(u => u.id === uploadId);
      
      await updateDoc(doc(db, 'uploaded_files', uploadId), {
        reviewStatus: newStatus,
        reviewNote: reviewNote || '',
        updatedAt: new Date().toISOString()
      });

      // Update related DocumentRequest if exists
      if (upload?.requestId && upload?.checklistItemId) {
        const requestRef = doc(db, 'document_requests', upload.requestId);
        const requestSnap = await getDocs(query(collection(db, 'document_requests'), where('__name__', '==', upload.requestId)));
        
        if (!requestSnap.empty) {
          const requestData = requestSnap.docs[0].data() as any;
          const updatedItems = requestData.items.map((item: any) => {
            if (item.item === upload.checklistItemId || item.item === upload.fileNameOriginal) {
              return { ...item, status: newStatus === 'approved' ? 'received' : 'refused', comment: reviewNote || '' };
            }
            return item;
          });

          await updateDoc(requestRef, {
            items: updatedItems,
            updatedAt: new Date().toISOString()
          });
        }
      }

      setRefuseModal(null);
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `uploaded_files/${uploadId}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (uploadId: string) => {
    setProcessingId(uploadId);
    try {
      await deleteDoc(doc(db, 'uploaded_files', uploadId));
      setDeleteConfirmId(null);
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `uploaded_files/${uploadId}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleViewFile = (url: string) => {
    if (url.startsWith('data:')) {
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
      } else {
        alert('O bloqueador de popups impediu a abertura do arquivo.');
      }
    } else {
      window.open(url, '_blank');
    }
  };

  const handleDownloadFile = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredUploads = uploads.filter(upload => {
    const client = clients[upload.clientId];
    const declaration = upload.declarationId ? declarations[upload.declarationId] : null;

    // Visibility restriction: only restrict analysts to what they created or manage
    if (profile?.role === 'analista') {
      const isClientOwner = client?.createdByUserId === profile.id || client?.internalManagerId === profile.id;
      const isDeclOwner = declaration?.createdByUserId === profile.id || declaration?.assignedToUserId === profile.id;
      if (!isClientOwner && !isDeclOwner) return false;
    }

    // Admin filter by responsible/creator
    if (isAdmin && responsibleFilter !== 'all') {
      const isClientMatch = client?.createdByUserId === responsibleFilter || client?.internalManagerId === responsibleFilter;
      const isDeclMatch = declaration?.createdByUserId === responsibleFilter || declaration?.assignedToUserId === responsibleFilter;
      if (!isClientMatch && !isDeclMatch) return false;
    }

    const matchesSearch = client?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         upload.fileNameOriginal.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || upload.reviewStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Uploads / Arquivos</h2>
          <p className="text-slate-500">Central de documentos recebidos dos clientes.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative md:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente ou nome do arquivo..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
            <option value="approved">Aprovados</option>
            <option value="refused">Recusados</option>
          </select>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 md:col-span-2">
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

      {/* Uploads List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-bottom border-slate-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Arquivo</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Cliente / Declaração</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Data</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Carregando arquivos...</td>
                </tr>
              ) : filteredUploads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Nenhum arquivo encontrado.</td>
                </tr>
              ) : (
                filteredUploads.map((upload) => {
                  const client = clients[upload.clientId];
                  const declaration = upload.declarationId ? declarations[upload.declarationId] : null;
                  return (
                    <tr key={upload.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                            <File size={20} />
                          </div>
                          <div>
                            <div className="font-medium text-slate-800 truncate max-w-[200px]" title={upload.fileNameOriginal}>
                              {upload.fileNameOriginal}
                            </div>
                            <div className="text-xs text-slate-400 uppercase tracking-wider">{(upload.mimeType || 'file/unknown').split('/')[1]}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-700">{client?.name || 'Cliente Desconhecido'}</div>
                        <div className="text-xs text-slate-500">IRPF {declaration?.exerciseYear || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {format(new Date(upload.createdAt), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          upload.reviewStatus === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          upload.reviewStatus === 'refused' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {upload.reviewStatus === 'approved' ? <CheckCircle2 size={12} /> : 
                           upload.reviewStatus === 'refused' ? <XCircle size={12} /> : 
                           <Clock size={12} />}
                          {upload.reviewStatus === 'approved' ? 'Aprovado' : 
                           upload.reviewStatus === 'refused' ? 'Recusado' : 
                           'Pendente'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleViewFile(upload.fileUrl)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Visualizar"
                          >
                            <Eye size={18} />
                          </button>
                          <button 
                            onClick={() => handleDownloadFile(upload.fileUrl, upload.fileNameOriginal)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Download"
                          >
                            <Download size={18} />
                          </button>
                          {upload.reviewStatus === 'pending' && (
                            <>
                              <button 
                                onClick={() => handleUpdateStatus(upload.id, 'approved')}
                                disabled={processingId === upload.id}
                                className={`p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors ${processingId === upload.id ? 'animate-pulse' : ''}`}
                                title="Aprovar"
                              >
                                <Check size={18} />
                              </button>
                              <button 
                                onClick={() => setRefuseModal({ id: upload.id, note: '' })}
                                disabled={processingId === upload.id}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Recusar"
                              >
                                <X size={18} />
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => setDeleteConfirmId(upload.id)}
                            disabled={processingId === upload.id}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Refuse Modal */}
      {refuseModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Recusar Documento</h3>
              <button onClick={() => setRefuseModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">Informe o motivo da recusa para orientar o cliente:</p>
              <textarea
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                rows={3}
                placeholder="Ex: Documento ilegível, CPF incorreto..."
                value={refuseModal.note}
                onChange={(e) => setRefuseModal({ ...refuseModal, note: e.target.value })}
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setRefuseModal(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleUpdateStatus(refuseModal.id, 'refused', refuseModal.note)}
                  disabled={processingId === refuseModal.id}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all shadow-md shadow-rose-100"
                >
                  {processingId === refuseModal.id ? 'Processando...' : 'Recusar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Excluir Arquivo?</h3>
              <p className="text-sm text-slate-500 mb-6">Esta ação não pode ser desfeita. O arquivo será removido permanentemente.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  disabled={processingId === deleteConfirmId}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all shadow-md shadow-rose-100"
                >
                  {processingId === deleteConfirmId ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
