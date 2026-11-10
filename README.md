# PanelVerse

Aplicación publicada: https://guillermogarcia137.github.io/panelverse/


Biblioteca personal de cómics con enlaces externos y seguimiento manual de lectura. Primera versión funcional, pensada para probar en Windows y adaptar después la estética con Guillermo.

## Probar en local

Requisito: Node.js 22 o posterior y npm. Tras clonar, ejecuta `npm ci` y `npm run build` una vez para preparar el cliente de cuentas.

1. Abre `E:\Sida moco\Panelverse`.
2. Ejecuta `Iniciar PanelVerse.cmd`, o abre una terminal en esa carpeta y ejecuta `node scripts/serve.mjs`.
3. Visita **http://localhost:4173/panelverse/**.
4. Mantén la terminal abierta; Ctrl+C cierra el servidor.

Usa siempre esa dirección para conservar la misma biblioteca. Cambiar de navegador, puerto o de `localhost` a `127.0.0.1` crea otro almacenamiento. Los datos locales no se trasladan automáticamente al futuro dominio público: exporta e importa la copia JSON.

## Incluido en v0.1

- Biblioteca visual, alta, edición, ficha y eliminación de series.
- Estados leyendo, pendiente y terminado; filtros, búsqueda sin acentos y ordenación.
- Último número leído, total opcional y botón «+1 leído». Al alcanzar el total se marca como terminado.
- Enlace exacto para continuar leyendo en una nueva pestaña. Marcar un número como leído no cambia el enlace: se actualiza desde Editar serie.
- Portada por URL con alternativa visual si falla y notas personales.
- Persistencia local, sincronización entre pestañas del mismo navegador y copia JSON con importación validada y fusión por identificador.
- Interfaz adaptable, navegación por teclado y diálogos accesibles.
- PWA: manifiesto, iconos, service worker y caché local de la aplicación. La lectura externa y las portadas remotas necesitan conexión.
- Ejemplo de Superman (2023), progreso cero y enlace de referencia al #35. La ilustración incluida es una referencia gráfica, no una portada oficial.

## Datos y límites

No hay cuenta, backend, analítica ni sincronización entre dispositivos. Los datos están en `localStorage`, clave `panelverse.library.v1`. Exporta copias periódicas. El máximo es 2000 series; una importación admite hasta 5 MB. La importación actualiza los mismos identificadores y añade los demás. Antes se descarga una copia del estado actual. Comprueba que tu navegador permita la descarga.

La aplicación no lee el progreso de Marmota, no descarga cómics y no calcula URLs del siguiente número. Solo guarda y abre los enlaces que añadas. No hay integración con Panels/PanelBridge.

## Desarrollo y comprobaciones

```sh
node --test
node scripts/build.mjs
node scripts/serve.mjs
```

También están definidos `npm start`, `npm test` y `npm run build` cuando npm esté instalado. Las pruebas comprueban reglas de progreso, URLs, importación atómica, fusión y búsqueda. `dist/` es el resultado de producción y no se guarda en Git.

## Arquitectura

Esta versión usa HTML, CSS y módulos JavaScript nativos para poder ejecutarse sin instalar dependencias. React, TypeScript y Supabase se propusieron inicialmente; quedan como opciones para una siguiente etapa si la complejidad y la sincronización lo justifican.

| Archivo | Responsabilidad |
| --- | --- |
| `src/model.js` | Modelo, validación, progreso y copias |
| `src/app.js` | Interfaz y almacenamiento local |
| `src/styles.css` | Diseño adaptable |
| `sw.js` | Caché offline limitada a esta aplicación |
| `scripts/serve.mjs` | Servidor local ligado a loopback |
| `scripts/build.mjs` | Exportación estática |

## Publicación futura

Repositorio: https://github.com/guillermogarcia137/panelverse

Sitio publicado: https://guillermogarcia137.github.io/panelverse/

Publicación mediante `.github/workflows/pages.yml`: cada push a main ejecuta las pruebas y publica dist/ en GitHub Pages. Para publicar después de la revisión local, compila con `node scripts/build.mjs` y publica `dist/` mediante GitHub Pages (Actions). Todas las rutas son relativas y admiten el subdirectorio `/panelverse/`. Instalar en iPad requiere servir por HTTPS y usar Safari → Compartir → Añadir a pantalla de inicio. No se ha probado todavía en un iPad físico.

## Siguiente conversación

1. Revisar estética y portadas.
2. Decidir nuevas funciones y datos iniciales reales.
3. Definir si hace falta sincronización entre dispositivos.
4. Probar en iPad y publicar en GitHub Pages cuando se decida.

## Resultado de la revisión de v0.1

Alta, edición, borrado confirmado, progreso, finalización y persistencia al recargar comprobados en navegador. Vista móvil revisada a 390 × 844. Las siete pruebas automatizadas y el build pasan. La prueba de importación de archivos mediante la interfaz no se ha completado por la restricción de acceso a archivos de la extensión de Brave. La validación y fusión sí están cubiertas por pruebas de lógica. La instalación PWA y el modo offline no se han probado en un iPad físico.

Documentación: https://app.notion.com/p/414453bf2fd881f481e8f77ef55ed480


## Navy edition (v0.2)

Rediseño navy y azul, con detalles de puntos, tipografía de sistema y etiquetas monoespaciadas. Prioridad visual: Nothing, Apple, Omarchy, Nate Gentile y MoureDev. La paleta y criterios se documentan en DESIGN.md. Se conservan las funciones y los datos de la primera versión. Revisión visual de escritorio, móvil (390 x 844) e iPad simulado (1024 x 1366), incluyendo formulario móvil y ausencia de desbordamientos horizontales.


## Temas y estilos (v0.3)

El selector permanente, junto a Copias de seguridad, permite alternar entre Navy · Técnico, Navy · Sans y GitHub · Navy. Se recuerda el último estilo en este navegador. Los estilos futuros se añadirán a este mismo selector. Implementación en src/theme.js y src/themes.css; preferencia independiente de la biblioteca.


## Galería de temas (v0.4)

La paleta ampliada abre 42 temas permanentes con miniaturas y búsqueda. Incluye Nothing, Apple, GitHub, 22 paletas de Omarchy, Navy y alternativas adicionales. Los filtros permiten ver destacados, claros, oscuros y Omarchy. Tocar una miniatura aplica y guarda el tema; Listo vuelve a la biblioteca. Los datos de lectura permanecen independientes. Once pruebas pasan, incluidas comprobaciones de contraste para todas las paletas.


## Enlaces y cuentas (v0.5)

Documentación y repositorio accesibles desde el lateral y el pie (también en móvil). Pantalla de Cuenta con proveedores Google y Apple preparados, desactivados hasta configurar el servicio real. Bibliotecas locales separadas por usuario sin migración automática ni sincronización en la nube. Estado de activación y guía completa en ACCOUNTS.md.

