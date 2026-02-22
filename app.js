/**
 * SIMULADOR RLC — app.js
 * Universidad de Oriente, Cuba
 * Ing. José Vicet · Jiménez Matos
 * v4.0.0
 *
 * CORRECCIONES respecto a versión anterior:
 *  1. Señal cuadrada añadida en UI y en lógica de dibujo.
 *  2. Respuesta al escalón: caso de amortiguamiento crítico sin división por cero.
 *  3. Zoom aplicado efectivamente en todas las vistas (variable state.zoom).
 *  4. loadState() restaura unidades correctamente desde el estado guardado.
 *  5. Factor Q corregido según topología: serie Q=(1/R)√(L/C), paralelo Q=R√(C/L).
 *  6. Ganancia H calculada según preset activo (PB, PA, PBanda, Notch).
 *  7. Escala del diagrama de Nyquist adaptativa.
 *  8. updateAllValues() protegido contra inputs parasíticos inexistentes en DOM.
 *  9. Animación fasorial usa valores reales del estado del circuito.
 * 10. Slider de frecuencia con escala logarítmica.
 * 11. Indicador de carga en botón Simular.
 * 12. Ecuación de Q actualizada según topología activa.
 */

'use strict';

/* ============================================================
   CONSTANTES
   ============================================================ */
const STORAGE_KEY = 'rlc-simulator-state-v4';
const FREQ_LOG_MIN = 1;        // Hz
const FREQ_LOG_MAX = 1e6;      // Hz

/** Mapeo de IDs con guiones a claves del estado */
const KEY_MAP = { 'esr-c': 'esrC', 'esl-c': 'eslC', 'esr-l': 'esrL' };

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const state = {
    // Componentes (valores físicos en SI)
    R:    100,
    L:    0.01,
    C:    10e-6,
    freq: 1000,
    amp:  10,
    // Unidades seleccionadas (para persistencia correcta)
    unitR:    1,
    unitL:    0.001,
    unitC:    1e-6,
    unitFreq: 1000,
    unitAmp:  1,
    unitEsrC: 1,
    unitEslC: 1e-9,
    unitEsrL: 1,
    // Configuración
    topology:      'series',
    signalType:    'sine',
    activePreset:  'lpf',
    vizMode:       'time',
    zoom:          1,
    useParasitics: false,
    esrC: 0.1,
    eslC: 10e-9,
    esrL: 0.5,
    showFFT:   true,
    normalize: true,
    // Resultados derivados
    f0: 0, Q: 0, BW: 0
};

/* ============================================================
   PERSISTENCIA
   ============================================================ */
function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('localStorage no disponible:', e); }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        Object.assign(state, saved);
        restoreUI();
        showToast('Configuración anterior restaurada');
    } catch (e) {
        console.warn('Error al cargar estado:', e);
    }
}

/** Restaura todos los controles de la UI desde state */
function restoreUI() {
    // Componentes numéricos con sus unidades guardadas
    setInputWithUnit('R',    state.R    / state.unitR,    'unit-R',    state.unitR);
    setInputWithUnit('L',    state.L    / state.unitL,    'unit-L',    state.unitL);
    setInputWithUnit('C',    state.C    / state.unitC,    'unit-C',    state.unitC);
    setInputWithUnit('freq', state.freq / state.unitFreq, 'unit-freq', state.unitFreq);
    setInputWithUnit('amp',  state.amp  / state.unitAmp,  'unit-amp',  state.unitAmp);

    document.getElementById('topology').value = state.topology;

    if (state.useParasitics) {
        document.getElementById('parasitic-toggle').classList.add('active');
        document.getElementById('parasitic-controls').classList.remove('hidden');
        setInputWithUnit('esr-c', state.esrC / state.unitEsrC, 'unit-esr-c', state.unitEsrC);
        setInputWithUnit('esl-c', state.eslC / state.unitEslC, 'unit-esl-c', state.unitEslC);
        setInputWithUnit('esr-l', state.esrL / state.unitEsrL, 'unit-esr-l', state.unitEsrL);
    }

    document.getElementById('show-fft').checked = state.showFFT;
    document.getElementById('normalize').checked = state.normalize;

    // Preset activo
    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
    const pCard = document.getElementById(`preset-${state.activePreset}`);
    if (pCard) pCard.classList.add('active');

    // Señal activa
    document.querySelectorAll('.signal-btn').forEach(b => b.classList.remove('active'));
    const sBtn = document.getElementById(`btn-${state.signalType}`);
    if (sBtn) sBtn.classList.add('active');

    // Slider de frecuencia logarítmico
    syncFreqSlider();
}

function setInputWithUnit(inputId, displayValue, selectId, factorValue) {
    const inp = document.getElementById(inputId);
    const sel = document.getElementById(selectId);
    if (!inp || !sel) return;
    inp.value = +displayValue.toFixed(6);
    // Buscar la opción cuyo value corresponde al factor
    for (const opt of sel.options) {
        if (Math.abs(parseFloat(opt.value) - factorValue) < factorValue * 1e-6) {
            sel.value = opt.value;
            break;
        }
    }
    sel.dataset.unit = factorValue;
}

function saveSimulation() {
    saveState();
    showToast('Simulación guardada');
    if (navigator.vibrate) navigator.vibrate(50);
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function toggleNav() {
    const drawer = document.getElementById('navDrawer');
    const isActive = drawer.classList.toggle('active');
    drawer.setAttribute('aria-hidden', String(!isActive));
    document.body.style.overflow = isActive ? 'hidden' : '';
}

function closeNavOnOverlay(e) {
    if (e.target === e.currentTarget) toggleNav();
}

function selectNavLink(link, mode) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    showToast(`Modo ${mode} seleccionado`);
    setTimeout(toggleNav, 300);
}

