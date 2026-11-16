# PanelVerse

[Biblioteca y lector](https://guillermogarcia137.github.io/panelverse/) de cómics para archivos CBR/CBZ, Google Drive y enlaces de lectura web.

## Qué funciona

- Series de tipo Web o Archivos CBR/CBZ, con números, notas, portadas, búsqueda y estados de lectura.
- Lector independiente y apertura desde la biblioteca usando los mismos archivos. Página simple, doble, vertical, manga, zoom y marcadores.
- Importación múltiple de archivos locales, detección de duplicados por contenido y lectura sin conexión.
- Una carpeta de Drive por serie. Los CBR/CBZ nuevos se vinculan automáticamente y se conserva la numeración que hayas corregido. También se mantiene la carpeta general del Lector.
- Reanudación del archivo y la página actual de la serie, tanto desde la biblioteca como desde Lector.
- Cuenta Google con biblioteca privada en Supabase, copia sin conexión, reintentos y resolución explícita de conflictos. Sin cuenta, la biblioteca permanece en este navegador.
- Contenedor de lectura web y pestaña conectada. Las webs compatibles guardan su posición mediante un puente instalado en el navegador.
- 42 temas, copias JSON de la biblioteca y aplicación web instalable.

## Usar una serie de archivos

1. **Añadir serie → Archivos CBR / CBZ**. No necesita un enlace web.
2. En **Números**, importar archivos descargados o guardar una carpeta de Drive. **Elegir carpeta** abre el explorador de Drive después de autorizar la lectura con Google.
3. Abrir **Continuar leyendo**. La página se guarda al leer y el número queda leído al mostrar su última página correctamente cargada.
4. En otro navegador, iniciar sesión con la misma cuenta y conectar Drive. Se recuperan las carpetas de las series y se reconstruyen sus números. Los archivos locales necesitan importarse también allí.

El lector independiente permanece en su sección. Desvincular una carpeta conserva los números que ya estaban en la serie. Desvincular un número conserva el archivo en Lector e impide que la regla de carpeta vuelva a añadirlo en ese navegador.

## Límites que siguen pendientes

- Drive requiere autorizar el permiso en cada navegador. Su API y el consentimiento OAuth deben estar habilitados en el proyecto de Google. Las pruebas automatizadas simulan Drive; falta comprobar el permiso ampliado con una cuenta real y Safari en un iPad físico.
- Se sincronizan los datos de la serie, su carpeta y el archivo/página actual. **No se sincroniza todo el historial por archivo**, las correcciones de numeración de otros números, marcadores, exclusiones manuales ni descargas. Las reglas de carpeta reconstruyen las vinculaciones automáticas en otro dispositivo.
- Las copias JSON contienen series y referencias de lectura; no contienen los CBR/CBZ, sus miniaturas ni todos los datos locales del lector.
- El progreso automático en otra web necesita el puente y un lector compatible. Instalar PanelVerse como PWA no elimina ese requisito. No hay una aplicación nativa publicada ni navegación guiada de viñetas.
- Apple sigue sin configurar. El lector admite imágenes dentro de CBZ/CBR, sin cifrado ni RAR multivolumen; no abre PDF.

## Desarrollo

Node.js 22 o posterior:

```sh
npm ci
npm test
npm run build
npm start
```

Abrir http://localhost:4173/panelverse/. `dist/` contiene la exportación de producción. GitHub Actions ejecuta las pruebas y publica esa carpeta en cada cambio de `main`.

La prueba de integración de Drive se sirve en otro terminal:

```sh
PORT=4185 npm start
CHROMIUM_PATH=/usr/bin/chromium npm run test:drive-series-browser
```

También hay pruebas de navegador para el lector, el puente web y las series con archivos. `READER_TEST_URL` permite seleccionar la URL local; `CHROMIUM_PATH` es opcional si Chromium de Playwright está instalado. En GitHub Actions se comprueba la integración de Drive sobre `dist/`, con archivos propios de prueba y respuestas simuladas.

## Código y guías

El código incluye comentarios en español para aprender cómo se conectan funciones, eventos, almacenamiento y operaciones asíncronas. Las preferencias de mantenimiento están en [AGENTS.md](AGENTS.md).

| Módulo | Responsabilidad |
| --- | --- |
| `src/app.js` / `src/model.js` | Biblioteca, interfaz y validación |
| `src/reader.js` / `src/reader-store.js` | Lectura y almacenamiento local de archivos |
| `src/reader-drive.js` | Consultas de solo lectura a Drive |
| `src/series-files.js` / `src/series-files-model.js` | Números por serie y reanudación |
| `src/series-drive-model.js` | Carpetas por serie y vinculación automática |
| `src/library-sync.js` / `src/sync-model.js` | Cola, reconciliación y conflictos de la cuenta |
| `src/web-reader.js` / `src/web-bridge.user.js` | Contenedor y comunicación con webs compatibles |

Detalles: [series y Drive](SERIES-FILES.md), [lector](READER.md), [lectura web](WEB-READING.md), [sincronización](SYNC.md) y [cuentas](ACCOUNTS.md). Las licencias de ZIP/UnRAR se conservan junto a los recursos generados en el build.
