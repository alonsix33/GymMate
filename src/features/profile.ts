import { getProfile } from '@/utils/storage';
import { renderPerfil, renderHistorialDeMedidas } from '@/ui/perfil';

// ==========================================
// CARGAR PERFIL
// ==========================================

/**
 * P-01 · Perfil. El formulario legacy con sus ids sueltos se retira: el render
 * vive en src/ui/perfil.ts, como el resto de FIERRO.
 */
export function loadProfile(): void {
  const contenedor = document.getElementById('profileTab');
  if (contenedor) renderPerfil(contenedor);
}

/** P-03 · Historial de medidas, en seccion Hueso. */
export function loadMedidas(): void {
  const contenedor = document.getElementById('medidasTab');
  if (contenedor) renderHistorialDeMedidas(contenedor);
}

// ==========================================
// GUARDAR PERFIL / EDAD / INICIALIZACION
// ==========================================
//
// Se han borrado `saveProfile`, `calculateAge` e `initializeProfile`. Buscaban
// nueve ids que la fase 7 retiro de `index.html` al reemplazar el formulario
// legacy por P-01 (`profileForm`, `profileName`, `profileBirthdate`,
// `profileGender`, `profileWeight`, `profileHeight`, `profileActivity`,
// `profileSaveMessage`, `calculatedAge`). No las llamaba nadie, pero
// `saveProfile` estaba EXPORTADA y cada `getElementById` devolvia null: al
// volver a engancharla habria escrito {name:'', weight:0, height:0} encima del
// perfil real. El guardado vive en `src/ui/perfil.ts`, contra los campos que
// esa pantalla pinta de verdad.

// ==========================================
// OBTENER DATOS DEL PERFIL PARA CALCULADORAS
// ==========================================

export function getProfileForCalculators(): {
  age: number | null;
  gender: 'male' | 'female' | null;
  weight: number | null;
  height: number | null;
  activity: number | null;
} {
  const profile = getProfile();

  let age: number | null = null;
  if (profile.birthdate) {
    const birth = new Date(profile.birthdate);
    const today = new Date();
    age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
  }

  return {
    age,
    gender: profile.gender || null,
    weight: profile.weight || null,
    height: profile.height || null,
    activity: profile.activity || null,
  };
}

// ==========================================
// BODY MEASUREMENTS
// ==========================================
// MEDIDAS CORPORALES
// ==========================================
//
// Se han borrado `openMeasurementsModal`, `closeMeasurementsModal`,
// `setupBodyFatCalculation`, `calculateBodyFat`, `saveMeasurement`,
// `updateMeasurementPreview`, `showMeasurementsHistory`,
// `closeMeasurementsHistoryModal` y `deleteMeasurementEntry`: eran los dos
// modales legacy con sus ids sueltos, sus clases de Tailwind y sus iconos de
// lucide. P-02 (hoja de medicion) y P-03 (historial en seccion Hueso) los
// sustituyen enteros, y el % graso lo calcula ahora una sola funcion en
// `@/utils/perfil-calc`.