/* ============================================================
   TABS
   ============================================================ */
function switchTab(btn, panelId) {
    btn.parentElement.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`tab-${panelId}`).classList.remove('hidden');
}

function switchVizTab(btn, mode) {
    btn.parentElement.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');

    state.vizMode = mode;

    const titles = {
        time:    '📈 Respuesta Temporal',
        phasor:  '🔄 Diagrama Fasorial',
        bode:    '📊 Diagrama de Bode',
        nyquist: '🎯 Diagrama de Nyquist',
        fft:     '🔊 Espectro de Frecuencias'
    };
    document.getElementById('viz-title').textContent = titles[mode] || mode;

    const canvas = document.getElementById('main-canvas');
    const svg    = document.getElementById('phasor-svg');

    if (mode === 'phasor') {
        canvas.classList.add('hidden');
        svg.classList.remove('hidden');
        startPhasorAnimation();
    } else {
        canvas.classList.remove('hidden');
        svg.classList.add('hidden');
        stopPhasorAnimation();
        drawCanvas();
    }
}

/* ============================================================
   PRESETS
   ============================================================ */
function selectPreset(card, type) {
    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    state.activePreset = type;

    const presets = {
        lpf:   { R: 100, L: 10e-3, C: 10e-6,  topology: 'series',   unitL: 0.001, unitC: 1e-6 },
        hpf:   { R: 100, L: 1e-3,  C: 10e-6,  topology: 'series',   unitL: 0.001, unitC: 1e-6 },
        bpf:   { R: 50,  L: 10e-3, C: 10e-6,  topology: 'series',   unitL: 0.001, unitC: 1e-6 },
        notch: { R: 100, L: 10e-3, C: 10e-6,  topology: 'parallel', unitL: 0.001, unitC: 1e-6 }
    };

    const p = presets[type];
    if (!p) return;

    state.R = p.R; state.L = p.L; state.C = p.C; state.topology = p.topology;
    state.unitL = p.unitL; state.unitC = p.unitC;

    document.getElementById('topology').value = p.topology;
    setInputWithUnit('R', p.R,             'unit-R', state.unitR);
    setInputWithUnit('L', p.L / p.unitL,   'unit-L', p.unitL);
    setInputWithUnit('C', p.C / p.unitC,   'unit-C', p.unitC);

    syncSlider('R');
    syncSlider('L');
    syncSlider('C');

    updateQEquation();
    calculateResults();
    drawCanvas();
    showToast(`Preset ${type.toUpperCase()} cargado`);
    saveState();
}

/* ============================================================
   SEÑAL DE EXCITACIÓN
   ============================================================ */
