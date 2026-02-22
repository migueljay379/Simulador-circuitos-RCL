# Simulador de Circuitos RLC
## Universidad de Oriente — Cuba

---

### Descripción

Aplicación web interactiva para el análisis de circuitos RLC en el dominio del tiempo y la frecuencia.
Desarrollada como herramienta didáctica para la asignatura de Circuitos Eléctricos / Telecomunicaciones.

---

### Autores

- **Ing. José Vicet**
- **Jiménez Matos**

Universidad de Oriente — Cuba
Ingeniería en Telecomunicaciones

---

### Estructura del proyecto

```
rlc-simulator/
├── index.html      → Estructura HTML5 semántica (sin CSS ni JS embebidos)
├── styles.css      → Hoja de estilos separada (mobile-first, dark mode)
├── app.js          → Lógica JavaScript separada (cálculos, canvas, UI)
├── README.md       → Este archivo
└── LLMs.txt        → Historial de interacciones con LLMs
```

---

### Características

- Análisis de circuitos RLC serie y paralelo
- Vistas: Temporal, Fasorial, Bode, Nyquist, Espectro FFT
- Señales de excitación: Senoidal, Cuadrada, Escalón, Impulso
- Presets: Filtro Pasa-bajos, Pasa-altos, Pasa-banda, Notch
- Modelo realista con ESR/ESL (parásitos)
- Exportación: CSV, PNG, PDF, JSON, LTspice (.asc)
- Diseño responsive: móvil, tablet, desktop
- Dark mode automático según preferencias del sistema
- Gestos táctiles (pinch-zoom en canvas)
- Persistencia mediante localStorage

---

### Correcciones v4.0.0 (respecto a versión anterior)

1. Archivos HTML, CSS y JS **separados** (modular y profesional)
2. Señal cuadrada añadida a la UI y a la lógica de dibujo
3. Respuesta al escalón corregida para amortiguamiento crítico (sin división por cero)
4. Zoom aplicado efectivamente en todas las vistas del canvas
5. `loadState()` restaura unidades correctamente desde el estado guardado
6. Factor Q corregido según topología: Serie Q=(1/R)√(L/C) | Paralelo Q=R√(C/L)
7. Ganancia H calculada según preset activo (PB, PA, PBanda, Notch)
8. Escala del diagrama de Nyquist adaptativa al rango real de |Z|
9. `updateAllValues()` protegido cuando inputs parásitos no están en DOM
10. Animación fasorial usa valores reales del circuito (no hardcodeados)
11. Slider de frecuencia con escala logarítmica (10 Hz — 1 MHz)
12. Indicador de carga en botón "Simular"
13. Ecuación de Q actualizada visualmente según topología seleccionada
14. Botones de modos "en desarrollo" deshabilitados visualmente

---

### Uso

Abrir `index.html` en cualquier navegador moderno.
No requiere servidor ni dependencias externas (salvo jsPDF desde CDN para exportar PDF).

---

### Tecnologías

- HTML5 semántico
- CSS3 (variables, grid, flexbox, media queries, dark mode)
- JavaScript ES6+ (Canvas API, SVG, Web Animations API, localStorage)
- jsPDF 2.5.1 (exportación PDF)

---

### Licencia

Desarrollado con fines académicos. Universidad de Oriente, Cuba. © 2024
