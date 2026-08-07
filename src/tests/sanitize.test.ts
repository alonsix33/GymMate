import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../utils/sanitize';
import { renderExercise, renderHistoryItem, renderPRItem } from '../ui/components';
import type { ExerciseData, HistorySession, MuscleGroup } from '../types';

// ==========================================
// escapeHtml() — función centralizada (UI-01/UI-02/GAM2-10/WKT-10)
// ==========================================

describe('escapeHtml', () => {
  it('escapes angle brackets so a <script> tag cannot be injected', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('escapes double quotes so an HTML attribute cannot be broken out of', () => {
    expect(escapeHtml('"><img src=x onerror=alert(1)>')).toBe(
      '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'
    );
  });

  it('escapes single quotes so an onclick=\'fn(...)\' string cannot be broken out of (UI-02)', () => {
    expect(escapeHtml("Curl'); alert(document.cookie); //")).toBe(
      'Curl&#39;); alert(document.cookie); //'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Press & Curl')).toBe('Press &amp; Curl');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Press Banca')).toBe('Press Banca');
  });
});

// ==========================================
// UI-01 / WKT-10 — renderExercise() con nombre malicioso
// ==========================================

describe('renderExercise (UI-01/WKT-10) — nombre de ejercicio malicioso', () => {
  const maliciousName = `<script>alert(1)</script>Curl'"`;

  const ejercicio: ExerciseData = {
    nombre: maliciousName,
    sets: 3,
    reps: 10,
    peso: 20,
    esMancuerna: false,
    grupoMuscular: 'Bíceps' as MuscleGroup,
    volumen: 600,
    completado: false,
  };

  it('nunca contiene un <script> crudo del input de usuario', () => {
    const html = renderExercise(ejercicio, 0);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('al insertarse en el DOM real, el payload no se ejecuta ni rompe la estructura', () => {
    document.body.innerHTML = '<div id="container"></div>';
    const container = document.getElementById('container')!;
    container.innerHTML = renderExercise(ejercicio, 0);

    // El navegador no debe haber creado un <script> ejecutable real
    expect(container.querySelector('script')).toBeNull();

    // El nombre debe aparecer como texto literal, no como markup
    const title = document.getElementById('nombre-0');
    expect(title?.textContent).toBe(maliciousName);
  });
});

// ==========================================
// UI-01 — renderHistoryItem() con nombre de rutina malicioso
// ==========================================

describe('renderHistoryItem (UI-01) — nombre de rutina/grupo malicioso', () => {
  it('escapa el nombre del grupo antes de renderizar', () => {
    const session: HistorySession = {
      date: new Date().toISOString(),
      grupo: '"><img src=x onerror=alert(1)>',
      ejercicios: [],
      volumenTotal: 100,
      volumenPorGrupo: {},
      type: 'weights',
    };

    const html = renderHistoryItem(session, 0);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });
});

// ==========================================
// GAM2-10 (patrón compartido) — renderPRItem() con nombre malicioso
// ==========================================

describe('renderPRItem (UI-01) — nombre de ejercicio malicioso', () => {
  it('escapa el nombre antes de renderizar', () => {
    const html = renderPRItem("Curl'); alert(1); //", {
      peso: 20,
      sets: 3,
      reps: 10,
      volumen: 600,
      date: new Date().toISOString(),
    });
    expect(html).not.toContain("Curl'); alert(1); //");
    expect(html).toContain('Curl&#39;');
  });
});
