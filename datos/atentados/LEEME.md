# Atentados — datos crudos

Primero se carga todo tal cual viene en los tres tomos, sin clasificar.
Ordenar y separar viene después, sobre esto.

- `originales/` — los tomos como llegaron (PDF, fotos), sin tocar.
- `crudo/tomo1.jsonl`, `tomo2.jsonl`, `tomo3.jsonl` — un renglón por cada
  entrada del tomo, en el mismo orden que el libro.

Cada renglón tiene:

| campo | qué es |
|---|---|
| `tomo` | 1, 2 o 3 |
| `orden` | posición de la entrada dentro del tomo |
| `pagina` | página donde empieza |
| `fecha_texto` | la fecha exactamente como está impresa |
| `fecha` | la misma en `AAAA-MM-DD`, si se puede leer; si no, vacío |
| `texto` | el texto de la entrada completo, sin corregir ni resumir |

Nada se interpreta en esta etapa: si algo no se lee, queda como está.