function selectSignal(type) {
    state.signalType = type;
    document.querySelectorAll('.signal-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-${type}`);
    if (btn) btn.classList.add('active');
    drawCanvas();
    saveState();
}

/* ============================================================
   PARÁSITOS
   ============================================================ */
function toggleParasitics() {
    state.useParasitics = !state.useParasitics;
    const toggle   = document.getElementById('parasitic-toggle');
    const controls = document.getElementById('parasitic-controls');

    toggle.classList.toggle('active', state.useParasitics);
    controls.classList.toggle('hidden', !state.useParasitics);

    if (state.useParasitics) {
        // Inicializar inputs parasíticos con valores actuales
        setInputWithUnit('esr-c', state.esrC / state.unitEsrC, 'unit-esr-c', state.unitEsrC);
        setInputWithUnit('esl-c', state.eslC / state.unitEslC, 'unit-esl-c', state.unitEslC);
        setInputWithUnit('esr-l', state.esrL / state.unitEsrL, 'unit-esr-l', state.unitEsrL);
        updateDisplayValue('esr-c');
        updateDisplayValue('esl-c');
        updateDisplayValue('esr-l');
    }

    calculateResults();
    drawCanvas();
    saveState();
}

function toggleFFT() {
    state.showFFT = document.getElementById('show-fft').checked;
    if (state.vizMode === 'fft') drawCanvas();
    saveState();
}

/* ============================================================
   CONVERSIÓN DE UNIDADES
   ============================================================ */
function updateUnit(id) {
    const input     = document.getElementById(id);
    const unitSel   = document.getElementById(`unit-${id}`);
    const oldFactor = parseFloat(unitSel.dataset.unit) || 1;
    const newFactor = parseFloat(unitSel.value);

    // Mantener el valor físico constante, sólo cambiar la presentación
    const physVal    = parseFloat(input.value) * oldFactor;
    const precision  = getPrecision(id);
    input.value      = (physVal / newFactor).toFixed(precision);

    unitSel.dataset.unit = newFactor;
    saveUnitToState(id, newFactor);
    updateSliderRange(id, newFactor);
    updateValue(id);
}

function saveUnitToState(id, factor) {
    const unitKeys = {
        R: 'unitR', L: 'unitL', C: 'unitC', freq: 'unitFreq', amp: 'unitAmp',
        'esr-c': 'unitEsrC', 'esl-c': 'unitEslC', 'esr-l': 'unitEsrL'
    };
    const key = unitKeys[id];
    if (key) state[key] = factor;
}

function getPrecision(id) {
    if (['L', 'C', 'esl-c'].includes(id)) return 4;
    if (id === 'freq') return 3;
    if (['esr-c', 'esr-l'].includes(id)) return 3;
    return 2;
}

function updateSliderRange(id, factor) {
    const slider = document.getElementById(`slider-${id}`);
    if (!slider) return;
    const ranges = {
        R:     { min: 1, max: 1000, baseUnit: 1 },
        L:     { min: 0.1, max: 1000, baseUnit: 0.001 },
        C:     { min: 0.1, max: 1000, baseUnit: 1e-6 },
        amp:   { min: 0.001, max: 100, baseUnit: 1 }
    };
    const r = ranges[id];
    if (!r) return;
    const ratio = r.baseUnit / factor;
    slider.min   = r.min * ratio;
    slider.max   = r.max * ratio;
    const inp = document.getElementById(id);
    slider.value = inp ? inp.value : slider.min;
}

function updateValue(id) {
    const input   = document.getElementById(id);
    if (!input) return;
    const unitSel = document.getElementById(`unit-${id}`);
    const factor  = unitSel ? parseFloat(unitSel.value) : 1;
    let phys      = parseFloat(input.value) * factor;

    // Clamping mínimos para evitar división por cero
    const mins = { R: 1e-6, L: 1e-12, C: 1e-12, esrC: 1e-6, eslC: 1e-12, esrL: 1e-6 };
    const stKey = KEY_MAP[id] || id;
    phys = Math.max(phys, mins[stKey] ?? 0);
    state[stKey] = phys;

    updateDisplayValue(id);
    syncSlider(id);

    if (id === 'topology') updateQEquation();
    calculateResults();
    drawCanvas();
    saveState();
}

function updateDisplayValue(id) {
    const input   = document.getElementById(id);
    const display = document.getElementById(`val-${id}`);
    const unitSel = document.getElementById(`unit-${id}`);
    if (!display || !input) return;
    const unitText = unitSel ? unitSel.selectedOptions[0].text : '';
    display.textContent = `${input.value} ${unitText}`;
}

function syncSlider(id) {
    const slider = document.getElementById(`slider-${id}`);
    const input  = document.getElementById(id);
    if (slider && input) slider.value = input.value;
}

function updateFromSlider(id, val) {
    const input = document.getElementById(id);
    if (input) input.value = val;
    updateValue(id);
}

/* FIX: Slider de frecuencia logarítmico (0–100 mapea a FREQ_LOG_MIN–FREQ_LOG_MAX) */
function updateFreqFromLogSlider(sliderVal) {
    const logMin = Math.log10(FREQ_LOG_MIN);
    const logMax = Math.log10(FREQ_LOG_MAX);
    const logF   = logMin + (sliderVal / 100) * (logMax - logMin);
    const freqHz = Math.pow(10, logF);

    const unitSel  = document.getElementById('unit-freq');
    const factor   = unitSel ? parseFloat(unitSel.value) : 1;
    const freqDisp = freqHz / factor;

    document.getElementById('freq').value = freqDisp.toFixed(getPrecision('freq'));
    state.freq      = freqHz;
    state.unitFreq  = factor;
    updateDisplayValue('freq');
    calculateResults();
    drawCanvas();
    saveState();
}

function syncFreqSlider() {
    const logMin = Math.log10(FREQ_LOG_MIN);
    const logMax = Math.log10(FREQ_LOG_MAX);
    const logF   = Math.log10(Math.max(state.freq, FREQ_LOG_MIN));
    const sliderVal = ((logF - logMin) / (logMax - logMin)) * 100;
    const slider = document.getElementById('slider-freq');
    if (slider) slider.value = Math.min(100, Math.max(0, sliderVal));
}

function updateAllValues() {
    ['R', 'L', 'C', 'freq', 'amp'].forEach(id => updateValue(id));
    // FIX: sólo actualizar parásitos si los controles existen y están visibles
    if (state.useParasitics) {
        ['esr-c', 'esl-c', 'esr-l'].forEach(id => {
            if (document.getElementById(id)) updateValue(id);
        });
    }
    document.getElementById('topology').dispatchEvent(new Event('change'));
}

function updateCircuit() {
    state.topology = document.getElementById('topology').value;
    state.normalize = document.getElementById('normalize').checked;
    updateQEquation();
    calculateResults();
    drawCanvas();
    saveState();
}

/* ============================================================
   ECUACIÓN DE Q — actualiza según topología activa
   ============================================================ */
function updateQEquation() {
    const el = document.getElementById('eq-Q');
    if (!el) return;
    if (state.topology === 'parallel') {
        el.innerHTML = '<strong>Q</strong> = R√(C/L)';
    } else {
        el.innerHTML = '<strong>Q</strong> = (1/R)√(L/C)';
    }
}

/* ============================================================
   CÁLCULOS PRINCIPALES
   ============================================================ */
function calculateResults() {
    const R = Math.max(state.R, 1e-6);
    const C = Math.max(state.C, 1e-12);
    let   L = Math.max(state.L, 1e-12);

    // Efectos parásitos
    let R_eff = R, L_eff = L, C_eff = C;
    if (state.useParasitics) {
        R_eff = Math.max(R + state.esrC + state.esrL, 1e-6);
        L_eff = Math.max(L + state.eslC, 1e-12);
    }

    // Frecuencia de resonancia
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L_eff * C_eff));
    state.f0 = f0;

    // FIX: Factor Q correcto según topología
    const Q = (state.topology === 'parallel')
        ? R_eff * Math.sqrt(C_eff / L_eff)          // Q paralelo
        : (1 / R_eff) * Math.sqrt(L_eff / C_eff);   // Q serie

    state.Q  = Q;
    state.BW = f0 / Q;

    // Impedancia a frecuencia de operación
    const w  = 2 * Math.PI * Math.max(state.freq, 0.01);
    const XL = w * L_eff;
    const XC = 1 / (w * C_eff);
    let Z_mag, phase;

    if (state.topology === 'series') {
        Z_mag = Math.sqrt(R_eff * R_eff + Math.pow(XL - XC, 2));
        phase = Math.atan2(XL - XC, R_eff) * 180 / Math.PI;
    } else {
        const Y_R = 1 / R_eff, Y_L = 1 / XL, Y_C = 1 / XC;
        const Y_mag = Math.sqrt(Y_R * Y_R + Math.pow(Y_C - Y_L, 2));
        Z_mag = 1 / Y_mag;
        phase = -Math.atan2(Y_C - Y_L, Y_R) * 180 / Math.PI;
    }

    // FIX: Ganancia H según preset activo
    const u  = state.freq / f0;     // relación normalizada f/f0
    const Qu = Q;
    const gain_dB = computeGaindB(u, Qu);

    // Actualizar UI
    document.getElementById('res-f0').innerHTML    = formatFrequency(f0);
    document.getElementById('res-Q').textContent   = Q.toFixed(2);
    document.getElementById('res-BW').innerHTML    = formatFrequency(state.BW);
    document.getElementById('res-Z').innerHTML     = formatImpedance(Z_mag);
    document.getElementById('res-gain').innerHTML  = `${gain_dB.toFixed(1)}<span class="result-unit">dB</span>`;
    document.getElementById('res-phase').textContent = `${phase.toFixed(1)}°`;

    updateResonanceStatus();
    updateZoomIndicator();
}

