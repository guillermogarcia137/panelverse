# PanelVerse

Aplicación publicada: https://guillermogarcia137.github.io/panelverse/


Biblioteca personal de cómics con seguimiento de series y lector integrado de CBR/CBZ, archivos locales y carpeta de Google Drive. Con Google, biblioteca privada sincronizada entre dispositivos; sin cuenta, biblioteca local independiente. Incluye 42 temas y copias de seguridad JSON.

## Probar en local

Requisito: Node.js 22 o posterior y npm. Tras clonar, ejecuta `npm ci` y `npm run build` una vez para preparar el cliente de cuentas.

1. Abre `E:\Sida moco\Panelverse`.
2. Ejecuta `Iniciar PanelVerse.cmd`, o abre una terminal en esa carpeta y ejecuta `node scripts/serve.mjs`.
3. Visita **http://localhost:4173/panelverse/**.
4. Mantén la terminal abierta; Ctrl+C cierra el servidor.

Con cuenta, iniciar sesión con el mismo Google recupera la biblioteca de Supabase. Sin cuenta, cambiar de navegador, puerto o dominio crea otro almacenamiento. «Copiar biblioteca sin cuenta» permite llevar esas series a tu cuenta conservando el original y una copia JSON.

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

La cuenta de Google utiliza Supabase y una copia local transaccional en IndexedDB. Los cambios se sincronizan automáticamente; los cambios sin conexión quedan pendientes. La biblioteca sin cuenta permanece en `localStorage`, clave `panelverse.library.v1`. No hay analítica. Exporta copias periódicas. El máximo es 2000 series; una importación admite hasta 5 MB. La importación actualiza los mismos identificadores y añade los demás. Antes se descarga una copia del estado actual. Comprueba que tu navegador permita la descarga.

La biblioteca de series puede recibir la posición de webs compatibles mediante el puente de navegador descrito en [WEB-READING.md](WEB-READING.md). No calcula URLs del siguiente número. La nueva pestaña Lector permite leer archivos CBR/CBZ propios y descargar para lectura offline desde la carpeta de Drive elegida. No hay integración con Panels/PanelBridge. Uso, autorización y límites en [READER.md](READER.md).

## Desarrollo y comprobaciones

```sh
node --test
node scripts/build.mjs
node scripts/serve.mjs
```

También están definidos `npm start`, `npm test` y `npm run build` cuando npm esté instalado. Las pruebas comprueban reglas de progreso, URLs, importación atómica, fusión y búsqueda. `dist/` es el resultado de producción y no se guarda en Git.

## Arquitectura

La interfaz utiliza HTML, CSS y módulos JavaScript nativos. La compilación empaqueta el SDK oficial de Supabase para el acceso opcional a cuentas. La biblioteca de la cuenta se guarda en Supabase con una copia local y cola persistente en IndexedDB. Los conflictos se resuelven explícitamente. Detalles y pruebas en [SYNC.md](SYNC.md).

| Archivo | Responsabilidad |
| --- | --- |
| `src/model.js` | Modelo, validación, progreso y copias |
| `src/app.js` | Interfaz y almacenamiento local |
| `src/styles.css` | Diseño adaptable |
| `sw.js` | Caché offline limitada a esta aplicación |
| `scripts/serve.mjs` | Servidor local ligado a loopback |
| `scripts/build.mjs` | Exportación estática |

## Publicación

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


## Acceso con Google (v0.5.1)

Google está activado mediante Supabase Auth. Se han comprobado en localhost el acceso real, el retorno OAuth con PKCE, la persistencia tras recargar y el cierre de sesión. La biblioteca sin cuenta se recupera al salir y permanece separada de la cuenta. El inicio de sesión no sincroniza la biblioteca entre dispositivos. Apple sigue pendiente de configuración.

Las credenciales OAuth las ha guardado el propietario directamente en Supabase. El repositorio solo incluye la URL y clave publishable públicas. Guía y direcciones en ACCOUNTS.md.
## Biblioteca en la nube (v0.6)

Sincronización privada por cuenta, guardado sin conexión con reintentos, resolución de conflictos y copia de la biblioteca sin cuenta. La web y localhost usan la misma biblioteca cuando se inicia sesión con la misma cuenta. El estado indica cuándo los datos están pendientes o confirmados en la nube.

Migración y pruebas de seguridad en `supabase/`; arquitectura, límites y uso en [SYNC.md](SYNC.md). La verificación SQL ha pasado en Supabase real. IndexedDB real ha superado las comprobaciones de escrituras concurrentes, persistencia de la cola y reintentos sin duplicados. La prueba en un iPad físico sigue pendiente.
## Lector y Drive (v0.7)

Sala de lectura con importación múltiple CBR/CBZ, carpeta de Google Drive con subcarpetas, descarga al abrir y lectura sin conexión. Página simple/doble/vertical, manga, zoom, marcadores, favoritos, colecciones y progreso por página. El catálogo se actualiza mientras la aplicación está abierta; el progreso por página y las descargas se guardan por cuenta en este navegador, independientes del progreso de series sincronizado con Supabase. [Guía, configuración de Drive y pruebas](READER.md).

## Lectura web conectada (v0.8)

Contenedor para enlaces de series y puente instalable por dominio para lectores de imágenes compatibles, incluidos Madara/Marmota. Guarda página, capítulo completado y el siguiente enlace observado en la biblioteca existente. Incluye pestaña conectada como alternativa cuando una web bloquea los marcos. Requiere instalar el puente en el navegador; otras estructuras necesitan un adaptador y Safari físico sigue pendiente de verificación. [Investigación, instalación y límites](WEB-READING.md).

## Series con archivos (v0.9)

La biblioteca principal permite crear series de tipo Web o Archivos CBR/CBZ. Una serie puede agrupar números importados o vinculados desde Lector/Drive, reanudar su página y actualizar su progreso al terminar cada número. El lector independiente permanece en su pestaña y utiliza los mismos archivos, sin duplicarlos. [Uso, sincronización y límites](SERIES-FILES.md).
