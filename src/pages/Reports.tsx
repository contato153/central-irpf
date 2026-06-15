import React, { useEffect, useState } from 'react';
import { 
  Users, 
  FileText,
  Download,
  Calendar,
  Filter,
  UserCheck,
  DollarSign,
  Search,
  Printer,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Percent,
  Sliders,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Declaration, PricingHistory, UserProfile, Client } from '../types';
import { dbCache } from '../services/dbCache';
import { handleFirestoreError, OperationType, useAuth } from '../components/FirebaseProvider';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ReportType = 'clients' | 'declarations' | 'users' | 'billing' | 'commissions';

export const Reports: React.FC = () => {
  const { isAdmin, profile } = useAuth();
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [financials, setFinancials] = useState<PricingHistory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => (currentYear - i).toString());

  const [loading, setLoading] = useState(true);
  const [exerciseFilter, setExerciseFilter] = useState(currentYear.toString());
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Billing filters
  const [showTotalBilled, setShowTotalBilled] = useState(true);
  const [showTotalReceived, setShowTotalReceived] = useState(true);
  const [showTotalToReceive, setShowTotalToReceive] = useState(true);

  // Batch update commission states
  const [batchType, setBatchType] = useState<'employee' | 'client'>('employee');
  const [batchTargetId, setBatchTargetId] = useState<string>('');
  const [batchPercentage, setBatchPercentage] = useState<number>(30); // Default to 30% as requested
  const [batchYearOption, setBatchYearOption] = useState<'current' | 'all'>('current');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [showBatchForm, setShowBatchForm] = useState(false);

  const getCommissionPaymentStatus = (d: Declaration) => {
    // 1. If the declaration is included in the monthly fee (isIncludedInMonthlyFee === true),
    // it is paid strictly via the client's monthly subscription fee (paymentMethod === 'Mensalidade').
    if (d.isIncludedInMonthlyFee) {
      const monthlyFins = financials.filter(
        f => f.clientId === d.clientId && 
             f.exerciseYear === d.exerciseYear && 
             f.paymentMethod === 'Mensalidade'
      );

      // If there are monthly contract fee records, check if any of them is not paid.
      // We ignore other separate service bills when checking monthly fee status.
      if (monthlyFins.length > 0) {
        const unpaidMonthly = monthlyFins.find(f => f.paymentStatus !== 'paid');
        if (unpaidMonthly) {
          return { isPaid: false, fin: unpaidMonthly };
        }
        return { isPaid: true, fin: monthlyFins[0] };
      }

      // If no specific "Mensalidade" record is found, look for its specific declaration pricing record
      const specificFin = financials.find(f => f.declarationId === d.id);
      if (specificFin) {
        return { isPaid: specificFin.paymentStatus === 'paid', fin: specificFin };
      }

      return { isPaid: false, fin: undefined };
    }

    // 2. If it is NOT included in the monthly fee, it is billed separately.
    // We prioritize its specific linked pricing_history record (declarationId === d.id).
    const specificFin = financials.find(f => f.declarationId === d.id);
    if (specificFin) {
      return { isPaid: specificFin.paymentStatus === 'paid', fin: specificFin };
    }

    // If no specific financial record exists, check for an unlinked pricing record for this client/year,
    // but MUST NOT match unlinked regular monthly contract fees ('Mensalidade').
    const unlinkedFin = financials.find(
      f => f.clientId === d.clientId && 
           f.exerciseYear === d.exerciseYear && 
           !f.declarationId && 
           f.paymentMethod !== 'Mensalidade'
    );
    if (unlinkedFin) {
      return { isPaid: unlinkedFin.paymentStatus === 'paid', fin: unlinkedFin };
    }

    return { isPaid: false, fin: undefined };
  };

  const fetchAllData = async (force = false) => {
    try {
      setLoading(true);
      const [decsData, finsData, clientsData, usersData] = await Promise.all([
        dbCache.getDeclarations(force),
        dbCache.getFinancials(force),
        dbCache.getClients(force),
        dbCache.getUsers(force)
      ]);
      
      setDeclarations(decsData);
      setFinancials(finsData);
      setClients(clientsData);
      setUsers(usersData);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'reports_data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    dbCache.clear();
    fetchAllData();
  }, []);

  const handleExportCSV = () => {
    if (!activeReport) return;

    let headers: string[] = [];
    let rows: any[][] = [];
    let fileName = `relatorio_${activeReport}_${exerciseFilter}.csv`;

    if (activeReport === 'clients') {
      headers = ['Nome', 'CPF', 'Email', 'Telefone', 'Status'];
      const filtered = clients
        .filter(c => {
          if (isAdmin || profile?.role === 'gestor') return true;
          return c.createdByUserId === profile?.id || c.internalManagerId === profile?.id;
        })
        .filter(c => {
          if (employeeFilter === 'all') return true;
          return c.internalManagerId === employeeFilter || c.createdByUserId === employeeFilter;
        })
        .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.cpf.includes(searchTerm));
      rows = filtered.map(c => [c.name, c.cpf, c.email || '', c.phone || '', c.status === 'active' ? 'Ativo' : 'Inativo']);
      
      const activeCount = filtered.filter(c => c.status === 'active').length;
      const inactiveCount = filtered.length - activeCount;
      rows.push([]);
      rows.push(['TOTAIS / RESUMO']);
      rows.push(['Clientes Ativos', activeCount]);
      rows.push(['Clientes Inativos', inactiveCount]);
      rows.push(['Total de Clientes', filtered.length]);
    } else if (activeReport === 'declarations') {
      headers = ['Cliente', 'Exercício', 'Tipo', 'Embutido no Mensal', 'Status', 'Valor', 'Responsável'];
      const filtered = declarations
        .filter(d => {
          if (isAdmin || profile?.role === 'gestor') return true;
          return d.createdByUserId === profile?.id || d.assignedToUserId === profile?.id;
        })
        .filter(d => {
          if (employeeFilter === 'all') return true;
          return d.assignedToUserId === employeeFilter || d.createdByUserId === employeeFilter;
        })
        .filter(d => d.exerciseYear.toString() === exerciseFilter);
      rows = filtered.map(d => {
        const client = clients.find(c => c.id === d.clientId);
        const responsible = users.find(u => u.id === d.assignedToUserId);
        return [
          client?.name || 'Desconhecido',
          d.exerciseYear,
          d.declarationType === 'original' ? 'Original' : 'Retificadora',
          d.isIncludedInMonthlyFee ? 'Sim' : 'Não',
          d.kanbanStage,
          d.grossAmount || 0,
          responsible?.name || responsible?.email || 'Não atribuído'
        ];
      });

      const originals = filtered.filter(d => d.declarationType === 'original').length;
      const rectifying = filtered.length - originals;
      const totalAmount = filtered.reduce((acc, curr) => acc + (curr.grossAmount || 0), 0);
      const totalIncludedInMonthlyFee = filtered.filter(d => d.isIncludedInMonthlyFee).length;
      rows.push([]);
      rows.push(['TOTAIS / RESUMO']);
      rows.push(['Originais', originals]);
      rows.push(['Retificadoras', rectifying]);
      rows.push(['Embutidas no Mensal', totalIncludedInMonthlyFee]);
      rows.push(['Faturamento Estimado', totalAmount]);
      rows.push(['Total de Declarações', filtered.length]);
    } else if (activeReport === 'users') {
      headers = ['Nome', 'Email', 'Cargo', 'Status'];
      rows = users.map(u => [u.name || u.nome || '', u.email, u.role, u.status === 'active' ? 'Ativo' : 'Inativo']);

      const activeCount = users.filter(u => u.status === 'active').length;
      const inactiveCount = users.length - activeCount;
      rows.push([]);
      rows.push(['TOTAIS / RESUMO']);
      rows.push(['Ativos', activeCount]);
      rows.push(['Inativos', inactiveCount]);
      rows.push(['Total de Usuários', users.length]);
    } else if (activeReport === 'billing') {
      headers = ['Cliente', 'Exercício'];
      if (showTotalBilled) headers.push('Valor Faturado');
      if (showTotalReceived) headers.push('Valor Recebido');
      if (showTotalToReceive) headers.push('Valor a Receber');
      headers.push('Status Pagamento');

      const filtered = financials
        .filter(f => {
          if (isAdmin || profile?.role === 'gestor') return true;
          if (f.createdByUserId === profile?.id) return true;
          const client = clients.find(c => c.id === f.clientId);
          if (client && (client.internalManagerId === profile?.id || client.createdByUserId === profile?.id)) return true;
          if (f.declarationId) {
            const dec = declarations.find(d => d.id === f.declarationId);
            if (dec && (dec.assignedToUserId === profile?.id || dec.createdByUserId === profile?.id)) return true;
          }
          return false;
        })
        .filter(f => {
          if (employeeFilter === 'all') return true;
          if (f.createdByUserId === employeeFilter) return true;
          const client = clients.find(c => c.id === f.clientId);
          if (client && (client.internalManagerId === employeeFilter || client.createdByUserId === employeeFilter)) return true;
          if (f.declarationId) {
            const dec = declarations.find(d => d.id === f.declarationId);
            if (dec && (dec.assignedToUserId === employeeFilter || dec.createdByUserId === employeeFilter)) return true;
          }
          return false;
        })
        .filter(f => f.exerciseYear.toString() === exerciseFilter);

      rows = filtered.map(f => {
        const client = clients.find(c => c.id === f.clientId);
        const billed = f.finalAmount;
        const received = f.paymentStatus === 'paid' 
          ? f.finalAmount 
          : (f.paymentStatus === 'partial' 
            ? (f.paidAmount !== undefined ? f.paidAmount : (f.finalAmount === 970 ? 220 : 0)) 
            : 0);
        const toReceive = billed - received;

        const row = [client?.name || 'Desconhecido', f.exerciseYear];
        if (showTotalBilled) row.push(billed);
        if (showTotalReceived) row.push(received);
        if (showTotalToReceive) row.push(toReceive);
        row.push(f.paymentStatus === 'paid' ? 'Pago' : (f.paymentStatus === 'partial' ? 'Parcial' : 'Pendente'));
        return row;
      });

      const totalBilled = filtered.reduce((acc, curr) => acc + curr.finalAmount, 0);
      const totalReceived = filtered.reduce((acc, curr) => {
        const received = curr.paymentStatus === 'paid' 
          ? curr.finalAmount 
          : (curr.paymentStatus === 'partial' 
            ? (curr.paidAmount !== undefined ? curr.paidAmount : (curr.finalAmount === 970 ? 220 : 0)) 
            : 0);
        return acc + received;
      }, 0);
      const totalToReceive = totalBilled - totalReceived;

      const totalsRow: any[] = ['TOTAIS', ''];
      if (showTotalBilled) totalsRow.push(totalBilled);
      if (showTotalReceived) totalsRow.push(totalReceived);
      if (showTotalToReceive) totalsRow.push(totalToReceive);
      totalsRow.push('');
      rows.push([]);
      rows.push(totalsRow);
    } else if (activeReport === 'commissions') {
      headers = ['Responsável', 'Cliente', 'Embutido no Mensal', 'Status Pagamento', 'Valor Declaração', '% Comissão', 'Valor Comissão'];
      const filtered = declarations
        .filter(d => {
          if (isAdmin || profile?.role === 'gestor') return true;
          return d.assignedToUserId === profile?.id || d.createdByUserId === profile?.id;
        })
        .filter(d => {
          if (employeeFilter === 'all') return true;
          return d.assignedToUserId === employeeFilter || d.createdByUserId === employeeFilter;
        })
        .filter(d => d.exerciseYear.toString() === exerciseFilter && (d.hasCommission || d.isIncludedInMonthlyFee || (d.commissionPercentage && d.commissionPercentage > 0)));

      rows = filtered.map(d => {
        const client = clients.find(c => c.id === d.clientId);
        const responsible = users.find(u => u.id === d.assignedToUserId);
        const { isPaid, fin } = getCommissionPaymentStatus(d);
        const commissionValue = (d.grossAmount * (d.commissionPercentage || 0)) / 100;
        let paymentStatusText = isPaid ? 'Pago' : 'Pendente';
        if (!isPaid && fin?.paymentStatus === 'partial') {
          paymentStatusText = 'Parcial';
        }
        return [
          responsible?.name || responsible?.email || 'Não atribuído',
          client?.name || 'Desconhecido',
          d.isIncludedInMonthlyFee ? 'Sim' : 'Não',
          paymentStatusText,
          d.grossAmount,
          d.commissionPercentage || 0,
          commissionValue
        ];
      });

      const totalGross = filtered.reduce((acc, curr) => acc + (curr.grossAmount || 0), 0);
      
      let totalCommissions = 0;
      let totalReceived = 0;
      let totalPending = 0;

      filtered.forEach(d => {
        const commissionValue = (d.grossAmount * (d.commissionPercentage || 0)) / 100;
        totalCommissions += commissionValue;
        const { isPaid, fin } = getCommissionPaymentStatus(d);
        if (isPaid) {
          totalReceived += commissionValue;
        } else if (fin?.paymentStatus === 'partial') {
          const finAmount = fin.finalAmount || 1;
          const paidAmt = fin.paidAmount !== undefined ? fin.paidAmount : (fin.finalAmount === 970 ? 220 : 0);
          const ratio = paidAmt / finAmount;
          const partialRec = commissionValue * ratio;
          totalReceived += partialRec;
          totalPending += (commissionValue - partialRec);
        } else {
          totalPending += commissionValue;
        }
      });

      rows.push([]);
      rows.push(['TOTAIS', `${filtered.length} Declaração(ões)`, '', `Pago: ${totalReceived} | Pendente: ${totalPending}`, totalGross, '', totalCommissions]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    // Handle URL parameters for printing or deep linking
    const urlParams = new URLSearchParams(window.location.search);
    const reportParam = urlParams.get('report') as ReportType;
    const exerciseParam = urlParams.get('exercise');
    const employeeParam = urlParams.get('employee');
    const isPrintMode = urlParams.get('print') === 'true';
    
    if (reportParam && reportParam !== activeReport) setActiveReport(reportParam);
    if (exerciseParam && exerciseParam !== exerciseFilter) setExerciseFilter(exerciseParam);
    if (employeeParam && employeeParam !== employeeFilter) setEmployeeFilter(employeeParam);

    if (isPrintMode && !loading && activeReport === reportParam) {
      // Small delay to ensure rendering is complete
      const timer = setTimeout(() => {
        window.print();
        // Clean up URL after printing attempt
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }, 1500); // Increased delay for data loading
      return () => clearTimeout(timer);
    }
  }, [loading, activeReport]); // Run when loading or activeReport changes

  const handlePrint = () => {
    // In many iframe environments, window.print() is blocked.
    // The most reliable way is to open in a new tab and trigger print there.
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('print', 'true');
    if (activeReport) currentUrl.searchParams.set('report', activeReport);
    currentUrl.searchParams.set('exercise', exerciseFilter);
    currentUrl.searchParams.set('employee', employeeFilter);
    window.open(currentUrl.toString(), '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-yellow"></div>
      </div>
    );
  }

  const renderReportSelector = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <button 
        onClick={() => setActiveReport('clients')}
        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-brand-yellow hover:shadow-md transition-all text-left group"
      >
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-yellow group-hover:text-brand-black transition-colors">
          <Users size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Relação de Clientes</h3>
        <p className="text-sm text-slate-500 mt-1">Lista completa de clientes cadastrados no sistema.</p>
        <div className="mt-4 flex items-center text-xs font-bold text-brand-yellow uppercase tracking-wider">
          Gerar Relatório <ChevronRight size={14} className="ml-1" />
        </div>
      </button>

      <button 
        onClick={() => setActiveReport('declarations')}
        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-brand-yellow hover:shadow-md transition-all text-left group"
      >
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-yellow group-hover:text-brand-black transition-colors">
          <FileText size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Relação de Declarações</h3>
        <p className="text-sm text-slate-500 mt-1">Status e responsáveis por todas as declarações.</p>
        <div className="mt-4 flex items-center text-xs font-bold text-brand-yellow uppercase tracking-wider">
          Gerar Relatório <ChevronRight size={14} className="ml-1" />
        </div>
      </button>

      {isAdmin && (
        <button 
          onClick={() => setActiveReport('users')}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-brand-yellow hover:shadow-md transition-all text-left group"
        >
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-yellow group-hover:text-brand-black transition-colors">
            <UserCheck size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Relação de Usuários</h3>
          <p className="text-sm text-slate-500 mt-1">Lista de colaboradores e seus níveis de acesso.</p>
          <div className="mt-4 flex items-center text-xs font-bold text-brand-yellow uppercase tracking-wider">
            Gerar Relatório <ChevronRight size={14} className="ml-1" />
          </div>
        </button>
      )}

      <button 
        onClick={() => setActiveReport('billing')}
        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-brand-yellow hover:shadow-md transition-all text-left group"
      >
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-yellow group-hover:text-brand-black transition-colors">
          <DollarSign size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Faturamento</h3>
        <p className="text-sm text-slate-500 mt-1">Relatório financeiro detalhado por cliente.</p>
        <div className="mt-4 flex items-center text-xs font-bold text-brand-yellow uppercase tracking-wider">
          Gerar Relatório <ChevronRight size={14} className="ml-1" />
        </div>
      </button>

      <button 
        onClick={() => setActiveReport('commissions')}
        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-brand-yellow hover:shadow-md transition-all text-left group"
      >
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-brand-yellow group-hover:text-brand-black transition-colors">
          <DollarSign size={24} />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Relatório de Comissões</h3>
        <p className="text-sm text-slate-500 mt-1">Comissões por usuário baseadas nas declarações.</p>
        <div className="mt-4 flex items-center text-xs font-bold text-brand-yellow uppercase tracking-wider">
          Gerar Relatório <ChevronRight size={14} className="ml-1" />
        </div>
      </button>
    </div>
  );

  const renderBillingReport = () => {
    const filteredBilling = financials
      .filter(f => {
        if (isAdmin || profile?.role === 'gestor') return true;
        if (f.createdByUserId === profile?.id) return true;
        const client = clients.find(c => c.id === f.clientId);
        if (client && (client.internalManagerId === profile?.id || client.createdByUserId === profile?.id)) return true;
        if (f.declarationId) {
          const dec = declarations.find(d => d.id === f.declarationId);
          if (dec && (dec.assignedToUserId === profile?.id || dec.createdByUserId === profile?.id)) return true;
        }
        return false;
      })
      .filter(f => {
        if (employeeFilter === 'all') return true;
        if (f.createdByUserId === employeeFilter) return true;
        const client = clients.find(c => c.id === f.clientId);
        if (client && (client.internalManagerId === employeeFilter || client.createdByUserId === employeeFilter)) return true;
        if (f.declarationId) {
          const dec = declarations.find(d => d.id === f.declarationId);
          if (dec && (dec.assignedToUserId === employeeFilter || dec.createdByUserId === employeeFilter)) return true;
        }
        return false;
      })
      .filter(f => f.exerciseYear.toString() === exerciseFilter);
    const totalBilled = filteredBilling.reduce((acc, curr) => acc + curr.finalAmount, 0);
    const totalReceived = filteredBilling.reduce((acc, curr) => {
      const received = curr.paymentStatus === 'paid'
        ? curr.finalAmount
        : (curr.paymentStatus === 'partial'
          ? (curr.paidAmount !== undefined ? curr.paidAmount : (curr.finalAmount === 970 ? 220 : 0))
          : 0);
      return acc + received;
    }, 0);
    const totalToReceive = totalBilled - totalReceived;

    return (
      <div className="space-y-6">
        {/* Totalizer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Faturado</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBilled)}
              </h3>
            </div>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Recebido</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceived)}
              </h3>
            </div>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total a Receber</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalToReceive)}
              </h3>
            </div>
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 no-print">
          <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Filter size={16} />
            Filtros do Relatório
          </h4>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showTotalBilled} 
                onChange={(e) => setShowTotalBilled(e.target.checked)}
                className="w-4 h-4 text-brand-yellow rounded border-slate-300 focus:ring-brand-yellow"
              />
              <span className="text-sm font-medium text-slate-700">Total Faturado</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showTotalReceived} 
                onChange={(e) => setShowTotalReceived(e.target.checked)}
                className="w-4 h-4 text-brand-yellow rounded border-slate-300 focus:ring-brand-yellow"
              />
              <span className="text-sm font-medium text-slate-700">Total Recebido</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showTotalToReceive} 
                onChange={(e) => setShowTotalToReceive(e.target.checked)}
                className="w-4 h-4 text-brand-yellow rounded border-slate-300 focus:ring-brand-yellow"
              />
              <span className="text-sm font-medium text-slate-700">Total a Receber</span>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Exercício</th>
                  {showTotalBilled && <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Faturado</th>}
                  {showTotalReceived && <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Recebido</th>}
                  {showTotalToReceive && <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">A Receber</th>}
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredBilling.map((f) => {
                  const client = clients.find(c => c.id === f.clientId);
                  const billed = f.finalAmount;
                  const received = f.paymentStatus === 'paid'
                    ? f.finalAmount
                    : (f.paymentStatus === 'partial'
                      ? (f.paidAmount !== undefined ? f.paidAmount : (f.finalAmount === 970 ? 220 : 0))
                      : 0);
                  const toReceive = billed - received;

                  return (
                    <tr key={f.id} className={`hover:bg-slate-50/50 transition-colors ${f.paymentMethod === 'Mensalidade' ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{client?.name || 'Desconhecido'}</span>
                          {f.paymentMethod === 'Mensalidade' && (
                            <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5 inline-block">
                              Embutido no Mensal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{f.exerciseYear}</td>
                      {showTotalBilled && (
                        <td className="px-6 py-4 text-sm font-bold text-slate-700 text-right">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(billed)}
                        </td>
                      )}
                      {showTotalReceived && (
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600 text-right">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(received)}
                        </td>
                      )}
                      {showTotalToReceive && (
                        <td className="px-6 py-4 text-sm font-bold text-rose-600 text-right">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toReceive)}
                        </td>
                      )}
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg inline-flex items-center gap-1 ${
                          f.paymentStatus === 'paid' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : f.paymentStatus === 'partial'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {f.paymentStatus === 'paid' ? 'Pago' : (f.paymentStatus === 'partial' ? 'Parcial' : 'Pendente')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-slate-900">TOTAIS</td>
                  {showTotalBilled && (
                    <td className="px-6 py-4 text-right text-slate-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBilled)}
                    </td>
                  )}
                  {showTotalReceived && (
                    <td className="px-6 py-4 text-right text-emerald-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceived)}
                    </td>
                  )}
                  {showTotalToReceive && (
                    <td className="px-6 py-4 text-right text-rose-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalToReceive)}
                    </td>
                  )}
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderClientsReport = () => {
    const filteredClients = clients
      .filter(c => {
        if (isAdmin || profile?.role === 'gestor') return true;
        return c.createdByUserId === profile?.id || c.internalManagerId === profile?.id;
      })
      .filter(c => {
        if (employeeFilter === 'all') return true;
        return c.internalManagerId === employeeFilter || c.createdByUserId === employeeFilter;
      })
      .filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.cpf.includes(searchTerm)
      );

    const totalClients = filteredClients.length;
    const activeClients = filteredClients.filter(c => c.status === 'active').length;
    const inactiveClients = totalClients - activeClients;

    return (
      <div className="space-y-6">
        {/* Totalizer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Clientes</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalClients}</h3>
            </div>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Users size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clientes Ativos</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">{activeClients}</h3>
            </div>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clientes Inativos</p>
              <h3 className="text-2xl font-bold text-slate-500 mt-1">{inactiveClients}</h3>
            </div>
            <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 no-print">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Buscar por nome ou CPF..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/20 focus:border-brand-yellow"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">CPF</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Telefone</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredClients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{c.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{c.cpf}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{c.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{c.phone || '-'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {c.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <tr>
                  <td className="px-6 py-4 text-slate-900 font-bold">TOTAIS</td>
                  <td colSpan={3} className="px-6 py-4 text-sm text-slate-500 font-medium">
                    Ativos: <span className="text-emerald-600 font-bold">{activeClients}</span> | Inativos: <span className="text-slate-500 font-bold">{inactiveClients}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-slate-900 font-bold">
                    {totalClients} Clientes
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderDeclarationsReport = () => {
    const filteredDecs = declarations
      .filter(d => {
        if (isAdmin || profile?.role === 'gestor') return true;
        return d.createdByUserId === profile?.id || d.assignedToUserId === profile?.id;
      })
      .filter(d => {
        if (employeeFilter === 'all') return true;
        return d.assignedToUserId === employeeFilter || d.createdByUserId === employeeFilter;
      })
      .filter(d => d.exerciseYear.toString() === exerciseFilter);

    const totalDecs = filteredDecs.length;
    const originalDecs = filteredDecs.filter(d => d.declarationType === 'original').length;
    const rectifyingDecs = totalDecs - originalDecs;
    const totalGross = filteredDecs.reduce((acc, curr) => acc + (curr.grossAmount || 0), 0);

    return (
      <div className="space-y-6">
        {/* Totalizer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Declarações</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalDecs}</h3>
            </div>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <FileText size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Originais</p>
              <h3 className="text-2xl font-bold text-blue-600 mt-1">{originalDecs}</h3>
            </div>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <FileText size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Retificadoras</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{rectifyingDecs}</h3>
            </div>
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
              <FileText size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Honorários Estimados</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGross)}
              </h3>
            </div>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <DollarSign size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Exercício</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Valor</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredDecs.map((d) => {
                  const client = clients.find(c => c.id === d.clientId);
                  const responsible = users.find(u => u.id === d.assignedToUserId);
                  return (
                    <tr key={d.id} className={`hover:bg-slate-50/50 transition-colors ${d.isIncludedInMonthlyFee ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-6 py-4 font-bold text-slate-700">
                        <div className="flex flex-col">
                          <span>{client?.name || 'Desconhecido'}</span>
                          {d.isIncludedInMonthlyFee && (
                            <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5 inline-block">
                              Embutido no Mensal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{d.exerciseYear}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 capitalize">
                        {d.declarationType === 'original' ? 'Original' : 'Retificadora'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                          {d.kanbanStage}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-slate-700 font-mono">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.grossAmount || 0)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {responsible?.name || responsible?.email || 'Não atribuído'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <tr>
                  <td className="px-6 py-4 text-slate-900 font-bold">TOTAIS</td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-semibold">{exerciseFilter}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium leading-relaxed">
                    <div>Originais: <span className="text-blue-600 font-bold">{originalDecs}</span> | Retificadoras: <span className="text-amber-600 font-bold">{rectifyingDecs}</span></div>
                    {filteredDecs.some(d => d.isIncludedInMonthlyFee) && (
                      <div className="text-[11px] text-indigo-600 mt-0.5">
                        Embutidas no Mensal: <span className="font-bold">{filteredDecs.filter(d => d.isIncludedInMonthlyFee).length}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900">Total: {totalDecs}</td>
                  <td className="px-6 py-4 text-right text-slate-900 font-bold font-mono">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGross)}
                  </td>
                  <td className="px-6 py-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderUsersReport = () => {
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'active').length;
    const inactiveUsers = totalUsers - activeUsers;

    return (
      <div className="space-y-6">
        {/* Totalizer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Usuários</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalUsers}</h3>
            </div>
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <UserCheck size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usuários Ativos</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">{activeUsers}</h3>
            </div>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usuários Inativos</p>
              <h3 className="text-2xl font-bold text-slate-500 mt-1">{inactiveUsers}</h3>
            </div>
            <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cargo</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{u.name || u.nome || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{u.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 capitalize">{u.role}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {u.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <tr>
                  <td className="px-6 py-4 text-slate-900 font-bold">TOTAIS</td>
                  <td className="px-6 py-4 text-sm text-slate-500"></td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium colSpan={1}">
                    Ativos: <span className="text-emerald-600 font-bold">{activeUsers}</span> | Inativos: <span className="text-slate-500 font-bold">{inactiveUsers}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-slate-900 font-bold">
                    {totalUsers} Usuários
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const handleBatchUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!batchTargetId) {
      setBatchError('Por favor, selecione um ' + (batchType === 'employee' ? 'funcionário' : 'cliente') + '.');
      return;
    }
    if (batchPercentage < 0 || batchPercentage > 100) {
      setBatchError('A porcentagem de comissão deve ser entre 0 e 100.');
      return;
    }

    setBatchLoading(true);
    setBatchError(null);
    setBatchSuccess(null);

    try {
      // Find matching declarations
      const decsToUpdate = declarations.filter(d => {
        // Filter by target ID
        const matchesTarget = batchType === 'employee' 
          ? d.assignedToUserId === batchTargetId 
          : d.clientId === batchTargetId;

        // Filter by year
        const matchesYear = batchYearOption === 'current'
          ? d.exerciseYear.toString() === exerciseFilter
          : true;

        return matchesTarget && matchesYear;
      });

      if (decsToUpdate.length === 0) {
        setBatchError(`Nenhuma declaração encontrada para o ${batchType === 'employee' ? 'funcionário' : 'cliente'} selecionado com o escopo escolhido.`);
        setBatchLoading(false);
        return;
      }

      // Perform updates
      await Promise.all(
        decsToUpdate.map(d => 
          updateDoc(doc(db, 'declarations', d.id), {
            hasCommission: true,
            commissionPercentage: batchPercentage
          })
        )
      );

      // Clear cache and reload data
      dbCache.clear();
      await fetchAllData(true);

      setBatchSuccess(`Sucesso! ${decsToUpdate.length} declaração(ões) atualizada(s) para ${batchPercentage}% em lote.`);
      setBatchTargetId('');
    } catch (err: any) {
      console.error(err);
      setBatchError('Erro ao atualizar comissões em lote. Verifique limites ou conexão.');
    } finally {
      setBatchLoading(false);
    }
  };

  const renderCommissionsReport = () => {
    const filteredDecs = declarations
      .filter(d => {
        if (isAdmin || profile?.role === 'gestor') return true;
        return d.assignedToUserId === profile?.id || d.createdByUserId === profile?.id;
      })
      .filter(d => {
        if (employeeFilter === 'all') return true;
        return d.assignedToUserId === employeeFilter || d.createdByUserId === employeeFilter;
      })
      .filter(d => 
        d.exerciseYear.toString() === exerciseFilter && (d.hasCommission || d.isIncludedInMonthlyFee || (d.commissionPercentage && d.commissionPercentage > 0))
      );

    const totalDecs = filteredDecs.length;
    const totalGross = filteredDecs.reduce((acc, curr) => acc + (curr.grossAmount || 0), 0);
    
    let totalCommissions = 0;
    let receivedCommissions = 0;
    let pendingCommissions = 0;

    filteredDecs.forEach(d => {
      const commissionValue = ((d.grossAmount || 0) * (d.commissionPercentage || 0)) / 100;
      totalCommissions += commissionValue;

      const { isPaid, fin } = getCommissionPaymentStatus(d);

      if (isPaid) {
        receivedCommissions += commissionValue;
      } else if (fin?.paymentStatus === 'partial') {
        const finAmount = fin.finalAmount || 1;
        const paidAmt = fin.paidAmount !== undefined ? fin.paidAmount : (fin.finalAmount === 970 ? 220 : 0);
        const ratio = paidAmt / finAmount;
        const partialRec = commissionValue * ratio;
        receivedCommissions += partialRec;
        pendingCommissions += (commissionValue - partialRec);
      } else {
        pendingCommissions += commissionValue;
      }
    });

    return (
      <div className="space-y-6">
        {/* Totalizer Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Declarações</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalDecs}</h3>
            </div>
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <FileText size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Comissões Geradas (Total)</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCommissions)}
              </h3>
            </div>
            <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center">
              <Percent size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Comissão Recebida (Paga)</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receivedCommissions)}
              </h3>
            </div>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Comissão Pendente (A Receber)</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1 font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingCommissions)}
              </h3>
            </div>
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
              <Clock size={20} />
            </div>
          </div>
        </div>
        {/* Batch Update Card - Admin Only */}
        {isAdmin && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 no-print">
            <button
              onClick={() => {
                setShowBatchForm(!showBatchForm);
                setBatchError(null);
                setBatchSuccess(null);
              }}
              className="w-full flex items-center justify-between text-left focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Sliders size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Alteração de Comissão em Lote
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Ajuste facilmente as porcentagens de comissão para vários registros de uma vez.
                  </p>
                </div>
              </div>
              <div className="text-slate-400 hover:text-slate-600 transition-colors">
                {showBatchForm ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </button>

            {showBatchForm && (
              <form onSubmit={handleBatchUpdate} className="mt-6 pt-6 border-t border-slate-100 space-y-4 animate-in fade-in duration-300">
                {batchError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-xl flex items-center gap-2">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>{batchError}</span>
                  </div>
                )}
                {batchSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl flex items-center gap-2">
                    <CheckCircle2 size={18} className="shrink-0" />
                    <span>{batchSuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Select batch type */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Filtro Alvo</label>
                    <div className="flex gap-2 p-1 bg-slate-50 border border-slate-200 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setBatchType('employee');
                          setBatchTargetId('');
                          setBatchError(null);
                          setBatchSuccess(null);
                        }}
                        className={`flex-1 text-center py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                          batchType === 'employee'
                            ? 'bg-white text-indigo-600 shadow-sm border border-slate-100'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Funcionário
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBatchType('client');
                          setBatchTargetId('');
                          setBatchError(null);
                          setBatchSuccess(null);
                        }}
                        className={`flex-1 text-center py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                          batchType === 'client'
                            ? 'bg-white text-indigo-600 shadow-sm border border-slate-100'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Cliente
                      </button>
                    </div>
                  </div>

                  {/* Target Select */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Selecione o {batchType === 'employee' ? 'Funcionário' : 'Cliente'}
                    </label>
                    <select
                      required
                      value={batchTargetId}
                      onChange={(e) => setBatchTargetId(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      <option value="">-- Selecione --</option>
                      {batchType === 'employee' ? (
                        users.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.nome || u.email} ({u.role || 'Usuário'})
                          </option>
                        ))
                      ) : (
                        clients
                          .slice()
                          .sort((a,b) => a.name.localeCompare(b.name))
                          .map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.cpf ? `- ${c.cpf}` : ''}
                            </option>
                          ))
                      )}
                    </select>
                  </div>

                  {/* Percentage Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Nova Porcentagem (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="30"
                        value={batchPercentage}
                        onChange={(e) => setBatchPercentage(Number(e.target.value))}
                        className="w-full p-2.5 pl-4 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                      />
                      <Percent size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>

                  {/* Year Scope Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-medium">Exercício Alvo</label>
                    <select
                      value={batchYearOption}
                      onChange={(e: any) => setBatchYearOption(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      <option value="current">Apenas Exercício {exerciseFilter}</option>
                      <option value="all">Fazer em Todos os Anos</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={batchLoading}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl hover:shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm cursor-pointer"
                  >
                    {batchLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Atualizando Lote...</span>
                      </>
                    ) : (
                      <>
                        <Percent size={16} />
                        <span>Atualizar Comissão em Lote</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Commissions List Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Responsável</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status Pagamento</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Valor Declaração</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">% Comissão</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Valor Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
              {filteredDecs.map((d) => {
                const client = clients.find(c => c.id === d.clientId);
                const responsible = users.find(u => u.id === d.assignedToUserId);
                const { isPaid, fin } = getCommissionPaymentStatus(d);
                const commissionValue = ((d.grossAmount || 0) * (d.commissionPercentage || 0)) / 100;
                
                return (
                  <tr key={d.id} className={`hover:bg-slate-50/50 transition-colors ${d.isIncludedInMonthlyFee ? 'bg-indigo-50/30' : ''}`}>
                    <td className="px-6 py-4 font-bold text-slate-700">
                      {responsible?.name || responsible?.email || 'Não atribuído'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      <div className="flex flex-col">
                        <span>{client?.name || 'Desconhecido'}</span>
                        {d.isIncludedInMonthlyFee && (
                          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5 inline-block">
                            Embutido no Mensal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg inline-flex items-center gap-1 ${
                        isPaid 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : fin?.paymentStatus === 'partial'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {isPaid ? (
                          <>
                            <CheckCircle2 size={12} className="shrink-0" />
                            <span>Pago</span>
                          </>
                        ) : fin?.paymentStatus === 'partial' ? (
                          <>
                            <TrendingDown size={12} className="shrink-0 text-blue-500" />
                            <span>Parcial</span>
                          </>
                        ) : (
                          <>
                            <Clock size={12} className="shrink-0 text-amber-500" />
                            <span>Pendente</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.grossAmount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 text-center">
                      {d.commissionPercentage}%
                    </td>
                    <td className="px-6 py-4 text-sm text-emerald-600 text-right font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(commissionValue)}
                    </td>
                  </tr>
                );
              })}
              {filteredDecs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 italic">
                    Nenhuma comissão encontrada para este exercício.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
              <tr>
                <td className="px-6 py-4 text-slate-900 font-bold">TOTAIS</td>
                <td className="px-6 py-4 text-sm text-slate-500 font-medium">{totalDecs} Declaração(ões)</td>
                <td className="px-6 py-4 text-xs font-semibold text-slate-500 text-center">
                  Pago: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receivedCommissions)}<br/>
                  Pend: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingCommissions)}
                </td>
                <td className="px-6 py-4 text-sm text-slate-900 text-right font-bold font-mono">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGross)}
                </td>
                <td className="px-6 py-4"></td>
                <td className="px-6 py-4 text-sm text-emerald-600 text-right font-bold font-mono">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCommissions)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-brand-yellow uppercase tracking-wider mb-1">
            <TrendingUp size={16} />
            <span>Relatórios Gerenciais</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {activeReport ? (
              <button 
                onClick={() => setActiveReport(null)}
                className="hover:text-brand-yellow transition-colors flex items-center gap-2"
              >
                Relatórios
                <ChevronRight size={20} className="text-slate-300" />
                <span className="text-slate-500">
                  {activeReport === 'clients' && 'Relação de Clientes'}
                  {activeReport === 'declarations' && 'Relação de Declarações'}
                  {activeReport === 'users' && 'Relação de Usuários'}
                  {activeReport === 'billing' && 'Relatório de Faturamento'}
                  {activeReport === 'commissions' && 'Relatório de Comissões'}
                </span>
              </button>
            ) : 'Central de Relatórios'}
          </h2>
        </div>

        {activeReport && (
          <div className="flex flex-wrap items-center gap-3">
            {activeReport && activeReport !== 'users' && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl">
                <Users size={18} className="text-slate-400" />
                <select 
                  className="text-sm font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer max-w-[200px]"
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                >
                  <option value="all">Todos os Funcionários</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.nome || u.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(activeReport === 'declarations' || activeReport === 'billing' || activeReport === 'commissions') && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl">
                <Calendar size={18} className="text-slate-400" />
                <select 
                  className="text-sm font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                  value={exerciseFilter}
                  onChange={(e) => setExerciseFilter(e.target.value)}
                >
                  {years.map(year => (
                    <option key={year} value={year}>Exercício {year}</option>
                  ))}
                </select>
              </div>
            )}
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
            >
              <Printer size={18} />
              <span>Imprimir</span>
            </button>
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-brand-yellow text-brand-black px-4 py-2 rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-brand-yellow/20 transition-all shadow-sm cursor-pointer"
            >
              <Download size={18} />
              <span>Exportar CSV</span>
            </button>
          </div>
        )}
      </header>

      <main>
        {activeReport && (
          <div className="hidden print:block mb-6 text-center border-b-2 border-slate-200 pb-4">
            <h1 className="text-2xl font-bold text-slate-900 uppercase">
              {activeReport === 'clients' && 'Relação de Clientes'}
              {activeReport === 'declarations' && 'Relação de Declarações'}
              {activeReport === 'users' && 'Relação de Usuários'}
              {activeReport === 'billing' && 'Relatório de Faturamento'}
              {activeReport === 'commissions' && 'Relatório de Comissões'}
            </h1>
            <p className="text-slate-500 mt-1">
              Exercício: {exerciseFilter} 
              {employeeFilter !== 'all' && ` | Funcionário: ${users.find(u => u.id === employeeFilter)?.name || users.find(u => u.id === employeeFilter)?.nome || users.find(u => u.id === employeeFilter)?.email || ''}`}
              {` | Gerado por: ${profile?.name || profile?.email || 'Sistema'} | Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
            </p>
          </div>
        )}
        {!activeReport ? renderReportSelector() : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeReport === 'clients' && renderClientsReport()}
            {activeReport === 'declarations' && renderDeclarationsReport()}
            {activeReport === 'users' && isAdmin && renderUsersReport()}
            {!isAdmin && activeReport === 'users' && (
              <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-100 text-center">
                <p className="text-slate-500">Você não tem permissão para visualizar este relatório.</p>
              </div>
            )}
            {activeReport === 'billing' && renderBillingReport()}
            {activeReport === 'commissions' && renderCommissionsReport()}
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide sidebar, header and other non-print elements */
          aside, header, nav, .no-print, button, form, .bg-slate-50\\/30 {
            display: none !important;
          }
          
          /* Override layout constraints so height can grow naturally and trigger page breaks */
          html, body, #root, 
          div[class*="h-screen"], 
          div[class*="overflow-hidden"], 
          div[class*="overflow-y-auto"],
          main, 
          .flex, 
          .flex-col, 
          .flex-1 {
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            overflow-y: visible !important;
            display: block !important;
            position: static !important;
            width: 100% !important;
            float: none !important;
          }
          
          /* Ensure main content takes full width and isn't clipped or shifted */
          main {
            padding: 0 !important;
            margin: 0 !important;
          }

          body { 
            background: white !important; 
            color: black !important;
          }
          
          /* Clean backgrounds on reporting blocks */
          .bg-slate-50, .bg-slate-50\\/50, .bg-slate-100, .bg-indigo-50, .bg-blue-50, .bg-emerald-50, .bg-amber-50, .bg-rose-50, .bg-white { 
            background: transparent !important; 
          }
          
          .shadow-sm, .shadow-lg, .shadow-md, .shadow-2xl { 
            box-shadow: none !important; 
          }
          
          .border, .border-slate-100, .border-slate-200 { 
            border-color: #cbd5e1 !important; 
          }

          /* Ensure table structure prints properly and spreads across pages */
          table { 
            width: 100% !important; 
            border-collapse: collapse !important; 
            page-break-inside: auto !important;
          }
          
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          
          thead {
            display: table-header-group !important; /* Repeat header on every page */
          }
          
          tfoot {
            display: table-footer-group !important; /* Repeat footer on every page */
          }
          
          th, td { 
            border: 1px solid #cbd5e1 !important; 
            padding: 8px !important; 
            text-align: left !important;
            color: black !important;
            background: transparent !important;
          }
          
          /* Totalizer grid adjustment for print: render side-by-side flex line nicely */
          .grid {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
            gap: 12px !important;
            margin-bottom: 20px !important;
          }
          
          .grid > div {
            flex: 1 1 200px !important;
            border: 1px solid #cbd5e1 !important;
            padding: 12px !important;
            border-radius: 8px !important;
            background: #fafafa !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            page-break-inside: avoid !important;
          }
          
          /* Prevent outer wrap boxes from snapping in half */
          .bg-white.rounded-2xl {
            page-break-inside: avoid !important;
          }
        }
      `}} />
    </div>
  );
};
