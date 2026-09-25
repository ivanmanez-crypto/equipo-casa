// Configuración de Equipo Casa.
// Si SUPABASE_URL o SUPABASE_ANON_KEY están vacíos, la app funciona en
// MODO DEMO (datos inventados guardados solo en este dispositivo).
//
// La "anon public key" está pensada para ir en el código público: sin una
// cuenta activada no permite leer ni escribir nada (ver supabase/schema.sql).
// NUNCA pongas aquí la clave "service_role".
window.APP_CONFIG = {
  SUPABASE_URL: "https://ylmandpunmrwfrnabeeg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_re9AD30Mw7KD84F8UqOVww_yBxxPtka",
  TIMEZONE: "Europe/Madrid"
};
