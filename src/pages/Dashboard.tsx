import React, { useEffect, useState } from 'react';
import { 
  Users, 
  FileCheck, 
  Clock, 
  AlertCircle, 
  TrendingUp, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  FilePlus,
  FileText,
  LayoutDashboard,
  Settings as SettingsIcon,
  Search,
  Filter,
  ChevronRight,
  Calendar,
  User as UserIcon,
  CheckCircle2,
  PieChart as PieIcon,
  Trophy,
  Medal,
  Wallet,
  RotateCw
} from 'lucide-react';
import { collection, getDocs, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, Declaration, PricingHistory, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../components/FirebaseProvider';
import { dbCache } from '../services/dbCache';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, isAfter, isBefore, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const StatCard: React.FC<{ 
  title: string; 
  value: string | number; 
  icon: React.ReactNode; 
  color: string;
  trend?: { value: string; positive: boolean };
}> = ({ title, value, icon, color, trend }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <div className={`p-3 rounded-xl ${color || 'bg-slate-500'} bg-opacity-10 text-${((color || 'bg-slate-500').split('-')[1] || 'slate')}-600`}>
        {icon}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-bold ${trend.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {trend.positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend.value}
        </div>
      )}
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
    </div>
  </div>
);

import { useAuth } from '../components/FirebaseProvider';
import { automationService } from '../services/automationService';

