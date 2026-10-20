# Historial comercial del cliente

La ficha del cliente muestra los RFQ, las propuestas visibles para el usuario y las órdenes de producción. Las propuestas se pueden desplegar para consultar sus revisiones y eventos; el enlace abre la ficha original.

Para un RFQ con propuesta aceptada, el importe mostrado corresponde al subtotal de la revisión aceptada. Si no existe una revisión aceptada, se conserva el subtotal del cotizador anterior cuando tiene líneas; de lo contrario se consulta la revisión disponible de la propuesta. Los importes sin datos, sin permiso o con un error de lectura se identifican como tales y no se presentan como cero. Las líneas antiguas se conservan como historial, no como sustituto de la revisión aceptada.

Las consultas usan la sesión del usuario y las políticas existentes de acceso a propuestas. La sección no expone costos, ruteo ni márgenes. Sin acceso a propuestas, la ficha no puede comprobar si existe una revisión aceptada y únicamente muestra el cotizador anterior cuando es legible.
