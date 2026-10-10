// ============================================================
//  CONFIGURACIÓN DEL SISTEMA — es el único archivo que se edita
// ============================================================
window.CONFIG = {
  // URL del webhook del Escenario 1 (Make → módulo Custom webhook → "Copy address").
  // Es el disparador (trigger): cada vez que se envía el formulario, se llama a esta URL.
  WEBHOOK_URL: "https://hook.us2.make.com/d90bsi27eblnyafhbwa9y5suolfjh9bg",

  // ID de la hoja de Google que usa Make (está en la URL, entre /d/ y /edit).
  // La hoja debe estar compartida: "Cualquier persona con el enlace" → Lector.
  SHEET_ID: "16k4LgB64U-xohoBbShxLBHPyGaOjhVsr6WnG6FeEKr8",

  // (Recomendado) Enlaces CSV de "Archivo → Compartir → Publicar en la web".
  // Si se llenan, la agenda los usa en lugar del SHEET_ID. Deben terminar en output=csv
  CSV_AGENDA_URL: "",
  CSV_CITAS_URL: "",

  // Nombres EXACTOS de las pestañas de la hoja (respetan mayúsculas).
  HOJA_AGENDA: "agenda",
  HOJA_CITAS: "citas",

  // Segundos máximos de espera por la respuesta de Make.
  TIEMPO_ESPERA: 40,

  // Horas de las franjas que ofrece la clínica (formato HH:MM).
  HORAS: ["08:00", "09:00", "10:00", "11:00"]
};
