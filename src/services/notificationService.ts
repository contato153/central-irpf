import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { Notification } from '../types';

export const notificationService = {
  async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>) {
    try {
      await addDoc(collection(db, 'notifications'), {
        ...notification,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  },

  async getUnreadNotifications(userId: string) {
    try {
      if (typeof window !== 'undefined' && (window as any).__firestore_quota_exceeded__ === true) {
        const cached = localStorage.getItem(`cache_notifications_${userId}`);
        return cached ? JSON.parse(cached) : [];
      }

      const q = query(
        collection(db, 'notifications'),
        where('targetUserId', '==', userId),
        where('readAt', '==', null),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      try {
        localStorage.setItem(`cache_notifications_${userId}`, JSON.stringify(notifications));
      } catch (e) {}
      return notifications;
    } catch (error) {
      console.warn('Error getting notifications, falling back to cache:', error);
      const errMessage = error instanceof Error ? error.message : String(error);
      const isQuota = errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('resource-exhausted') || errMessage.toLowerCase().includes('limit exceeded');
      if (isQuota && typeof window !== 'undefined') {
        (window as any).__firestore_quota_exceeded__ = true;
        window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
      }
      try {
        const cached = localStorage.getItem(`cache_notifications_${userId}`);
        return cached ? JSON.parse(cached) : [];
      } catch (e) {
        return [];
      }
    }
  },

  async markAsRead(notificationId: string) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        readAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  },

  async markAllAsRead(userId: string) {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('targetUserId', '==', userId),
        where('readAt', '==', null)
      );
      const snapshot = await getDocs(q);
      const promises = snapshot.docs.map(d => 
        updateDoc(doc(db, 'notifications', d.id), { readAt: new Date().toISOString() })
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }
};