/** FIX: Ganancia según preset/topología */
function computeGaindB(u, Q) {
    // u = f/f0, Q = factor de calidad
    const denom = Math.sqrt(Math.pow(1 - u * u, 2) + Math.pow(u / Q, 2));
    let H;
    switch (state.activePreset) {
        case 'hpf':   H = (u * u) / denom; break;          // Pasa-altos
        case 'bpf':   H = (u / Q)  / denom; break;         // Pasa-banda
        case 'notch': H = Math.abs(1 - u * u) / denom; break; // Rechaza-banda
        default:      H = 1 / denom; break;                // Pasa-bajos (lpf)
    }
    return 20 * Math.log10(Math.max(H, 1e-10));
}

function updateResonanceStatus() {
    const freq = state.freq, f0 = state.f0;
    const ratio = Math.abs(freq - f0) / f0;
    const box   = document.getElementById('resonance-status');
    const ind   = document.getElementById('resonance-indicator');
    const card  = document.getElementById('card-f0');

    let iconClass, color, title, sub;

    if (ratio < 0.05) {
        iconClass = 'rs-green'; color = 'var(--success)';
        title = 'En Resonancia'; sub = 'Máxima transferencia de potencia';
        ind.style.display = 'block'; card.classList.add('highlight');
    } else if (freq < f0) {
        iconClass = 'rs-warning'; color = 'var(--warning)';
        title = 'Bajo f₀'; sub = 'Comportamiento capacitivo';
        ind.style.display = 'none'; card.classList.remove('highlight');
    } else {
        iconClass = 'rs-accent'; color = 'var(--accent)';
        title = 'Sobre f₀'; sub = 'Comportamiento inductivo';
        ind.style.display = 'none'; card.classList.remove('highlight');
    }

    const symbol = ratio < 0.05 ? '✓' : (freq < f0 ? '↓' : '↑');
    const bgs = {
        'rs-green':   ['rgba(5,150,105,.1)',   'rgba(5,150,105,.05)',   'rgba(5,150,105,.2)'],
        'rs-warning': ['rgba(217,119,6,.1)',    'rgba(217,119,6,.05)',   'rgba(217,119,6,.2)'],
        'rs-accent':  ['rgba(124,58,237,.1)',   'rgba(124,58,237,.05)',  'rgba(124,58,237,.2)']
    };
    const [c1, c2, border] = bgs[iconClass];

    box.style.background   = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
    box.style.border       = `1px solid ${border}`;
    box.innerHTML = `
        <div class="rs-icon ${iconClass}">${symbol}</div>
        <div>
            <div class="rs-title" style="color:${color}">${title}</div>
            <div class="rs-sub">${sub}</div>
        </div>`;
}

/* ============================================================
   SIMULACIÓN (botón ▶)
   ============================================================ */
function runSimulation() {
    const btn = document.getElementById('btn-simulate');
    btn.disabled = true;
    btn.textContent = '⏳ Calculando...';

    // Diferir un tick para que el DOM actualice el botón
    setTimeout(() => {
        calculateResults();
        drawCanvas();
        btn.disabled = false;
        btn.textContent = '▶ Simular';
        showToast('Simulación completada');
        if (navigator.vibrate) navigator.vibrate(50);
    }, 20);
}

function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
}

/* ============================================================
   ZOOM
   ============================================================ */
function zoomIn()    { state.zoom = Math.min(state.zoom * 1.5, 16); drawCanvas(); updateZoomIndicator(); }
function zoomOut()   { state.zoom = Math.max(state.zoom / 1.5, 0.25); drawCanvas(); updateZoomIndicator(); }
function zoomReset() { state.zoom = 1; drawCanvas(); updateZoomIndicator(); }

function updateZoomIndicator() {
    const el = document.getElementById('zoom-indicator');
    if (el) el.textContent = `Zoom: ${state.zoom.toFixed(2)}×`;
}

/* ============================================================
   CANVAS — utilidades
   ============================================================ */
function getThemeColors() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
        axis:       dark ? '#94a3b8' : '#475569',
        grid:       dark ? '#334155' : '#e2e8f0',
        text:       dark ? '#f8fafc' : '#0f172a',
        background: dark ? '#1e293b' : '#f8fafc'
    };
}

