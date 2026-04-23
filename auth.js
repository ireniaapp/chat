// --- 1. CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = 'https://ttymwhkhwwgljuguxeia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eW13aGtod3dnbGp1Z3V4ZWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzcxMjIsImV4cCI6MjA4NzU1MzEyMn0.iLxKac2QqiVo7sGrI84bp0yAxplfPAU_qev6A7knW6k'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DEFAULT_TOKEN_GRANT = 2;
const PLAN_ONBOARDING_KEY = 'irenia_plan_onboarding_seen_v1';

function getCurrentPage() {
    const raw = window.location.pathname.split('/').pop();
    if (!raw) return 'index.html';
    return raw;
}

function getPlanOnboardingStorageKey(userId) {
    return `${PLAN_ONBOARDING_KEY}:${userId}`;
}

function hasSeenPlanOnboarding(userId) {
    if (!userId) return false;
    return localStorage.getItem(getPlanOnboardingStorageKey(userId)) === '1';
}

function markPlanOnboardingSeen(userId) {
    if (!userId) return;
    localStorage.setItem(getPlanOnboardingStorageKey(userId), '1');
}

async function getLatestSubscription(userId) {
    if (!userId) return null;

    const { data, error } = await _supabase
        .from('paypal_subscriptions')
        .select('status,plan_interval,updated_at,current_period_end')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('No se pudo leer la suscripcion:', error);
        return null;
    }

    return data || null;
}

function isSubscriptionActive(subscription) {
    if (!subscription || typeof subscription !== 'object') return false;
    const status = (subscription.status || '').toString().toLowerCase();
    return status === 'active';
}

async function shouldShowPlanOnboarding(userId) {
    if (!userId) return false;
    if (hasSeenPlanOnboarding(userId)) return false;

    const subscription = await getLatestSubscription(userId);
    return !isSubscriptionActive(subscription);
}

async function getPostAuthRoute(userId) {
    const showPlans = await shouldShowPlanOnboarding(userId);
    return showPlans ? 'plans.html' : 'index.html';
}

async function startPaypalCheckout(planInterval) {
    const { data, error } = await _supabase.functions.invoke('create-paypal-subscription', {
        body: { planInterval }
    });

    if (error) {
        throw error;
    }

    const approvalUrl = data && typeof data === 'object' ? data.approvalUrl : '';
    if (!approvalUrl || typeof approvalUrl !== 'string') {
        throw new Error('No recibi URL de aprobacion de PayPal');
    }

    window.location.href = approvalUrl;
}

