# Atentados — datos crudos

Los tres tomos de *Crónica de una guerra negada* (Jorge Héctor Di Pasquale),
pasados tal cual vienen, sin clasificar. Ordenar y separar viene después.

**Los tomos y su texto no se suben al repositorio**: el repositorio es
público y sería publicar el libro entero. Quedan solo en la computadora de
trabajo y se regeneran en segundos con `crudo.py` a partir de los PDF:

    pdftotext -enc UTF-8 "PARTE I.pdf" parte1.txt
    python3 crudo.py 1 parte1.txt crudo/tomo1.jsonl

- `originales/` — los PDF, sin tocar.
- `crudo/tomo1.jsonl`, `tomo2.jsonl`, `tomo3.jsonl` — un renglón por entrada.

Cada entrada del libro empieza con `■` y la fecha. Cada renglón tiene:

| campo | qué es |
|---|---|
| `tomo` | 1, 2 o 3 |
| `orden` | posición dentro del tomo, en el orden del libro |
| `seccion` | `presentación` (lo que va antes de la cronología, que en el tomo 1 incluye los antecedentes desde 1873), `cronología` o `anexos` |
| `pagina` | página del PDF donde empieza (coincide con la impresa) |
| `anio_capitulo` | el «Año XXXX» bajo el que está la entrada |
| `fecha_texto` | la fecha exactamente como está impresa |
| `fecha` | la misma en `AAAA-MM-DD`, `AAAA-MM` o `AAAA`, según lo que diga. Si el libro no da fecha, el día 1 del mes de la entrada fechada más cercana del mismo capítulo («Fines de AAAA» → diciembre) |
| `fecha_aprox` | `true` cuando la fecha la puse yo así, no el libro |
| `texto` | el texto completo de la entrada, sin corregir ni resumir |

Los títulos sueltos sin fecha (como «GUERRA DE MALVINAS») se descartan.

Lo único que se saca es el armado de página: el encabezado que se repite
(«Jorge Héctor Di Pasquale», «Crónica de una guerra negada»), el número de
página y los títulos «Año XXXX», que pasan a `anio_capitulo`. Los renglones
que el PDF cortó por el ancho de página se vuelven a juntar.

## Lo que hay

| tomo | período | entradas de cronología | con fecha completa |
|---|---|---|---|
| 1 | 1955 – 25/05/1973 | 2.315 | 2.134 |
| 2 | 25/05/1973 – 15/10/1975 | 2.301 | 2.237 |
| 3 | 15/10/1975 – 1990 | 1.626 | 1.478 |

El resto tiene fecha parcial (mes o año). Quedan 17 sin ninguna fecha,
que son decretos o resúmenes sin fecha en el libro.

## Índice liviano

`python3 datos/atentados/indice.py` arma `crudo/indice.tsv` (no se sube al repo):
una línea por hecho de la cronología con `fecha, tomo, pagina, orden, resumen`
(primeros ~150 caracteres). Pesa un tercio del texto completo y sirve para ubicar
hechos; el detalle se busca después en los `.jsonl` por `tomo` + `orden`.
