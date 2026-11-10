# Arquitectura responsiva de los cursos

Un curso SCORM es una página web. Se adapta a móvil, tableta y escritorio con **una sola hoja de estilos** (`runtime/course.css`); no hay versiones separadas.

## Principios
1. **Mobile-first.** Lo base es para móvil. Los `@media (min-width)` solo *agregan* espacio o columnas en pantallas mayores.
2. **Tamaños fluidos** con `clamp()`. Tipografía, márgenes e imágenes escalan solos (`--pad`, `--gap`, `--fs`, `--fs-h1`, `--fs-h2`).
3. **Puntos de corte únicos:** `700px` (tableta: dos columnas), `1100px` (escritorio: columna más ancha) y `max-height:520px` (móvil horizontal: compacta).
4. **Táctil primero:** objetivos ≥ 44 px, `hover` solo bajo `@media (hover:hover)`, deslizar izquierda/derecha para navegar, flechas del teclado en escritorio.
5. **Pantallas con notch:** `viewport-fit=cover` + `env(safe-area-inset-*)` en cabecera y barra de navegación.
6. **Sin desbordes:** `overflow-wrap`, `img{max-width:100%}`, sin anchos fijos en px.
7. **Accesibilidad:** el zoom del usuario nunca se bloquea; se respeta `prefers-reduced-motion`.
8. **El bloqueo de pantallas manda:** deslizar o usar flechas **no** salta una pantalla que el SCORM exige completar.

## Reglas para una plantilla nueva
- Columna única por defecto; usa `@media (min-width:700px)` para pasar a columnas (ver `.ti`).
- Usa `var(--pad)`, `var(--gap)` y `var(--fs-h2)`; no escribas tamaños fijos.
- Imagen o figura siempre `max-width:100%`; en móvil, arriba del texto.
- Todo botón o zona pulsable: `min-height:46px`.
- Estado `:hover` envuelto en `@media (hover:hover)`.

## Cómo se verifica
- **Editor:** el panel de vista previa tiene *Panel / Tableta / Móvil*. Tableta y Móvil emulan el ancho real (768 y 375 px).
- **Player (validador):** selector de ventana Escritorio / Tableta / Móvil.
- **Validación estática:** el paquete debe tener `<meta viewport width=device-width>`, no bloquear el zoom y traer reglas adaptables; el panel «Validación» muestra la línea *Responsivo*.
- **Matriz probada:** 320×568, 375×812, 414×896, 768×1024, 1024×768, 1440×900 y 812×375 (horizontal). En cada una se recorren todas las pantallas verificando que no haya desbordes horizontales y que los botones midan ≥ 44 px.
