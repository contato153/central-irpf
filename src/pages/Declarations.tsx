import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  serverTimestamp,
  orderBy,
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { dbCache } from '../services/dbCache';
import { logAction } from '../services/auditService';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Plus, 
  PlusCircle,
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Edit2, 
  Edit3,
  Trash2,
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  FileCheck,
  User,
  Calendar,
  DollarSign,
  ChevronRight,
  Send,
  Archive,
  X,
  Upload,
  Loader2
} from 'lucide-react';
import { 
  Declaration, 
  Client, 
  DeclarationStatus, 
  DeclarationModel,
  DeclarationType,
  UserProfile,
  PricingHistory,
  UploadedFile
} from '../types';
import { handleFirestoreError, OperationType, useAuth } from '../components/FirebaseProvider';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { notificationService } from '../services/notificationService';

const STATUS_LABELS: Record<DeclarationStatus, { label: string; color: string; icon: any }> = {
  new_service: { label: 'Novo Serviço', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: PlusCircle },
  link_sent: { label: 'Link Enviado', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Send },
  waiting_docs: { label: 'Aguardando Docs', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  docs_received: { label: 'Docs Recebidos', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: FileCheck },
  screening: { label: 'Triagem', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Search },
  client_pending: { label: 'Pendência Cliente', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: AlertCircle },
  in_progress: { label: 'Em Elaboração', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Edit2 },
  review: { label: 'Em Revisão', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Eye },
  ready_to_send: { label: 'Pronta p/ Enviar', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  transmitted: { label: 'Transmitida', color: 'bg-cyan-100 text-cyan-700 border-cyan-200', icon: FileText },
  finalized: { label: 'Finalizada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  archived: { label: 'Arquivada', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Archive },
};

export const Declarations: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, profile, user: authUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - i);
  const [availableYears, setAvailableYears] = useState<number[]>(years);
  const [loading, setLoading] = useState(true);
  
  // Filters from URL
  const searchTerm = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const exerciseFilter = searchParams.get('exercise') || currentYear.toString();
  const responsibleFilter = searchParams.get('responsible') || 'all';

  // Handle 'id' query parameter to open edit modal
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && declarations.length > 0) {
      const dec = declarations.find(d => d.id === id);
      if (dec) {
        setEditingDeclaration(dec);
        setFormData({
          clientId: dec.clientId,
          exerciseYear: dec.exerciseYear,
          calendarYear: dec.calendarYear,
          declarationType: dec.declarationType,
          assignedToUserId: dec.assignedToUserId || '',
          kanbanStage: dec.kanbanStage,
          grossAmount: dec.grossAmount || 0,
          calculationModel: dec.calculationModel,
          notes: dec.notes || '',
          taxToPay: dec.taxToPay || 0,
          refundAmount: dec.refundAmount || 0,
          receiptNumber: dec.receiptNumber || '',
          priorityLabel: dec.priorityLabel || 'medium',
          hasCommission: dec.hasCommission || false,
          commissionPercentage: dec.commissionPercentage || 0,
          isIncludedInMonthlyFee: dec.isIncludedInMonthlyFee || false
        });
        setIsModalOpen(true);
        // Clear the ID from URL after opening
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('id');
        setSearchParams(newParams);
      }
    }
  }, [searchParams, declarations, setSearchParams]);

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
  const [selectedDeclaration, setSelectedDeclaration] = useState<Declaration | null>(null);
  const [editingDeclaration, setEditingDeclaration] = useState<Declaration | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'checklist' | 'pending' | 'timeline' | 'files'>('summary');
  const [docRequest, setDocRequest] = useState<any>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [refusalComment, setRefusalComment] = useState('');
  const [refusingItemId, setRefusingItemId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedDeclaration && (activeTab === 'checklist' || activeTab === 'pending')) {
      const fetchDocRequest = async () => {
        try {
          const q = query(
            collection(db, 'document_requests'),
            where('declarationId', '==', selectedDeclaration.id),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            setDocRequest({ id: snap.docs[0].id, ...snap.docs[0].data() });
          } else {
            setDocRequest(null);
          }
        } catch (e) {
          console.error("Error loading document request in Declarations detail:", e);
        }
      };
      fetchDocRequest();
    }
  }, [selectedDeclaration, activeTab]);

  useEffect(() => {
    if (selectedDeclaration && activeTab === 'files') {
      const fetchUploadedFiles = async () => {
        try {
          const q = query(
            collection(db, 'uploaded_files'),
            where('declarationId', '==', selectedDeclaration.id),
            orderBy('uploadedAt', 'desc')
          );
          const snap = await getDocs(q);
          const files = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UploadedFile));
          setUploadedFiles(files);
        } catch (e) {
          console.error("Error loading uploaded files in Declarations detail:", e);
        }
      };
      fetchUploadedFiles();
    }
  }, [selectedDeclaration, activeTab]);

  // Form State
  const [formData, setFormData] = useState({
    clientId: '',
    exerciseYear: currentYear,
    calendarYear: currentYear - 1,
    declarationType: 'original' as DeclarationType,
    assignedToUserId: '',
    kanbanStage: 'waiting_docs' as DeclarationStatus,
    grossAmount: 0,
    calculationModel: 'simplified' as DeclarationModel,
    notes: '',
    taxToPay: 0,
    refundAmount: 0,
    receiptNumber: '',
    priorityLabel: 'medium' as 'low' | 'medium' | 'high',
    hasCommission: false,
    commissionPercentage: 0,
    isIncludedInMonthlyFee: false
  });

  const fetchData = async (forceDeclarations = false, forceOthers = false) => {
    try {
      setLoading(true);
      const [declarationsData, clientsData, usersData, settingsData] = await Promise.all([
        dbCache.getDeclarations(forceDeclarations),
        dbCache.getClients(forceOthers),
        dbCache.getUsers(forceOthers),
        dbCache.getSystemSettings(forceOthers)
      ]);

      setDeclarations(declarationsData);
      setClients(clientsData);
      setUsers(usersData);

      if (settingsData && settingsData.availableYears && Array.isArray(settingsData.availableYears)) {
        const years = [...settingsData.availableYears];
        if (!years.includes(2026)) years.unshift(2026);
        if (!years.includes(2025)) {
          if (!years.includes(2026)) years.unshift(2025);
          else {
             const idx = years.indexOf(2026);
             years.splice(idx + 1, 0, 2025);
          }
        }
        const uniqueYears = Array.from(new Set(years)).sort((a, b) => b - a);
        setAvailableYears(uniqueYears);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'declarations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    dbCache.clear();
    fetchData();
  }, []);

  const handleCopyLastFee = async () => {
    if (!formData.clientId) {
      alert('Selecione um cliente primeiro.');
      return;
    }

    try {
      const q = query(
        collection(db, 'pricing_history'),
        where('clientId', '==', formData.clientId),
        orderBy('exerciseYear', 'desc'),
        limit(1)
      );
      
      const snap = await getDocs(q);
      if (!snap.empty) {
        const lastFee = snap.docs[0].data() as PricingHistory;
        setFormData({ ...formData, grossAmount: lastFee.grossAmount });
      } else {
        alert('Nenhum honorário anterior encontrado para este cliente.');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'pricing_history');
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingReceipt(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Extraia as informações deste recibo de entrega de declaração de imposto de renda (IRPF). Procure pelo Ano de Exercício, Número do Recibo, Valor do Imposto a Pagar e Valor do Imposto a Restituir." },
              { inlineData: { data: base64Data, mimeType: file.type } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              exerciseYear: { type: Type.INTEGER, description: "Ano do exercício (ex: 2025)" },
              receiptNumber: { type: Type.STRING, description: "Número do recibo de entrega" },
              taxToPay: { type: Type.NUMBER, description: "Valor do imposto a pagar" },
              refundAmount: { type: Type.NUMBER, description: "Valor do imposto a restituir" },
            },
            required: ["exerciseYear", "receiptNumber"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      if (result.exerciseYear && result.exerciseYear !== Number(formData.exerciseYear)) {
        alert(`Atenção: O exercício do recibo (${result.exerciseYear}) é diferente do exercício selecionado na declaração (${formData.exerciseYear}).`);
        setIsProcessingReceipt(false);
        return;
      }

      setFormData(prev => ({
        ...prev,
        receiptNumber: result.receiptNumber || prev.receiptNumber,
        taxToPay: result.taxToPay || 0,
        refundAmount: result.refundAmount || 0,
      }));

      alert('Dados extraídos com sucesso do recibo!');
    } catch (err) {
      console.error('Error processing receipt:', err);
      alert('Erro ao processar o recibo. Verifique se o arquivo é uma imagem ou PDF válido do recibo da Receita Federal.');
    } finally {
      setIsProcessingReceipt(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleApproveItem = async (index: number) => {
    if (!docRequest) return;
    try {
      const newItems = [...docRequest.items];
      newItems[index].status = 'received';
      newItems[index].comment = '';
      
      await updateDoc(doc(db, 'document_requests', docRequest.id), {
        items: newItems,
        updatedAt: new Date().toISOString()
      });

      setDocRequest(prev => prev ? { ...prev, items: newItems } : null);

      await logAction('approve', 'document_requests', docRequest.id, {
        item: newItems[index].item
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `document_requests/${docRequest.id}`);
    }
  };

  const handleRefuseItem = async (index: number) => {
    if (!docRequest || !refusalComment) {
      alert('Por favor, informe o motivo da recusa.');
      return;
    }
    try {
      const newItems = [...docRequest.items];
      newItems[index].status = 'refused';
      newItems[index].comment = refusalComment;
      
      await updateDoc(doc(db, 'document_requests', docRequest.id), {
        items: newItems,
        updatedAt: new Date().toISOString()
      });

      setDocRequest(prev => prev ? { ...prev, items: newItems } : null);

      await logAction('refuse', 'document_requests', docRequest.id, {
        item: newItems[index].item,
        reason: refusalComment
      });

      // Notify client (or just log it for now, but the request was to notify when documents are refused)
      // Since clients don't have a userId in the same way, we might need to think how they see it.
      // But the request says "alerta quando houver documento recusado". This could be for the staff too.
      // Let's notify the assigned manager that a document was refused (so they know they need to follow up)
      // OR if the client has a portal, they see it there.
      // The prompt says "alerta quando houver documento recusado".
      await notificationService.createNotification({
        targetUserId: selectedDeclaration.assignedToUserId || 'admin',
        type: 'document_refused',
        relatedEntityId: selectedDeclaration.id,
        title: 'Documento Recusado',
        message: `O documento "${newItems[index].item}" do cliente ${getClientName(selectedDeclaration.clientId)} foi recusado.`
      });

      setRefusingItemId(null);
      setRefusalComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `document_requests/${docRequest.id}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting declaration form:', formData);
    try {
      if (editingDeclaration) {
        console.log('Updating existing declaration:', editingDeclaration.id);
        const updateData = {
          clientId: formData.clientId,
          exerciseYear: Number(formData.exerciseYear),
          calendarYear: Number(formData.calendarYear),
          declarationType: formData.declarationType,
          kanbanStage: formData.kanbanStage,
          assignedToUserId: formData.assignedToUserId,
          calculationModel: formData.calculationModel,
          taxToPay: Number(formData.taxToPay),
          refundAmount: Number(formData.refundAmount),
          grossAmount: Number(formData.grossAmount),
          receiptNumber: formData.receiptNumber,
          notes: formData.notes,
          priorityLabel: formData.priorityLabel,
          hasCommission: formData.hasCommission,
          commissionPercentage: Number(formData.commissionPercentage),
          isIncludedInMonthlyFee: formData.isIncludedInMonthlyFee,
          updatedAt: new Date().toISOString(),
        };

        await updateDoc(doc(db, 'declarations', editingDeclaration.id), updateData);
        console.log('Declaration updated successfully');

        // Update pricing history if it exists
        try {
          const q = query(
            collection(db, 'pricing_history'),
            where('declarationId', '==', editingDeclaration.id),
            limit(1)
          );
          const pricingSnap = await getDocs(q);
          if (!pricingSnap.empty) {
            const pricingDoc = pricingSnap.docs[0];
            await updateDoc(doc(db, 'pricing_history', pricingDoc.id), {
              grossAmount: Number(formData.grossAmount),
              finalAmount: Number(formData.grossAmount) - (pricingDoc.data().discountAmount || 0),
              paymentMethod: formData.isIncludedInMonthlyFee ? 'Mensalidade' : (pricingDoc.data().paymentMethod === 'Mensalidade' ? 'pix' : (pricingDoc.data().paymentMethod || 'pix')),
              paymentStatus: formData.isIncludedInMonthlyFee ? 'paid' : (pricingDoc.data().paymentStatus === 'paid' && pricingDoc.data().paymentMethod === 'Mensalidade' ? 'pending' : (pricingDoc.data().paymentStatus || 'pending')),
              paidAt: formData.isIncludedInMonthlyFee ? (pricingDoc.data().paidAt || new Date().toISOString()) : (pricingDoc.data().paymentMethod === 'Mensalidade' ? null : (pricingDoc.data().paidAt || null)),
              notes: formData.isIncludedInMonthlyFee ? 'Valor embutido no contrato mensal do cliente.' : (pricingDoc.data().notes || ''),
              updatedAt: new Date().toISOString()
            });
          } else if (Number(formData.grossAmount) > 0) {
            // Create if it doesn't exist but has a value now
            await addDoc(collection(db, 'pricing_history'), {
              clientId: formData.clientId,
              declarationId: editingDeclaration.id,
              exerciseYear: Number(formData.exerciseYear),
              grossAmount: Number(formData.grossAmount),
              discountAmount: 0,
              finalAmount: Number(formData.grossAmount),
              paymentMethod: formData.isIncludedInMonthlyFee ? 'Mensalidade' : 'pix',
              paymentStatus: formData.isIncludedInMonthlyFee ? 'paid' : 'pending',
              paidAt: formData.isIncludedInMonthlyFee ? new Date().toISOString() : null,
              notes: formData.isIncludedInMonthlyFee ? 'Valor embutido no contrato mensal do cliente.' : '',
              dueDate: new Date().toISOString(),
              createdByUserId: auth.currentUser?.uid,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (pricingErr) {
          console.error('Error updating pricing history:', pricingErr);
        }

        // Audit Log
        await logAction('update', 'declarations', editingDeclaration.id, {
          clientId: formData.clientId,
          exerciseYear: formData.exerciseYear
        });

        setIsModalOpen(false);
        resetForm();
        fetchData(true);
        return;
      }

      // Rule: Each client can have only one declaration per exercise
      const existing = declarations.find(
        d => d.clientId === formData.clientId && d.exerciseYear === Number(formData.exerciseYear)
      );

      if (existing) {
        alert(`Este cliente já possui uma declaração para o exercício ${formData.exerciseYear}.`);
        return;
      }

      const newDeclaration = {
        clientId: formData.clientId,
        exerciseYear: Number(formData.exerciseYear),
        calendarYear: Number(formData.calendarYear),
        declarationType: formData.declarationType,
        kanbanStage: formData.kanbanStage,
        assignedToUserId: formData.assignedToUserId,
        createdByUserId: authUser?.uid,
        calculationModel: formData.calculationModel,
        taxToPay: Number(formData.taxToPay),
        refundAmount: Number(formData.refundAmount),
        grossAmount: Number(formData.grossAmount),
        receiptNumber: formData.receiptNumber,
        notes: formData.notes,
        priorityLabel: formData.priorityLabel,
        hasCommission: formData.hasCommission,
        commissionPercentage: Number(formData.commissionPercentage),
        isIncludedInMonthlyFee: formData.isIncludedInMonthlyFee,
        obligationStatus: 'pending',
        reviewStatus: 'not_started',
        checklist: [],
        timeline: [{
          status: formData.kanbanStage,
          date: new Date().toISOString(),
          user: auth.currentUser?.displayName || 'Sistema'
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const declRef = await addDoc(collection(db, 'declarations'), newDeclaration);

      // Kanban History for initial stage
      await addDoc(collection(db, 'kanban_history'), {
        declarationId: declRef.id,
        fromStage: 'new_service', // Virtual starting point
        toStage: formData.kanbanStage,
        userId: auth.currentUser?.uid || 'system',
        userName: auth.currentUser?.displayName || 'Sistema',
        timestamp: new Date().toISOString()
      });

      // Audit Log
      await logAction('create', 'declarations', declRef.id, {
        clientId: formData.clientId,
        exerciseYear: formData.exerciseYear
      });

      // Create pricing history record
      if (formData.grossAmount > 0) {
        await addDoc(collection(db, 'pricing_history'), {
          clientId: formData.clientId,
          declarationId: declRef.id,
          exerciseYear: Number(formData.exerciseYear),
          grossAmount: Number(formData.grossAmount),
          discountAmount: 0,
          finalAmount: Number(formData.grossAmount),
          paymentMethod: formData.isIncludedInMonthlyFee ? 'Mensalidade' : 'pix',
          paymentStatus: formData.isIncludedInMonthlyFee ? 'paid' : 'pending',
          paidAt: formData.isIncludedInMonthlyFee ? new Date().toISOString() : null,
          notes: formData.isIncludedInMonthlyFee ? 'Valor embutido no contrato mensal do cliente.' : '',
          dueDate: new Date().toISOString(),
          createdByUserId: authUser?.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      setIsModalOpen(false);
      resetForm();
      fetchData(true);
    } catch (err) {
      handleFirestoreError(err, editingDeclaration ? OperationType.UPDATE : OperationType.CREATE, 'declarations');
    }
  };

  const handleUpdateStatus = async (declarationId: string, newStatus: DeclarationStatus) => {
    try {
      const declaration = declarations.find(d => d.id === declarationId);
      if (!declaration) return;

      // Rule: Reopening restricted (handled by rules, but UI feedback is good)
      const isLocked = ['finalized', 'transmitted'].includes(declaration.kanbanStage);
      const isMovingOut = !['finalized', 'transmitted'].includes(newStatus);
      
      // We'll let the Firestore rules handle the actual permission check, 
      // but we can log the attempt or provide a warning if we had user roles here.

      await updateDoc(doc(db, 'declarations', declarationId), {
        kanbanStage: newStatus,
        updatedAt: new Date().toISOString()
      });

      // Audit Log
      await logAction('update', 'declarations', declarationId, {
        oldStatus: declaration.kanbanStage,
        newStatus: newStatus
      });

      // Kanban History
      await addDoc(collection(db, 'kanban_history'), {
        declarationId,
        fromStage: declaration.kanbanStage,
        toStage: newStatus,
        userId: auth.currentUser?.uid || 'system',
        userName: auth.currentUser?.displayName || 'Sistema',
        timestamp: new Date().toISOString()
      });

      fetchData(true);

    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `declarations/${declarationId}`);
    }
  };

  const handleDelete = async (declarationId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta declaração? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'declarations', declarationId));
      
      // Audit Log
      await logAction('delete', 'declarations', declarationId, {});

      fetchData(true);

      // Clean up related data (optional but recommended)
      // We could also delete pricing_history, document_requests, etc.
      // For now, let's just delete the main record as requested.
      
      if (selectedDeclaration?.id === declarationId) {
        setIsDetailOpen(false);
        setSelectedDeclaration(null);
      }
      
      alert('Declaração excluída com sucesso.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `declarations/${declarationId}`);
    }
  };

  const resetForm = () => {
    setEditingDeclaration(null);
    setFormData({
      clientId: '',
      exerciseYear: currentYear,
      calendarYear: currentYear - 1,
      declarationType: 'original',
      assignedToUserId: '',
      kanbanStage: 'waiting_docs',
      grossAmount: 0,
      calculationModel: 'simplified',
      notes: '',
      taxToPay: 0,
      refundAmount: 0,
      receiptNumber: '',
      priorityLabel: 'medium',
      hasCommission: false,
      commissionPercentage: 0,
      isIncludedInMonthlyFee: false
    });
  };

  const filteredDeclarations = declarations.filter(dec => {
    // Visibility restriction: only restrict analysts to their own creations or assignments
    if (profile?.role === 'analista') {
      const isOwner = dec.createdByUserId === profile.id;
      const isAssigned = dec.assignedToUserId === profile.id;
      if (!isOwner && !isAssigned) return false;
    }

    // Admin filter by responsible/creator
    if (isAdmin && responsibleFilter !== 'all') {
      if (dec.createdByUserId !== responsibleFilter && dec.assignedToUserId !== responsibleFilter) return false;
    }

    const client = clients.find(c => c.id === dec.clientId);
    const matchesSearch = (client?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         client?.cpf.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || dec.kanbanStage === statusFilter;
    const matchesExercise = exerciseFilter === 'all' || dec.exerciseYear.toString() === exerciseFilter;
    return matchesSearch && matchesStatus && matchesExercise;
  });

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Cliente não encontrado';
  };

  const getResponsibleName = (id?: string) => {
    if (!id) return 'Não atribuído';
    const u = users.find(usr => usr.id === id);
    if (!u) return 'Usuário não encontrado';
    return u.name || u.nome || u.email || 'Usuário';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Declarações</h2>
          <p className="text-slate-500">Gerencie as declarações de IRPF dos seus clientes.</p>
        </div>
        <button 
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus size={20} />
          Nova Declaração
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente ou CPF..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => updateFilters({ q: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={statusFilter}
            onChange={(e) => updateFilters({ status: e.target.value })}
          >
            <option key="all" value="all">Todos os Status</option>
            {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="text-slate-400" size={18} />
          <select
            className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={exerciseFilter}
            onChange={(e) => updateFilters({ exercise: e.target.value })}
          >
            <option key="all" value="all">Todos os Exercícios</option>
            {availableYears.map(year => (
              <option key={year} value={year.toString()}>Exercício {year}</option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <User className="text-slate-400" size={18} />
            <select
              className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={responsibleFilter}
              onChange={(e) => updateFilters({ responsible: e.target.value })}
            >
              <option value="all">Todos os Responsáveis</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name || u.nome || u.email}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Declarations List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Cliente</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">CPF</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Exercício</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Responsável</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">Honorário</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">Carregando declarações...</td>
                </tr>
              ) : filteredDeclarations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">Nenhuma declaração encontrada.</td>
                </tr>
              ) : (
                filteredDeclarations.map((dec) => {
                  const statusInfo = STATUS_LABELS[dec.kanbanStage];
                  const StatusIcon = statusInfo.icon;
                  const client = clients.find(c => c.id === dec.clientId);
                  return (
                    <tr key={dec.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-800">{client?.name || 'Cliente não encontrado'}</div>
                        <div className="text-xs text-slate-500">{dec.declarationType}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {client?.cpf || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {dec.exerciseYear}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                          <StatusIcon size={12} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {(getResponsibleName(dec.assignedToUserId) || 'U').charAt(0)}
                          </div>
                          {getResponsibleName(dec.assignedToUserId)}
                        </div>
                      </td>
      <td className="px-6 py-4 text-sm font-medium text-slate-700">
        <div>
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dec.grossAmount || 0)}
          {dec.isIncludedInMonthlyFee && (
            <div className="text-[10px] text-indigo-600 font-bold mt-0.5">Embutido no Mensal</div>
          )}
        </div>
      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => {
                              setSelectedDeclaration(dec);
                              setIsDetailOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Ver Detalhes"
                          >
                            <Eye size={18} />
                          </button>
                          <button 
                            onClick={() => {
                              setEditingDeclaration(dec);
                              setFormData({
                                clientId: dec.clientId,
                                exerciseYear: dec.exerciseYear,
                                calendarYear: dec.calendarYear,
                                declarationType: dec.declarationType,
                                assignedToUserId: dec.assignedToUserId || '',
                                kanbanStage: dec.kanbanStage,
                                grossAmount: dec.grossAmount || 0,
                                calculationModel: dec.calculationModel,
                                notes: dec.notes || '',
                                taxToPay: dec.taxToPay || 0,
                                refundAmount: dec.refundAmount || 0,
                                receiptNumber: dec.receiptNumber || '',
                                priorityLabel: dec.priorityLabel || 'medium',
                                hasCommission: dec.hasCommission || false,
                                commissionPercentage: dec.commissionPercentage || 0,
                                isIncludedInMonthlyFee: dec.isIncludedInMonthlyFee || false
                              });
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={18} />
                          </button>
                          {isAdmin && (
                            <button 
                              onClick={() => handleDelete(dec.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
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

      {/* Add Declaration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                {editingDeclaration ? 'Editar Declaração' : 'Nova Declaração'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
                  <select
                    required
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  >
                    <option value="">Selecione um cliente</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name} ({client.cpf})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Exercício</label>
                  <div className="flex gap-2">
                    <select
                      className="flex-1 p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.exerciseYear}
                      onChange={(e) => setFormData({ ...formData, exerciseYear: Number(e.target.value), calendarYear: Number(e.target.value) - 1 })}
                    >
                      {availableYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <div className="relative">
                      <input
                        type="file"
                        id="receipt-upload"
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={handleReceiptUpload}
                        disabled={isProcessingReceipt}
                      />
                      <label
                        htmlFor="receipt-upload"
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                          isProcessingReceipt 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                        }`}
                      >
                        {isProcessingReceipt ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        {isProcessingReceipt ? 'Processando...' : 'Recibo'}
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.declarationType}
                    onChange={(e) => setFormData({ ...formData, declarationType: e.target.value as DeclarationType })}
                  >
                    <option value="original">Original</option>
                    <option value="rectifying">Retificadora</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Responsável</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.assignedToUserId}
                    onChange={(e) => setFormData({ ...formData, assignedToUserId: e.target.value })}
                  >
                    <option value="">Selecione um responsável</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name || user.nome || user.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Modelo</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.calculationModel}
                    onChange={(e) => setFormData({ ...formData, calculationModel: e.target.value as DeclarationModel })}
                  >
                    <option value="simplified">Simplificado</option>
                    <option value="complete">Completo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prioridade</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.priorityLabel}
                    onChange={(e) => setFormData({ ...formData, priorityLabel: e.target.value as 'low' | 'medium' | 'high' })}
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700">Honorário (R$)</label>
                    <button 
                      type="button"
                      onClick={handleCopyLastFee}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider"
                    >
                      Copiar Anterior
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.grossAmount}
                    onChange={(e) => setFormData({ ...formData, grossAmount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status Inicial</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.kanbanStage}
                    onChange={(e) => setFormData({ ...formData, kanbanStage: e.target.value as DeclarationStatus })}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Imposto a Pagar (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.taxToPay}
                    onChange={(e) => setFormData({ ...formData, taxToPay: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Restituição (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.refundAmount}
                    onChange={(e) => setFormData({ ...formData, refundAmount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Número do Recibo</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.receiptNumber}
                    onChange={(e) => setFormData({ ...formData, receiptNumber: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      checked={formData.hasCommission}
                      onChange={(e) => setFormData({ ...formData, hasCommission: e.target.checked })}
                    />
                    <span className="text-sm font-medium text-slate-700">Tem Comissão?</span>
                  </label>
                  {formData.hasCommission && (
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Porcentagem (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={formData.commissionPercentage}
                        onChange={(e) => setFormData({ ...formData, commissionPercentage: Number(e.target.value) })}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 border border-slate-100 p-3 rounded-lg bg-slate-50/50">
                  <input
                    type="checkbox"
                    id="isIncludedInMonthlyFee"
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 mt-1"
                    checked={formData.isIncludedInMonthlyFee}
                    onChange={(e) => setFormData({ ...formData, isIncludedInMonthlyFee: e.target.checked })}
                  />
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor="isIncludedInMonthlyFee" className="text-sm font-medium text-slate-700 cursor-pointer">
                      Cobrança Embutida no Mensal
                    </label>
                    <span className="text-[11px] text-slate-400 font-normal leading-tight">
                      O valor da declaração já está embutido na mensalidade recorrente do cliente.
                    </span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Observações Técnicas</label>
                  <textarea
                    rows={3}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
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
                  Salvar Declaração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Slide-over / Modal */}
      {isDetailOpen && selectedDeclaration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50">
          <div className="bg-white h-full w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <div>
                <h3 className="text-xl font-bold text-slate-800">{getClientName(selectedDeclaration.clientId)}</h3>
                <p className="text-sm text-slate-500">Declaração IRPF {selectedDeclaration.exerciseYear}</p>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50/50">
              {[
                { id: 'summary', label: 'Resumo', icon: FileText },
                { id: 'checklist', label: 'Lista de Verificação', icon: CheckCircle2 },
                { id: 'pending', label: 'Pendências', icon: AlertCircle },
                { id: 'files', label: 'Arquivos', icon: FileText },
                { id: 'timeline', label: 'Histórico', icon: Clock },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'summary' && (
                <div className="space-y-8">
                  {/* Status Section */}
                  <section>
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Status Atual</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(STATUS_LABELS).map(([value, { label, color, icon: Icon }]) => (
                        <button
                          key={value}
                          onClick={() => handleUpdateStatus(selectedDeclaration.id, value as DeclarationStatus)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                            selectedDeclaration.kanbanStage === value 
                              ? `${color} ring-2 ring-offset-1 ring-indigo-500` 
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <Icon size={16} />
                          <span className="text-sm font-medium">{label}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Info Grid */}
                  <section className="grid grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="text-xs text-slate-500 mb-1">Modelo</div>
                      <div className="font-semibold text-slate-800 capitalize">
                        {selectedDeclaration.calculationModel === 'simplified' ? 'Simplificado' : 'Completo'}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="text-xs text-slate-500 mb-1">Honorário</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedDeclaration.grossAmount)}
                        </span>
                        {selectedDeclaration.isIncludedInMonthlyFee && (
                          <span className="text-[10px] px-2 py-0.5 font-bold uppercase rounded bg-indigo-100 text-indigo-700">
                            Embutido no Mensal
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="text-xs text-slate-500 mb-1">Imposto a Pagar</div>
                      <div className="font-semibold text-red-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedDeclaration.taxToPay)}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="text-xs text-slate-500 mb-1">Restituição</div>
                      <div className="font-semibold text-emerald-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedDeclaration.refundAmount)}
                      </div>
                    </div>
                  </section>

                  {/* Notes */}
                  <section>
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Observações Técnicas</h4>
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-sm text-amber-900 whitespace-pre-wrap">
                      {selectedDeclaration.notes || 'Nenhuma observação técnica registrada.'}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'checklist' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Lista de Verificação de Documentos</h4>
                    {docRequest && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        docRequest.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {docRequest.status === 'completed' ? 'Concluído' : 'Pendente'}
                      </span>
                    )}
                  </div>
                  
                  {docRequest ? (
                    <div className="space-y-3">
                      {docRequest.items.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                item.status === 'received' ? 'bg-emerald-500' : 
                                item.status === 'refused' ? 'bg-red-500' : 'bg-slate-300'
                              }`} />
                              <span className="text-sm font-medium text-slate-700">{item.item}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.status !== 'received' && (
                                <button 
                                  onClick={() => handleApproveItem(idx)}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Aprovar"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                              )}
                              {item.status !== 'refused' && (
                                <button 
                                  onClick={() => setRefusingItemId(idx)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Recusar"
                                >
                                  <X size={18} />
                                </button>
                              )}
                            </div>
                          </div>

                          {item.comment && (
                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 italic">
                              Motivo da recusa: {item.comment}
                            </div>
                          )}

                          {refusingItemId === idx && (
                            <div className="space-y-2 pt-2 border-t border-slate-200">
                              <textarea
                                placeholder="Informe o motivo da recusa..."
                                className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500/20 outline-none"
                                value={refusalComment}
                                onChange={(e) => setRefusalComment(e.target.value)}
                                rows={2}
                              />
                              <div className="flex justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    setRefusingItemId(null);
                                    setRefusalComment('');
                                  }}
                                  className="px-3 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded uppercase"
                                >
                                  Cancelar
                                </button>
                                <button 
                                  onClick={() => handleRefuseItem(idx)}
                                  className="px-3 py-1 text-[10px] font-bold bg-red-600 text-white rounded uppercase"
                                >
                                  Confirmar Recusa
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <FileText size={48} className="mx-auto mb-4 opacity-10" />
                      <p className="text-slate-400 text-sm">Nenhuma solicitação de documentos encontrada.</p>
                      <button 
                        onClick={() => navigate('/document-requests')}
                        className="mt-4 text-indigo-600 font-bold text-xs uppercase tracking-wider hover:underline"
                      >
                        Criar Solicitação
                      </button>
                    </div>
                  )}

                  {docRequest && docRequest.questions && docRequest.questions.length > 0 && (
                    <div className="mt-8 space-y-4">
                      <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Perguntas ao Cliente</h4>
                      <div className="grid gap-3">
                        {docRequest.questions.map((q: any, idx: number) => (
                          <div key={idx} className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                            <div className="text-sm font-bold text-slate-800 mb-2">P: {q.text}</div>
                            {q.answer ? (
                              <div className="text-sm text-indigo-700 bg-white p-3 rounded-lg border border-indigo-100 italic">
                                <strong>R:</strong> {q.answer}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400 italic flex items-center gap-1">
                                <Clock size={12} /> Aguardando resposta...
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pending' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Pendências de Documentos</h4>
                  {docRequest ? (
                    <div className="space-y-3">
                      {docRequest.items.filter((i: any) => i.status !== 'received').map((item: any, idx: number) => (
                        <div key={idx} className={`p-4 rounded-xl border flex items-start gap-3 ${
                          item.status === 'refused' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                        }`}>
                          <AlertCircle className={item.status === 'refused' ? 'text-red-600 mt-0.5' : 'text-amber-600 mt-0.5'} size={18} />
                          <div>
                            <div className={`text-sm font-bold ${item.status === 'refused' ? 'text-red-800' : 'text-amber-800'}`}>
                              {item.item}
                            </div>
                            <div className={`text-xs ${item.status === 'refused' ? 'text-red-600' : 'text-amber-600'}`}>
                              {item.status === 'refused' ? `Recusado: ${item.comment}` : 'Aguardando envio pelo cliente'}
                            </div>
                          </div>
                        </div>
                      ))}
                      {docRequest.items.filter((i: any) => i.status !== 'received').length === 0 && (
                        <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 text-slate-500 text-sm">
                          Nenhuma pendência documental encontrada.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-slate-400 text-sm">Nenhuma solicitação de documentos ativa.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'files' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Arquivos da Declaração</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {uploadedFiles.length > 0 ? (
                      uploadedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-indigo-600">
                              <FileText size={20} />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-800">{file.fileNameOriginal}</div>
                              <div className="text-xs text-slate-500">
                                {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB • {(file.mimeType || 'file/unknown').split('/')[1].toUpperCase()}
                                {file.uploadedByType === 'client' && ' • Enviado pelo Cliente'}
                              </div>
                            </div>
                          </div>
                          <a 
                            href={file.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            <ChevronRight size={20} />
                          </a>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-slate-400 text-sm">Nenhum arquivo enviado ainda.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Linha do Tempo da Declaração</h4>
                  <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                    {selectedDeclaration.timeline?.map((event: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[29px] top-1 w-5 h-5 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center z-10">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800">{event.stage}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {event.timestamp && formatDistanceToNow(
                              event.timestamp.toDate ? event.timestamp.toDate() : new Date(event.timestamp), 
                              { addSuffix: true, locale: ptBR }
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!selectedDeclaration.timeline || selectedDeclaration.timeline.length === 0) && (
                      <div className="text-center py-8 text-slate-400 text-sm italic">
                        Nenhum histórico registrado.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
