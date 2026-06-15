import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

export type AuditAction = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'move' 
  | 'approve' 
  | 'refuse' 
  | 'upload' 
  | 'login' 
  | 'logout'
  | 'update_status';

export interface AuditLogEntry {
  userId: string;
  userName: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: any;
}

export const logAction = async (
  action: AuditAction, 
  entityType: string, 
  entityId: string, 
  details: any
) => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const detailsString = typeof details === 'object' ? JSON.stringify(details) : String(details);

    await addDoc(collection(db, 'audit_logs'), {
      userId: user.uid,
      userName: user.displayName || user.email || 'Usuário',
      action,
      entityType,
      entityId,
      details: detailsString,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Erro ao registrar log de auditoria:', error);
  }
};
