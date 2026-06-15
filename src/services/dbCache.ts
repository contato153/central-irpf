import { collection, getDocs, doc, getDoc, orderBy, query, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, UserProfile, Declaration, PricingHistory, DocumentRequest, ChecklistTemplate } from '../types';

const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
};

const loadLocalStorageCache = <T>(key: string): T[] | null => {
  const data = safeGetItem(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
};

const handleCacheError = (error: unknown, fallbackValue: any, cacheFieldName: string) => {
  console.warn(`Firestore Cache or Quota Error for ${cacheFieldName}:`, error);
  const errMessage = error instanceof Error ? error.message : String(error);
  const isQuota = errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('resource-exhausted') || errMessage.toLowerCase().includes('limit exceeded');
  
  if (typeof window !== 'undefined') {
    (window as any).__firestore_last_error__ = { message: errMessage, collection: cacheFieldName };
    window.dispatchEvent(new CustomEvent('firestore-error', { 
      detail: { message: errMessage, collection: cacheFieldName, isQuota } 
    }));
    
    if (isQuota) {
      (window as any).__firestore_quota_exceeded__ = true;
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    }
  }
  return fallbackValue;
};

const isQuotaActive = (): boolean => {
  return typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded__ === true;
};

const clearQuotaActive = () => {
  if (typeof window !== 'undefined') {
    (window as any).__firestore_quota_exceeded__ = false;
    (window as any).__firestore_last_error__ = null;
    window.dispatchEvent(new CustomEvent('firestore-error-cleared'));
  }
};

// Memory Cache + Local Storage initialization
let clientsCache: Client[] | null = loadLocalStorageCache<Client>('cache_clients');
let clientsTimestamp = 0; // Initialize to 0 so we always fetch fresh data on first load

let usersCache: UserProfile[] | null = loadLocalStorageCache<UserProfile>('cache_users');
let usersTimestamp = 0;

let settingsCache: any = null;
try {
  const cachedSettings = safeGetItem('cache_system_settings');
  if (cachedSettings) {
    settingsCache = JSON.parse(cachedSettings);
  }
} catch (e) {}
let settingsTimestamp = 0;

let declarationsCache: Declaration[] | null = loadLocalStorageCache<Declaration>('cache_declarations');
let declarationsTimestamp = 0;

let financialsCache: PricingHistory[] | null = loadLocalStorageCache<PricingHistory>('cache_pricing_history');
let financialsTimestamp = 0;

let docRequestsCache: DocumentRequest[] | null = loadLocalStorageCache<DocumentRequest>('cache_doc_requests');
let docRequestsTimestamp = 0;

let checklistTemplatesCache: ChecklistTemplate[] | null = loadLocalStorageCache<ChecklistTemplate>('cache_checklist_templates');
let checklistTemplatesTimestamp = 0;

let kanbanHistoryCache: any[] | null = loadLocalStorageCache<any>('cache_kanban_history');
let kanbanHistoryTimestamp = 0;

let auditLogsCache: any[] | null = loadLocalStorageCache<any>('cache_audit_logs');
let auditLogsTimestamp = 0;

// Cache lifetime: 10 seconds (10,000 ms) to keep the app fresh and synchronized
const CACHE_TTL = 10000;

export const dbCache = {
  async getClients(force = false): Promise<Client[]> {
    const now = Date.now();
    
    // Immediate short-circuit during quota outages to prevent requests and subsequent SDK hangs/crashes
    if (!force && isQuotaActive()) {
      return clientsCache || [];
    }
    
    if (!force && clientsCache && (now - clientsTimestamp < CACHE_TTL)) {
      return clientsCache;
    }
    try {
      const snap = await getDocs(collection(db, 'clients'));
      clearQuotaActive();
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      clientsCache = list;
      clientsTimestamp = now;
      safeSetItem('cache_clients', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, clientsCache || [], 'clients');
    }
  },

  async getUsers(force = false): Promise<UserProfile[]> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return usersCache || [];
    }
    
    if (!force && usersCache && (now - usersTimestamp < CACHE_TTL)) {
      return usersCache;
    }
    try {
      const snap = await getDocs(collection(db, 'users'));
      clearQuotaActive();
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
      usersCache = list;
      usersTimestamp = now;
      safeSetItem('cache_users', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, usersCache || [], 'users');
    }
  },

  async getDeclarations(force = false): Promise<Declaration[]> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return declarationsCache || [];
    }
    
    if (!force && declarationsCache && (now - declarationsTimestamp < CACHE_TTL)) {
      return declarationsCache;
    }
    try {
      const q = query(collection(db, 'declarations'), orderBy('updatedAt', 'desc'));
      clearQuotaActive();
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Declaration));
      declarationsCache = list;
      declarationsTimestamp = now;
      safeSetItem('cache_declarations', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, declarationsCache || [], 'declarations');
    }
  },

  async getFinancials(force = false): Promise<PricingHistory[]> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return financialsCache || [];
    }
    
    if (!force && financialsCache && (now - financialsTimestamp < CACHE_TTL)) {
      return financialsCache;
    }
    try {
      const q = query(collection(db, 'pricing_history'), orderBy('dueDate', 'desc'));
      clearQuotaActive();
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PricingHistory));
      financialsCache = list;
      financialsTimestamp = now;
      safeSetItem('cache_pricing_history', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, financialsCache || [], 'pricing_history');
    }
  },

  async getSystemSettings(force = false): Promise<any> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return settingsCache || null;
    }
    
    if (!force && settingsCache && (now - settingsTimestamp < CACHE_TTL)) {
      return settingsCache;
    }
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'system'));
      clearQuotaActive();
      if (docSnap.exists()) {
        const data = docSnap.data();
        settingsCache = data;
        settingsTimestamp = now;
        safeSetItem('cache_system_settings', JSON.stringify(data));
        return data;
      }
      return null;
    } catch (e) {
      return handleCacheError(e, settingsCache || null, 'system_settings');
    }
  },

  async getDocumentRequests(force = false): Promise<DocumentRequest[]> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return docRequestsCache || [];
    }
    
    if (!force && docRequestsCache && (now - docRequestsTimestamp < CACHE_TTL)) {
      return docRequestsCache;
    }
    try {
      const q = query(collection(db, 'document_requests'), orderBy('createdAt', 'desc'));
      clearQuotaActive();
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentRequest));
      docRequestsCache = list;
      docRequestsTimestamp = now;
      safeSetItem('cache_doc_requests', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, docRequestsCache || [], 'document_requests');
    }
  },

  async getChecklistTemplates(force = false): Promise<ChecklistTemplate[]> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return checklistTemplatesCache || [];
    }
    
    if (!force && checklistTemplatesCache && (now - checklistTemplatesTimestamp < CACHE_TTL)) {
      return checklistTemplatesCache;
    }
    try {
      const snap = await getDocs(collection(db, 'document_checklist_templates'));
      clearQuotaActive();
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistTemplate));
      checklistTemplatesCache = list;
      checklistTemplatesTimestamp = now;
      safeSetItem('cache_checklist_templates', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, checklistTemplatesCache || [], 'document_checklist_templates');
    }
  },

  async getKanbanHistory(force = false): Promise<any[]> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return kanbanHistoryCache || [];
    }
    
    if (!force && kanbanHistoryCache && (now - kanbanHistoryTimestamp < CACHE_TTL)) {
      return kanbanHistoryCache;
    }
    try {
      const q = query(collection(db, 'kanban_history'), orderBy('timestamp', 'desc'));
      clearQuotaActive();
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      kanbanHistoryCache = list;
      kanbanHistoryTimestamp = now;
      safeSetItem('cache_kanban_history', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, kanbanHistoryCache || [], 'kanban_history');
    }
  },

  async getAuditLogs(force = false): Promise<any[]> {
    const now = Date.now();
    
    if (!force && isQuotaActive()) {
      return auditLogsCache || [];
    }
    
    if (!force && auditLogsCache && (now - auditLogsTimestamp < CACHE_TTL)) {
      return auditLogsCache;
    }
    try {
      const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(100));
      clearQuotaActive();
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      auditLogsCache = list;
      auditLogsTimestamp = now;
      safeSetItem('cache_audit_logs', JSON.stringify(list));
      return list;
    } catch (e) {
      return handleCacheError(e, auditLogsCache || [], 'audit_logs');
    }
  },

  setClientsCache(list: Client[]) {
    clientsCache = list;
    clientsTimestamp = Date.now();
    safeSetItem('cache_clients', JSON.stringify(list));
  },

  setUsersCache(list: UserProfile[]) {
    usersCache = list;
    usersTimestamp = Date.now();
    safeSetItem('cache_users', JSON.stringify(list));
  },

  setDeclarationsCache(list: Declaration[]) {
    declarationsCache = list;
    declarationsTimestamp = Date.now();
    safeSetItem('cache_declarations', JSON.stringify(list));
  },

  setFinancialsCache(list: PricingHistory[]) {
    financialsCache = list;
    financialsTimestamp = Date.now();
    safeSetItem('cache_pricing_history', JSON.stringify(list));
  },

  setDocumentRequestsCache(list: DocumentRequest[]) {
    docRequestsCache = list;
    docRequestsTimestamp = Date.now();
    safeSetItem('cache_doc_requests', JSON.stringify(list));
  },

  setChecklistTemplatesCache(list: ChecklistTemplate[]) {
    checklistTemplatesCache = list;
    checklistTemplatesTimestamp = Date.now();
    safeSetItem('cache_checklist_templates', JSON.stringify(list));
  },

  clear(forceWipe = false) {
    // Only mark as expired so the next call forces a network fetch,
    // but keep existing cache inside memory/localStorage as a safe fallback
    clientsTimestamp = 0;
    usersTimestamp = 0;
    settingsTimestamp = 0;
    declarationsTimestamp = 0;
    financialsTimestamp = 0;
    docRequestsTimestamp = 0;
    checklistTemplatesTimestamp = 0;
    kanbanHistoryTimestamp = 0;
    auditLogsTimestamp = 0;

    if (forceWipe) {
      clientsCache = null;
      usersCache = null;
      settingsCache = null;
      declarationsCache = null;
      financialsCache = null;
      docRequestsCache = null;
      checklistTemplatesCache = null;
      kanbanHistoryCache = null;
      auditLogsCache = null;
      try {
        localStorage.removeItem('cache_clients');
        localStorage.removeItem('cache_users');
        localStorage.removeItem('cache_system_settings');
        localStorage.removeItem('cache_declarations');
        localStorage.removeItem('cache_pricing_history');
        localStorage.removeItem('cache_doc_requests');
        localStorage.removeItem('cache_checklist_templates');
        localStorage.removeItem('cache_kanban_history');
        localStorage.removeItem('cache_audit_logs');
      } catch (e) {}
    }
  }
};
