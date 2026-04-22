// Configuración de Supabase con tu clave real detectada
const SUPABASE_URL = 'https://ttymwhkhwwgljuguxeia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eW13aGtod3dnbGp1Z3V4ZWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzcxMjIsImV4cCI6MjA4NzU1MzEyMn0.iLxKac2QqiVo7sGrI84bp0yAxplfPAU_qev6A7knW6k'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- LÓGICA DE CERRAR SESIÓN ---
// Buscamos el botón por el ID 'logout-btn' que definimos en index.html
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log("Cerrando sesión...");
        try {
            await _supabase.auth.signOut();
        } catch (err) {
            console.error("Error al cerrar sesión:", err);
        } finally {
            // Obligamos a ir al login y limpiamos el historial para que no puedan volver atrás
            window.location.replace("login.html");
        }
    });
}

// --- PROTECCIÓN DE RUTA ---
// Evita que alguien entre a index.html sin estar logueado
async function protectRoute() {
    const { data: { session } } = await _supabase.auth.getSession();
    const path = window.location.pathname;
    
    // Si no hay sesión y está en la consola, redirigir
    if (!session && (path.includes('index.html') || path.endsWith('/'))) {
        window.location.replace("login.html");
    }
}
protectRoute();

// --- REGISTRO DE USUARIOS ---
const regForm = document.getElementById('register-form');
if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        const { error } = await _supabase.auth.signUp({ email, password });
        
        if (error) alert("Error: " + error.message);
        else alert("¡Registro iniciado! Revisa tu email para confirmar tu cuenta.");
    });
}

// --- INICIO DE SESIÓN ---
const logForm = document.getElementById('login-form');
if (logForm) {
    logForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        
        if (error) alert("Credenciales inválidas: " + error.message);
        else window.location.replace("index.html");
    });
}
