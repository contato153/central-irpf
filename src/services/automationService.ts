import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  Timestamp, 
  getDoc, 
  doc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { Declaration, PricingHistory, DocumentRequest, Notification, Client } from '../types';
import { format, differenceInDays, parseISO, isAfter, isBefore, addDays } from 'date-fns';

export const automationService = {
  async runAutomations(userId: string, force = false) {
    try {
      if (!userId) return;
      
      const now = Date.now();
      const throttleKey = `last_run_automations_${userId}`;
      const lastRun = localStorage.getItem(throttleKey);
      
      if (!force && lastRun) {
        const timePassed = now - parseInt(lastRun, 10);
        if (timePassed < 15 * 60 * 1000) {
          console.log(`Automations skipped (throttled). Last run was ${Math.round(timePassed / 1000)} seconds ago.`);
          return;
        }
      }

      // Mark running now to prevent race conditions or double-triggers
      localStorage.setItem(throttleKey, now.toString());

      // 1. Fetch ALL unread notifications for this user in ONE single query to avoid loops of queries
      const notificationsQ = query(
        collection(db, 'notifications'),
        where('targetUserId', '==', userId),
        where('readAt', '==', null)
      );
      const notificationsSnapshot = await getDocs(notificationsQ);
      const existingNotificationKeys = new Set(
        notificationsSnapshot.docs.map(doc => {
          const data = doc.data();
          return `${data.type}_${data.relatedEntityId}`;
        })
      );

      // 2. Alert for upcoming delivery deadline (within 7 days)
      await this.checkUpcomingDeadlines(userId, existingNotificationKeys);

      // 3. Alert for overdue fee
      await this.checkOverdueFees(userId, existingNotificationKeys);

      // 4. Alert for cards stuck for many days (e.g., > 10 days in same stage)
      await this.checkStuckCards(userId, existingNotificationKeys);

      // 5. Alert for declarations without a sent link
      await this.checkMissingLinks(userId, existingNotificationKeys);

    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      const isQuota = errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('resource-exhausted') || errMessage.toLowerCase().includes('limit exceeded');
      if (isQuota) {
        console.warn('Automations deferred: Firestore limit exceeded. Caching/degradation mode active.');
        if (typeof window !== 'undefined') {
          (window as any).__firestore_quota_exceeded__ = true;
          window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
        }
      } else {
        console.error('Error running automations:', error);
      }
    }
  },

  parseDate(date: any): Date | null {
    if (!date) return null;
    if (date.toDate && typeof date.toDate === 'function') return date.toDate();
    if (date instanceof Date) return date;
    if (typeof date === 'string') {
      try {
        return parseISO(date);
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  async checkUpcomingDeadlines(userId: string, existingNotificationKeys: Set<string>) {
    const q = query(
      collection(db, 'declarations'),
      where('kanbanStage', 'not-in', ['finalized', 'archived'])
    );
    const snapshot = await getDocs(q);
    const now = new Date();
    const sevenDaysFromNow = addDays(now, 7);

    for (const dDoc of snapshot.docs) {
      const decl = { id: dDoc.id, ...dDoc.data() } as Declaration;
      const dueDate = this.parseDate(decl.dueDate);
      if (!dueDate) continue;
      
      if (isAfter(dueDate, now) && isBefore(dueDate, sevenDaysFromNow)) {
        const key = `deadline_near_${decl.id}`;
        if (!existingNotificationKeys.has(key)) {
          await this.createNotification(userId, 'deadline_near', decl.id, 
            'Prazo de entrega próximo', 
            `A declaração do exercício ${decl.exerciseYear} vence em ${format(dueDate, 'dd/MM/yyyy')}.`
          );
          existingNotificationKeys.add(key); // prevent duplicates within same run
        }
      }
    }
  },

  async checkOverdueFees(userId: string, existingNotificationKeys: Set<string>) {
    const q = query(
      collection(db, 'pricing_history'),
      where('paymentStatus', '==', 'pending'),
      where('dueDate', '!=', null)
    );
    const snapshot = await getDocs(q);
    const now = new Date();

    for (const pDoc of snapshot.docs) {
      const pricing = { id: pDoc.id, ...pDoc.data() } as PricingHistory;
      const dueDate = this.parseDate(pricing.dueDate);
      if (!dueDate) continue;
      
      if (isBefore(dueDate, now)) {
        const key = `overdue_fee_${pricing.id}`;
        if (!existingNotificationKeys.has(key)) {
          await this.createNotification(userId, 'overdue_fee', pricing.id, 
            'Honorário Vencido', 
            `O honorário do exercício ${pricing.exerciseYear} está vencido desde ${format(dueDate, 'dd/MM/yyyy')}.`
          );
          existingNotificationKeys.add(key);
        }
      }
    }
  },

  async checkStuckCards(userId: string, existingNotificationKeys: Set<string>) {
    const q = query(
      collection(db, 'declarations'),
      where('kanbanStage', 'not-in', ['finalized', 'archived'])
    );
    const snapshot = await getDocs(q);
    const now = new Date();

    for (const dDoc of snapshot.docs) {
      const decl = { id: dDoc.id, ...dDoc.data() } as Declaration;
      const updatedAt = this.parseDate(decl.updatedAt);
      if (!updatedAt) continue;
      
      const daysStuck = differenceInDays(now, updatedAt);

      if (daysStuck >= 10) {
        const key = `stuck_card_${decl.id}`;
        if (!existingNotificationKeys.has(key)) {
          await this.createNotification(userId, 'stuck_card', decl.id, 
            'Card Parado', 
            `A declaração está na etapa "${decl.kanbanStage}" há ${daysStuck} dias.`
          );
          existingNotificationKeys.add(key);
        }
      }
    }
  },

  async checkMissingLinks(userId: string, existingNotificationKeys: Set<string>) {
    const q = query(
      collection(db, 'declarations'),
      where('kanbanStage', '==', 'new_service')
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    // Fetch ALL document requests once to do in-memory lookup instead of querying inside the loop!
    const reqSnapshot = await getDocs(collection(db, 'document_requests'));
    const declarationsWithRequests = new Set(
      reqSnapshot.docs.map(doc => doc.data().declarationId)
    );

    for (const dDoc of snapshot.docs) {
      const decl = { id: dDoc.id, ...dDoc.data() } as Declaration;
      
      if (!declarationsWithRequests.has(decl.id)) {
        const key = `missing_link_${decl.id}`;
        if (!existingNotificationKeys.has(key)) {
          await this.createNotification(userId, 'missing_link', decl.id, 
            'Link não enviado', 
            `A declaração do exercício ${decl.exerciseYear} ainda não possui link de documentos enviado.`
          );
          existingNotificationKeys.add(key);
        }
      }
    }
  },

  async checkExistingNotification(userId: string, type: string, entityId: string) {
    // Left for backwards compatibility if called elsewhere, but unused inside the main flow now
    const q = query(
      collection(db, 'notifications'),
      where('targetUserId', '==', userId),
      where('type', '==', type),
      where('relatedEntityId', '==', entityId),
      where('readAt', '==', null),
      limit(1)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  },

  async createNotification(userId: string, type: string, entityId: string, title: string, message: string) {
    await addDoc(collection(db, 'notifications'), {
      targetUserId: userId,
      type,
      relatedEntityId: entityId,
      title,
      message,
      readAt: null,
      createdAt: new Date().toISOString()
    });
  }
};
