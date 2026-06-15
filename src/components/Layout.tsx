import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Kanban as KanbanIcon, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  TrendingUp,
  Settings,
  Send,
  UploadCloud,
  DollarSign,
  Search,
  Bell,
  ChevronDown
} from 'lucide-react';
import { useAuth } from './FirebaseProvider';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { NotificationBell } from './NotificationBell';
import { dbCache } from '../services/dbCache';

const SidebarItem: React.FC<{ 
  to: string; 
  icon: React.ReactNode; 
  label: string; 
  active: boolean;
  onClick?: () => void;
}> = ({ to, icon, label, active, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group ${
      active 
        ? 'bg-brand-yellow text-brand-black shadow-lg shadow-brand-yellow/20' 
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <span className={`${active ? 'text-brand-black' : 'text-slate-400 group-hover:text-brand-yellow'} transition-colors`}>
      {icon}
    </span>
    <span className="font-semibold text-sm">{label}</span>
  </Link>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [dbError, setDbError] = useState<{ message: string; collection: string } | null>(null);

  useEffect(() => {
    if ((window as any).__firestore_quota_exceeded__) {
      setQuotaExceeded(true);
    }
    const lastError = (window as any).__firestore_last_error__;
    if (lastError) {
      setDbError(lastError);
    }

    const handleQuota = () => {
      setQuotaExceeded(true);
    };
    const handleDbError = (e: any) => {
      if (e.detail) {
        setDbError({ message: e.detail.message, collection: e.detail.collection });
      }
    };
    const handleDbErrorCleared = () => {
      setDbError(null);
    };

    window.addEventListener('firestore-quota-exceeded', handleQuota);
    window.addEventListener('firestore-error', handleDbError as any);
    window.addEventListener('firestore-error-cleared', handleDbErrorCleared);
    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuota);
      window.removeEventListener('firestore-error', handleDbError as any);
      window.removeEventListener('firestore-error-cleared', handleDbErrorCleared);
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    // Simple logic: if it looks like a CPF (only numbers and 11 digits), search by CPF
    const cleanSearch = searchQuery.replace(/\D/g, '');
    if (cleanSearch.length === 11) {
      navigate(`/clients?q=${cleanSearch}`);
    } else {
      navigate(`/clients?q=${encodeURIComponent(searchQuery)}`);
    }
    setSearchQuery('');
  };

  const menuItems = [
    { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/clients', icon: <Users size={20} />, label: 'Clientes' },
    { to: '/declarations', icon: <FileText size={20} />, label: 'Declarações' },
    { to: '/kanban', icon: <KanbanIcon size={20} />, label: 'Kanban' },
    { to: '/requests', icon: <Send size={20} />, label: 'Solicitações' },
    { to: '/uploads', icon: <UploadCloud size={20} />, label: 'Uploads' },
    { to: '/financial', icon: <DollarSign size={20} />, label: 'Financeiro' },
    { to: '/reports', icon: <TrendingUp size={20} />, label: 'Relatórios' },
    { to: '/settings', icon: <Settings size={20} />, label: 'Configurações' },
  ];

  return (
    <div className="flex h-screen bg-slate-50/50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-200/60 shadow-sm z-30">
        <div className="p-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-yellow rounded-xl flex items-center justify-center text-brand-black shadow-lg shadow-brand-yellow/20">
              <TrendingUp size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">Central IRPF</h1>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">L&M Contabilidade</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-6 space-y-1.5 overflow-y-auto py-2">
          {menuItems.map((item) => (
            <SidebarItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              active={location.pathname === item.to}
            />
          ))}
        </nav>

        <div className="p-6 border-t border-slate-100 bg-slate-50/30">
          <div className="flex items-center gap-3 px-2 py-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-yellow/10 flex items-center justify-center text-brand-black font-bold text-sm shadow-sm">
              {profile?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{profile?.name}</p>
              <p className="text-[10px] text-slate-500 truncate uppercase font-bold tracking-wider">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut size={18} />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-8 z-20">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <form onSubmit={handleSearch} className="relative w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-yellow transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Busca rápida (Clientes, CPF, Declarações)..."
                className="w-full bg-slate-100/50 border-transparent border focus:bg-white px-11 py-2.5 rounded-2xl text-sm transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>

          <div className="flex items-center gap-4">
            <NotificationBell />
            
            <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>
            
            <div className="hidden md:flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-all">
              <div className="text-right">
                <p className="text-xs font-bold text-slate-900">{profile?.name}</p>
                <p className="text-[10px] text-slate-500 font-medium">Online</p>
              </div>
              <ChevronDown size={16} className="text-slate-400" />
            </div>

            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              className="lg:hidden p-2.5 text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </header>

        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 px-8 py-3.5 flex items-start gap-4 text-slate-800 text-sm font-medium animate-fade-in shrink-0">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <strong className="text-amber-800 font-bold">Limite de quota do Firebase excedido:</strong> O limite gratuito diário de consultas ao banco de dados foi temporariamente esgotado. O aplicativo continuará funcionando normalmente em modo de consulta com os dados em cache (offline). Alterações ou novos cadastros podem ser limitados até a renovação da cota diária do Google Cloud.
            </div>
            <button 
              onClick={() => setQuotaExceeded(false)}
              className="text-amber-600 hover:text-amber-800 font-bold text-xs uppercase cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {dbError && !quotaExceeded && (
          <div className="bg-rose-50 border-b border-rose-200 px-8 py-3.5 flex items-start gap-4 text-slate-800 text-sm font-medium animate-fade-in shrink-0">
            <span className="text-lg">❌</span>
            <div className="flex-1">
              <strong className="text-rose-800 font-bold">Aviso do Banco de Dados:</strong> Ocorreu uma lentidão ou falha ao tentar carregar a coleção <strong>{dbError.collection}</strong> do Firestore. Pode ser decorrente do limite diário gratuito atingido ou indisponibilidade de rede. O sistema está carregando informações seguras em cache. Detalhes: <code className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-xs font-mono">{dbError.message}</code>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={async () => {
                  setDbError(null);
                  dbCache.clear(true);
                  window.location.reload();
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all"
              >
                Recarregar Banco
              </button>
              <button 
                onClick={() => setDbError(null)}
                className="text-rose-600 hover:text-rose-800 font-bold text-xs uppercase cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 bg-white z-40 pt-24 px-6 overflow-y-auto">
            <nav className="space-y-2">
              {menuItems.map((item) => (
                <SidebarItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  active={location.pathname === item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                />
              ))}
              <div className="pt-4 mt-4 border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-4 text-red-600 hover:bg-red-50 rounded-xl font-bold"
                >
                  <LogOut size={20} />
                  <span>Sair</span>
                </button>
              </div>
            </nav>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          {children}
        </main>
      </div>
    </div>
  );
};
