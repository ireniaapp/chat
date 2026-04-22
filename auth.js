// --- 1. CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = 'https://ttymwhkhwwgljuguxeia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eW13aGtod3dnbGp1Z3V4ZWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzcxMjIsImV4cCI6MjA4NzU1MzEyMn0.iLxKac2QqiVo7sGrI84bp0yAxplfPAU_qev6A7knW6k'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

        // --- INTEGRACIÓN CON ELEVENLABS ---
        // Buscamos el elemento de ElevenLabs (suponiendo que usas su widget)
        const chatAgent = document.querySelector('elevenlabs-convai');
        if (chatAgent) {
            // Le pasamos el ID de usuario de Supabase para que ElevenLabs sepa quién es
            chatAgent.setAttribute('user-id', user.id);
            console.log("Chatbot vinculado al ID:", user.id);
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
        
        if (error) alert("Error: " + error.message);
        else alert("¡Registro iniciado! Revisa tu email.");
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
        
        if (error) alert("Error: " + error.message);
        else window.location.replace("index.html");
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
