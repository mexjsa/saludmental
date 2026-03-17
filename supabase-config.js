// Supabase Configuration - Replacement for firebase-config.js
const SUPABASE_URL = "https://azzxycyhmlkafykufumf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6enh5Y3lobWxrYWZ5a3VmdW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MjYwMTksImV4cCI6MjA4OTMwMjAxOX0.FSUKZyazAFU4lr62rXIIWhQzpEhT7opPRKVsnf0C968";

// Use CDN link for Supabase Client safely
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false, // Evita avisos de "Tracking Prevention" en el chatbot
        autoRefreshToken: false
    }
}) : null;

export { supabase, SUPABASE_URL, SUPABASE_KEY };
