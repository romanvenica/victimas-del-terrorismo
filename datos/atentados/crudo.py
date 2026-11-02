"""Pasa un tomo de 'Cronica de una guerra negada' a datos crudos (JSONL).

Un renglon por entrada, en el orden del libro. No interpreta nada: solo
separa las entradas, anota pagina y fecha, y saca lo que es armado de pagina
(el encabezado que se repite y el numero de pagina). El texto queda tal cual.
"""
import json, re, sys

MESES = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,"julio":7,
         "agosto":8,"septiembre":9,"setiembre":9,"octubre":10,"noviembre":11,"diciembre":12}
ENCABEZADOS = {"JORGE HÉCTOR DI PASQUALE", "CRÓNICA DE UNA GUERRA NEGADA"}

def anio4(yy, contexto):
    yy = int(yy)
    if yy >= 100: return yy
    siglo = (contexto // 100) * 100 if contexto else 1900
    return siglo + yy

def leer_fecha(cab, anio_ctx):
    """Devuelve (fecha_texto, fecha_normalizada) a partir del comienzo de la entrada."""
    c = cab.strip()
    mes = lambda t: MESES.get(t.lower())
    # 25/04/55 · 15-16/06/55
    m = re.match(r"(\d{1,2})(?:\s*[-y/al]+\s*\d{1,2})*/(\d{1,2})/(\d{2,4})", c)
    if m:
        d, mm, a = int(m.group(1)), int(m.group(2)), anio4(m.group(3), anio_ctx)
        if 1 <= mm <= 12 and 1 <= d <= 31:
            return m.group(0), "%04d-%02d-%02d" % (a, mm, d)
        return m.group(0), ""
    # 9 de mayo de 1955 · 23/24 de enero de 1919 · 13 enero de 1919 · 15 de julio (año del capitulo)
    m = re.match(r"(\d{1,2})(?:\s*[-/y]\s*\d{1,2})?\s+(?:de\s+)?([a-záéíóú]+)(?:\s+(?:de|del)\s+(\d{2,4}))?", c, re.I)
    if m and mes(m.group(2)):
        a = anio4(m.group(3), anio_ctx) if m.group(3) else anio_ctx
        if a: return m.group(0), "%04d-%02d-%02d" % (a, mes(m.group(2)), int(m.group(1)))
        return m.group(0), ""
    # Enero/1955 · Mayo/72 · Marzo-Junio/77
    m = re.match(r"([A-Za-záéíóú]+)(?:\s*-\s*[A-Za-záéíóú]+)?\s*/\s*(\d{2,4})", c)
    if m and mes(m.group(1)):
        return m.group(0), "%04d-%02d" % (anio4(m.group(2), anio_ctx), mes(m.group(1)))
    # Mayo de 1873
    m = re.match(r"([A-Za-záéíóú]+)\s+(?:de|del)\s+(\d{4})", c)
    if m and mes(m.group(1)):
        return m.group(0), "%04d-%02d" % (int(m.group(2)), mes(m.group(1)))
    # Año/1956 · Segundo semestre de 1974 · Acciones realizadas durante 1977
    m = re.match(r"(?:Año\s*/?\s*|[^.]{0,40}?(?:semestre|durante|año)\s+(?:de\s+)?)(\d{4})", c, re.I)
    if m:
        return m.group(0), m.group(1)
    return "", ""

def unir(lineas):
    """Junta los renglones cortados por el ancho de pagina; los parrafos quedan separados."""
    parrafos, actual = [], []
    for l in lineas:
        if l.strip(): actual.append(l.strip())
        elif actual: parrafos.append(" ".join(actual)); actual = []
    if actual: parrafos.append(" ".join(actual))
    return "\n\n".join(parrafos)

def procesar(ruta_txt, tomo):
    paginas = open(ruta_txt, encoding="utf-8").read().split("\f")
    # renglones con su pagina, sin el armado de pagina
    renglones = []
    for i, pag in enumerate(paginas, start=1):
        for l in pag.split("\n"):
            s = l.strip()
            if s in ENCABEZADOS or s == str(i): continue
            renglones.append((i, l))
    textos = [l.strip() for _, l in renglones]
    inicio = max(k for k, s in enumerate(textos) if s == "PARTE " + "I" * tomo)   # la ultima: el comienzo real
    anexos = max(k for k, s in enumerate(textos) if s == "ANEXOS")

    salida, actual, anio_ctx, orden = [], None, None, 0
    def cerrar():
        nonlocal actual
        if actual:
            actual["texto"] = unir(actual.pop("_l"))
            salida.append(actual)
        actual = None
    def abrir(seccion, pagina, fecha_texto="", fecha="", primera=""):
        nonlocal actual, orden
        cerrar(); orden += 1
        actual = {"tomo": tomo, "orden": orden, "seccion": seccion, "pagina": pagina,
                  "anio_capitulo": anio_ctx if seccion == "cronología" else None,
                  "fecha_texto": fecha_texto, "fecha": fecha, "_l": [primera] if primera else []}

    abrir("presentación", renglones[0][0])
    for k, (pag, l) in enumerate(renglones):
        s = l.strip()
        if k == inicio: abrir("presentación", pag)                # el tramo de la parte, antes del primer año
        if k == anexos: abrir("anexos", pag); actual["_l"].append(l); continue
        if k > anexos:
            if re.match(r"^(ANEXO\s+\d+|BIBLIOGRAF)", s): abrir("anexos", pag)
            actual["_l"].append(l); continue
        seccion = "cronología" if k >= inicio else "presentación"
        if k >= inicio:
            m = re.match(r"^(?:AÑO|Año) (\d{4})$", s)       # el libro usa las dos
            if m:
                anio_ctx = int(m.group(1)); cerrar(); continue
        if "■" in l:
            # puede haber varias entradas en el mismo renglon
            pedazos = l.split("■")
            if pedazos[0].strip():
                if actual is None: abrir(seccion, pag)
                actual["_l"].append(pedazos[0])
            for p in pedazos[1:]:
                ft, f = leer_fecha(p, anio_ctx)
                abrir(seccion, pag, ft, f, p.strip())
            continue
        if actual is None: abrir(seccion, pag)
        actual["_l"].append(l)
    cerrar()
    return salida

if __name__ == "__main__":
    tomo, entrada, destino = int(sys.argv[1]), sys.argv[2], sys.argv[3]
    filas = procesar(entrada, tomo)
    with open(destino, "w", encoding="utf-8") as f:
        for r in filas: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    cron = [r for r in filas if r["seccion"] == "cronología"]
    print("tomo %d: %d renglones, %d de cronología, %d con fecha completa, %d sin fecha"
          % (tomo, len(filas), len(cron), sum(1 for r in cron if len(r["fecha"]) == 10),
             sum(1 for r in cron if not r["fecha"])))
