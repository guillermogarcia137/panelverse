# PanelVerse · Navy edition

## Dirección acordada

Prioridad de las referencias solicitadas por Guillermo: Nothing, Apple, Omarchy, Nate Gentile y MoureDev. El navy y los azules dominan; blanco y negro completan la interfaz. Interpretación propia, sin incorporar fuentes, logotipos o recursos propietarios de esas marcas.

1. **Nothing:** titular con trama de puntos, etiquetas pequeñas monoespaciadas, numeración y gráfico vectorial inspirado en hardware.
2. **Apple:** espacio, jerarquía clara, tipografía de sistema, superficies suaves y controles redondeados.
3. **Omarchy:** panel lateral sobrio, tonos consistentes y estructura técnica.
4. **Nate Gentile:** acentos de terminal y líneas de componentes, limitados a etiquetas y detalles.
5. **MoureDev:** lectura directa, organización clara y carácter de herramienta personal.

## Paleta

| Uso | Color |
| --- | --- |
| Fondo navy | `#080F20` |
| Lateral negro azulado | `#070C17` |
| Superficie | `#101C33` |
| Borde | `#25334D` |
| Acción azul | `#3977E5` |
| Acento azul | `#518DFF` |
| Azul hielo | `#B4CFFF` |
| Texto | `#F5F7FC` |
| Texto secundario | `#9AAAC4` |

La portada de Superman conserva los colores de su ilustración. Las portadas forman parte del contenido y no se recolorean por el tema.

## Implementación

CSS nativo sin dependencias ni fuentes externas. El efecto de puntos se aplica al primer renglón del titular mediante background-clip con alternativa de texto sólido. El gráfico del encabezado es un SVG decorativo inline y se oculta en pantallas pequeñas para priorizar la biblioteca. Se conservan las funciones y el formato de datos de v0.1.

Iconos PWA y metadatos ajustados a navy; caché actualizada a `panelverse-v2-navy`. Se respetan preferencias de movimiento reducido y foco visible.

## Verificación

Revisión visual en navegador a tamaño de escritorio, 390 × 844 y 1024 × 1366. Sin desbordamiento horizontal en los dos tamaños simulados. Formulario de alta abierto y cerrado desde móvil. No equivale a una prueba en un iPad físico.

## Referencias

- https://nothing.tech/
- https://www.apple.com/
- https://omarchy.org/
- https://www.nategentile.com/
- https://moure.dev/

## Ajuste tipográfico tras revisión

Se sustituye la familia monoespaciada por Segoe UI Variable Text / Segoe UI / Arial en la interfaz. Menú y textos secundarios más legibles, etiquetas con menos espaciado y subtítulo principal algo mayor. La trama de puntos queda reservada al primer renglón del titular. Se conserva la paleta navy.


## Selector permanente de estilos (v0.3)

Selector a la derecha de Copias de seguridad, disponible también en móvil. Ofrece Navy · Técnico (versión inicial con etiquetas monoespaciadas), Navy · Sans (la revisión aprobada) y GitHub · Navy (tipografía nativa de Primer, controles compactos, bordes de 6px y azul navy). La variante inicial al estrenar el selector es GitHub · Navy. La elección se guarda en localStorage, clave panelverse.theme.v1, se restaura al abrir y se propaga a otras pestañas. No altera la biblioteca. Borrar los datos del navegador elimina también la preferencia; no existe sincronización entre dispositivos.

El selector se queda como parte del producto. Los nuevos estilos deben añadirse al registro de src/theme.js y a src/themes.css, conservando los anteriores. Si el navegador bloquea el almacenamiento, el tema se aplica para la sesión y se anuncia que no se ha podido guardar.

Referencia tipográfica: https://github.com/primer/css/blob/main/src/support/variables/typography.scss

