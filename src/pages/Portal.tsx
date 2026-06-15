import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Upload, 
  File as FileIcon, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck,
  X,
  Loader2,
  FileText,
  Calendar,
  CheckSquare,
  ChevronRight,
  Landmark,
  Receipt,
  Home,
  Car,
  Stethoscope,
  GraduationCap,
  User,
  Info,
  MessageSquare,
  Clock,
  ThumbsUp,
  ThumbsDown,
  ExternalLink
} from 'lucide-react';
import { 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  limit,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { db, storage, auth } from '../firebase';
import { Client, Declaration, DocumentRequest, UploadedFile } from '../types';
import { format, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

import { notificationService } from '../services/notificationService';

const getDocumentIcon = (itemName: string) => {
  const name = itemName.toLowerCase();
  if (name.includes('cpf') || name.includes('rg') || name.includes('cnh') || name.includes('título') || name.includes('identidade')) return User;
  if (name.includes('extrato') || name.includes('banco') || name.includes('informe') || name.includes('rendimento') || name.includes('investimento')) return Landmark;
  if (name.includes('recibo') || name.includes('nota') || name.includes('fiscal') || name.includes('pagamento')) return Receipt;
  if (name.includes('imóvel') || name.includes('iptu') || name.includes('escritura') || name.includes('aluguel')) return Home;
  if (name.includes('veículo') || name.includes('ipva') || name.includes('carro') || name.includes('moto')) return Car;
  if (name.includes('saúde') || name.includes('médico') || name.includes('plano') || name.includes('hospital') || name.includes('dentista')) return Stethoscope;
  if (name.includes('educação') || name.includes('escola') || name.includes('faculdade') || name.includes('curso')) return GraduationCap;
  return FileText;
};

export const Portal: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [request, setRequest] = useState<DocumentRequest | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [declaration, setDeclaration] = useState<Declaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const [observations, setObservations] = useState<Record<number, string>>({});
  const [generalObservation, setGeneralObservation] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSavingAnswers, setIsSavingAnswers] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      try {
        // Ensure we have some form of auth for Storage/Firestore
        if (!auth.currentUser) {
          await signInAnonymously(auth).catch(err => console.warn('Anonymous auth failed:', err));
        }
        // Try to get by ID first (new system)
        let reqDoc = await getDoc(doc(db, 'document_requests', token));
        let reqData: any = null;

        if (reqDoc.exists()) {
          reqData = { id: reqDoc.id, ...reqDoc.data() };
        } else {
          // Fallback to query (old system)
          const q = query(collection(db, 'document_requests'), where('token', '==', token), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            reqData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          }
        }
        
        if (reqData) {
          // Check expiration
          if (reqData.expiresAt && isAfter(new Date(), parseISO(reqData.expiresAt))) {
            setLoading(false);
            return;
          }

          setRequest(reqData);
          setGeneralObservation(reqData.generalObservation || '');
          
          // Initialize answers
          if (reqData.questions) {
            const initialAnswers: Record<string, string> = {};
            reqData.questions.forEach((q: any) => {
              if (q.answer) initialAnswers[q.id] = q.answer;
            });
            setAnswers(initialAnswers);
          }

          // Try to fetch full docs, but don't fail if they are missing (security rules)
          // We fetch them separately to avoid one failure blocking the other or hanging the whole thing
          getDoc(doc(db, 'clients', reqData.clientId)).then(doc => {
            if (doc.exists()) setClient({ id: doc.id, ...doc.data() } as Client);
          }).catch(() => console.warn('Could not fetch client doc (likely security rules)'));

          getDoc(doc(db, 'declarations', reqData.declarationId)).then(doc => {
            if (doc.exists()) setDeclaration({ id: doc.id, ...doc.data() } as Declaration);
          }).catch(() => console.warn('Could not fetch declaration doc (likely security rules)'));
        }
      } catch (err) {
        console.error('Erro ao carregar portal:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  const handleSaveGeneralObservation = async () => {
    if (!request) return;
    setIsSavingGeneral(true);
    try {
      await updateDoc(doc(db, 'document_requests', request.id), {
        generalObservation,
        updatedAt: new Date().toISOString()
      });
      setRequest({ ...request, generalObservation });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar observação:', err);
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleSaveAnswers = async () => {
    if (!request || !request.questions) return;
    setIsSavingAnswers(true);
    try {
      const updatedQuestions = request.questions.map(q => ({
        ...q,
        answer: answers[q.id] || '',
        answeredAt: answers[q.id] ? (q.answeredAt || new Date().toISOString()) : undefined
      }));

      await updateDoc(doc(db, 'document_requests', request.id), {
        questions: updatedQuestions,
        updatedAt: new Date().toISOString()
      });
      
      setRequest({ ...request, questions: updatedQuestions });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar respostas:', err);
    } finally {
      setIsSavingAnswers(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, itemIdx: number) => {
    const file = e.target.files?.[0];
    if (!file || !request) return;
    
    // Check file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      setUploadErrors(prev => ({ ...prev, [itemIdx]: 'O arquivo é muito grande. O limite máximo é de 50MB.' }));
      return;
    }

    const rClientId = request.clientId;
    const rDeclarationId = request.declarationId;

    setUploading(true);
    setSelectedItemIdx(itemIdx);
    setUploadErrors(prev => {
      const next = { ...prev };
      delete next[itemIdx];
      return next;
    });
    setUploadProgress(prev => ({ ...prev, [itemIdx]: 0 }));
    
    console.log(`Iniciando upload para o item ${itemIdx}: ${file.name} (${file.size} bytes)`);

    const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
    };

    const compressImage = (file: File): Promise<File> => {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
          resolve(file);
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Max dimensions 2000px
            const MAX_SIZE = 2000;
            if (width > height) {
              if (width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
              }
            } else {
              if (height > MAX_SIZE) {
                width *= MAX_SIZE / height;
                height = MAX_SIZE;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            }, 'image/jpeg', 0.7); // 70% quality
          };
        };
      });
    };

    try {
      // Try auth before upload
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (authErr) {
          console.warn('Auth anônima falhou:', authErr);
        }
      }

      let currentFile = file;
      if (file.type.startsWith('image/')) {
        console.log('Comprimindo imagem...');
        currentFile = await compressImage(file);
        console.log(`Imagem comprimida: ${currentFile.size} bytes`);
      }

      let finalUrl = '';
      let usedFallback = false;

      // Attempt Storage with resumable upload for better reliability and progress
      try {
        const storageRef = ref(storage, `uploads/${rClientId}/${rDeclarationId}/${Date.now()}_${currentFile.name}`);
        
        console.log('Tentando upload via Storage (Resumable)...');
        
        const uploadTask = uploadBytesResumable(storageRef, currentFile);

        finalUrl = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            uploadTask.cancel();
            reject(new Error('Storage Timeout: O servidor de arquivos demorou muito para responder.'));
          }, 120000); // 2 minutes timeout for Storage

          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setUploadProgress(prev => ({ ...prev, [itemIdx]: Math.min(progress, 95) }));
              console.log(`Upload progress: ${progress}%`);
            }, 
            (error) => {
              clearTimeout(timeoutId);
              console.error('Storage upload error:', error);
              reject(error);
            }, 
            async () => {
              clearTimeout(timeoutId);
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (urlErr) {
                reject(urlErr);
              }
            }
          );
        });
        
        console.log('Storage OK, URL obtida.');
      } catch (storageErr) {
        console.warn('Storage falhou ou deu timeout, tentando contingência...', storageErr);
        
        // Fallback to Firestore Base64 if file is small enough (< 700KB)
        // 700KB * 1.33 (Base64) = ~931KB, which fits in 1MB Firestore limit
        if (currentFile.size < 700000) { 
          console.log('Usando contingência Firestore (Base64)...');
          setUploadProgress(prev => ({ ...prev, [itemIdx]: 50 }));
          finalUrl = await fileToBase64(currentFile);
          usedFallback = true;
        } else {
          const errorMsg = storageErr instanceof Error ? storageErr.message : 'Erro no servidor de arquivos.';
          throw new Error(`${errorMsg} O arquivo é muito grande para o servidor de contingência (máx 700KB). Tente uma conexão melhor ou um arquivo menor.`);
        }
      }

      // Create UploadedFile record
      const fileUpload: Omit<UploadedFile, 'id'> = {
        clientId: rClientId,
        declarationId: rDeclarationId,
        fileNameOriginal: file.name,
        fileNameStored: usedFallback ? 'base64_fallback' : `${Date.now()}_${currentFile.name}`,
        fileUrl: finalUrl,
        mimeType: currentFile.type,
        sizeBytes: currentFile.size,
        reviewStatus: 'pending',
        uploadedByType: 'client',
        uploadedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('Registrando no banco de dados...');
      setUploadProgress(prev => ({ ...prev, [itemIdx]: 90 }));
      await addDoc(collection(db, 'uploaded_files'), fileUpload);

      // Update items
      const newItems = [...request.items];
      newItems[itemIdx].status = 'received';
      newItems[itemIdx].clientObservation = observations[itemIdx] || '';
      
      const allReceived = newItems.every(i => i.status === 'received');
      const someReceived = newItems.some(i => i.status === 'received');
      const newStatus = allReceived ? 'completed' : (someReceived ? 'partially_received' : 'pending');

      await updateDoc(doc(db, 'document_requests', request.id), {
        items: newItems,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      setRequest({ ...request, items: newItems, status: newStatus });

      // Notification
      try {
        const managerId = client?.internalManagerId || 'admin';
        const cName = client?.name || (request as any).clientName || 'Cliente';
        await notificationService.createNotification({
          targetUserId: managerId,
          type: 'new_document',
          relatedEntityId: request.id,
          title: 'Novo Documento Recebido',
          message: `O cliente ${cName} enviou: ${newItems[itemIdx].item}${usedFallback ? ' (via contingência)' : ''}`,
          readAt: null
        });
      } catch (nErr) { console.error(nErr); }

      setSuccess(true);
      setUploadProgress(prev => {
        const next = { ...prev };
        delete next[itemIdx];
        return next;
      });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      console.error('Erro final no upload:', err);
      const technicalDetails = err.code || err.message || 'Unknown error';
      const msg = `Erro ao enviar: ${err.message || 'Verifique sua internet'}. (Detalhes: ${technicalDetails})`;
      setUploadErrors(prev => ({ ...prev, [itemIdx]: msg }));
    } finally {
      setUploading(false);
      // Don't clear selectedItemIdx here so the error stays visible for that item
    }
  };

  const handleFinalize = async () => {
    if (!request) return;
    try {
      const allReceived = request.items.every(i => i.status === 'received');
      const newStatus = allReceived ? 'completed' : 'partially_received';
      
      await updateDoc(doc(db, 'document_requests', request.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      
      setRequest({ ...request, status: newStatus });
      alert('Sua entrega foi finalizada com sucesso! Nossa equipe será notificada.');
    } catch (err) {
      console.error('Erro ao finalizar:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-brand-yellow" size={48} />
          <p className="text-slate-500 font-medium">Carregando seu portal seguro...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl text-center border border-slate-100">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} className="text-rose-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Link Inválido ou Expirado</h1>
          <p className="text-slate-500 mt-2">Este link de acesso não é mais válido. Por favor, entre em contato com a L&M Contabilidade para solicitar um novo link.</p>
        </div>
      </div>
    );
  }

  const clientName = client?.name || (request as any).clientName || 'Cliente';
  const exerciseYear = declaration?.exerciseYear || (request as any).exerciseYear || 2026;
  const clientId = request.clientId;
  const declarationId = request.declarationId;
  const internalManagerId = client?.internalManagerId || 'admin';

  const completedCount = request.items.filter(i => i.status === 'received').length;
  const progressPercent = (completedCount / request.items.length) * 100;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-brand-yellow rounded-xl flex items-center justify-center text-brand-black shadow-lg shadow-brand-yellow/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Central IRPF L&M</h2>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Ambiente Criptografado</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs font-bold text-slate-400">
            <span className="flex items-center gap-1"><Clock size={14} /> Link expira em breve</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full" />
            <span>Suporte: (00) 0000-0000</span>
          </div>
        </div>

        {/* Hero Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-8">
          <div className="p-8 md:p-12 bg-gradient-to-br from-brand-black to-slate-900 text-white relative overflow-hidden">
            <div className="relative z-10">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h1 className="text-3xl md:text-4xl font-bold mb-2">Olá, {(clientName || 'Cliente').split(' ')[0]}!</h1>
                <p className="text-slate-300 text-lg md:text-xl opacity-90 max-w-xl">
                  Estamos prontos para processar sua declaração de <span className="font-bold text-brand-yellow">IRPF {exerciseYear}</span>. Envie seus documentos abaixo.
                </p>
              </motion.div>

              <div className="mt-8 flex flex-wrap gap-4">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-yellow rounded-xl flex items-center justify-center text-brand-black">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Prazo Final</p>
                    <p className="font-bold">{format(new Date(request.dueDate), "dd 'de' MMMM", { locale: ptBR })}</p>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center gap-3 flex-1 min-w-[200px]">
                  <div className="flex-1">
                    <div className="flex justify-between items-end mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Seu Progresso</p>
                      <p className="text-xs font-bold">{completedCount}/{request.items.length}</p>
                    </div>
                    <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        className="h-full bg-brand-yellow rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl" />
          </div>

          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <CheckSquare className="text-brand-yellow" size={24} />
                Documentos Solicitados
              </h2>
              <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-slate-200 rounded-full" /> Pendente</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-emerald-500 rounded-full" /> Enviado</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 bg-rose-500 rounded-full" /> Recusado</span>
              </div>
            </div>

            <div className="grid gap-6">
              {request.items.map((item, idx) => {
                const Icon = getDocumentIcon(item.item);
                const isReceived = item.status === 'received';
                const isRefused = item.status === 'refused';
                
                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`group relative bg-white rounded-2xl border-2 transition-all overflow-hidden ${
                      isReceived ? 'border-emerald-100 bg-emerald-50/10' : 
                      isRefused ? 'border-rose-200 bg-rose-50/30' : 
                      'border-slate-100 hover:border-indigo-200 hover:shadow-md'
                    }`}
                  >
                    {/* Status indicator bar */}
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${
                      isReceived ? 'bg-emerald-500' : 
                      isRefused ? 'bg-rose-500' : 
                      'bg-slate-200 group-hover:bg-brand-yellow'
                    }`} />

                    <div className="p-5 md:p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start gap-4 flex-1">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                            isReceived ? 'bg-emerald-100 text-emerald-600' : 
                            isRefused ? 'bg-rose-100 text-rose-600' : 
                            'bg-slate-100 text-slate-500 group-hover:bg-brand-yellow/10 group-hover:text-brand-yellow'
                          }`}>
                            <Icon size={24} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className={`font-bold text-lg ${isReceived ? 'text-emerald-900' : 'text-slate-800'}`}>
                                {item.item}
                              </h3>
                              {isReceived && <ThumbsUp size={16} className="text-emerald-500" />}
                              {isRefused && <ThumbsDown size={16} className="text-rose-500 animate-bounce" />}
                            </div>
                            
                            <div className="flex flex-wrap gap-3">
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                isReceived ? 'bg-emerald-100 text-emerald-700' : 
                                isRefused ? 'bg-rose-100 text-rose-700' : 
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {isReceived ? 'Recebido' : isRefused ? 'Recusado' : 'Aguardando'}
                              </span>
                              
                              {isRefused && item.comment && (
                                <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium bg-rose-50 px-3 py-1 rounded-lg border border-rose-100 shadow-sm">
                                  <AlertCircle size={14} />
                                  <span><strong>Motivo:</strong> {item.comment}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 min-w-[240px]">
                          {!isReceived && (
                            <div className="space-y-3">
                              <div className="relative">
                                <MessageSquare size={14} className="absolute left-3 top-3 text-slate-400" />
                                <textarea
                                  placeholder="Alguma observação sobre este documento?"
                                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-yellow/20 min-h-[60px] resize-none bg-slate-50/50"
                                  value={observations[idx] || ''}
                                  onChange={(e) => setObservations({ ...observations, [idx]: e.target.value })}
                                />
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <input
                                  type="file"
                                  id={`file-${idx}`}
                                  className="hidden"
                                  onChange={(e) => handleFileUpload(e, idx)}
                                  disabled={uploading}
                                />
                                <label
                                  htmlFor={`file-${idx}`}
                                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-lg active:scale-95 ${
                                    uploading 
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                      : 'bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark shadow-brand-yellow/10'
                                  }`}
                                >
                                  {uploading && selectedItemIdx === idx ? (
                                    <Loader2 size={18} className="animate-spin" />
                                  ) : (
                                    <Upload size={18} />
                                  )}
                                  <span>
                                    {uploading && selectedItemIdx === idx && uploadProgress[idx] !== undefined
                                      ? `Enviando... ${uploadProgress[idx]}%`
                                      : (isRefused ? 'Reenviar Documento' : 'Enviar Documento')}
                                  </span>
                                </label>
                              </div>
                              {uploadErrors[idx] && (
                                <p className="text-[10px] text-rose-500 font-bold mt-1 flex items-start gap-1 bg-rose-50 p-2 rounded-lg border border-rose-100">
                                  <AlertCircle size={12} className="shrink-0 mt-0.5" /> 
                                  <span>{uploadErrors[idx]}</span>
                                </p>
                              )}
                            </div>
                          )}
                          
                          {isReceived && (
                            <div className="flex items-center justify-end gap-2 text-emerald-600 font-bold text-sm bg-emerald-50/50 px-4 py-2 rounded-xl border border-emerald-100/50">
                              <CheckCircle2 size={18} />
                              Documento Enviado
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Questions Section */}
            {request.questions && request.questions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-8 bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-brand-yellow/10 text-brand-yellow rounded-lg">
                    <MessageSquare size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Perguntas sobre seus Bens</h3>
                </div>
                <p className="text-slate-500 text-sm mb-6">
                  O analista responsável pela sua declaração tem algumas dúvidas específicas. Por favor, responda abaixo:
                </p>
                <div className="space-y-6">
                  {request.questions.map((q) => (
                    <div key={q.id} className="space-y-2">
                      <label className="block text-sm font-bold text-slate-700">
                        {q.text}
                      </label>
                      <textarea
                        className="w-full p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-yellow/20 min-h-[80px] bg-slate-50/30 text-slate-700"
                        placeholder="Sua resposta aqui..."
                        value={answers[q.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-6">
                  <button
                    onClick={handleSaveAnswers}
                    disabled={isSavingAnswers}
                    className="flex items-center gap-2 bg-brand-yellow text-brand-black px-8 py-3 rounded-xl font-bold hover:bg-brand-yellow-dark transition-all disabled:opacity-50 shadow-lg shadow-brand-yellow/10"
                  >
                    {isSavingAnswers ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={18} />
                    )}
                    Salvar Respostas
                  </button>
                </div>
              </motion.div>
            )}

            {/* General Observations */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-brand-yellow/10 text-brand-yellow rounded-lg">
                  <MessageSquare size={20} />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Observações Gerais</h3>
              </div>
              <p className="text-slate-500 text-sm mb-4">
                Use este campo para nos enviar qualquer informação adicional ou mensagem importante sobre sua declaração.
              </p>
              <textarea
                className="w-full p-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-yellow/20 min-h-[120px] bg-slate-50/30 text-slate-700"
                placeholder="Escreva aqui sua mensagem para o contador..."
                value={generalObservation}
                onChange={(e) => setGeneralObservation(e.target.value)}
              />
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSaveGeneralObservation}
                  disabled={isSavingGeneral}
                  className="flex items-center gap-2 bg-slate-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-900 transition-all disabled:opacity-50"
                >
                  {isSavingGeneral ? 'Salvando...' : 'Salvar Observação'}
                </button>
              </div>
            </motion.div>

            {/* Finalize Section */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-8 bg-gradient-to-br from-brand-black to-slate-900 rounded-3xl p-8 text-center text-white shadow-xl shadow-slate-200"
            >
              <h3 className="text-2xl font-bold mb-2">Tudo pronto por enquanto?</h3>
              <p className="text-slate-300 mb-6 max-w-md mx-auto">
                Se você já enviou todos os documentos disponíveis, clique no botão abaixo para nos avisar.
              </p>
              <button
                onClick={handleFinalize}
                className="bg-brand-yellow text-brand-black px-10 py-4 rounded-2xl font-bold text-lg hover:bg-brand-yellow-dark transition-all shadow-lg active:scale-95"
              >
                Finalizar Entrega
              </button>
            </motion.div>

            <div className="mt-12 grid md:grid-cols-2 gap-6">
              <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 relative overflow-hidden group">
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-yellow shadow-sm mb-4">
                    <Info size={24} />
                  </div>
                  <h3 className="font-bold text-slate-800 text-lg mb-2">Dúvidas no processo?</h3>
                  <p className="text-slate-500 text-sm mb-6 leading-relaxed">Nossa equipe de especialistas está pronta para ajudar você com qualquer dúvida sobre a documentação.</p>
                  <a 
                    href="https://wa.me/5500000000000" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-white text-brand-black px-6 py-3 rounded-xl font-bold text-sm shadow-sm hover:shadow-md transition-all border border-brand-yellow/20"
                  >
                    Suporte via WhatsApp
                    <ChevronRight size={16} className="text-brand-yellow" />
                  </a>
                </div>
                <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-brand-yellow/10 rounded-full blur-2xl group-hover:bg-brand-yellow/20 transition-colors" />
              </div>

              <div className="p-8 bg-brand-black rounded-3xl border border-slate-800 text-white relative overflow-hidden group">
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-brand-yellow mb-4">
                    <ShieldCheck size={24} />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Seus dados estão seguros</h3>
                  <p className="text-slate-400 text-sm mb-6 leading-relaxed">Utilizamos criptografia de ponta a ponta para garantir que seus documentos financeiros permaneçam privados.</p>
                  <div className="flex items-center gap-2 text-xs font-bold text-brand-yellow">
                    <CheckCircle2 size={14} />
                    Conformidade com LGPD
                  </div>
                </div>
                <div className="absolute -top-4 -left-4 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">© 2024 L&M Contabilidade - Portal do Cliente</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest">Privacidade</a>
              <a href="#" className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest">Termos</a>
            </div>
          </div>
        </div>
      </div>

        {/* Success Toast Notification */}
        <AnimatePresence>
          {success && (
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm"
            >
              <div className="bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-emerald-500">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-lg leading-tight">Envio Confirmado!</p>
                  <p className="text-emerald-100 text-xs">Seu documento foi recebido com sucesso.</p>
                </div>
                <button 
                  onClick={() => setSuccess(false)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
};

