# Aceptación de B

```json
[
  {
    "paso": "historial-versiones",
    "resultado": "ok",
    "detalle": {
      "historial": "Historial de versiones\n\nCada modificación se conserva como una versión independiente; las anteriores se abren en solo lectura.\n\nVersión\tEstado\tMotivo\tSubtotal de venta\tTotal cliente\tValidada\tAcciones\nCNC-1126_08-A\tEnviada\t—\t$112,100.00\t$130,036.00\t17 de noviembre de 2026\tVer\nCNC-1126_08-B\tEnviada\tEl cliente solicita ajustar precio unitario y cantidad del panel MDF.\t$110,750.00\t$128,470.00\t17 de noviembre de 2026\tVer\nCNC-1126_08-C\tEnviada· viendo\tVersión C: ajuste final de precio del panel por negociación con el cliente.\t$112,500.00\t$130,500.00\t17 de noviembre de 2026\tVer"
    }
  },
  {
    "paso": "aceptar-B",
    "resultado": "ok",
    "detalle": {
      "cabecera": "← Cola de propuestas\nCNC-1126_08\nVenta confirmada\nRevisión aceptada\n\nManufactura Fronteriza QA1711 S.A. de C.V.\n\nA · Enviada\nB · Venta confirmada ✓\nC · Enviada\nRevisión B\nVenta confirmada\nMotivo: El cliente solicita ajustar precio unitario y cantidad del panel MDF.\n\nOrden creada (O-1126_07) · compromiso 7 de diciembre de 2026\n\nResumen\nÍtems\nRuteo/Costeo\nArchivos\nPDFs\nSeguimiento\nActividad\nFolio\nCNC-1126_08\nEstado\nVenta confirmada\nRevisión aceptada\nB\nCreada\n17 de noviembre de 2026\nHistorial de versiones\n\nCada modificación se conserva como una versión independiente; las anteriores se abren en solo lectura.\n\nVersión\tEstado\tMotivo\tSubtotal de venta\tTotal cliente\tValidada\tAcciones\nCNC-1126_08-A\tEnviada\t—\t$112,100.00\t$130,036.00\t17 de noviembre de 2026\tVer\nCNC-1126_08-B\tVenta confirmada· viendo\tEl cliente solicita ajustar precio unitario y cantidad del panel MDF.\t$110,750.00\t$128,470.00\t17 de noviembre de 2026\tVer\nCNC-1126_08-C\tEnviada\tVersión C: ajuste final de precio del panel por negociación con el cliente.\t$112,500.00\t$130,500.00\t17 de noviembre de 2026\tVer"
    }
  },
  {
    "paso": "verificar-solo-lectura-A-C",
    "resultado": "ok",
    "detalle": {
      "A": {
        "txt": "← Cola de propuestas\nCNC-1126_08\nVenta confirmada\nRevisión aceptada\n\nManufactura Fronteriza QA1711 S.A. de C.V.\n\nA · Enviada\nB · Venta confirmada ✓\nC · Enviada\nRevisión A\nEnviada\n\nVersión histórica: la propuesta ya tiene una revisión aceptada; esta versión se conserva solo para consulta.\n\nTotales de la revisión: $112,100.00 + IVA = $130,036.00\n\nResumen\nÍtems\nRuteo/Costeo\nArchivos\nPDFs\nSeguimiento\nActividad\nFolio\nCNC-1126_08\nEstado\nVenta confirmada\nRevisión aceptada\nB\nCreada\n17 de noviembre de 2026\nHistorial de versiones\n\nCada modificación se conserva como una versión independiente; las anterio",
        "botones": [
          "A · Enviada",
          "B · Venta confirmada ✓",
          "C · Enviada",
          "Ver",
          "Ver",
          "Ver"
        ],
        "tieneAceptar": false,
        "tieneNuevaVersion": false
      },
      "C": {
        "txt": "← Cola de propuestas\nCNC-1126_08\nVenta confirmada\nRevisión aceptada\n\nManufactura Fronteriza QA1711 S.A. de C.V.\n\nA · Enviada\nB · Venta confirmada ✓\nC · Enviada\nRevisión C\nEnviada\n\nVersión histórica: la propuesta ya tiene una revisión aceptada; esta versión se conserva solo para consulta.\n\nTotales de la revisión: $112,500.00 + IVA = $130,500.00\n\nResumen\nÍtems\nRuteo/Costeo\nArchivos\nPDFs\nSeguimiento\nActividad\nFolio\nCNC-1126_08\nEstado\nVenta confirmada\nRevisión aceptada\nB\nCreada\n17 de noviembre de 2026\nHistorial de versiones\n\nCada modificación se conserva como una versión independiente; las anterio",
        "botones": [
          "A · Enviada",
          "B · Venta confirmada ✓",
          "C · Enviada",
          "Ver",
          "Ver",
          "Ver"
        ],
        "tieneAceptar": false,
        "tieneNuevaVersion": false
      }
    }
  },
  {
    "paso": "verificar-orden-generada",
    "resultado": "ok",
    "detalle": {
      "tabla": "Máquina\nTodas las máquinas\nEstado\nConfirmada\nPlanificada\nLista\nEn producción\nProducción completada\nCerrada\nCancelada\nLimpiar filtros\nActualizar\nÓrdenes de producción con estado, prioridad y avance agregado\nFOLIO\tESTADO\tPRIORIDAD\tCOMPROMISO\tPARTIDAS\tAVANCE\tACCIONES\n\nO-1126_07\nPropuesta CNC-1126_08\n\t\nConfirmada\tAlta\t7 de diciembre de 2026\nOperativa 7 de diciembre de 2026\n\t2\t\n0%\n0/75\n\t\nAbrir\n\n\nO-1126_05\nPropuesta CNC-1126_06\n\t\nPlanificada\tNormal\t14 de noviembre de 2026\nOperativa 14 de noviembre de 2026\n\t1\t\n0%\n0/100\n\t\nAbrir\nLiberar\n\n\nO-1126_03\nPropuesta CNC-1126_04\n\t\nEn producción\tNormal\t15 de noviembre de 2026\nOperativa 15 de noviembre de 2026\n\t2\t\n86%\n250/290\n\t\nAbrir\n\n\nO-1126_06\nPropuesta CNC-1126_07\nArchivada 15 de noviembre de 2026\n\t\nProducción completada\nEntregado 200/200\n\tNormal\t4 de diciembre de 2026\nOperativa 4 de diciembre de 2026\n\t1\t\n100%\n200/200\n\t\nAbrir\n\n\nO-1126_04\nPropuesta CNC-11",
      "textoFila": "sin fila"
    }
  }
]
```
