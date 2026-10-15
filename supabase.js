// Usa la Project URL y la Publishable key de tu proyecto Supabase.
// No coloques aquí una Secret key ni una service_role key.
const SUPABASE_URL = "https://ilsjmyozmepwildjrbev.supabase.co";
const SUPABASE_KEY = "sb_publishable_nvqe3CrutYoCk3rXPZePFw_Hkpf1whz";

if (SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGA_AQUI") && !SUPABASE_KEY.includes("PEGA_AQUI")) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn("Configura SUPABASE_URL y SUPABASE_KEY en supabase.js.");
}

async function obtenerFotoPerfil(usuarioId) {
  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('foto_url')
    .eq('id', usuarioId)
    .maybeSingle();

  if (error) {
    console.error('Error al consultar el perfil:', error);
    return null;
  }

  return perfil?.foto_url || null;
}
