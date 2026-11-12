# Lectura web conectada — v0.8

**Resultado:** PanelVerse puede guardar el capítulo, el enlace y la página visible de lectores web compatibles mediante un puente instalado por el usuario en el navegador. No necesita descargar ni volver a alojar los cómics. La instalación del puente es necesaria en cada navegador y para cada web elegida.

## Investigación (12 de noviembre de 2026)

Se inspeccionó la respuesta pública de `https://marmota.me/comic/superman-2023/superman-35/` y el JavaScript del tema/lector:

- La respuesta fue HTTP 200. La respuesta observada no incluía `X-Frame-Options`, CSP `frame-ancestors` ni `Access-Control-Allow-Origin`. Esto no garantiza que otras páginas o futuras respuestas se comporten igual.
- El lector usa Madara/WordPress, con imágenes bajo `.reading-content .wp-manga-chapter-img`, identificador de capítulo y enlaces `next_page` reales. Estos datos permiten observar la lectura sin inventar URLs.
- Marmota conserva también un historial de su propio dominio y usa peticiones de su tema. No se encontró un contrato público documentado para enviar progreso a PanelVerse. El `postMessage` encontrado en el HTML pertenece a la detección de emojis de WordPress, no a una integración de lectura.
- La política de mismo origen impide que PanelVerse lea directamente el DOM, el desplazamiento o la URL actual de un iframe de otra web, aunque permita mostrarse. Tampoco basta con poner `fetch(..., {mode:'no-cors'})`: la respuesta no se puede leer desde JavaScript.
- El intento de navegación real con Chromium del entorno encontró `ERR_CERT_AUTHORITY_INVALID` en la conexión HTTPS de este entorno. No se desactivó la verificación TLS. La inspección HTTP se realizó con curl y la CA del entorno; la integración en navegador se verificó con contenido sintético en orígenes separados. Falta verificar el gestor de scripts en los navegadores personales y en un iPad físico.

Por ello se eligió un puente de navegador: observa el DOM con el permiso que el usuario concede al gestor de scripts y comunica únicamente los metadatos de lectura al origen conocido de PanelVerse. No se modifican cabeceras del sitio remoto ni se necesita acceso a su servidor.

Referencias:

