# Fichas de tanda — C8

| Tanda | Nombre | Requisitos | Rama | Depende de | Migraciones | Esfuerzo | Ficha |
|---|---|---|---|---|---|---|---|
| C8.1 | Cola mínima y ficha como destino | R01, R02, R14, R15, R19 | `feat/ordenes-cola-minima-ficha-destino` | - | ninguna | L | [C8.1-cola-minima-y-ficha-como-destino.md](C8.1-cola-minima-y-ficha-como-destino.md) |
| C8.2 | Ficha: identidad, origen comercial y actividad sin datos técnicos | R03, R04, R05, R06, R10 | `fix/ordenes-ficha-folio-origen-sin-ids` | C8.1 | ninguna | M | [C8.2-ficha-identidad-origen-comercial-y-actividad-sin-datos-tecni.md](C8.2-ficha-identidad-origen-comercial-y-actividad-sin-datos-tecni.md) |
| C8.3 | Ficha: qué se fabrica, cómo y con qué archivos, sin economía | R07, R08, R09, R17, R18 | `feat/ordenes-ficha-ruta-archivos-hoja-trabajo` | C8.2 | ninguna | L | [C8.3-ficha-que-se-fabrica-como-y-con-que-archivos-sin-economia.md](C8.3-ficha-que-se-fabrica-como-y-con-que-archivos-sin-economia.md) |
| C8.4 | Entrega, cierre administrativo, documento comercial y aceptación | R11, R12, R13, R16, R20 | `feat/ordenes-entrega-cierre-aceptacion` | C8.1, C8.2, C8.3 | ninguna | M | [C8.4-entrega-cierre-administrativo-documento-comercial-y-aceptaci.md](C8.4-entrega-cierre-administrativo-documento-comercial-y-aceptaci.md) |
