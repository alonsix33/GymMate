import { getProfile, saveProfile as saveProfileData, getLatestMeasurement, addBodyMeasurement, getBodyMeasurements, deleteMeasurement } from '@/utils/storage';
import type { ProfileData, BodyMeasurement } from '@/types';
import { refreshIcons } from '@/utils/icons';

// ==========================================
// CARGAR PERFIL
// ==========================================

export function loadProfile(): void {
  const profile = getProfile();

  if (profile.name) {
    const nameInput = document.getElementById('profileName') as HTMLInputElement;
    if (nameInput) nameInput.value = profile.name;
  }

  if (profile.birthdate) {
    const birthdateInput = document.getElementById(
      'profileBirthdate'
    ) as HTMLInputElement;
    if (birthdateInput) {
      birthdateInput.value = profile.birthdate;
      calculateAge();
    }
  }

  if (profile.gender) {
    const genderSelect = document.getElementById(
      'profileGender'
    ) as HTMLSelectElement;
    if (genderSelect) genderSelect.value = profile.gender;
  }

  if (profile.weight) {
    const weightInput = document.getElementById(
      'profileWeight'
    ) as HTMLInputElement;
    if (weightInput) weightInput.value = String(profile.weight);
  }

  if (profile.height) {
    const heightInput = document.getElementById(
      'profileHeight'
    ) as HTMLInputElement;
    if (heightInput) heightInput.value = String(profile.height);
  }

  if (profile.activity) {
    const activitySelect = document.getElementById(
      'profileActivity'
    ) as HTMLSelectElement;
    if (activitySelect) activitySelect.value = String(profile.activity);
  }
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
  const today = new Date().toISOString().split('T')[0];
  const birthdateInput = document.getElementById(
    'profileBirthdate'
  ) as HTMLInputElement;

  if (birthdateInput) {
    birthdateInput.setAttribute('max', today);

    // Min = 100 años atrás
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 100);
    birthdateInput.setAttribute('min', minDate.toISOString().split('T')[0]);

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

export function openMeasurementsModal(): void {
  const modal = document.getElementById('measurementsModal');
  const dateEl = document.getElementById('measurementDate');
  const form = document.getElementById('measurementsForm') as HTMLFormElement;

  if (!modal) return;

  // Set current date
  const today = new Date();
  if (dateEl) {
    dateEl.textContent = today.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // Pre-fill with profile weight if available
  const profile = getProfile();
  const weightInput = document.getElementById('measureWeight') as HTMLInputElement;
  if (weightInput && profile.weight) {
    weightInput.value = String(profile.weight);
  }

  // Pre-fill with latest measurement values if available
  const latest = getLatestMeasurement();
  if (latest) {
    const fields: (keyof BodyMeasurement)[] = ['neck', 'chest', 'waist', 'hips', 'armLeft', 'armRight', 'thighLeft', 'thighRight'];
    fields.forEach(field => {
      const input = document.getElementById(`measure${field.charAt(0).toUpperCase() + field.slice(1)}`) as HTMLInputElement;
      if (input && latest[field]) {
        input.value = String(latest[field]);
      }
    });
  }

  // Setup form submit
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      saveMeasurement();
      return false;
    };
  }

  // Setup live body fat calculation
  setupBodyFatCalculation();

  modal.classList.add('active');
  refreshIcons();
}

export function closeMeasurementsModal(): void {
  const modal = document.getElementById('measurementsModal');
  if (modal) {
    modal.classList.remove('active');
    // Reset form
    const form = document.getElementById('measurementsForm') as HTMLFormElement;
    if (form) form.reset();
  }
}

function setupBodyFatCalculation(): void {
  const inputs = ['measureWeight', 'measureNeck', 'measureWaist', 'measureHips'];
  inputs.forEach(id => {
    const input = document.getElementById(id) as HTMLInputElement;
    if (input) {
      input.addEventListener('input', calculateBodyFat);
    }
  });
  // Trigger initial calculation
  calculateBodyFat();
}

interface NavyBodyFatInput {
  gender: 'male' | 'female' | null | undefined;
  height: number;
  waist: number;
  neck: number;
  hips?: number;
}

/**
 * Formula Navy para % de grasa corporal (unica implementacion, usada tanto
 * por el preview en vivo como por el guardado de la medicion). Requiere
 * genero explicito: no asume ningun valor por defecto si el perfil no lo
 * tiene configurado.
 */
