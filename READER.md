# Sala de lectura — v0.7

La pestaña **Lector** añade lectura dentro de PanelVerse. La biblioteca de series y su sincronización con Supabase se conservan. El lector tiene su propio almacenamiento por cuenta en IndexedDB; desde v0.9 sus archivos también pueden vincularse a series de la biblioteca principal ([guía](SERIES-FILES.md)). No cambia el esquema SQL ni requiere un servidor nuevo.

## Leer

- **Importar CBR / CBZ** admite varios archivos. Se validan antes de guardar, se extrae una miniatura y se conservan para leer sin conexión. Importar el mismo archivo no duplica el cómic ni borra su progreso (identidad SHA-256).
- **Leer / Continuar** abre un lector que ocupa la ventana, con página simple, doble página con portada independiente, vertical, sentido occidental/manga, ajuste de página o ancho, zoom y tres fondos.
- Flechas, botones, deslizador y gestos horizontales permiten navegar. El gesto no cambia de página en modo vertical ni con zoom ampliado. El zoom del navegador sigue disponible.
- Marcadores por página, favoritos, historial de lectura, colecciones por subcarpeta y filtros de descargas, lectura y terminados. La finalización es explícita con **Marcar terminado**.
- **Pantalla completa** depende de las capacidades del navegador. En Safari/iPad donde no esté disponible se conserva el lector a tamaño de ventana.

## Conectar Google Drive

1. Pulsar **Conectar Drive** y autorizar la lectura con Google. Se utiliza el proveedor Google ya configurado en Supabase, solicitando adicionalmente `https://www.googleapis.com/auth/drive.readonly`. No se introduce ningún secreto OAuth en el navegador o en Git.
2. En **Elegir carpeta**, explorar Mi unidad o pegar un enlace/ID de carpeta al que tenga acceso esa cuenta. Se puede incluir o excluir subcarpetas. Las subcarpetas aparecen como colecciones.
3. Al confirmar se indexan CBR y CBZ. **Sincronizar** actualiza manualmente. También se consulta cada minuto mientras la aplicación está abierta y visible, al volver a la ventana y al recuperar Internet. No se ejecutan sincronizaciones periódicas durante la lectura ni trabajos cuando la aplicación está cerrada.
4. Abrir un cómic lo descarga a este navegador. Los originales de Drive nunca se modifican: todas las peticiones a la API de Drive son GET. **Liberar descarga** elimina solo los bytes locales y conserva progreso y marcadores.
5. La autorización de Google concede lectura de Drive; la aplicación limita sus consultas a la carpeta elegida (y explora nombres de carpetas para seleccionarla). No es un permiso limitado por Google a esa única carpeta. Google puede mostrar un aviso de verificación del proveedor por este alcance.
6. Si aparece un error de acceso, comprobar que **Google Drive API** esté habilitada en el proyecto de Google Cloud que contiene el cliente OAuth de Supabase y que el alcance esté permitido en la pantalla de consentimiento. Si el proveedor está en pruebas, la cuenta debe estar autorizada como usuario de prueba. No se ha modificado la configuración externa de Google Cloud ni Supabase para esta versión.
7. Los tokens de proveedor pueden caducar y Supabase no renueva automáticamente el token de Drive. **Conectar Drive** permite volver a autorizarlo. Desconectar lo elimina de la sesión del lector; para revocar el permiso de Google, utilizar la configuración de seguridad de la cuenta Google.

La API pagina los resultados y recorre las subcarpetas elegidas. Solo confirma un catálogo completo cuando todas las consultas han terminado correctamente. Si un archivo desaparece de Drive se conserva su ficha, progreso y descarga existente. Una nueva versión invalida la miniatura y se descarga al abrir; el progreso se conserva y se ajusta si cambia el número de páginas. Cambiar de carpeta conserva las fichas de las anteriores, pero solo se actualiza la carpeta activa.

## Almacenamiento y límites

- Base `panelverse-reader`: almacenes `books` (fichas/progreso/miniaturas), `files` (CBR/CBZ originales) y `settings` (carpeta/preferencias). Las claves incluyen el propietario o `guest`.
- Cambiar de cuenta cierra el lector, cancela peticiones y carga su biblioteca independiente. Los archivos sin cuenta no se migran automáticamente. Los cambios de las series originales siguen su mecanismo Supabase existente.
- **El progreso del lector independiente, marcadores, selección de carpeta y descargas son locales a cada navegador.** Los archivos vinculados a una serie guardan además la referencia de número y página en la biblioteca sincronizada; su lista completa de vinculaciones sigue siendo local. No se sincronizan entre dispositivos en esta versión. Seleccionar la misma carpeta en otro dispositivo recupera los mismos archivos desde Drive, con progreso independiente.
- La PWA precarga los módulos y el WASM. Para leer sin conexión hay que haber abierto/descargado el cómic en ese navegador. Borrar los datos del sitio borra las descargas y los datos locales del lector. La cuota depende del navegador; los errores de almacenamiento se muestran y no se confirman como éxito.
- Las copias JSON de series conservan su formato v1 y **no incluyen** archivos ni datos del lector. Los originales locales y de Drive se deben conservar.
- Hasta 250 MB por archivo, 4000 imágenes por cómic, 40 MB por imagen y 5000 cómics/1000 carpetas por consulta de Drive. El lector extrae páginas bajo demanda; en vertical mantiene una ventana limitada de imágenes cargadas.
- ZIP/CBZ y RAR/CBR se detectan por la firma real del contenido, con orden natural de nombres. Páginas JPEG, PNG, WebP, GIF y AVIF según soporte del navegador. Se omiten metadatos de macOS. Archivos cifrados, RAR multivolumen y PDF no se admiten.
- CBZ usa `@zip.js/zip.js`; CBR usa `node-unrar-js` y su binario WASM, empaquetados localmente. No se envían archivos a servicios de conversión. Las extracciones RAR se serializan porque UnRAR comparte un módulo activo. Los cómics grandes pueden tardar y necesitan memoria suficiente.
- No hay detección ni navegación guiada de viñetas, OCR, ni integración con Panels/PanelBridge.

## Comprobaciones

```sh
npm ci
npm test
npm run build
npm start
# En otra terminal, con Chromium de Playwright instalado:
npx playwright install chromium
npm run test:reader-browser
# O con Chromium del sistema:
CHROMIUM_PATH=/usr/bin/chromium npm run test:reader-browser
```

La prueba de navegador usa un perfil temporal y datos sintéticos; nunca accede al Drive real. `READER_TEST_URL` permite comprobar una exportación de producción servida en otra URL local. Las capturas temporales se guardan en `work/`.

Se comprueban CBZ y CBR con PNG reales, orden natural y extracción concurrente, límites, validación de carpetas, paginación y errores de Drive, reconciliación sin pérdida de progreso, navegación, doble página/manga/vertical, marcadores, recarga, lectura offline mediante el service worker, vista móvil y separación por cuenta. Drive se verifica con respuestas simuladas y autorización GET; falta comprobar OAuth/Drive con la cuenta real y Safari en iPad físico.
