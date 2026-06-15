import React from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  Mail, 
  Lock, 
  Loader2, 
  UserPlus, 
  LogIn as LogInIcon, 
  AlertCircle,
  ExternalLink,
  ArrowLeft,
  Eye,
  EyeOff
} from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);
  const [resetSuccess, setResetSuccess] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, digite seu e-mail para recuperar a senha.');
      return;
    }
    setResetLoading(true);
    setError(null);
    setResetSuccess(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess('Link de recuperação enviado com sucesso! Verifique sua caixa de entrada.');
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code || '';
      if (errorCode === 'auth/user-not-found' || err.message?.includes('user-not-found')) {
        setError('Nenhum usuário cadastrado com este e-mail.');
      } else if (errorCode === 'auth/invalid-email' || err.message?.includes('invalid-email')) {
        setError('E-mail inválido.');
      } else {
        setError('Falha ao enviar e-mail de recuperação. Tente novamente mais tarde.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';
      
      if (errorCode === 'auth/operation-not-allowed' || errorMessage.includes('auth/operation-not-allowed')) {
        setError('operation-not-allowed');
      } else if (errorCode === 'auth/network-request-failed' || errorMessage.includes('auth/network-request-failed')) {
        setError('network-request-failed');
      } else if (
        errorCode === 'auth/user-not-found' || 
        errorCode === 'auth/wrong-password' || 
        errorCode === 'auth/invalid-credential' ||
        errorCode === 'auth/invalid-login-credentials' ||
        errorMessage.includes('auth/invalid-credential') ||
        errorMessage.includes('auth/invalid-login-credentials') ||
        errorMessage.includes('auth/user-not-found') ||
        errorMessage.includes('auth/wrong-password')
      ) {
        setError('E-mail ou senha incorretos. Verifique suas credenciais ou crie uma conta se for seu primeiro acesso.');
      } else if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('auth/email-already-in-use') || String(err).includes('email-already-in-use')) {
        setError('Este e-mail já está em uso. Se você esqueceu sua senha, clique em "Esqueci minha senha" abaixo para redefini-la.');
      } else {
        setError(errorMessage || 'Falha ao autenticar.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';

      if (errorCode === 'auth/operation-not-allowed' || errorMessage.includes('auth/operation-not-allowed')) {
        setError('operation-not-allowed');
      } else if (errorCode === 'auth/network-request-failed' || errorMessage.includes('auth/network-request-failed')) {
        setError('network-request-failed');
      } else {
        setError('Falha ao entrar com Google. Verifique se o provedor está ativo e sua conexão de rede.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8 text-center bg-brand-black text-white">
          <div className="w-16 h-16 bg-brand-yellow rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-yellow/20">
            <ShieldCheck size={32} className="text-brand-black" />
          </div>
          <h1 className="text-2xl font-bold">Central IRPF L&M</h1>
          <p className="text-slate-400 text-sm mt-2">Gestão Operacional de Imposto de Renda</p>
        </div>
        
        <div className="p-8">
          {error === 'operation-not-allowed' ? (
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-6 text-center animate-in fade-in zoom-in duration-300">
              <AlertCircle size={48} className="text-rose-600 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-rose-900 mb-2">Acesso Bloqueado pelo Google</h2>
              <p className="text-sm text-rose-800 mb-6">
                O Firebase não permite o login porque o provedor (E-mail ou Google) está <strong>desativado</strong> no seu painel.
              </p>
              
              <div className="bg-white p-4 rounded-xl border border-rose-100 text-left mb-6">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">ID do seu Projeto:</p>
                <code className="block bg-slate-50 p-2 rounded text-blue-600 font-mono text-xs break-all mb-4">
                  {firebaseConfig.projectId}
                </code>
                <a 
                  href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                >
                  <ExternalLink size={18} />
                  ATIVAR NO FIREBASE AGORA
                </a>
              </div>
              
              <button 
                onClick={() => setError(null)}
                className="text-sm text-slate-500 hover:text-slate-800 font-medium"
              >
                Tentar novamente após ativar
              </button>
            </div>
          ) : error === 'network-request-failed' ? (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center animate-in fade-in zoom-in duration-300">
              <AlertCircle size={48} className="text-amber-600 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-amber-900 mb-2">Erro de Rede (Auth)</h2>
              <p className="text-sm text-amber-800 mb-6">
                O Firebase não conseguiu se conectar ao servidor de autenticação. Isso é comum quando o app está rodando dentro de um <strong>iframe</strong> ou se houver bloqueio de cookies de terceiros.
              </p>
              
              <div className="space-y-4">
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="flex items-center justify-center gap-2 w-full bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100"
                >
                  <ExternalLink size={18} />
                  ABRIR EM NOVA ABA
                </button>
                
                <button 
                  onClick={() => setError(null)}
                  className="text-sm text-slate-500 hover:text-slate-800 font-medium"
                >
                  Tentar novamente aqui
                </button>
              </div>
            </div>
          ) : isResetting ? (
            <>
              <div className="mb-8 text-center animate-in fade-in duration-300">
                <h2 className="text-xl font-semibold text-slate-800">
                  Recuperar Senha
                </h2>
                <p className="text-slate-500 text-sm mt-2">
                  Não se preocupe, digite seu e-mail abaixo para receber um link de redefinição de senha.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg text-center">
                  {error}
                </div>
              )}

              {resetSuccess && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-slate-700 text-xs rounded-xl text-left animate-in fade-in duration-300">
                  <h3 className="font-bold text-emerald-800 text-sm mb-2 flex items-center gap-1.5">
                    ✓ Link enviado com sucesso!
                  </h3>
                  <p className="mb-2 text-emerald-700 font-medium">
                    Enviamos o e-mail de redefinição para <span className="font-black underline">{email}</span>.
                  </p>
                  <div className="space-y-1.5 text-slate-600 bg-white/70 p-3 rounded-lg border border-emerald-100">
                    <p className="font-semibold text-slate-800">Se o e-mail não chegar em alguns minutos, verifique:</p>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      <li>A pasta de <strong>Spam / Lixo Eletrônico</strong> do seu e-mail.</li>
                      <li>A aba de <strong>Promoções</strong> ou <strong>Social</strong> (se usar Gmail).</li>
                      <li>Verifique se digitou o e-mail 100% correto.</li>
                      <li><strong>Domínios Corporativos:</strong> Provedores de empresas às vezes bloqueiam e-mails diretos do remetente padrão do Firebase. Contate o administrador para configurar um <strong>remetente próprio (Ex: contato@suaempresa.com.br)</strong> nas configurações do Firebase.</li>
                    </ul>
                  </div>
                </div>
              )}

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="email" 
                      required
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full flex items-center justify-center gap-3 bg-brand-yellow text-brand-black font-bold py-3 px-4 rounded-xl hover:bg-brand-yellow-dark transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-yellow/10 mt-6"
                >
                  {resetLoading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Enviando link...</span>
                    </>
                  ) : (
                    <>
                      <Mail size={20} />
                      <span>Enviar Link de Recuperação</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button 
                  onClick={() => {
                    setIsResetting(false);
                    setError(null);
                    setResetSuccess(null);
                  }}
                  className="text-sm text-brand-yellow font-bold hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft size={16} />
                  <span>Voltar para o login</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h2 className="text-xl font-semibold text-slate-800">
                  {isRegistering ? 'Criar Nova Conta' : 'Acesso ao Sistema'}
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  {isRegistering ? 'Cadastre-se para acessar o sistema' : 'Escolha uma forma de acesso'}
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg text-center">
                  {error}
                </div>
              )}

              {!isRegistering && (
                <>
                  <button
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 shadow-sm mb-6"
                  >
                    {googleLoading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                    )}
                    <span>Entrar com Google</span>
                  </button>

                  <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">ou use e-mail</span>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="email" 
                      required
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required
                      placeholder="••••••••"
                      className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1 rounded-md hover:bg-slate-100 transition-all"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {!isRegistering && (
                    <div className="flex justify-end mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsResetting(true);
                          setError(null);
                          setResetSuccess(null);
                        }}
                        className="text-xs text-slate-500 hover:text-brand-yellow font-medium transition-colors"
                      >
                        Esqueceu sua senha?
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-brand-yellow text-brand-black font-bold py-3 px-4 rounded-xl hover:bg-brand-yellow-dark transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-yellow/10 mt-6"
                >
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>{isRegistering ? 'Criando...' : 'Entrando...'}</span>
                    </>
                  ) : (
                    <>
                      {isRegistering ? <UserPlus size={20} /> : <LogInIcon size={20} />}
                      <span>{isRegistering ? 'Criar Conta' : 'Entrar com E-mail'}</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button 
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="text-sm text-brand-yellow font-bold hover:underline"
                >
                  {isRegistering ? 'Já tenho uma conta? Entrar' : 'Não tem uma conta? Criar agora'}
                </button>
              </div>
            </>
          )}

          <div className="mt-8 pt-8 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">L&M Contabilidade</p>
          </div>
        </div>
      </div>
    </div>
  );
};