function calculateNavyBodyFat({
  gender,
  height,
  waist,
  neck,
  hips = 0,
}: NavyBodyFatInput): number | null {
  if (!gender) return null;
  if (!(height > 0) || !(waist > 0) || !(neck > 0)) return null;

  let bodyFat: number | null = null;

  if (gender === 'female') {
    // Female formula: 163.205 * log10(waist + hips - neck) - 97.684 * log10(height) - 78.387
    if (hips > 0 && waist + hips > neck) {
      bodyFat = 163.205 * Math.log10(waist + hips - neck) - 97.684 * Math.log10(height) - 78.387;
    }
  } else {
    // Male formula: 86.010 * log10(waist - neck) - 70.041 * log10(height) + 36.76
    if (waist > neck) {
      bodyFat = 86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(height) + 36.76;
    }
  }

  if (bodyFat === null || !(bodyFat > 0) || bodyFat >= 60) return null;

  return bodyFat;
}

function calculateBodyFat(): void {
  const profile = getProfile();
  const height = profile.height;
  const gender = profile.gender;

  const waist = parseFloat((document.getElementById('measureWaist') as HTMLInputElement)?.value || '0');
  const neck = parseFloat((document.getElementById('measureNeck') as HTMLInputElement)?.value || '0');
  const hips = parseFloat((document.getElementById('measureHips') as HTMLInputElement)?.value || '0');

  const estimateEl = document.getElementById('bodyFatEstimate');
  const valueEl = document.getElementById('bodyFatValue');
  const noteEl = document.getElementById('bodyFatNote');

  if (!estimateEl || !valueEl || !height) return;

  if (!gender) {
    // No calcular con un genero por defecto oculto: pedir explicitamente el dato
    estimateEl.classList.remove('hidden');
    valueEl.textContent = '--%';
    if (noteEl) noteEl.textContent = 'Configura tu género en el perfil para estimar la grasa corporal';
    return;
  }

  const bodyFat = calculateNavyBodyFat({ gender, height, waist, neck, hips });

  if (bodyFat !== null) {
    estimateEl.classList.remove('hidden');
    valueEl.textContent = bodyFat.toFixed(1) + '%';
    if (noteEl) noteEl.textContent = 'Calculado con el método Navy';
  } else {
    estimateEl.classList.add('hidden');
  }
}

function saveMeasurement(): void {
  const profile = getProfile();

  const measurement: BodyMeasurement = {
    date: new Date().toISOString(),
    weight: parseFloat((document.getElementById('measureWeight') as HTMLInputElement)?.value || '0') || undefined,
    neck: parseFloat((document.getElementById('measureNeck') as HTMLInputElement)?.value || '0') || undefined,
    chest: parseFloat((document.getElementById('measureChest') as HTMLInputElement)?.value || '0') || undefined,
    waist: parseFloat((document.getElementById('measureWaist') as HTMLInputElement)?.value || '0') || undefined,
    hips: parseFloat((document.getElementById('measureHips') as HTMLInputElement)?.value || '0') || undefined,
    armLeft: parseFloat((document.getElementById('measureArmLeft') as HTMLInputElement)?.value || '0') || undefined,
    armRight: parseFloat((document.getElementById('measureArmRight') as HTMLInputElement)?.value || '0') || undefined,
    thighLeft: parseFloat((document.getElementById('measureThighLeft') as HTMLInputElement)?.value || '0') || undefined,
    thighRight: parseFloat((document.getElementById('measureThighRight') as HTMLInputElement)?.value || '0') || undefined,
  };

  // Calcular grasa corporal solo si el perfil tiene genero configurado
  // (sin defaults ocultos — misma formula que el preview en vivo)
  const height = profile.height;
  const gender = profile.gender;

  const bodyFat = calculateNavyBodyFat({
    gender,
    height: height || 0,
    waist: measurement.waist || 0,
    neck: measurement.neck || 0,
    hips: measurement.hips || 0,
  });

  if (bodyFat !== null) {
    measurement.bodyFat = bodyFat;
  }

  addBodyMeasurement(measurement);

  // Sync weight to profile if changed
  if (measurement.weight && measurement.weight !== profile.weight) {
    const weightInput = document.getElementById('profileWeight') as HTMLInputElement;
    if (weightInput) {
      weightInput.value = String(measurement.weight);
    }
    saveProfileData({
      name: profile.name || '',
      birthdate: profile.birthdate || '',
      gender: profile.gender || 'male',
      weight: measurement.weight,
      height: profile.height || 0,
      activity: profile.activity || 1.2,
    });
  }

  closeMeasurementsModal();
  updateMeasurementPreview();
}