export const Dashboard: React.FC = () => {
  const { isAdmin, profile, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeClients: 0,
    currentYearDeclarations: 0,
    waitingDocs: 0,
    screening: 0,
    inProgress: 0,
    review: 0,
    transmitted: 0,
    finalized: 0,
    totalExpectedFees: 0,
    totalReceived: 0,
    totalOpen: 0,
    pendingClients: 0,
    averageFee: 0,
    completionRate: 0,
    prevYearDeclarations: 0,
    prevYearReceived: 0,
  });
  const [billingByYear, setBillingByYear] = useState<{ year: string; total: number }[]>([]);
  const [productivity, setProductivity] = useState<{ id: string; name: string; total: number; finished: number; percentage: number }[]>([]);
  const [pendingDocsList, setPendingDocsList] = useState<{ id: string; clientName: string; stage: string }[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<{ id: string; clientName: string; dueDate: string; daysLeft: number }[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Raw Firestore data cached locally to avoid redundant reads
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allDeclarations, setAllDeclarations] = useState<Declaration[]>([]);
  const [allFinancials, setAllFinancials] = useState<PricingHistory[]>([]);
  
  // Filters
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterResponsible, setFilterResponsible] = useState<string>('all');
  const currentYear = new Date().getFullYear();
  const [availableYears, setAvailableYears] = useState<number[]>(
    Array.from({ length: 7 }, (_, i) => currentYear - i)
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await dbCache.getSystemSettings();
        if (data && data.availableYears && Array.isArray(data.availableYears)) {
          const years = [...data.availableYears];
          if (!years.includes(2026)) years.push(2026);
          if (!years.includes(2025)) years.push(2025);
          setAvailableYears(Array.from(new Set(years)).sort((a: number, b: number) => b - a));
        }
      } catch (err) {
        console.error("Error loading system settings in Dashboard:", err);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (user?.uid) {
      automationService.runAutomations(user.uid);
    }
  }, [user?.uid]);

  // Fetch all collections ONCE on component mount to respect free tier quota limit
  const fetchRawData = async (force = false) => {
    try {
      setLoading(true);
      const [clientsData, declarationsData, financialsData, usersData] = await Promise.all([
        dbCache.getClients(force),
        dbCache.getDeclarations(force),
        dbCache.getFinancials(force),
        dbCache.getUsers(force)
      ]);
      
      setAllClients(clientsData);
      setAllDeclarations(declarationsData);
      setAllFinancials(financialsData);
      setUsers(usersData);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'dashboard_data_mount');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRawData();
  }, []);

  const handleRefresh = async () => {
    dbCache.clear();
    await fetchRawData(true);
    if (user?.uid) {
      await automationService.runAutomations(user.uid, true);
    }
  };

  // Compute all metrics locally in-memory when data or filters change
  useEffect(() => {
    // If no collections have loaded, nothing to compute yet
    if (allClients.length === 0 && allDeclarations.length === 0 && allFinancials.length === 0) return;

    // Apply filters in-memory
    const declarations = allDeclarations.filter(d => {
      const yearMatch = d.exerciseYear === filterYear;
      
      // Visibility restriction: only restrict analysts to their own creations or assignments
      if (profile?.role === 'analista') {
        const isOwner = d.createdByUserId === profile.id;
        const isAssigned = d.assignedToUserId === profile.id;
        if (!isOwner && !isAssigned) return false;
      }

      const responsibleMatch = filterResponsible === 'all' || d.assignedToUserId === filterResponsible || d.createdByUserId === filterResponsible;
      return yearMatch && responsibleMatch;
    });

    const financials = allFinancials.filter(f => {
      const yearMatch = f.exerciseYear === filterYear;
      
      // Visibility restriction: only restrict analysts to what they created
      if (profile?.role === 'analista') {
        if (f.createdByUserId !== profile.id) return false;
      }

      const clientIdsInFilteredDeclarations = new Set(declarations.map(d => d.clientId));
      // If filtering by responsible, we only want financials related to those declarations
      if (filterResponsible !== 'all') {
        return yearMatch && (clientIdsInFilteredDeclarations.has(f.clientId) || f.createdByUserId === filterResponsible);
      }
      return yearMatch;
    });

    const filteredClients = allClients.filter(c => {
      if (profile?.role === 'analista') {
        const isOwner = c.createdByUserId === profile.id;
        const isManager = c.internalManagerId === profile.id;
        if (!isOwner && !isManager) return false;
      }
      if (isAdmin && filterResponsible !== 'all') {
        if (c.createdByUserId !== filterResponsible && c.internalManagerId !== filterResponsible) return false;
      }
      return true;
    });

    const activeClients = filteredClients.filter(c => c.status === 'active').length;
    const currentYearDeclarations = declarations.length;
    
    // Previous Year Stats for Trends
    const prevYear = filterYear - 1;
    const prevYearDeclarations = allDeclarations.filter(d => {
      if (d.exerciseYear !== prevYear) return false;
      
      // Visibility restriction: only restrict analysts
      if (profile?.role === 'analista') {
        const isOwner = d.createdByUserId === profile.id;
        const isAssigned = d.assignedToUserId === profile.id;
        if (!isOwner && !isAssigned) return false;
      }

      if (filterResponsible !== 'all' && d.assignedToUserId !== filterResponsible && d.createdByUserId !== filterResponsible) return false;
      return true;
    }).length;

    const prevYearReceived = allFinancials
      .filter(f => f.exerciseYear === prevYear && f.paymentStatus === 'paid')
      .filter(f => {
        // Visibility restriction: only restrict analysts
        if (profile?.role === 'analista') {
          if (f.createdByUserId !== profile.id) return false;
        }

        if (filterResponsible === 'all') return true;
        const dec = allDeclarations.find(d => d.clientId === f.clientId && d.exerciseYear === prevYear);
        return dec?.assignedToUserId === filterResponsible || dec?.createdByUserId === filterResponsible;
      })
      .reduce((acc, f) => acc + (f.finalAmount || 0), 0);

    const waitingDocs = declarations.filter(d => d.kanbanStage === 'waiting_docs').length;
    const screening = declarations.filter(d => d.kanbanStage === 'screening').length;
    const inProgress = declarations.filter(d => d.kanbanStage === 'in_progress').length;
    const review = declarations.filter(d => d.kanbanStage === 'review').length;
    const transmitted = declarations.filter(d => d.kanbanStage === 'transmitted').length;
    const finalized = declarations.filter(d => d.kanbanStage === 'finalized').length;

    const totalExpectedFees = financials.reduce((acc, f) => acc + (f.finalAmount || 0), 0);
    const totalReceived = financials.filter(f => f.paymentStatus === 'paid').reduce((acc, f) => acc + (f.finalAmount || 0), 0);
    const totalOpen = totalExpectedFees - totalReceived;
    
    const averageFee = currentYearDeclarations > 0 ? totalExpectedFees / currentYearDeclarations : 0;
    const completionRate = currentYearDeclarations > 0 ? ((finalized + transmitted) / currentYearDeclarations) * 100 : 0;

    const pendingClientsCount = declarations.filter(d => d.kanbanStage === 'waiting_docs' || d.kanbanStage === 'screening' || d.kanbanStage === 'client_pending').length;

    // Billing by year (all years for the chart)
    const billingMap: Record<number, number> = {};
    allFinancials
      .filter(f => {
        if (isAdmin) return true;
        return f.createdByUserId === profile?.id;
      })
      .forEach(f => {
        billingMap[f.exerciseYear] = (billingMap[f.exerciseYear] || 0) + (f.finalAmount || 0);
      });
    const billingData = Object.entries(billingMap)
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => Number(a.year) - Number(b.year));
    setBillingByYear(billingData);

    // Productivity by responsible (Ranking)
    const prodData = users
      .filter(u => {
        if (isAdmin) return true;
        return u.id === profile?.id;
      })
      .map(user => {
        const userDeclarations = allDeclarations.filter(d => d.assignedToUserId === user.id && d.exerciseYear === filterYear);
        const finished = userDeclarations.filter(d => d.kanbanStage === 'finalized' || d.kanbanStage === 'transmitted').length;
        const percentage = userDeclarations.length > 0 ? (finished / userDeclarations.length) * 100 : 0;
        return { 
          id: user.id,
          name: user.name || user.email, 
          total: userDeclarations.length,
          finished,
          percentage: Math.round(percentage) 
        };
      }).sort((a, b) => b.percentage - a.percentage || b.total - a.total);
    setProductivity(prodData);

    // Pending Docs List
    const pendingDocs = declarations
      .filter(d => d.kanbanStage === 'waiting_docs')
      .map(d => {
        const client = allClients.find(c => c.id === d.clientId);
        return {
          id: d.id,
          clientName: client?.name || 'Cliente Desconhecido',
          stage: 'Aguardando Documentos'
        };
      })
      .slice(0, 5);
    setPendingDocsList(pendingDocs);

    // Upcoming Deadlines
    const now = new Date();
    const deadlines = declarations
      .filter(d => d.dueDate && d.kanbanStage !== 'finalized' && d.kanbanStage !== 'transmitted')
      .map(d => {
        const client = allClients.find(c => c.id === d.clientId);
        const dueDate = parseISO(d.dueDate!);
        const diffTime = dueDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
          id: d.id,
          clientName: client?.name || 'Cliente Desconhecido',
          dueDate: d.dueDate!,
          daysLeft
        };
      })
      .filter(d => d.daysLeft >= 0 && d.daysLeft <= 15)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
    setUpcomingDeadlines(deadlines);

    setStats({
      activeClients,
      currentYearDeclarations,
      waitingDocs,
      screening,
      inProgress,
      review,
      transmitted,
      finalized,
      totalExpectedFees,
      totalReceived,
      totalOpen,
      pendingClients: pendingClientsCount,
      averageFee,
      completionRate,
      prevYearDeclarations,
      prevYearReceived,
    });
  }, [filterYear, filterResponsible, allClients, allDeclarations, allFinancials, users]);

  const kanbanData = [
    { name: 'Aguardando', value: stats.waitingDocs, color: '#77787B' }, // brand-gray
    { name: 'Triagem', value: stats.screening, color: '#FFCC29' }, // brand-yellow
    { name: 'Elaboração', value: stats.inProgress, color: '#3E4095' }, // brand-blue
    { name: 'Revisão', value: stats.review, color: '#8b5cf6' },
    { name: 'Transmitida', value: stats.transmitted, color: '#4CB752' }, // brand-green
    { name: 'Finalizada', value: stats.finalized, color: '#0B3D1A' }, // brand-dark-green
  ];

  const financialPieData = [
    { name: 'Recebido', value: stats.totalReceived, color: '#4CB752' }, // brand-green
    { name: 'Em Aberto', value: stats.totalOpen, color: '#FFCC29' }, // brand-yellow
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-yellow"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Painel Executivo</h2>
          <p className="text-slate-500 font-medium">Gestão Estratégica IRPF L&M</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-100">
            <Calendar size={16} className="text-slate-400" />
            <select 
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
            >
              {availableYears.length > 0 ? availableYears.map(year => (
                <option key={year} value={year}>Exercício {year}</option>
              )) : (
                <option value={new Date().getFullYear()}>Exercício {new Date().getFullYear()}</option>
              )}
            </select>
          </div>
          
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <UserIcon size={16} className="text-slate-400" />
              <select 
                value={filterResponsible}
                onChange={(e) => setFilterResponsible(e.target.value)}
                className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
              >
                <option key="all" value="all">Todos Responsáveis</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name || user.email}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="h-8 w-px bg-slate-100 mx-2 hidden sm:block"></div>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all border border-slate-200"
            title="Atualizar Dados"
          >
            <RotateCw size={14} className="text-slate-500" />
            <span>Atualizar</span>
          </button>
        </div>
      </header>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button 
          onClick={() => navigate('/clients?action=new')}
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-brand-yellow transition-all group"
        >
          <div className="p-2 bg-brand-yellow/10 text-brand-yellow rounded-lg group-hover:bg-brand-yellow group-hover:text-white transition-colors">
            <Users size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">Novo Cliente</span>
        </button>
        <button 
          onClick={() => navigate('/declarations?action=new')}
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-500 transition-all group"
        >
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <FilePlus size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">Nova Declaração</span>
        </button>
        <button 
          onClick={() => navigate('/financial')}
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-500 transition-all group"
        >
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <DollarSign size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">Lançar Honorário</span>
        </button>
        <button 
          onClick={() => navigate('/document-requests')}
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-amber-500 transition-all group"
        >
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <Clock size={20} />
          </div>
          <span className="text-sm font-bold text-slate-700">Solicitar Docs</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <FileText size={60} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Declarações</p>
          <h3 className="text-3xl font-black text-slate-900">{stats.currentYearDeclarations}</h3>
          {stats.prevYearDeclarations > 0 && (
            <div className={`mt-3 flex items-center gap-1 text-[10px] font-bold w-fit px-2 py-0.5 rounded-lg ${
              stats.currentYearDeclarations >= stats.prevYearDeclarations ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'
            }`}>
              {stats.currentYearDeclarations >= stats.prevYearDeclarations ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span>{Math.abs(Math.round(((stats.currentYearDeclarations - stats.prevYearDeclarations) / stats.prevYearDeclarations) * 100))}%</span>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <CheckCircle2 size={60} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Eficiência</p>
          <h3 className="text-3xl font-black text-emerald-600">{stats.completionRate.toFixed(1)}%</h3>
          <p className="text-[10px] font-bold text-slate-400 mt-3">
            {stats.finalized + stats.transmitted} concluídas
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={60} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Recebido</p>
          <h3 className="text-3xl font-black text-slate-900">
            R$ {stats.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h3>
          {stats.prevYearReceived > 0 && (
            <div className={`mt-3 flex items-center gap-1 text-[10px] font-bold w-fit px-2 py-0.5 rounded-lg ${
              stats.totalReceived >= stats.prevYearReceived ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'
            }`}>
              {stats.totalReceived >= stats.prevYearReceived ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span>{Math.abs(Math.round(((stats.totalReceived - stats.prevYearReceived) / stats.prevYearReceived) * 100))}%</span>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertCircle size={60} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Em Aberto</p>
          <h3 className="text-3xl font-black text-rose-600">
            R$ {stats.totalOpen.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h3>
          <button 
            onClick={() => navigate('/financial?tab=reports')}
            className="mt-3 text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1"
          >
            Ver inadimplentes <ChevronRight size={12} />
          </button>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={60} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ticket Médio</p>
          <h3 className="text-3xl font-black text-indigo-600">
            R$ {stats.averageFee.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h3>
          <p className="text-[10px] font-bold text-slate-400 mt-3">
            Média por declaração
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Status das Declarações</h3>
                <p className="text-sm text-slate-500">Distribuição por etapa do processo</p>
              </div>
              <div className="p-2 bg-slate-50 rounded-xl">
                <LayoutDashboard size={20} className="text-slate-400" />
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kanbanData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} 
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32}>
                    {kanbanData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Performance Financeira</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={financialPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {financialPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
                      contentStyle={{ borderRadius: '12px', border: 'none' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Recebido</p>
                  <p className="text-lg font-bold text-emerald-600">R$ {stats.totalReceived.toLocaleString('pt-BR')}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Em Aberto</p>
                  <p className="text-lg font-bold text-amber-600">R$ {stats.totalOpen.toLocaleString('pt-BR')}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Faturamento Histórico</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={billingByYear}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
                    />
                    <Line type="monotone" dataKey="total" stroke="#FFCC29" strokeWidth={4} dot={{ fill: '#FFCC29', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-center text-slate-400 mt-4 italic">Evolução anual de honorários</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {isAdmin ? 'Ranking de Responsáveis' : 'Minha Produtividade'}
              </h3>
              <span className="text-xs font-bold text-brand-black bg-brand-yellow px-3 py-1 rounded-full">Exercício {filterYear}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ranking</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Responsável</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Concluídas</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Eficiência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {productivity.length > 0 ? productivity.map((user, idx) => (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-50/50 transition-colors group ${
                        filterResponsible === user.id ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="px-8 py-4">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full font-black text-sm ${
                          filterResponsible === user.id ? 'bg-indigo-600 text-white' : ''
                        }`}>
                          {idx === 0 ? <Trophy size={20} className={filterResponsible === user.id ? 'text-white' : 'text-amber-400'} /> : 
                           idx === 1 ? <Medal size={20} className={filterResponsible === user.id ? 'text-white' : 'text-slate-400'} /> : 
                           idx === 2 ? <Medal size={20} className={filterResponsible === user.id ? 'text-white' : 'text-amber-700'} /> : 
                           <span className={filterResponsible === user.id ? 'text-white' : 'text-slate-400'}>{idx + 1}º</span>}
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border transition-colors ${
                            filterResponsible === user.id 
                              ? 'bg-white text-indigo-600 border-indigo-200' 
                              : 'bg-slate-100 text-slate-500 border-slate-200 group-hover:bg-white'
                          }`}>
                            {user.name.charAt(0)}
                          </div>
                          <span className={`font-bold ${filterResponsible === user.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                            {user.name}
                            {filterResponsible === user.id && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase">Selecionado</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-center font-medium text-slate-600">{user.total}</td>
                      <td className="px-8 py-4 text-center font-bold text-emerald-600">{user.finished}</td>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[100px]">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${user.percentage}%` }}
                              className={`h-full rounded-full ${
                                user.percentage >= 80 ? 'bg-emerald-500' : 
                                user.percentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                            />
                          </div>
                          <span className="text-sm font-black text-slate-700">{user.percentage}%</span>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-slate-400 italic">
                        Nenhum dado de produtividade disponível para este exercício.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-900">Vencimentos Próximos</h3>
              <div className="p-2 bg-rose-50 rounded-xl">
                <Clock size={20} className="text-rose-500" />
              </div>
            </div>
            <div className="space-y-4">
              {upcomingDeadlines.length > 0 ? upcomingDeadlines.map((deadline) => (
                <div key={deadline.id} className="group p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-rose-200 hover:bg-rose-50/30 transition-all cursor-pointer" onClick={() => navigate(`/kanban?id=${deadline.id}`)}>
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-rose-600 transition-colors">{deadline.clientName}</p>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${deadline.daysLeft <= 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                      {deadline.daysLeft} dias
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar size={12} />
                    <span>{format(parseISO(deadline.dueDate), 'dd/MM/yyyy')}</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-200 mb-2" />
                  <p className="text-sm text-slate-400 italic">Nenhum vencimento crítico nos próximos 15 dias.</p>
                </div>
              )}
            </div>
            {upcomingDeadlines.length > 0 && (
              <button 
                onClick={() => navigate('/kanban')}
                className="w-full mt-6 py-3 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors"
              >
                Ver cronograma completo
              </button>
            )}
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-900">Pendência Documental</h3>
              <div className="p-2 bg-amber-50 rounded-xl">
                <AlertCircle size={20} className="text-amber-500" />
              </div>
            </div>
            <div className="space-y-4">
              {pendingDocsList.length > 0 ? pendingDocsList.map((item) => (
                <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-md transition-all cursor-pointer" onClick={() => navigate(`/kanban?id=${item.id}`)}>
                  <div>
                    <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{item.clientName}</p>
                    <p className="text-xs text-slate-500">{item.stage}</p>
                  </div>
                  <div className="p-2 text-slate-400 group-hover:text-blue-600 transition-colors">
                    <ChevronRight size={18} />
                  </div>
                </div>
              )) : (
                <div className="text-center py-8">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-200 mb-2" />
                  <p className="text-sm text-slate-400 italic">Nenhuma pendência documental ativa.</p>
                </div>
              )}
              {pendingDocsList.length > 0 && (
                <button 
                  onClick={() => navigate('/kanban?filter=waiting_docs')}
                  className="w-full mt-6 py-3 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors"
                >
                  Ver todas as pendências
                </button>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-brand-black to-slate-900 p-8 rounded-3xl shadow-lg text-white">
            <h3 className="text-lg font-bold mb-2">Acesso Rápido</h3>
            <p className="text-slate-300 text-sm mb-6">Navegue pelos módulos estratégicos do sistema.</p>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/kanban" className="flex items-center gap-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 backdrop-blur-sm">
                <LayoutDashboard size={16} className="text-brand-yellow" />
                <span className="text-xs font-bold">Kanban</span>
              </Link>
              <Link to="/financial" className="flex items-center gap-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 backdrop-blur-sm">
                <DollarSign size={16} className="text-brand-yellow" />
                <span className="text-xs font-bold">Financeiro</span>
              </Link>
              <Link to="/reports" className="flex items-center gap-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 backdrop-blur-sm">
                <TrendingUp size={16} className="text-brand-yellow" />
                <span className="text-xs font-bold">Relatórios</span>
              </Link>
              <Link to="/settings" className="flex items-center gap-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 backdrop-blur-sm">
                <SettingsIcon size={16} className="text-brand-yellow" />
                <span className="text-xs font-bold">Ajustes</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