function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const canvas    = document.getElementById('main-canvas');
    const dpr  = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const W = rect.width  - 32;
    const H = rect.height - 32;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, W, H };
}

function drawGrid(ctx, W, H, colors) {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
        const x = (i / 10) * W;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let i = 1; i < 5; i++) {
        const y = (i / 5) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
}

function drawCanvas() {
    if (state.vizMode === 'phasor') return;
    if (!state.f0) calculateResults();

    const { ctx, W, H } = resizeCanvas();
    const colors = getThemeColors();
    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H, colors);

    switch (state.vizMode) {
        case 'time':    drawTimeDomain(ctx, W, H, colors); break;
        case 'bode':    drawBode(ctx, W, H, colors);       break;
        case 'nyquist': drawNyquist(ctx, W, H, colors);    break;
        case 'fft':     drawFFT(ctx, W, H, colors);        break;
    }
}

/* ============================================================
   VISTA TEMPORAL — FIX crítico amortiguamiento + zoom aplicado
   ============================================================ */
function drawTimeDomain(ctx, W, H, colors) {
    const amp   = state.amp;
    const freq  = Math.max(state.freq, 1);
    const omega = 2 * Math.PI * freq;

    // FIX: zoom controla cuántos periodos se muestran
    const periods = 3 / state.zoom;
    const points  = Math.min(W, 600);

    let inputFn, outputFn;

    if (state.signalType === 'sine') {
        const Z   = Math.sqrt(state.R ** 2 + (omega * state.L - 1 / (omega * state.C)) ** 2);
        const phi = Math.atan2(omega * state.L - 1 / (omega * state.C), state.R);
        const H_  = state.R / Z; // ganancia como divisor resistivo (Vr/Vin) para pasa-banda
        inputFn  = t => amp * Math.sin(omega * t);
        outputFn = t => amp * H_ * Math.sin(omega * t - phi);

    } else if (state.signalType === 'square') {
        // Suma de Fourier (5 armónicos impares)
        const harmonics = [1, 3, 5, 7, 9];
        inputFn = t => {
            let v = 0;
            harmonics.forEach(n => { v += (4 / (n * Math.PI)) * Math.sin(n * omega * t); });
            return amp * v / (4 / Math.PI); // normalizar a amplitud amp
        };
        outputFn = t => {
            let v = 0;
            harmonics.forEach(n => {
                const wn   = n * omega;
                const Zn   = Math.sqrt(state.R ** 2 + (wn * state.L - 1 / (wn * state.C)) ** 2);
                const Hn   = state.R / Zn;
                const phin = Math.atan2(wn * state.L - 1 / (wn * state.C), state.R);
                v += Hn * (4 / (n * Math.PI)) * Math.sin(n * omega * t - phin);
            });
            return amp * v / (4 / Math.PI);
        };

    } else if (state.signalType === 'step') {
        const R   = Math.max(state.R, 1e-6);
        const L   = Math.max(state.L, 1e-12);
        const C   = Math.max(state.C, 1e-12);
        const w0  = 1 / Math.sqrt(L * C);
        const al  = R / (2 * L);
        const zt  = al / w0; // amortiguamiento relativo (ζ = α/ω0)

        inputFn = t => amp * (t >= 0 ? 1 : 0);

        if (zt < 0.9999) {
            // Sub-amortiguado
            const wd = w0 * Math.sqrt(1 - zt * zt);
            outputFn = t => t < 0 ? 0 :
                amp * (1 - Math.exp(-al * t) * (Math.cos(wd * t) + (al / wd) * Math.sin(wd * t)));
        } else if (zt > 1.0001) {
            // Sobre-amortiguado
            const s1 = -al + Math.sqrt(al * al - w0 * w0);
            const s2 = -al - Math.sqrt(al * al - w0 * w0);
            outputFn = t => t < 0 ? 0 :
                amp * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
        } else {
            // FIX: Caso crítico (ζ ≈ 1), evita división por cero: y = (1 - e^(-αt)(1+αt))
            outputFn = t => t < 0 ? 0 :
                amp * (1 - Math.exp(-al * t) * (1 + al * t));
        }

    } else {
        // Impulso
        const R   = Math.max(state.R, 1e-6);
        const L   = Math.max(state.L, 1e-12);
        const C   = Math.max(state.C, 1e-12);
        const w0  = 1 / Math.sqrt(L * C);
        const al  = R / (2 * L);
        inputFn = () => 0;
        if (al < w0) {
            const wd = Math.sqrt(w0 * w0 - al * al);
            outputFn = t => t <= 0 ? 0 : (amp / (L * wd)) * Math.exp(-al * t) * Math.sin(wd * t);
        } else {
            outputFn = () => 0;
        }
    }

    // Escalar Y dinámicamente
    let maxAbs = 0;
    for (let i = 0; i <= points; i++) {
        const t  = (i / points) * periods / freq;
        maxAbs = Math.max(maxAbs, Math.abs(inputFn(t)), Math.abs(outputFn(t)));
    }
    if (maxAbs < 1e-12) maxAbs = 1;
    const yScale = (H / 2.5) / maxAbs;

    // Dibujar entrada
    drawSignalLine(ctx, points, W, H, periods, freq, inputFn, '#0369a1', 3, yScale);
    // Dibujar salida
    drawSignalLine(ctx, points, W, H, periods, freq, outputFn, '#059669', 3, yScale);
}

