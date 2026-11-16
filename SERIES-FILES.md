# Series con números CBR/CBZ — v0.10

La biblioteca principal admite series leídas en una web y series formadas por archivos propios. La sección **Lector** conserva su ubicación y sus funciones: los mismos archivos se pueden abrir desde allí o desde la ficha de su serie, sin duplicar los bytes.

## Uso

1. Pulsar **Añadir serie** y elegir **Archivos CBR / CBZ** como lectura. No se necesita una URL. Guardar la serie abre su lista de números.
2. **Importar CBR / CBZ** permite seleccionar varios números descargados. **Vincular desde Lector / Drive** permite usar archivos que ya estén importados o en el catálogo de Drive.
3. Los números se ordenan por su numeración, que se puede corregir en la ficha. Se reconoce una numeración explícita (`#001`) o al final del nombre. Los años se ignoran y los nombres ambiguos reciben el siguiente número libre. No se permiten dos archivos con el mismo número dentro de una serie.
4. Leer desde la ficha o con **Continuar leyendo** en la biblioteca. Se abre el mismo lector existente, conservando zoom, modos, marcadores y preferencias.
5. La página se guarda al leer. Al mostrar la última página cargada (incluida la doble página), el número queda leído y se actualiza el último número de la serie. **Siguiente número** abre el siguiente archivo vinculado. La biblioteca continúa por el número en curso o el primero sin terminar.
6. Sin total definido, la serie queda terminada al leer todos sus números disponibles. Añadir otro número sin leer vuelve a ponerla en lectura. Si se ha definido un total manual, se respeta ese total. Releer no reduce el último número leído.
7. **Desvincular** quita un archivo de una serie y conserva el archivo y su progreso en el Lector. Vincularlo a otra serie pide confirmación si ya pertenecía a una distinta.

En el Lector, cada cómic tiene también un botón **Vincular / Serie**. Permite seleccionar una serie existente o crear una nueva, conservando la página, el estado y los marcadores del archivo.

Una serie puede conservar su enlace web como alternativa: al pasar a archivos se conserva el enlace anterior; desde **Editar serie → Web** se puede volver a utilizarlo. Los archivos vinculados permanecen accesibles con **Números descargados**.

## Qué se conserva entre dispositivos

La serie, su estado, el último número leído y la referencia al archivo/página actual se guardan en la biblioteca existente y se sincronizan con Supabase al iniciar sesión. Las copias JSON v1 mantienen estos datos sin cambios de esquema ni migraciones SQL.

**Los archivos, sus miniaturas, marcadores por archivo y las vinculaciones manuales siguen siendo locales por cuenta y navegador.** Desde v0.10 se guarda una carpeta de Drive por serie: en otro dispositivo, conectar Drive recupera sus números y los vincula automáticamente. Los archivos locales necesitan importarse y vincularse allí. El mismo archivo local usa su SHA-256 y los de Drive su ID estable; al vincular el archivo en curso se recuperan su numeración y la página que guarda la serie. Los archivos no se suben a Supabase ni se incluyen en las copias JSON.

Para lectura offline hay que haber importado o abierto los archivos en ese navegador. Las series web mantienen su funcionamiento y su puente opcional; la lectura CBR/CBZ no necesita ese puente.

## Implementación

- `series-files-model.js`: enlaces internos de colección, referencia de número/página, orden, asignación y selección del siguiente número.
- `series-files.js`: lista de números de una serie, importación, vinculación, portada desde archivo y guardado del progreso en la biblioteca.
- `reader.js`: conserva el lector independiente y expone operaciones sobre los mismos registros de IndexedDB, con avisos de progreso hacia la biblioteca.
- Un enlace interno real de PanelVerse con `pvCollection`, `book`, `issue` y `page` permite guardar la posición con el esquema de series existente. El enlace web opcional se conserva en `web`. Estos parámetros no se envían a terceros.
- La pertenencia (`seriesId`) y numeración (`issue`) se guardan en los registros del lector, bajo las mismas claves por cuenta. El catálogo de Drive conserva esos campos al reconciliar archivos.
- Cambiar de cuenta cierra la ficha y el lector. Las importaciones, vinculaciones y colas de progreso comprueban la cuenta/generación antes de aplicar resultados.

## Comprobaciones

```sh
npm test
npm run build
# Servir dist/ en http://127.0.0.1:4176/ y utilizar Chromium de Playwright:
npm run test:series-browser
# Alternativa con Chromium del sistema:
CHROMIUM_PATH=/usr/bin/chromium npm run test:series-browser
```

`READER_TEST_URL` permite elegir otro origen local. La prueba utiliza CBR/CBZ con PNG sintéticos y Drive simulado. Comprueba creación sin URL, importación de varios números, reanudación tras recarga, finalización automática, siguiente número, archivos compartidos entre biblioteca/lector sin duplicados, vinculación desde Drive, lectura offline, vista móvil, desvinculación sin pérdida del archivo y separación por cuenta. Las pruebas de modelo verifican también copias v1 y la cola de sincronización existente.

Los límites de archivo, formatos y verificación en iPad físico siguen documentados en [READER.md](READER.md).

## Carpetas por serie (v0.10)

En **Números → Carpeta de Google Drive** se puede pegar un enlace/id o usar el explorador. La carpeta y la opción de incluir subcarpetas se guardan en la biblioteca sincronizada y en sus copias JSON. No hace falta otra migración SQL. Google sigue requiriendo su permiso en cada navegador.

Al sincronizar se consultan la carpeta general del Lector y las carpetas de las series. Una carpeta repetida se consulta una sola vez. Los archivos nuevos reciben numeración sin duplicar números ni modificar correcciones existentes. Si encajan varias carpetas anidadas, gana la regla más próxima al archivo; no se asigna la misma carpeta a dos series. Los archivos que ya pertenecen a una serie no se mueven automáticamente.

**Desvincular carpeta** detiene sus altas automáticas y conserva los números existentes. **Desvincular número** mantiene el archivo en Lector y guarda una exclusión local para que la misma regla no lo vuelva a añadir. Esa exclusión no se sincroniza. Si falla la consulta de una carpeta se conserva el catálogo anterior completo; un permiso caducado vuelve a mostrar **Conectar Drive**.

La referencia de lectura incluye si el número actual está completado. Al recuperar la biblioteca, se puede continuar por el siguiente número o por la página en curso. Abrir desde el Lector independiente también consulta la posición de la serie. Esto no sincroniza el historial de todos los archivos, las correcciones de numeración de otros números ni sus marcadores.

`test/series-drive.test.js` comprueba reglas de carpetas, jerarquía, numeración, copias y reanudación. `npm run test:drive-series-browser` comprueba el flujo completo sobre Drive simulado en dos perfiles de navegador, selección de carpetas, altas nuevas, exclusión manual, caducidad de permiso, desvinculación y vista móvil. La misma prueba se ejecuta sobre producción en GitHub Actions. Sigue pendiente la verificación de OAuth/Drive real y del iPad físico.
