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


## Galería de 42 ambientes (v0.4)

El botón de paleta pasa de 16 a 30 px (28 px en móvil) y abre una galería permanente. Cada tema tiene una miniatura con fondo, lateral, texto, tarjetas y acento. Búsqueda por nombre y familia; filtros Todos, Destacados, Claros, Oscuros y Omarchy. Un clic aplica y guarda; Listo cierra. La preferencia mantiene la clave anterior y los tres estilos existentes.

Colecciones: seis variantes Nothing (Paper, Carbon, Blanco/rojo, Blanco/azul, Negro/azul y Monochrome), Apple Light/Dark, GitHub Navy/Dark/Light, Navy Técnico/Sans, siete adicionales y 22 paletas del selector web de Omarchy. Nothing y Apple adaptan su lenguaje visual a PanelVerse; no son copias de sus páginas ni incorporan sus fuentes o logotipos propietarios.

Las 22 paletas de Omarchy se extrajeron de sus variables públicas de color: Tokyo Night, White, Catppuccin, Gruvbox, Matte Black, Rosé Pine, Catppuccin Latte, Ethereal, Everforest, Flexoki Light, Hackerman, Kanagawa, Last Horizon, Lumon, Lupine, Miasma, Nord, Osaka Jade, Retro 82, Ristretto, Solitude y Vantablack. Se adaptan tokens secundarios para mantener legibilidad en los controles de PanelVerse.

Referencias: https://omarchy.org/ ; https://omarchy.org/themes/ ; https://nothing.tech/ ; https://www.apple.com/ . Las paletas quedan incluidas localmente y no se consultan en cada visita.

Implementación: src/theme-catalog.js contiene el catálogo y cálculo de contraste; src/theme.js aplica y guarda el tema y gestiona la galería; src/themes.css aplica colores semánticos a toda la interfaz, incluidos formularios y menú. El texto lateral se adapta a menús claros u oscuros. No modifica la biblioteca.

Validación: 11 pruebas pasan; cubren los siete casos originales más catálogo único de 42 temas, colores válidos, compatibilidad con los identificadores anteriores y contraste de texto, laterales, botones y enlaces. Se recorrieron los 42 temas desde la interfaz en móvil simulado sin desbordamiento horizontal. Búsqueda Apple y persistencia al recargar comprobadas. Revisión visual de galería, Apple y Nothing, incluido formulario claro.

