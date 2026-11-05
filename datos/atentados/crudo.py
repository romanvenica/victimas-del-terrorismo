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

VINETA = re.compile(r"^[\ue000-\uf8ff•▪●◦\-–]\s*")

def unir(lineas):
    """Junta los renglones cortados por el ancho de pagina; los parrafos quedan separados.
    Las listas con viñetas quedan un renglón por item («• Roque, Juan Julio»): el PDF
    a veces trae las viñetas solas y los nombres abajo, así que se vuelven a juntar."""
    parrafos, actual, lista = [], [], 0
    for l in lineas:
        s = l.strip()
        if s and VINETA.sub("", s) == "":          # una viñeta sola: anuncia un item
            lista += 1; continue
        if not s:
            if actual: parrafos.append(" ".join(actual) if not isinstance(actual[0], tuple) else "\n".join(x[1] for x in actual)); actual = []
            continue
        if VINETA.match(s) and len(s) > 2 and s[0] not in "-–":
            item = "• " + VINETA.sub("", s)
        elif lista:
            item = "• " + s; lista -= 1
        else:
            item = None
        if item:
            if actual and not isinstance(actual[0], tuple):
                parrafos.append(" ".join(actual)); actual = []
            actual.append(("i", item))
        else:
            if actual and isinstance(actual[0], tuple):
                # renglón cortado de un item largo: va pegado al item anterior
                if s[:1].islower(): actual[-1] = ("i", actual[-1][1] + " " + s); continue
                parrafos.append("\n".join(x[1] for x in actual)); actual = []
            actual.append(s)
    if actual: parrafos.append(" ".join(actual) if not isinstance(actual[0], tuple) else "\n".join(x[1] for x in actual))
    return "\n\n".join(parrafos)

NOTAS = {}
NOTA_RE = re.compile(r"^\s*(\d{1,4})(?: (\S.*)|([A-ZÁÉÍÓÚ“].*))$")   # «115 La Razón» o pegado «234Los 70»

def separar_notas(lineas, ultima):
    """Las notas al pie estan al final de la pagina: «115 La Razón 29/07/65...».
    La primera tiene que seguir a la ultima nota vista (con margen por saltos)
    y debajo no puede haber ningun hecho nuevo (■)."""
    for k, l in enumerate(lineas):
        m = NOTA_RE.match(l)
        if not m or not (ultima < int(m.group(1)) <= ultima + 40): continue
        if re.match(r"(de|del|al|y|a|años?|personas|hs)\b", m.group(2) or m.group(3), re.I): continue   # «12 de abril», «24 años»
        if any("■" in r for r in lineas[k:]): continue    # debajo de una nota no puede empezar un hecho
        notas, actual, prev = {}, None, ultima
        for r in lineas[k:]:
            m2 = NOTA_RE.match(r)
            if m2 and prev < int(m2.group(1)) <= prev + 5:
                actual = prev = int(m2.group(1)); notas[actual] = (m2.group(2) or m2.group(3)).strip()
            elif r.strip() and actual:
                t = notas[actual]
                notas[actual] = (t[:-1] if t.endswith("-") else t + " ") + r.strip()
        return lineas[:k], notas
    return lineas, {}

def marcar_llamadas(cuerpo, notas):
    """Cambia la llamada «palabra 115» por «palabra⟦115⟧» (la ultima aparicion en la pagina)."""
    texto = "\n".join(cuerpo)
    for n in sorted(notas):
        pat = re.compile(r"(?<=[^\d\s/,:-])\s?" + str(n) + r"(?![\d/])")
        ms = list(pat.finditer(texto))
        if ms:
            m = ms[-1]
            texto = texto[:m.start()] + "⟦%d⟧" % n + texto[m.end():]
    return texto.split("\n")

def procesar(ruta_txt, tomo):
    paginas = open(ruta_txt, encoding="utf-8").read().split("\f")
    # renglones con su pagina, sin el armado de pagina ni las notas al pie;
    # las notas quedan en NOTAS[numero] y su llamada en el texto como «⟦n⟧»
    renglones, ultima = [], 0
    NOTAS.clear()
    for i, pag in enumerate(paginas, start=1):
        lineas = [l for l in pag.split("\n") if l.strip() not in ENCABEZADOS and l.strip() != str(i)]
        cuerpo, notas = separar_notas(lineas, ultima)
        if notas:
            ultima = max(notas)
            NOTAS.update(notas)
            cuerpo = marcar_llamadas(cuerpo, notas)
        for l in cuerpo:
            renglones.append((i, l))
    textos = [l.strip() for _, l in renglones]
    inicio = max(k for k, s in enumerate(textos) if s == "PARTE " + "I" * tomo)   # la ultima: el comienzo real
    anexos = max(k for k, s in enumerate(textos) if s == "ANEXOS")

    salida, actual, anio_ctx, orden = [], None, None, 0
    def cerrar():
        nonlocal actual
        if actual:
            t = unir(actual.pop("_l"))
            nums = [int(x) for x in re.findall(r"⟦(\d+)⟧", t)]
            actual["texto"] = re.sub(r"\s*⟦\d+⟧", "", t)
            actual["notas"] = [NOTAS[n] for n in nums if n in NOTAS]
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
    aproximar(salida)
    return salida

def aproximar(filas):
    """A las entradas de la cronología sin fecha les pone el día 1 del mes de
    la entrada fechada más cercana del mismo capítulo, y las marca con
    fecha_aprox = true. 'Fines de AAAA' va a diciembre de ese año."""
    # títulos sueltos sin fecha (ej. «GUERRA DE MALVINAS») no son hechos: afuera
    sueltos = [r for r in filas if r["seccion"] == "cronología" and not r["fecha"]
               and len(r["texto"]) < 60 and r["texto"] == r["texto"].upper()]
    for r in sueltos:
        filas.remove(r)
    cron = [r for r in filas if r["seccion"] == "cronología"]
    for i, r in enumerate(cron):
        r["fecha_aprox"] = False
        if r["fecha"]:
            continue
        m = re.match(r"Fines de (\d{4})", r["texto"])
        if m:
            r["fecha"], r["fecha_aprox"] = m.group(1) + "-12-01", True
            continue
        mejor = None
        for j, o in enumerate(cron):
            if (len(o["fecha"]) >= 7 and not o.get("fecha_aprox")
                    and o["anio_capitulo"] == r["anio_capitulo"]
                    and o["fecha"][:4] == str(r["anio_capitulo"])):
                dist = (abs(j - i), j > i)  # empate: gana la anterior
                if mejor is None or dist < mejor[0]:
                    mejor = (dist, o["fecha"][:7])
        r["fecha"] = (mejor[1] if mejor else str(r["anio_capitulo"]) + "-01") + "-01"
        r["fecha_aprox"] = True

if __name__ == "__main__":
    tomo, entrada, destino = int(sys.argv[1]), sys.argv[2], sys.argv[3]
    filas = procesar(entrada, tomo)
    with open(destino, "w", encoding="utf-8") as f:
        for r in filas: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    cron = [r for r in filas if r["seccion"] == "cronología"]
    print("tomo %d: %d renglones, %d de cronología, %d con fecha completa, %d con fecha aproximada"
          % (tomo, len(filas), len(cron), sum(1 for r in cron if len(r["fecha"]) == 10),
             sum(1 for r in cron if r.get("fecha_aprox"))))
