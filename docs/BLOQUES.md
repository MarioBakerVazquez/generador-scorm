# Lecciones con bloques (v1.0)

Una pantalla de tipo `bloques` apila bloques en orden, como en Rise 360. Las pantallas `texto_imagen` y `acordeon` siguen funcionando; en el editor se pueden convertir a bloques con un clic (Plantilla → «Lección con bloques»).

```json
{ "id": "m1-p1", "tipo": "bloques", "titulo": "…", "fuente": "…", "contenido": {},
  "bloques": [ { "tipo": "parrafo", "texto": "…" }, { "tipo": "pasos", "items": [ { "titulo": "…", "texto": "…" } ] } ] }
```

El catálogo (campos, validación, textos) vive en `shared/bloques.js` y lo usan el esquema, el empaquetador (`src/bloques-html.js`), el editor y la IA.

| Grupo | Bloques |
|---|---|
| Texto | encabezado, parrafo, cita (nota/destacado/cita), lista (viñetas/numerada/casillas), tabla |
| Multimedia | imagen, galeria, video (YouTube/Vimeo/.mp4 por URL), audio (URL), divisor (línea o botón «Continuar») |
| Interactivos | acordeon, pestanas, pasos, linea_tiempo, imagen_etiquetas, tarjetas, escenario |
| Practicar | ordenar, relacionar |

## Avance del alumno
- Los bloques interactivos (todos menos `linea_tiempo`, más el divisor «Continuar») deben completarse para habilitar «Siguiente». El avance se guarda en `suspend_data`.
- El botón «Continuar» oculta lo que sigue hasta pulsarlo (solo dentro de un LMS; en la vista previa del autor se ve todo).
- `ordenar` y `relacionar` mezclan los elementos en cada carga; el JSON guarda el orden correcto.

## IA local
Tarea `bloque` (`src/ai.js`): convierte un texto en pasos, pestañas, tarjetas, línea de tiempo, relacionar, ordenar o escenario. El asistente «Crear con IA» genera pantallas de bloques (párrafo + imagen + lista, o acordeón).

## Límites conocidos
- Video y audio solo por URL (el alumno necesita internet); aún no se pueden incrustar archivos locales.
- La IA local (modelo de 3B) puede equivocarse: revisar siempre el resultado.
