# Cuentas en PanelVerse

## Estado actual

La interfaz, los adaptadores OAuth y las bibliotecas locales separadas por identificador de usuario están implementados. Los accesos siguen desactivados hasta conectar un proyecto y habilitar cada proveedor. No se ha simulado ningún inicio de sesión. El modo local conserva su clave y sus datos anteriores.

La sincronización de la biblioteca entre dispositivos todavía no está implementada. Iniciar sesión no equivale a sincronizar: cada cuenta tiene un espacio local independiente en este navegador. No hay subida automática de la biblioteca sin cuenta.

## Recomendación

Activar Google primero mediante Supabase Auth. Apple es compatible, pero requiere una configuración adicional en Apple Developer y renovar el secreto OAuth cada seis meses. No es necesario activar ambos a la vez.

## Activación

1. Crear un proyecto Supabase, preferiblemente en Europa. La contraseña de Postgres la establece el propietario. Mantener RLS y no exponer tablas sin políticas.
2. En Authentication → URL Configuration, registrar:
   - Site URL: `https://guillermogarcia137.github.io/panelverse/`
   - Redirect URL local: `http://localhost:4173/panelverse/`
   - Redirect URL pública: `https://guillermogarcia137.github.io/panelverse/`
3. En Google Auth Platform, crear/configurar un cliente OAuth web y su pantalla de consentimiento. Su redirect autorizado es `https://<proyecto>.supabase.co/auth/v1/callback`. Añadir los usuarios de prueba cuando corresponda. Los secretos del cliente solo se guardan en Supabase.
4. Activar el proveedor Google en Supabase con su Client ID y Client Secret.
5. Completar `src/account-config.js` con la URL pública y la clave publishable (o anon) del proyecto. Poner `providers.google: true` solo después de habilitarlo en Supabase.
6. Compilar y probar el flujo completo de entrada, retorno, persistencia y salida en el sitio publicado. No activar un proveedor en producción sin esa prueba.

La clave publishable está diseñada para el navegador. Nunca incluir `service_role`, `sb_secret_...`, contraseñas, secretos de Google ni claves `.p8` de Apple en el repositorio o en JavaScript público. Las políticas de la base de datos deben controlar el acceso; la separación de localStorage no sustituye a RLS.

## Apple, cuando se decida activarlo

Requiere cuenta Apple Developer, App ID con Sign in with Apple, Services ID para web, Team ID y clave de firma. Configurar como callback la URL HTTPS de Supabase y guardar el secreto en Supabase. Renovarlo cada seis meses. Después activar `providers.apple` y probar el retorno al sitio. No se ha contratado ninguna membresía ni generado ninguna credencial de Apple en esta entrega.

## Diseño técnico

- SDK oficial `@supabase/supabase-js`, versión fijada en package-lock.json y empaquetado localmente mediante esbuild.
- OAuth con PKCE, sesión persistente y renovación gestionadas por el SDK. Se valida la cuenta inicial contra el servicio.
- El callback vuelve a la raíz real de la aplicación, compatible con `/panelverse/` y localhost. Se eliminan del historial los parámetros OAuth consumidos y el service worker no cachea URLs con códigos de autorización.
- La biblioteca sin cuenta continúa en `panelverse.library.v1`. Las cuentas utilizan `panelverse.library.v1.user.<uuid>`. Cambiar de cuenta cierra los formularios abiertos para evitar guardar en el espacio anterior.
- La autenticación utiliza `panelverse.auth.v1`. Cerrar sesión no elimina bibliotecas locales.
- Los proveedores aparecen desactivados si falta configuración. La aplicación no realiza llamadas a Supabase en modo local.

## Preparar el proyecto después de clonarlo

```sh
npm ci
npm run build
npm start
```

GitHub Actions repite instalación, pruebas, compilación y publicación en cada push a main. No contiene secretos OAuth ni necesita acceso administrativo a Supabase para compilar.

## Referencias

- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/social-sign-in/auth-apple
- https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web
