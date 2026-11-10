# Estado del proyecto y pendientes

Corte: 2026-11-10. Este documento deja constancia de lo construido y, sobre todo, de **lo que falta o no se ha verificado**.
La referencia de producto es el documento de concepto v1 (fuera de este repositorio); aquí solo se citan sus secciones por número.

## 1. Orden de construcción (§17 del concepto)

| # | Paso | Estado |
|---|---|---|
| 1 | Modelo Curso > Módulo > Lección > Objeto | Hecho |
| 2 | Rejilla de 12 columnas + vista previa Escritorio / Tablet / Móvil | Hecho |
| 3 | Editor en 3 zonas | Hecho |
| 4 | Equivalencia escritorio → móvil (§14) | Hecho, con huecos (ver 3) |
| 5 | Modo Guiado / Experto | Hecho |
| 6 | Panel lateral de IA | Hecho |
| 7 | Catálogo de bloques, mapa de objetivos, revisión/QA, certificados, publicación | Hecho, con huecos (ver 2 y 3) |

## 2. Qué falta (funcionalidad)

### Pantallas del menú izquierdo (§11)
- **Biblioteca** (§11, imágenes, videos, audios y PDFs con buscador y etiquetas): hoy solo existe el banco de imágenes dentro del editor. Falta la pantalla propia y soporte de video, audio y PDF.
- **Banco de preguntas**: no existe como módulo reutilizable entre cursos.
- **Plantillas** y **Objetivos** como pantallas independientes: las plantillas viven en el asistente y los objetivos en el editor (Mapa); no hay pantalla de menú propia.
- Tarjetas de «Mis cursos» (§11): faltan estado (Borrador / En revisión / Publicado), % de avance y las acciones duplicar / vista previa / eliminar completas.

### Publicación (§10.8)
- **xAPI**: sin probar contra un LRS real (solo contra un LRS simulado). El avance se retoma únicamente en el mismo navegador (no usa la API de estado del LRS).
- **SCORM 2004**: sin probar en un LMS real; el player del editor solo simula SCORM 1.2, así que no hay botón «Validar en el player» para 2004 / xAPI / web.
- **Link web**: genera un `.zip` para hosting estático; la app no lo hospeda ni crea el enlace.
- Estados del curso (Borrador / En revisión / Publicado) no se persisten.

### Bloques (§9)
- **Video y audio desde archivo**: solo se admiten por URL (YouTube, Vimeo, .mp4 / .mp3 remotos). Aparecen como «Próximamente» en la paleta.
- **Documento descargable**: solo PDF, Word y Excel; la vista previa del editor no abre el archivo (se descarga desde el paquete). Probado con un PDF simulado, no con Word / Excel reales.
- **Encuesta / Reflexión**: las respuestas no se guardan ni se envían al LMS (solo se registra que el alumno respondió).
- **Quiz final**: falta ramificación por resultado y «Result Slide» más rico que el actual.
- Comentarios / revisión colaborativa: fuera de la v1 y no iniciados.

### Equivalencia móvil (§14)
- **Video**: la transcripción es un desplegable, no un *bottom sheet*.
- **Resumen**: no tiene el botón «Completar» al cerrar la lección.
- **Arrastrar y soltar**: en escritorio se arrastra y en móvil se toca y se coloca, pero solo se probó con eventos simulados.
- Regla de 120–150 palabras por pantalla móvil: el sistema avisa en Revisión, pero no propone todavía «dividir en 2» automáticamente.
- Imágenes responsivas (varios tamaños por imagen, §12): sin implementar.

### Certificados (§15)
- **QR de verificación**: marcado como v2 en el concepto; no existe.
- El PDF se genera con el diálogo de impresión del navegador («Guardar como PDF»), no con un PDF generado por la app.
- El folio es determinista por nombre + curso; no hay registro central de folios.

### IA local (§6)
- Se eliminó «Crear con IA» (asistente de inicio). Siguen: panel de IA del editor, objetivos, variantes, preguntas, «Pulir con IA local» en Utilidades.
- El modelo (`qwen2.5-3b-instruct-q4_k_m.gguf`, ~2 GB) **no está en el repositorio**: se descarga o se coloca en `models/`.

### Otros
- Las lecciones nuevas nacen como «bloques»; los tipos antiguos `texto_imagen` y `acordeon` siguen disponibles en el menú «Añadir pantalla» (por decidir si se retiran).
- Limpieza pendiente: estilos del asistente «Crear con IA» en `home/home.css` y su ilustración en `home/home.js` quedaron sin uso.
- Licencia del proyecto: **no definida**. Mientras no se agregue una, el código público queda con todos los derechos reservados.

## 3. Qué no se ha verificado (evidencia de pruebas)

Probado en desarrollo (navegador integrado, servidor local `node bin/cli.js player`):
- Editor: bloques, mapa de objetivos, revisión/QA, panel de certificados, diálogo de publicación.
- Paquetes SCORM 1.2 / 2004 / xAPI / web generados y validados con el validador estático (todos «aprobado» con el curso de ejemplo).
- Runtime con LMS **simulado**: SCORM 2004 (completado, aprobado, puntaje, interacciones, tiempo) y xAPI (9 sentencias con actor correcto).
- Móvil solo con viewport emulado de 375 px.

**No probado:**
- Ningún LMS real (Moodle, Canvas, Cornerstone, SCORM Cloud, etc.) ni LRS real.
- Teléfonos reales (gestos, teclado virtual, zoom con dedos).
- Ventana de Electron empaquetada (instalador) con los cambios más recientes: el instalable **no se recompiló** tras los últimos cambios.
- Tema claro del editor.
- Accesibilidad con lector de pantalla (se aplican etiquetas ARIA, sin auditoría).
- Impresión real a PDF del certificado en Windows / macOS (se verificó el HTML de impresión, no el diálogo).

## 4. Cómo continuar

```bash
npm install
node bin/cli.js player --port 4173 --work ./trabajo    # editor + inicio + player
```

- Empaquetado de escritorio: `npx electron-builder --win nsis` (requiere `rcedit` y el modelo en `models/`).
- Catálogo de bloques: `docs/BLOQUES.md` y `shared/bloques.js`.
- Arquitectura responsiva: `docs/ARQUITECTURA-RESPONSIVA.md`.
- Al añadir un bloque, tocar: `shared/bloques.js` (definición + `ORDEN`), `shared/modelo.js` (`EQUIV`, rótulo móvil, paleta, `INTER`), `src/bloques-html.js` (render + `HINT`), `runtime/course.js` (comportamiento) y `runtime/course.css`.

## 5. Siguiente paso recomendado

1. Pantallas Biblioteca y Banco de preguntas.
2. Probar en un LMS real (SCORM Cloud) los cuatro formatos.
3. Recompilar el instalable y verificar icono, título y modelo local.