function drawSignalLine(ctx, pts, W, H, periods, freq, fn, color, lw, yScale) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    for (let i = 0; i <= pts; i++) {
        const t = (i / pts) * periods / freq;
        const x = (i / pts) * W;
        const y = H / 2 - fn(t) * yScale;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
}

/* ============================================================
   DIAGRAMA DE BODE — zoom sobre eje frecuencia
   ============================================================ */
function drawBode(ctx, W, H, colors) {
    const f0 = state.f0;
    const Q  = state.Q;
    if (f0 <= 0) return;

    // FIX: zoom estrecha/amplía el rango de décadas mostrado
    const decades  = 4 / state.zoom;
    const logStart = Math.log10(f0) - decades / 2;
    const N        = 300;

    // Magnitud
    ctx.beginPath(); ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 3;
    for (let i = 0; i <= N; i++) {
        const f = Math.pow(10, logStart + (i / N) * decades);
        const u = f / f0;
        const H_ = computeHFromU(u, Q);
        const dB  = 20 * Math.log10(Math.max(H_, 1e-10));
        const x   = (i / N) * W;
        const y   = H - 40 - (dB + 60) * (H - 80) / 60;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fase
    ctx.beginPath(); ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    for (let i = 0; i <= N; i++) {
        const f    = Math.pow(10, logStart + (i / N) * decades);
        const u    = f / f0;
        const ph   = computePhase(u, Q);
        const x    = (i / N) * W;
        const y    = H - 40 - (ph + 180) * (H - 80) / 360;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Línea de f0
    const f0x = ((Math.log10(f0) - logStart) / decades) * W;
    if (f0x > 0 && f0x < W) {
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(f0x, 0); ctx.lineTo(f0x, H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#dc2626'; ctx.font = 'bold 12px sans-serif';
        ctx.fillText('f₀', f0x + 4, 18);
    }

    // Etiquetas dB
    ctx.fillStyle = colors.text; ctx.font = '11px sans-serif';
    [-60, -40, -20, 0, 20].forEach(db => {
        const y = H - 40 - (db + 60) * (H - 80) / 60;
        ctx.fillText(`${db}dB`, 2, y - 2);
    });
}

function computeHFromU(u, Q) {
    const denom = Math.sqrt(Math.pow(1 - u * u, 2) + Math.pow(u / Q, 2));
    switch (state.activePreset) {
        case 'hpf':   return (u * u) / denom;
        case 'bpf':   return (u / Q)  / denom;
        case 'notch': return Math.abs(1 - u * u) / denom;
        default:      return 1 / denom;
    }
}

function computePhase(u, Q) {
    return -Math.atan2(Q * (u - 1 / u), 1) * 180 / Math.PI;
}

/* ============================================================
   DIAGRAMA DE NYQUIST — FIX: escala adaptativa
   ============================================================ */
function drawNyquist(ctx, W, H, colors) {
    const R   = Math.max(state.R, 1e-6);
    const L   = Math.max(state.L, 1e-12);
    const C   = Math.max(state.C, 1e-12);
    const cx  = W / 2, cy = H / 2;
    const N   = 300;

    // FIX: Calcular rango real de Z para escalar dinámicamente
    let maxMag = 0;
    for (let i = 0; i <= N; i++) {
        const logf = 1 + (i / N) * 5; // 10 Hz a 100 kHz
        const f    = Math.pow(10, logf);
        const w    = 2 * Math.PI * f;
        const Zim  = w * L - 1 / (w * C);
        const Zmag = Math.sqrt(R * R + Zim * Zim);
        if (isFinite(Zmag)) maxMag = Math.max(maxMag, Zmag);
    }
    const scale = (Math.min(W, H) * 0.4 / maxMag) * state.zoom;

    // Ejes
    ctx.strokeStyle = colors.axis; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    // Curva de Nyquist
    ctx.beginPath(); ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 3;
    let first = true;
    for (let i = 0; i <= N; i++) {
        const logf  = 1 + (i / N) * 5;
        const f     = Math.pow(10, logf);
        const w     = 2 * Math.PI * f;
        const Zreal = R;
        const Zimag = w * L - 1 / (w * C);
        const x = cx + Zreal * scale;
        const y = cy - Zimag * scale;
        if (!isFinite(x) || !isFinite(y)) continue;
        first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        first = false;
    }
    ctx.stroke();

    // Punto de resonancia
    const w0 = 2 * Math.PI * state.f0;
    const Z0im = w0 * L - 1 / (w0 * C);
    const x0 = cx + R * scale;
    const y0 = cy - Z0im * scale;
    if (isFinite(x0) && isFinite(y0)) {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(x0, y0, 6, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = '#dc2626'; ctx.font = 'bold 12px sans-serif';
        ctx.fillText('ω₀', x0 + 9, y0 - 8);
    }

    // Etiquetas de ejes
    ctx.fillStyle = colors.text; ctx.font = '11px sans-serif';
    ctx.fillText('Re(Z) →', W - 60, cy - 6);
    ctx.fillText('Im(Z)', cx + 6, 16);
}

/* ============================================================
   ESPECTRO FFT
   ============================================================ */
function drawFFT(ctx, W, H, colors) {
    const bins = 256;
    const bw   = W / bins;
    const freq = state.freq;
    const f0   = state.f0;
    const Q    = state.Q;

    // FIX: zoom ajusta el rango de frecuencias visible
    const fs = (10 * freq) / state.zoom;

    ctx.fillStyle = '#0369a1';
    for (let i = 0; i < bins; i++) {
        const binF = (i / bins) * (fs / 2);
        let mag = 0;

        if (state.signalType === 'sine') {
            const det = Math.abs(binF - freq);
            if (det < freq * 0.05) mag = 1 - det / (freq * 0.05);
        } else if (state.signalType === 'square') {
            for (let h = 1; h <= 9; h += 2) {
                if (Math.abs(binF - h * freq) < freq * 0.02) mag += 1 / h;
            }
        } else {
            mag = Math.exp(-Math.abs(binF - freq) / (freq * 0.5));
        }

        const ww = 2 * Math.PI * Math.max(binF, 1);
        const w0 = 2 * Math.PI * f0;
        const u  = ww / w0;
        const Hf = computeHFromU(u, Q);
        mag *= Hf;

        const bh = mag * (H - 40);
        ctx.fillRect(i * bw, H - bh - 20, bw - 1, bh);
    }

    // Etiquetas
    ctx.fillStyle = colors.text; ctx.font = '11px sans-serif';
    ctx.fillText('0', 2, H - 5);
    ctx.fillText(formatFreqShort(fs / 4), W / 2 - 20, H - 5);
    ctx.fillText(formatFreqShort(fs / 2), W - 50, H - 5);
}

function formatFreqShort(f) {
    if (f >= 1e6) return (f / 1e6).toFixed(1) + 'M';
    if (f >= 1e3) return (f / 1e3).toFixed(1) + 'k';
    return f.toFixed(0);
}

/* ============================================================
   DIAGRAMA FASORIAL — FIX: valores reales del circuito
   ============================================================ */
let _phasorAnimId   = null;
let _phasorAngle    = 0;

function startPhasorAnimation() {
    if (_phasorAnimId) return;

    function frame() {
        _phasorAngle += 0.04;

        const R   = Math.max(state.R, 1e-6);
        const L   = Math.max(state.L, 1e-12);
        const C   = Math.max(state.C, 1e-12);
        const w   = 2 * Math.PI * Math.max(state.freq, 1);
        const XL  = w * L;
        const XC  = 1 / (w * C);
        const Z   = Math.sqrt(R * R + (XL - XC) ** 2);
        const Vm  = state.amp;
        const Im  = Vm / Z;
        const phi = Math.atan2(XL - XC, R); // ángulo de Z

        // Magnitudes de fasores en voltaje (normalizadas a px, máx 100px)
        const scale = 95 / Vm;
        const cx = 200, cy = 150;

        const angle = _phasorAngle;

        // V entrada
        setFasorLine('ph-V',  cx, cy, Vm * scale,        angle,      '#0369a1');
        // I (adelantada o retrasada respecto a V según Z)
        const Im_scale = 95 / Math.max(Im, 1e-12);
        // Para visualizar I en la misma escala que V: usamos VR = R*Im
        const Vr = R * Im;
        const Vl_mag = XL * Im;
        const Vc_mag = XC * Im;

        const pxScale = 95 / Math.max(Vm, Vr, Vl_mag, Vc_mag, 1e-12);

        setFasorLine('ph-V',  cx, cy, Vm * pxScale,       angle,           '#0369a1');
        setFasorLine('ph-I',  cx, cy, Im * pxScale * R,   angle - phi,     '#059669'); // representado como VR dirección
        setFasorLine('ph-VR', cx, cy, Vr * pxScale,       angle - phi,     '#dc2626');
        setFasorLine('ph-VL', cx, cy, Vl_mag * pxScale,   angle - phi + Math.PI/2, '#7c3aed');
        setFasorLine('ph-VC', cx, cy, Vc_mag * pxScale,   angle - phi - Math.PI/2, '#d97706');

        _phasorAnimId = requestAnimationFrame(frame);
    }
    frame();
}

function setFasorLine(id, cx, cy, mag, angle, _color) {
    const el = document.getElementById(id);
    if (!el) return;
    const x2 = cx + mag * Math.cos(angle);
    const y2 = cy - mag * Math.sin(angle);  // eje Y invertido en SVG
    el.setAttribute('x2', x2.toFixed(2));
    el.setAttribute('y2', y2.toFixed(2));
}

function stopPhasorAnimation() {
    if (_phasorAnimId) { cancelAnimationFrame(_phasorAnimId); _phasorAnimId = null; }
}

/* ============================================================
   FORMATEO
   ============================================================ */
function formatFrequency(f) {
    if (f >= 1e6) return `${(f / 1e6).toFixed(2)}<span class="result-unit">MHz</span>`;
    if (f >= 1e3) return `${(f / 1e3).toFixed(2)}<span class="result-unit">kHz</span>`;
    return `${f.toFixed(2)}<span class="result-unit">Hz</span>`;
}

function formatImpedance(z) {
    if (z >= 1e6) return `${(z / 1e6).toFixed(2)}<span class="result-unit">MΩ</span>`;
    if (z >= 1e3) return `${(z / 1e3).toFixed(2)}<span class="result-unit">kΩ</span>`;
    return `${z.toFixed(2)}<span class="result-unit">Ω</span>`;
}

/* ============================================================
   EXPORTACIÓN
   ============================================================ */
function exportViz() {
    document.getElementById('exportModal').classList.add('active');
    document.getElementById('exportModal').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('exportModal').classList.remove('active');
    document.getElementById('exportModal').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function exportData(fmt) {
    const fns = { csv: exportCSV, png: exportPNG, pdf: exportPDF, json: exportJSON, ltspice: exportLTspice };
    if (fns[fmt]) fns[fmt]();
    closeModal();
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportCSV() {
    let csv = 'Frecuencia(Hz),Magnitud(dB),Fase(deg),Impedancia(Ohm)\n';
    for (let i = 0; i <= 100; i++) {
        const f   = Math.pow(10, 1 + i * 0.04);
        const u   = f / state.f0;
        const H_  = computeHFromU(u, state.Q);
        const dB  = 20 * Math.log10(Math.max(H_, 1e-10));
        const ph  = computePhase(u, state.Q);
        const w   = 2 * Math.PI * f;
        const Z   = Math.sqrt(state.R ** 2 + (w * state.L - 1 / (w * state.C)) ** 2);
        csv += `${f.toFixed(2)},${dB.toFixed(4)},${ph.toFixed(4)},${Z.toFixed(4)}\n`;
    }
    downloadFile(csv, 'rlc_response.csv', 'text/csv');
    showToast('CSV exportado');
}

function exportPNG() {
    const canvas = document.getElementById('main-canvas');
    const link   = Object.assign(document.createElement('a'), {
        download: 'rlc_simulation.png',
        href: canvas.toDataURL()
    });
    link.click();
    showToast('Imagen guardada');
}

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Simulación de Circuito RLC', 105, 18, { align: 'center' });
    doc.setFontSize(11);
    doc.text('Universidad de Oriente — Núcleo de Anzoátegui — Cuba', 105, 26, { align: 'center' });
    doc.text('Desarrolladores: Ing. José Vicet · Jiménez Matos', 105, 32, { align: 'center' });
    doc.text(`Fecha: ${new Date().toLocaleString()}`, 105, 38, { align: 'center' });

    doc.setFontSize(13); doc.text('Parámetros:', 20, 50);
    doc.setFontSize(10);
    const params = [
        `Topología: ${state.topology}`,
        `R = ${state.R} Ω  |  L = ${(state.L * 1000).toFixed(3)} mH  |  C = ${(state.C * 1e6).toFixed(3)} µF`,
        `Frecuencia de operación: ${state.freq.toFixed(2)} Hz  |  Amplitud: ${state.amp} V`
    ];
    params.forEach((p, i) => doc.text(p, 25, 58 + i * 7));

    let y = 85;
    doc.setFontSize(13); doc.text('Resultados:', 20, y); y += 8;
    doc.setFontSize(10);
    const results = [
        `f₀ = ${state.f0.toFixed(2)} Hz  |  Q = ${state.Q.toFixed(3)}  |  BW = ${state.BW.toFixed(2)} Hz`
    ];
    results.forEach(r => { doc.text(r, 25, y); y += 7; });

    y += 5;
    doc.setFontSize(13); doc.text('Ecuaciones:', 20, y); y += 8;
    doc.setFontSize(10);
    ['Z = R + j(wL - 1/wC)', 'f0 = 1/(2*pi*sqrt(L*C))',
     state.topology === 'parallel' ? 'Q = R*sqrt(C/L)' : 'Q = (1/R)*sqrt(L/C)',
     'BW = f0/Q'
    ].forEach(eq => { doc.text(eq, 25, y); y += 7; });

    if (state.vizMode !== 'phasor') {
        try {
            const imgData = document.getElementById('main-canvas').toDataURL('image/png');
            doc.addPage();
            doc.setFontSize(13); doc.text(`Vista: ${state.vizMode.toUpperCase()}`, 105, 15, { align: 'center' });
            doc.addImage(imgData, 'PNG', 15, 25, 180, 120);
        } catch (_) {}
    }

    doc.save('rlc_report.pdf');
    showToast('PDF generado');
}

function exportJSON() {
    const data = { version: '4.0.0', timestamp: new Date().toISOString(), state, results: { f0: state.f0, Q: state.Q, BW: state.BW } };
    downloadFile(JSON.stringify(data, null, 2), 'rlc_config.json', 'application/json');
    showToast('JSON exportado');
}

function exportLTspice() {
    const asc = `* Circuito RLC — Universidad de Oriente
* Desarrollado por: Ing. José Vicet · Jiménez Matos
* Fecha: ${new Date().toLocaleDateString()}

V1 N001 0 AC ${state.amp} SINE(0 ${state.amp} ${state.freq})
${state.topology === 'series' ? `R1 N001 N002 ${state.R}\nL1 N002 N003 ${state.L}\nC1 N003 0 ${state.C}` :
`L1 N001 0 ${state.L}\nC1 N001 0 ${state.C}\nR1 N001 0 ${state.R}`}

.ac dec 100 1 100k
.tran 0 10m 0 1u
.backanno
.end`;
    downloadFile(asc, 'rlc_circuit.asc', 'text/plain');
    showToast('Archivo LTspice exportado');
}

/* ============================================================
   UTILIDADES UI
   ============================================================ */
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
}

/* ============================================================
   EVENTOS Y CICLO DE VIDA
   ============================================================ */
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

window.addEventListener('resize', debounce(drawCanvas, 120));
window.addEventListener('orientationchange', () => setTimeout(drawCanvas, 300));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawCanvas);

// Gestos de pinch-zoom en canvas
let _touchDist = 0;
document.getElementById('main-canvas')?.addEventListener('touchstart', e => {
    if (e.touches.length === 2)
        _touchDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX,
                                e.touches[0].pageY - e.touches[1].pageY);
});
document.getElementById('main-canvas')?.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const d = Math.hypot(e.touches[0].pageX - e.touches[1].pageX,
                         e.touches[0].pageY - e.touches[1].pageY);
    if (d > _touchDist * 1.08) { zoomIn();  _touchDist = d; }
    else if (d < _touchDist * 0.92) { zoomOut(); _touchDist = d; }
}, { passive: false });

/* Inicialización */
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    updateAllValues();
    updateQEquation();
    calculateResults();
    syncFreqSlider();
    drawCanvas();
});
