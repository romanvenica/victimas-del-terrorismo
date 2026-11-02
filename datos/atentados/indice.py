"""Arma un índice liviano (una línea por hecho) a partir de crudo/tomo*.jsonl.

Salida: crudo/indice.tsv con columnas
  fecha  tomo  pagina  orden  resumen
'resumen' son los primeros ~150 caracteres del texto, sin la fecha inicial.
Sirve para ubicar hechos rápido; el texto completo sigue en los .jsonl.
"""
import json, re, pathlib

AQUI = pathlib.Path(__file__).parent
CRUDO = AQUI / "crudo"
LARGO = 150

filas = []
for n in (1, 2, 3):
    for linea in open(CRUDO / f"tomo{n}.jsonl", encoding="utf-8"):
        d = json.loads(linea)
        if d["seccion"] != "cronología":
            continue
        t = d["texto"].replace("\n", " ").replace("\t", " ")
        ft = d["fecha_texto"]
        if ft and t.startswith(ft):
            t = t[len(ft):].lstrip(" .:-")
        t = re.sub(r"\s+", " ", t)
        if len(t) > LARGO:
            t = t[:LARGO].rsplit(" ", 1)[0] + "…"
        filas.append((d["fecha"] or "?", d["tomo"], d["pagina"], d["orden"], t))

with open(CRUDO / "indice.tsv", "w", encoding="utf-8") as f:
    f.write("fecha\ttomo\tpagina\torden\tresumen\n")
    for r in filas:
        f.write("\t".join(str(x) for x in r) + "\n")
print(len(filas), "hechos ->", CRUDO / "indice.tsv")