- [Política de mismo origen, MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- [Comunicación entre ventanas con postMessage, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [Scripts de contenido y marcos, Chrome Developers](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Extensiones de Safari, Apple](https://developer.apple.com/safari/extensions/)
- [Userscripts para Safari](https://github.com/quoid/userscripts)

## Uso en ordenador y en iPad/iPhone

1. Desde una serie, pulsar **Empezar a leer**, **Continuar leyendo** o **Abrir lectura**. El contenido se abre en un contenedor con acceso al original.
2. Instalar un gestor de scripts: por ejemplo Tampermonkey en un navegador compatible de ordenador, o Userscripts en Safari de iPad/iPhone. Consultar las instrucciones del gestor para habilitar scripts en marcos. En iPad, utilizar Safari; no se ha verificado la ejecución de extensiones en la aplicación instalada desde la pantalla de inicio.
3. Abrir **Activar el progreso automático para esta web**. Descargar o copiar el script, añadirlo al gestor y permitir que se ejecute en el dominio indicado. La descarga genera un `@match` exclusivo para el origen de la lectura; no pide acceso a todas las webs.
4. Volver a PanelVerse y pulsar **Recargar**. El indicador confirma si el puente responde y si reconoce el lector. Sin el puente, mostrar el contenido no permite detectar la posición y PanelVerse lo indica explícitamente.
5. Si la web rechaza el contenedor, pulsar **Pestaña conectada**. Se abre el original en una pestaña normal, con el mismo puente y un canal de comunicación iniciado por PanelVerse. Mantener PanelVerse abierto. Cerrar el lector detiene el seguimiento; si la pestaña original permanece abierta, se puede cerrar manualmente. Si el navegador bloquea ventanas, permitirlas para PanelVerse. Si la web aísla también las ventanas con COOP o el gestor no ejecuta el script, esta alternativa puede no funcionar.
6. **Abrir original** siempre permite leer en una pestaña independiente sin prometer seguimiento automático. Ctrl/Cmd+clic en el enlace de una serie conserva también el comportamiento externo habitual.

El lector CBR/CBZ continúa disponible en su propia pestaña, sin necesitar este puente.

## Qué se guarda

- Se detecta la imagen visible, después de que se haya cargado. El desplazamiento se agrupa antes de emitir y guardar eventos.
- La página actual se guarda en el enlace de la serie mediante el parámetro reservado `panelversePage`. Ese parámetro se elimina antes de cargar la web original; el puente recibe la posición a restaurar por el canal de comunicación.
- La misma biblioteca existente, incluida su cola sin conexión y resolución de conflictos, guarda la posición. Al iniciar sesión con la misma cuenta, ese enlace y el último número leído se sincronizan con Supabase y se recuperan en otro dispositivo con el puente instalado. Sin cuenta permanecen en este navegador. No se cambia el esquema SQL.
- Un capítulo se marca leído cuando su última imagen cargada queda visible hasta el final. Abrir un capítulo o pasar por una página intermedia no lo marca terminado. No se puede certificar que una persona haya leído el contenido: se registra la posición visible.
- Si existe un enlace siguiente observado y válido de la misma serie, se guarda para continuar desde él al terminar. No se calcula sumando números a la URL.
- El último número leído no retrocede al releer. Se respetan los límites del total configurado. Si el número del capítulo es ambiguo o decimal, se conserva el número anterior y se actualiza el enlace; no se inventa un entero.
- Cambiar de cuenta cierra la lectura y descarta eventos pendientes de la sesión anterior. Los mensajes de otro origen, ventana, canal o serie se ignoran.

## Compatibilidad y límites

El puente incluye adaptadores por selectores para Madara/Marmota y contenedores habituales (`#readerarea`, `.reader-area`, `.chapter-content`, `.chapter-images`, `.reader-pages`, `.reading-content`). Funciona con imágenes presentes en el DOM y navegación de capítulos convencional. Otra web con una estructura compatible puede usar el script generado para su propio dominio; **no se garantiza compatibilidad con cualquier web**.

Los lectores que dibujan en canvas, PDF, imágenes dentro de otros iframes, paginación especial, navegación sin una ruta estable de serie, cambios de estructura, bloqueos de extensiones o políticas de aislamiento pueden necesitar adaptadores adicionales. El puente no sortea inicios de sesión, controles de acceso ni DRM. Las cabeceras de terceros no se cambian.

La alternativa de pestaña se ha comprobado con otra web sintética que envía `Content-Security-Policy: frame-ancestors 'none'`: el iframe se bloquea, pero la lectura de nivel superior y los mensajes funcionan. No se ha probado todavía una instalación real en Safari ni todos los gestores de scripts.

## Desarrollo y comprobaciones

- `npm test`: validación de mensajes, ámbito de serie, páginas, número completado, enlaces reales, relectura, totales y compatibilidad con copias v1, además de las pruebas existentes.
- `npm run build`: compila la aplicación y versiona también el módulo del puente y el service worker.
- `npm run test:web-reader-browser`: con `dist/` servido en `http://127.0.0.1:4174/` y Chromium de Playwright instalado. `READER_TEST_URL` permite otra URL local; los orígenes locales habilitados por el puente están explícitos en su fuente. `CHROMIUM_PATH=/usr/bin/chromium` permite utilizar Chromium del sistema.
- La prueba usa únicamente imágenes PNG sintéticas. Comprueba comunicación entre orígenes, guardado de página y capítulo, siguiente enlace, navegación, reanudación tras recarga, rechazo de otra serie, descarga del script con dominio acotado, vista móvil, otra web que prohíbe marcos y cambio de cuenta.
- `npm run test:reader-browser` conserva las comprobaciones de CBR/CBZ y Drive simulado.