async function ensureUserCredits(options = {}) {
    const {
        initialize = false,
        startingBalance = DEFAULT_TOKEN_GRANT
    } = options;

    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await _supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error('No se pudo leer el saldo de tokens:', error);
        return null;
    }

    if (data?.balance !== null && data?.balance !== undefined) {
        return data.balance;
    }

    if (!initialize) {
        return null;
    }

    const { data: upserted, error: upsertError } = await _supabase
        .from('user_credits')
        .upsert({
            user_id: user.id,
            balance: startingBalance,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select('balance')
        .maybeSingle();

    if (upsertError) {
        console.error('No se pudo inicializar el saldo de tokens:', upsertError);
        return null;
    }

    return upserted?.balance ?? startingBalance;
}

// --- 2. PROTECCIÓN Y CONEXIÓN CON ELEVENLABS ---
async function initApp() {
    const { data: { session } } = await _supabase.auth.getSession();
    const path = window.location.pathname;
    const currentPage = getCurrentPage();
    const isResetPage = currentPage === 'reset-password.html';
    const isPlansPage = currentPage === 'plans.html';
    const isAuthPage = currentPage === 'login.html' || currentPage === 'register.html';
    const isChatPage = currentPage === 'index.html' || path.endsWith('/');
    const isPrivatePage = (isChatPage || isPlansPage) && !isResetPage;

    if (!session && isPrivatePage) {
        window.location.replace("login.html");
        return;
    }

    if (session) {
        const user = session.user;
        console.log("Usuario autenticado:", user.email);

        window.currentUser = user;

        if (isAuthPage) {
            await ensureUserCredits({ initialize: true });
            const nextRoute = await getPostAuthRoute(user.id);
            window.location.replace(nextRoute);
            return;
        }

        if (isChatPage) {
            const showPlans = await shouldShowPlanOnboarding(user.id);
            if (showPlans) {
                window.location.replace('plans.html');
                return;
            }
        }

        if (isPlansPage) {
            const subscription = await getLatestSubscription(user.id);
            if (isSubscriptionActive(subscription)) {
                markPlanOnboardingSeen(user.id);
                window.location.replace('index.html');
                return;
            }
        }

        const loader = document.getElementById('app-loader');
        if (loader) {
            loader.classList.add('hidden');
        }
    }
}
initApp();

function setAuthMessage(text, type = 'error') {
    const errorDiv = document.getElementById('auth-error');
    if (!errorDiv) return;

    errorDiv.classList.remove(
        'hidden',
        'text-red-400',
        'bg-red-500/10',
        'border-red-500/30',
        'text-green-400',
        'bg-green-500/10',
        'border-green-500/30'
    );

    if (type === 'success') {
        errorDiv.classList.add('text-green-400', 'bg-green-500/10', 'border-green-500/30');
    } else {
        errorDiv.classList.add('text-red-400', 'bg-red-500/10', 'border-red-500/30');
    }

    errorDiv.innerText = text;
}

function translateAuthErrorMessage(rawMessage) {
    const message = (rawMessage || '').toString().trim();
    const lower = message.toLowerCase();

    if (!message) return 'Ocurrio un error inesperado.';
    if (lower.includes('invalid login credentials')) return 'Credenciales invalidas. Verifica tu email y contrasena.';
    if (lower.includes('email not confirmed')) return 'Debes confirmar tu email antes de iniciar sesion.';
    if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('user already')) {
        return 'Este email ya se encuentra registrado. Inicia sesion o recupera tu contrasena.';
    }
    if (lower.includes('password should be at least') || lower.includes('weak password')) {
        return 'La contrasena es demasiado debil. Usa al menos 6 caracteres.';
    }
    if (lower.includes('for security purposes') || lower.includes('rate limit')) {
        return 'Demasiados intentos. Espera un momento e intenta nuevamente.';
    }
    if (lower.includes('failed to fetch') || lower.includes('network')) {
        return 'No se pudo conectar con el servidor. Revisa tu conexion.';
    }
    if (lower.includes('invalid email')) return 'El email ingresado no es valido.';
    if (lower.includes('token has expired') || lower.includes('expired')) {
        return 'El enlace expiro. Solicita uno nuevo.';
    }

    return message;
}

// --- 3. REGISTRO (SOLO EMAIL/PASS) ---
const regForm = document.getElementById('register-form');
if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        
        const { data, error } = await _supabase.auth.signUp({ email, password });
        
        if (error) {
            setAuthMessage(translateAuthErrorMessage(error.message), 'error');
        } else {
            const identities = Array.isArray(data?.user?.identities) ? data.user.identities : null;
            const alreadyRegistered = Boolean(data?.user && identities && identities.length === 0);
            if (alreadyRegistered) {
                setAuthMessage('Este email ya se encuentra registrado. Inicia sesion o recupera tu contrasena.', 'error');
                return;
            }

            if (data?.session?.user) {
                await ensureUserCredits({ initialize: true });
                const nextRoute = await getPostAuthRoute(data.session.user.id);
                window.location.replace(nextRoute);
                return;
            }

            setAuthMessage('Registro exitoso. Revisa tu email para confirmar.', 'success');
        }
    });
}

// --- 4. LOGIN ---
const logForm = document.getElementById('login-form');
if (logForm) {
    logForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            setAuthMessage(translateAuthErrorMessage(error.message), 'error');
        } else {
            await ensureUserCredits({ initialize: true });
            const userId = data?.user?.id;
            const nextRoute = await getPostAuthRoute(userId);
            window.location.replace(nextRoute);
        }
    });
}

