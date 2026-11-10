# Generador SCORM

Herramienta de autoría de cursos e-learning que funciona **sin conexión** (app de escritorio con Electron y servidor local). Crea lecciones con bloques, evaluaciones, certificados y publica en **SCORM 1.2, SCORM 2004, xAPI o link web**. La IA es local (`node-llama-cpp`); ningún contenido sale de la computadora.

> Estado: trabajo en curso. Lo que falta y lo que no se ha verificado está en [`docs/PENDIENTES.md`](docs/PENDIENTES.md).

## Probar en desarrollo

Requiere Node 18+.

```bash
npm install
node bin/cli.js player --port 4173 --work ./trabajo
# abre http://127.0.0.1:4173/ (inicio, editor y player LMS)
```

Empaquetar un curso desde la línea de comandos:

```bash
node bin/cli.js build ejemplo/curso-higiene.json --stock ejemplo/stock --out out/higiene.zip
node bin/cli.js validate out/higiene.zip
```

## Estructura

- `shared/` modelo de datos (`modelo.js`), catálogo de bloques (`bloques.js`), certificados (`certificado.js`) y utilidades comunes al editor y al curso.
- `src/` servidor, empaquetador (SCORM 1.2 / 2004 / xAPI / web), validador, esquema e IA local.
- `runtime/` lo que viaja dentro del curso publicado (HTML/CSS/JS ES5, conector con el LMS).
- `editor/`, `home/`, `utilidades/`, `player/` interfaces de la app (editor, inicio con asistentes, convertidor de documentos, emulador LMS SCORM 1.2).
- `docs/` arquitectura responsiva y catálogo de bloques.
- `main.js`, `build/` empaquetado de escritorio con Electron.

## IA local

El modelo (`qwen2.5-3b-instruct-q4_k_m.gguf`, ~2 GB) **no se incluye**; se coloca o descarga en `models/`.

## Licencia

Sin licencia definida todavía (todos los derechos reservados por defecto). Los íconos usan Material Symbols; ver `docs/LICENCIA-Material-Symbols.txt`.
