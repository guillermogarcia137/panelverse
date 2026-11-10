# Biblioteca sincronizada — v0.6

Al iniciar sesión con Google, PanelVerse utiliza la biblioteca privada de esa cuenta en Supabase. La misma cuenta recupera las mismas series, notas, enlaces y progreso desde otro navegador o dispositivo. La biblioteca sin cuenta continúa siendo local e independiente.

## Cómo utilizarla

1. Iniciar sesión con la misma cuenta en los dispositivos que se quieran sincronizar.
2. Esperar a «Biblioteca sincronizada». Los cambios se envían automáticamente al guardar. Se consultan cambios de otros dispositivos cada 15 segundos mientras la página está visible y al volver a la ventana. «Sincronizar ahora» fuerza la comprobación.
3. Para llevar las series anteriores a la cuenta, usar «Copiar biblioteca sin cuenta». Se pide confirmación, se descarga una copia JSON y se conserva el original. Los identificadores que ya existen en la cuenta no se sustituyen.
4. Sin conexión, seguir editando: los cambios permanecen en la copia del navegador y se envían al recuperar Internet. No borrar sus datos mientras haya cambios pendientes.
5. Si una serie ha cambiado en dos dispositivos, comparar ambas versiones y elegir «Conservar mi cambio» o «Usar versión de la nube». Los detalles muestran también los enlaces, la portada y las notas. No se elige una versión automáticamente.

El navegador conserva una copia por cuenta en IndexedDB, base `panelverse-library`, almacén `libraries`. Cada guardado y su operación pendiente se confirman en una misma transacción. Se mantienen las copias JSON v1 y un espejo local compatible. Antes de pasar una biblioteca antigua de una cuenta a este formato se conserva el original bajo su clave `.before-cloud.v1`.

Una cuenta que ya tuviera series locales de la versión anterior las incorpora a su cola de sincronización. La biblioteca sin cuenta solo se copia cuando se utiliza el botón de importación.

## Seguridad y conflictos

- `public.panelverse_library` tiene una clave compuesta por propietario y serie, RLS activado y lectura directa limitada al propietario. Anónimos no pueden leer ni escribir. Las escrituras directas de usuarios están revocadas.
- Las funciones RPC comprueban `auth.uid()` y el propietario esperado de la petición. Un cambio de sesión durante una subida no puede guardar la cola de una cuenta en otra.
- Las escrituras comparan revisiones del servidor en una transacción. No dependen del reloj del dispositivo. Las operaciones tienen identificadores para reconocer reintentos tras perder una respuesta.
- Los borrados dejan una marca en la nube para detectar cambios pendientes de un dispositivo antiguo. Conservar explícitamente una versión local puede recuperar una serie; nunca se recupera automáticamente.
- Las funciones usan un `search_path` vacío y consultan siempre el propietario autenticado. No aceptan un propietario arbitrario como autorización. La clave del navegador sigue siendo exclusivamente publishable; no hay claves administrativas en la aplicación.
- Hasta 2000 series activas por cuenta y 10000 identificadores contando historial de borrados. Hasta 100 operaciones por petición. Enlaces de hasta 2048 caracteres, notas de hasta 2000 y copias importadas de hasta 5 MB.

## Instalación del backend

En el proyecto Supabase correcto, ejecutar `supabase/001_library.sql` con el SQL Editor. Después ejecutar `supabase/002_verify.sql`. La verificación crea dos usuarios sintéticos sin credenciales y datos temporales dentro de una transacción que se revierte al terminar. Debe devolver `PASS`; no modifica los usuarios reales ni sus bibliotecas.

No se requieren cambios en GitHub Pages ni un servidor propio. El sitio estático utiliza Supabase Auth y los RPC de la biblioteca. No se utiliza Realtime; la actualización automática se realiza por consulta periódica y al volver a la ventana.

## Validación

- `npm test`: reglas de biblioteca y sincronización, conflictos, borrados, operaciones duplicadas, ediciones durante peticiones, recuperación de colas y cambios de cuenta.
- `npm run test:browser`: abrir la dirección que imprime el servidor. Usa un origen local separado, IndexedDB real y un servicio simulado para comprobar escrituras concurrentes, persistencia sin conexión y reintentos. No contacta con Supabase. Ctrl+C detiene el servidor.
- `supabase/002_verify.sql`: aislamiento entre propietarios, RLS, rechazo de acceso anónimo, rechazo de escrituras directas, propietario esperado, validación de datos, lotes atómicos, revisiones y borrados.

La prueba de navegador sin conexión utiliza un servicio simulado. Las comprobaciones del backend se ejecutan contra Supabase real. La instalación y el uso sin conexión en un iPad físico siguen pendientes.