const forgotPasswordToggle = document.getElementById('forgot-password-toggle');
const forgotPasswordForm = document.getElementById('forgot-password-form');

if (forgotPasswordToggle && forgotPasswordForm) {
    forgotPasswordToggle.addEventListener('click', () => {
        forgotPasswordForm.classList.toggle('hidden');
    });
}

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById('forgot-email');
        const email = emailInput ? emailInput.value.trim() : '';
        if (!email) {
            setAuthMessage('Ingresa un email valido.', 'error');
            return;
        }

        const redirectTo = `${window.location.origin}${window.location.pathname.replace('login.html', 'reset-password.html')}`;

        const { error } = await _supabase.auth.resetPasswordForEmail(email, { redirectTo });

        if (error) {
            setAuthMessage(translateAuthErrorMessage(error.message), 'error');
            return;
        }

        setAuthMessage('Te enviamos un enlace para restablecer la contrasena.', 'success');
    });
}

const resetPasswordForm = document.getElementById('reset-password-form');
if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const passwordInput = document.getElementById('reset-password');
        const confirmInput = document.getElementById('reset-password-confirm');
        const password = passwordInput ? passwordInput.value : '';
        const confirm = confirmInput ? confirmInput.value : '';

        if (!password || password.length < 6) {
            setAuthMessage('La contrasena debe tener al menos 6 caracteres.', 'error');
            return;
        }

        if (password !== confirm) {
            setAuthMessage('Las contrasenas no coinciden.', 'error');
            return;
        }

        const { error } = await _supabase.auth.updateUser({ password });
        if (error) {
            setAuthMessage(translateAuthErrorMessage(error.message), 'error');
            return;
        }

        setAuthMessage('Contrasena actualizada. Redirigiendo a login...', 'success');
        window.setTimeout(() => {
            window.location.replace('login.html');
        }, 1500);
    });
}

const chooseMonthlyBtn = document.getElementById('choose-monthly-btn');
const chooseYearlyBtn = document.getElementById('choose-yearly-btn');
const chooseFreeBtn = document.getElementById('choose-free-btn');
const planStatus = document.getElementById('plan-status');

function setPlanStatus(text, type = 'neutral') {
    if (!planStatus) return;

    planStatus.classList.remove('hidden', 'text-red-400', 'bg-red-500/10', 'border-red-500/30', 'text-green-400', 'bg-green-500/10', 'border-green-500/30', 'text-slate-300', 'bg-slate-800/60', 'border-slate-700');

    if (type === 'error') {
        planStatus.classList.add('text-red-400', 'bg-red-500/10', 'border-red-500/30');
    } else if (type === 'success') {
        planStatus.classList.add('text-green-400', 'bg-green-500/10', 'border-green-500/30');
    } else {
        planStatus.classList.add('text-slate-300', 'bg-slate-800/60', 'border-slate-700');
    }

    planStatus.innerText = text;
}

if (chooseMonthlyBtn) {
    chooseMonthlyBtn.addEventListener('click', async () => {
        try {
            setPlanStatus('Creando checkout mensual en PayPal...', 'neutral');
            await startPaypalCheckout('monthly');
        } catch (error) {
            setPlanStatus(`No se pudo iniciar el plan mensual: ${translateAuthErrorMessage(error?.message || 'error')}`, 'error');
        }
    });
}

if (chooseYearlyBtn) {
    chooseYearlyBtn.addEventListener('click', async () => {
        try {
            setPlanStatus('Creando checkout anual en PayPal...', 'neutral');
            await startPaypalCheckout('yearly');
        } catch (error) {
            setPlanStatus(`No se pudo iniciar el plan anual: ${translateAuthErrorMessage(error?.message || 'error')}`, 'error');
        }
    });
}

if (chooseFreeBtn) {
    chooseFreeBtn.addEventListener('click', async () => {
        const { data: { user } } = await _supabase.auth.getUser();
        if (user?.id) {
            markPlanOnboardingSeen(user.id);
        }
        window.location.replace('index.html');
    });
}

// --- 5. LOGOUT ---
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await _supabase.auth.signOut();
        window.location.replace("login.html");
    });
}
