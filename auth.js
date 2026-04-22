// --- 1. CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = 'https://ttymwhkhwwgljuguxeia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eW13aGtod3dnbGp1Z3V4ZWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzcxMjIsImV4cCI6MjA4NzU1MzEyMn0.iLxKac2QqiVo7sGrI84bp0yAxplfPAU_qev6A7knW6k'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DEFAULT_TOKEN_GRANT = 100;

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
    const isPrivatePage = path.includes('index.html') || path.endsWith('/');

    if (!session && isPrivatePage) {
        window.location.replace("login.html");
        return;
    }

    if (session) {
        const user = session.user;
        console.log("Usuario autenticado:", user.email);

        window.currentUser = user;

        const loader = document.getElementById('app-loader');
        if (loader) {
            loader.classList.add('hidden');
        }
    }
}
initApp();

// --- 3. REGISTRO (SOLO EMAIL/PASS) ---
const regForm = document.getElementById('register-form');
if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        const { error } = await _supabase.auth.signUp({ email, password });
        const errorDiv = document.getElementById('auth-error');
        
        if (error) {
            errorDiv.innerText = "Error: " + error.message;
            errorDiv.classList.remove('hidden');
        } else {
            errorDiv.classList.remove('text-red-400', 'bg-red-500/10', 'border-red-500/30');
            errorDiv.classList.add('text-green-400', 'bg-green-500/10', 'border-green-500/30');
            errorDiv.innerText = "¡Registro exitoso! Revisa tu email para confirmar.";
            errorDiv.classList.remove('hidden');
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
        
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        const errorDiv = document.getElementById('auth-error');
        
        if (error) {
            errorDiv.innerText = "Error: " + error.message;
            errorDiv.classList.remove('hidden');
        } else {
            await ensureUserCredits({ initialize: true });
            window.location.replace("index.html");
        }
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
