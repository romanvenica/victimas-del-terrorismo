# Atentados — formato de los datos

Un renglón por atentado, en `atentados.csv`. Se abre con doble clic en Excel
o en Google Sheets. Separado por punto y coma, en UTF-8.

Los atentados van en orden de fecha, igual que en los tomos.

## Columnas

| columna | qué va | ejemplo |
|---|---|---|
| `id` | número correlativo | `AT-0001` |
| `tomo` | 1, 2 o 3 | `1` |
| `pagina` | página del tomo donde está el caso | `69` |
| `fecha` | `AAAA-MM-DD`. Si falta el día, `AAAA-MM`. Si falta el mes, `AAAA` | `1960-02-16` |
| `hora` | `HH:MM`, si el libro la dice | `23:30` |
| `provincia` | igual que en el memorial | `Córdoba` |
| `localidad` | ciudad o pueblo | `Alta Gracia` |
| `lugar` | edificio, calle, dirección | `Depósito de Shell-Mex` |
| `tipo` | una de la lista de abajo | `Bomba / explosivo` |
| `objetivo` | una de la lista de abajo | `Empresa` |
| `objetivo_detalle` | quién o qué fue atacado | `Shell-Mex` |
| `organizacion` | de la lista de abajo; si son varias, separadas por ` / ` | `Uturuncos` |
| `reivindicado` | `sí`, `no` o vacío si no consta | `sí` |
| `muertos` | número | `13` |
| `heridos` | número | `4` |
| `secuestrados` | número | `0` |
| `danos` | daños materiales, en pocas palabras | `ardieron 3 millones de litros de nafta` |
| `victimas` | personas del memorial que murieron ahí, separadas por ` / ` | `ACOSTA, Andrés` |
| `fuente` | lo que cita el libro | `Los del 73, Chávez y Lewinger, pág. 33` |
| `relato` | el texto del caso, completo | |
| `notas` | dudas de la carga | `la fecha no se lee bien` |

**Vacío quiere decir "no consta".** Un `0` quiere decir que el libro dice que
no hubo. No es lo mismo: no se rellena con cero lo que no se sabe.

## Listas cerradas

Para poder contar y comparar, estas columnas usan siempre las mismas palabras.

**tipo:** Bomba / explosivo · Incendio · Ataque armado · Asesinato · Secuestro ·
Copamiento · Asalto / robo · Robo de armas · Toma · Otro

**objetivo:** Fuerzas Armadas · Policía / Seguridad · Empresa · Comercio ·
Sindicato · Partido político · Edificio público · Medio de prensa · Iglesia ·
Domicilio particular · Vía pública / transporte · Otro

**organizacion:** Montoneros · ERP · FAR · FAP · FAL · Uturuncos · Descamisados ·
Otra · No consta

Si aparece algo que no entra en la lista, va `Otro` u `Otra` y se aclara en
`notas`. Si se repite mucho, se agrega a la lista.
