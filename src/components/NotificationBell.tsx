import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCircle2, AlertCircle, Clock, FileText, Send } from 'lucide-react';
import { notificationService } from '../services/notificationService';
import { useAuth } from './FirebaseProvider';
import { Notification } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    if (!user?.uid) return;
    setLoading(true);
    const unread = await notificationService.getUnreadNotifications(user.uid);
    setNotifications(unread);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
    // Refresh every 5 minutes (only when window/tab is visible to save quota)
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchNotifications();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.markAsRead(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.uid) return;
    await notificationService.markAllAsRead(user.uid);
    setNotifications([]);
  };

  const handleNotificationClick = (notification: Notification) => {
    setIsOpen(false);
    notificationService.markAsRead(notification.id);
    setNotifications(prev => prev.filter(n => n.id !== notification.id));

    // Navigate based on type
    switch (notification.type) {
      case 'new_document':
      case 'document_refused':
      case 'missing_link':
      case 'stuck_card':
      case 'deadline_near':
        navigate(`/declarations?id=${notification.relatedEntityId}`);
        break;
      case 'overdue_fee':
        navigate(`/financial?id=${notification.relatedEntityId}`);
        break;
      default:
        break;
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_document': return <FileText className="text-brand-yellow" size={16} />;
      case 'document_refused': return <AlertCircle className="text-rose-500" size={16} />;
      case 'deadline_near': return <Clock className="text-amber-500" size={16} />;
      case 'overdue_fee': return <AlertCircle className="text-rose-500" size={16} />;
      case 'stuck_card': return <Clock className="text-slate-500" size={16} />;
      case 'missing_link': return <Send className="text-brand-blue" size={16} />;
      default: return <Bell className="text-slate-500" size={16} />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2.5 rounded-xl transition-all relative ${isOpen ? 'bg-slate-100 text-brand-yellow' : 'text-slate-500 hover:bg-slate-100'}`}
      >
        <Bell size={20} />
        {notifications.length > 0 && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  Notificações
                  {notifications.length > 0 && (
                    <span className="bg-brand-yellow/10 text-brand-yellow text-[10px] px-2 py-0.5 rounded-full">
                      {notifications.length} novas
                    </span>
                  )}
                </h3>
                {notifications.length > 0 && (
                  <button 
                    onClick={handleMarkAllAsRead}
                    className="text-xs font-bold text-brand-yellow hover:text-brand-yellow-dark"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {loading && notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-yellow mx-auto mb-2"></div>
                    <p className="text-xs">Buscando alertas...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">Tudo em dia!</p>
                    <p className="text-xs text-slate-400 mt-1">Você não tem novas notificações.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {notifications.map((n) => (
                      <div 
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group relative"
                      >
                        <div className="flex gap-3">
                          <div className="mt-1 shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-white transition-colors">
                              {getIcon(n.type)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 leading-tight mb-1">{n.title}</p>
                            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-2 font-medium">
                              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                          <button 
                            onClick={(e) => handleMarkAsRead(n.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 transition-all"
                            title="Marcar como lida"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-slate-50 bg-slate-50/30 text-center">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
