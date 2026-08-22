import { claveDiaLocal, hoyLocal } from '@/utils/fecha';
import { getProfile, saveProfile as saveProfileData } from '@/utils/storage';
import type { ProfileData } from '@/types';
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
// GUARDAR PERFIL
// ==========================================

export function saveProfile(e: Event): boolean {
  e.preventDefault();

  const profile: ProfileData = {
    name:
      (document.getElementById('profileName') as HTMLInputElement)?.value || '',
    birthdate:
      (document.getElementById('profileBirthdate') as HTMLInputElement)?.value ||
      '',
    gender:
      ((document.getElementById('profileGender') as HTMLSelectElement)
        ?.value as 'male' | 'female') || 'male',
    weight:
      parseFloat(
        (document.getElementById('profileWeight') as HTMLInputElement)?.value ||
          '0'
      ) || 0,
    height:
      parseFloat(
        (document.getElementById('profileHeight') as HTMLInputElement)?.value ||
          '0'
      ) || 0,
    activity:
      parseFloat(
        (document.getElementById('profileActivity') as HTMLSelectElement)
          ?.value || '1.2'
      ) || 1.2,
  };

  saveProfileData(profile);

  // Mostrar mensaje de éxito
  const message = document.getElementById('profileSaveMessage');
  if (message) {
    message.classList.remove('hidden');
    setTimeout(() => {
      message.classList.add('hidden');
    }, 3000);
  }

  return false;
}

// ==========================================
// CALCULAR EDAD
// ==========================================

export function calculateAge(): void {
  const birthdateInput = document.getElementById(
    'profileBirthdate'
  ) as HTMLInputElement;
  const ageDisplay = document.getElementById('calculatedAge');

  if (!birthdateInput || !ageDisplay) return;

  const birthdate = birthdateInput.value;
  if (!birthdate) {
    ageDisplay.textContent = '-';
    return;
  }

  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  ageDisplay.textContent = String(age);
}

// ==========================================
// INICIALIZAR PERFIL
// ==========================================

export function initializeProfile(): void {
  // Establecer max date para birthdate input (hoy)
  const today = hoyLocal();
  const birthdateInput = document.getElementById(
    'profileBirthdate'
  ) as HTMLInputElement;

  if (birthdateInput) {
    birthdateInput.setAttribute('max', today);

    // Min = 100 años atrás
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 100);
    birthdateInput.setAttribute('min', claveDiaLocal(minDate));

    birthdateInput.addEventListener('change', calculateAge);
  }

  // Form submit
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', saveProfile);
  }

  // Cargar datos existentes
  loadProfile();
}

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