export function updateMeasurementPreview(): void {
  const preview = document.getElementById('latestMeasurementPreview');
  if (!preview) return;

  const latest = getLatestMeasurement();
  if (!latest) {
    preview.classList.add('hidden');
    return;
  }

  const date = new Date(latest.date);
  const formattedDate = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  preview.classList.remove('hidden');
  preview.innerHTML = `
    <div class="bg-dark-bg border border-dark-border rounded-xl p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-text-muted">Última medición: ${formattedDate}</span>
        ${latest.bodyFat ? `<span class="text-xs font-medium text-purple-400">${latest.bodyFat.toFixed(1)}% grasa</span>` : ''}
      </div>
      <div class="grid grid-cols-4 gap-2 text-center text-xs">
        ${latest.weight ? `<div><p class="font-bold text-white">${latest.weight}</p><p class="text-text-muted">kg</p></div>` : ''}
        ${latest.chest ? `<div><p class="font-bold text-white">${latest.chest}</p><p class="text-text-muted">pecho</p></div>` : ''}
        ${latest.waist ? `<div><p class="font-bold text-white">${latest.waist}</p><p class="text-text-muted">cintura</p></div>` : ''}
        ${latest.armRight ? `<div><p class="font-bold text-white">${latest.armRight}</p><p class="text-text-muted">brazo</p></div>` : ''}
      </div>
    </div>
  `;

  refreshIcons();
}

export function showMeasurementsHistory(): void {
  const modal = document.getElementById('measurementsHistoryModal');
  const list = document.getElementById('measurementsHistoryList');

  if (!modal || !list) return;

  const measurements = getBodyMeasurements();

  if (measurements.length === 0) {
    list.innerHTML = `
      <div class="text-center py-8">
        <i data-lucide="ruler" class="w-12 h-12 text-text-muted mx-auto mb-3"></i>
        <p class="text-text-secondary">No hay mediciones registradas</p>
        <p class="text-xs text-text-muted mt-1">Registra tu primera medición</p>
      </div>
    `;
  } else {
    list.innerHTML = measurements.map(m => {
      const date = new Date(m.date);
      const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

      return `
        <div class="bg-dark-bg border border-dark-border rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-white">${formattedDate}</span>
            <button onclick="window.deleteMeasurementEntry('${m.date}')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-2 text-xs">
            ${m.weight ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.weight} kg</p><p class="text-text-muted">Peso</p></div>` : ''}
            ${m.bodyFat ? `<div class="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-center"><p class="font-bold text-purple-400">${m.bodyFat.toFixed(1)}%</p><p class="text-text-muted">Grasa</p></div>` : ''}
            ${m.neck ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.neck} cm</p><p class="text-text-muted">Cuello</p></div>` : ''}
            ${m.chest ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.chest} cm</p><p class="text-text-muted">Pecho</p></div>` : ''}
            ${m.waist ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.waist} cm</p><p class="text-text-muted">Cintura</p></div>` : ''}
            ${m.hips ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.hips} cm</p><p class="text-text-muted">Cadera</p></div>` : ''}
            ${m.armLeft ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.armLeft} cm</p><p class="text-text-muted">Brazo Izq</p></div>` : ''}
            ${m.armRight ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.armRight} cm</p><p class="text-text-muted">Brazo Der</p></div>` : ''}
            ${m.thighLeft ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.thighLeft} cm</p><p class="text-text-muted">Muslo Izq</p></div>` : ''}
            ${m.thighRight ? `<div class="bg-dark-surface rounded-lg p-2 text-center"><p class="font-bold text-white">${m.thighRight} cm</p><p class="text-text-muted">Muslo Der</p></div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  modal.classList.add('active');
  refreshIcons();
}

export function closeMeasurementsHistoryModal(): void {
  const modal = document.getElementById('measurementsHistoryModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

export function deleteMeasurementEntry(date: string): void {
  if (confirm('¿Eliminar esta medición?')) {
    deleteMeasurement(date);
    showMeasurementsHistory(); // Refresh the list
    updateMeasurementPreview(); // Update preview
  }
}
