"""Arma los datos de los hechos para la web a partir de crudo/tomo*.jsonl.

Salida (en web/, fuera del repo hasta que se decida publicar):
  hechos.json   los hechos que muestra la línea de tiempo
  contexto.json las entradas de contexto (decretos, elecciones, etc.), guardadas para más adelante

Cada hecho:
  id  "tomo-orden"           f   fecha AAAA-MM-DD (o AAAA-MM / AAAA)   a  1 si la fecha es aproximada
  o   organizaciones          p   provincia      l  localidad
  tp  tipos de hecho          v   víctimas del memorial (posición en victimas.json)
  tx  texto completo          nt  notas al pie   tm/pg  tomo y página
"""
import json, re, unicodedata, pathlib, collections

AQUI = pathlib.Path(__file__).parent
RAIZ = AQUI.parent.parent
GOLPE = "1976-03-24"

def sin_tildes(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()

# ---------- organizaciones ----------
# (patrón sobre el primer tramo del texto, nombre que se muestra, es de derecha)
ORGS = [
    (r"\bAAA\b|Triple A|Alianza Anticomunista Argentina", "AAA", True),
    (r"anticomunista", "Anticomunista no identificada", True),
    (r"Libertadores de Am|\bCLA\b", "Comando Libertadores de América", True),
    (r"Comando Restaurador|\bCRNJ\b", "Comando Restaurador Nacional Justicialista", True),
    (r"ERP[ -]*22", "ERP 22 de Agosto", False),
    (r"PRT|\bERP\b", "PRT-ERP", False),
    (r"Montoneros|Descamisados|\bUES\b|\bJTP\b", "Montoneros", False),
    (r"\bFAR\b", "FAR", False),
    (r"\bFAL\b", "FAL", False),
    (r"\bFAP\b|Peronismo de Base", "FAP", False),
    (r"\bOCPO\b|Poder Obrero", "OCPO", False),
    (r"\bELN\b", "ELN", False),
    (r"\bEGP\b", "EGP", False),
    (r"\bMRA\b", "MRA", False),
    (r"\bVC\b|Vanguardia Comunista", "Vanguardia Comunista", False),
    (r"Uturuncos", "Uturuncos", False),
    (r"\bFARN\b", "FARN", False),
    (r"\bGEL\b", "GEL", False),
    (r"\bENR\b", "ENR", False),
    (r"\bOAP\b", "OAP", False),
    (r"FR-17|17 de Octubre", "FR-17", False),
    (r"\bFRIP\b", "FRIP", False),
    (r"\bGOR\b", "GOR", False),
    (r"Tacuara|\bMNRT\b", "Tacuara (MNRT)", False),
    (r"Resistencia Peronista", "Resistencia Peronista", False),
    (r"Camilo Torres", "Comando Camilo Torres", False),
    (r"Comando Argentino Revolucionario", "CARP", False),
    (r"\bCRP\b|Comandos? de la Resistencia Peronista", "Resistencia Peronista", False),
    (r"Nueva Era", "Movimiento Nueva Era", False),
    (r"marxista|izquierda|subversiv", "Marxista no identificada", False),
    (r"[Nn]o [Ii]dentificad", "No identificada", False),
]

def organizaciones(cab):
    """Devuelve (lista de organizaciones, es_de_derecha) o (None, None) si es contexto."""
    encontradas, derecha = [], False
    for pat, nombre, der in ORGS:
        if re.search(pat, cab) and nombre not in encontradas:
            # «Organización marxista» y «no identificada» no se suman a una con nombre
            if nombre in ("Marxista no identificada", "No identificada") and encontradas: continue
            if nombre == "No identificada" and "Marxista no identificada" in encontradas: continue
            encontradas.append(nombre); derecha = derecha or der
    if not encontradas: return None, None
    return encontradas, derecha

# ---------- lugares ----------
PROVINCIAS = ["Buenos Aires", "Capital Federal", "Córdoba", "Tucumán", "Santa Fe", "Formosa",
    "Mendoza", "Jujuy", "Chaco", "Salta", "Corrientes", "Entre Ríos", "San Juan", "Chubut",
    "San Luis", "Catamarca", "Misiones", "Santiago del Estero", "La Rioja", "Neuquén",
    "Río Negro", "La Pampa", "Santa Cruz", "Tierra del Fuego"]
CORTO = {"Santiago del Estero": "Sgo. del Estero"}     # como lo escribe el filtro del sitio
EXTERIOR = ["Cuba", "La Habana", "España", "Madrid", "Uruguay", "Montevideo", "Italia", "Roma",
    "Chile", "Santiago de Chile", "Bolivia", "Paraguay", "México", "Perú", "Lima", "Brasil",
    "Francia", "París", "Nicaragua", "Managua", "Argelia", "Venezuela", "Caracas", "Estados Unidos",
    "Washington", "Nueva York", "Panamá", "Colombia", "Ecuador", "Checoslovaquia", "Praga",
    "Unión Soviética", "Moscú", "China", "Vietnam", "Londres", "Inglaterra", "Alemania", "Suiza",
    "Ginebra", "Líbano", "Siria", "Libia", "Suecia", "Holanda", "Bélgica", "Portugal", "Israel"]
LOCALIDADES = {
    "Santa Fe": ["Rosario", "Villa Constitución", "San Lorenzo", "Cañada de Gómez",
        "Villa Gobernador Gálvez", "Reconquista", "Rafaela", "Venado Tuerto", "Granadero Baigorria",
        "Capitán Bermúdez", "Fray Luis Beltrán", "Puerto General San Martín", "Casilda", "Firmat"],
    "Córdoba": ["Ferreyra", "Alta Gracia", "Villa Allende", "La Calera", "San Francisco", "Villa María",
        "Río Ceballos", "Río Cuarto", "Cosquín", "Jesús María", "Carlos Paz", "Villa Carlos Paz",
        "Unquillo", "Bell Ville", "Río Tercero", "Cruz del Eje", "Saldán", "Malagueño"],
    "Tucumán": ["Famaillá", "Monteros", "Tafí Viejo", "San Miguel de Tucumán", "Concepción",
        "Lules", "Acheral", "Santa Lucía", "Aguilares", "Tafí del Valle", "Bella Vista", "Caspinchango"],
    "Chaco": ["Resistencia", "Presidencia Roque Sáenz Peña", "Sáenz Peña"],
    "Entre Ríos": ["Paraná", "Concordia", "Gualeguaychú", "Concepción del Uruguay"],
    "Salta": ["Orán", "San Ramón de la Nueva Orán", "Tartagal", "Metán"],
    "Jujuy": ["San Salvador de Jujuy", "Ledesma", "Libertador General San Martín", "San Pedro"],
    "Mendoza": ["Godoy Cruz", "Guaymallén", "Las Heras", "San Rafael", "Maipú", "Luján de Cuyo"],
    "Misiones": ["Posadas", "Oberá", "Eldorado"],
    "Chubut": ["Trelew", "Rawson", "Comodoro Rivadavia", "Puerto Madryn"],
    "Formosa": ["Clorinda"],
    "Corrientes": ["Goya", "Paso de los Libres"],
    "Neuquén": ["Cutral Có", "Plaza Huincul"],
    "Río Negro": ["Bariloche", "San Carlos de Bariloche", "Viedma", "General Roca", "Cipolletti"],
    "Buenos Aires": ["La Plata", "Bahía Blanca", "Mar del Plata", "Lanús", "Avellaneda", "San Martín",
        "La Matanza", "Quilmes", "Morón", "San Isidro", "Lomas de Zamora", "Berazategui", "Olivos",
        "San Nicolás", "Tigre", "Haedo", "Ramos Mejía", "Berisso", "Villa Ballester", "Moreno",
        "Zárate", "Bernal", "Florencio Varela", "Ensenada", "Campana", "San Justo", "Banfield", "Munro",
        "Ezeiza", "Ciudadela", "Monte Grande", "Vicente López", "San Miguel", "Adrogué", "Castelar",
        "Carapachay", "Hurlingham", "Caseros", "Villa Adelina", "Merlo", "Pilar", "Escobar",
        "Campo de Mayo", "Martínez", "Temperley", "Villa Elisa", "José C. Paz", "Ituzaingó", "Ranelagh",
        "Almirante Brown", "San Fernando", "Florida", "Esteban Echeverría", "Gonnet", "La Tablada",
        "Azul", "Bella Vista", "Tortuguitas", "Don Torcuato", "Garín", "La Lucila", "William Morris",
        "Remedios de Escalada", "San Andrés", "Gerli", "Monte Chingolo", "Ringuelet",
        "Loma Hermosa", "San Francisco Solano", "Santos Lugares", "Tres de Febrero", "Wilde",
        "Sarandí", "Valentín Alsina", "Lomas del Mirador", "González Catán", "Laferrere",
        "Isidro Casanova", "Villa Martelli", "Boulogne", "Beccar", "Acassuso", "San Antonio de Padua",
        "Libertad", "Burzaco", "Claypole", "Longchamps", "Glew", "Lanús Oeste", "Lanús Este",
        "Villa Lugano", "Tandil", "Olavarría", "Junín", "Pergamino", "Necochea", "Luján", "Chivilcoy",
        "Mercedes", "Saladillo", "Tres Arroyos", "Punta Alta", "Puerto Belgrano", "Baradero",
        "San Pedro", "Ramallo", "Villa Bosch", "El Palomar", "Palomar", "Morón Sur", "Lomas",
        "Partido de General San Martín", "General San Martín", "General Pacheco", "Benavídez",
        "Villa Lynch", "Billinghurst", "Del Viso", "Grand Bourg", "Los Polvorines", "Boulogne Sur Mer",
        "Villa Tesei", "Ciudad Jardín", "Ciudad Evita", "Aldo Bonzi", "Tapiales", "Villa Madero",
        "Victoria", "Virreyes", "Rafael Calzada", "José Mármol", "Lomas de Zamora", "Turdera",
        "Llavallol", "Ezpeleta", "Quilmes Oeste", "Don Bosco", "Hudson", "City Bell", "Tolosa",
        "Los Hornos", "Villa Gesell", "Pinamar", "Chascomús", "Dolores", "Cañuelas", "Marcos Paz",
        "General Rodríguez", "Paso del Rey", "Villa Ballester", "Ramos Mejia", "Ezeiza"],
}
LOC2PROV = {sin_tildes(l): p for p, ls in LOCALIDADES.items() for l in ls}
# lo que ya sabemos por las víctimas del memorial
for v in json.load(open(RAIZ / "victimas.json", encoding="utf-8")):
    if v.get("l") and v.get("p"):
        prov = {"Sgo. del Estero": "Santiago del Estero"}.get(v["p"], v["p"])
        LOC2PROV.setdefault(sin_tildes(v["l"]), prov)
CAPITALES = {"Córdoba": "Córdoba", "Santa Fe": "Santa Fe", "Tucumán": "Tucumán",
    "San Miguel de Tucumán": "Tucumán", "Mendoza": "Mendoza", "Salta": "Salta",
    "Corrientes": "Corrientes", "San Juan": "San Juan", "San Luis": "San Luis",
    "Santiago del Estero": "Santiago del Estero", "Catamarca": "Catamarca", "La Rioja": "La Rioja",
    "Jujuy": "Jujuy", "Formosa": "Formosa", "Neuquén": "Neuquén", "Paraná": "Entre Ríos",
    "Resistencia": "Chaco", "Posadas": "Misiones", "Santa Rosa": "La Pampa", "Buenos Aires": "Capital Federal"}
GBA = re.compile(r"^(Gran Buenos Aires|Conurbano|Zona (Sur|Norte|Oeste)|Provincia de Buenos Aires)", re.I)
NO_LUGAR = re.compile(r"enfrentamiento|propaganda|explosi|operaci|colabor|abatido|hubo|fue |fueron |"
                      r"se |robaron|secuestr|asesin|atentado|ataque|comando|columna|unidad|regional|"
                      r"bloque|frente|^mr|^\(|\*", re.I)

def lugar(segmentos):
    """Busca provincia y localidad en los tramos cortos que siguen a la organización."""
    prov, loc = "", ""
    for s in segmentos[:4]:
        s = s.strip().strip("“”\"")
        if not s or len(s) > 45: break
        if NO_LUGAR.search(s): continue
        m = re.match(r"(?:Provincia|Pcia\.?) (?:de |del )?(.+)", s)
        if m:
            p = m.group(1).strip()
            if p in PROVINCIAS: prov = prov or p
            continue
        if s == "Capital Federal" or s.startswith("Ciudad de Buenos Aires") or s == "Ciudad Autónoma de Buenos Aires":
            prov = prov or "Capital Federal"; continue
        if GBA.match(s): prov = prov or "Buenos Aires"; continue
        if any(s == e or s.startswith(e + " ") for e in EXTERIOR):
            prov = prov or "Exterior"; loc = loc or s; continue
        c = re.sub(r"^Ciudad de ", "", s)
        if c in CAPITALES:
            prov = prov or CAPITALES[c]; loc = loc or s; continue
        if c in PROVINCIAS:
            prov = prov or c; continue
        k = sin_tildes(c)
        if k in LOC2PROV:
            prov = prov or LOC2PROV[k]; loc = loc or c; continue
        # nombre corto con mayúscula: una localidad que no conocemos
        if len(c.split()) <= 4 and c[:1].isupper():
            loc = loc or c
    if prov and prov != "Exterior": prov = CORTO.get(prov, prov)
    return prov, loc

def es_lugar(s):
    s = s.strip()
    return bool(s) and (lugar([s])[0] != "" ) and len(s) < 45

def inicio_relato(t, seg):
    """Dónde empieza el relato, después de «Organización. Lugar. Provincia.»"""
    pos = 0
    for k, sg in enumerate(seg):
        corto = len(sg) <= 45 and not re.search(r"\b(fue|fueron|se|robaron|colocaron|hubo|un|una|el|la|los|las)\b", sg)
        if k > 0 and not corto: break
        nxt = t.find(sg, pos)
        if nxt < 0: break
        pos = nxt + len(sg)
        while pos < len(t) and t[pos] in ". ": pos += 1
        if k >= 4: break
    return pos if pos < len(t) else 0

CURADAS = sorted({l for ls in LOCALIDADES.values() for l in ls} | set(CAPITALES), key=len, reverse=True)
CURADAS_RE = re.compile(r"\b(" + "|".join(re.escape(l) for l in CURADAS if len(l) >= 5) + r")\b")
def provincia_en_texto(t):
    t = t[:400]
    m = re.search(r"[Pp]rovincia (?:de |del )?(" + "|".join(PROVINCIAS) + r")", t)
    if m: return CORTO.get(m.group(1), m.group(1))
    if "Capital Federal" in t: return "Capital Federal"
    if re.search(r"Gran Buenos Aires|[Cc]onurbano", t): return "Buenos Aires"
    m = CURADAS_RE.search(t)
    if m:
        k = sin_tildes(m.group(1))
        p = LOC2PROV.get(k) or CAPITALES.get(m.group(1))
        if p: return CORTO.get(p, p)
    return ""

# ---------- tipo de hecho ----------
TIPOS = [
    ("Asesinato", r"asesin|ejecutad|ejecutaron|dieron muerte|dio muerte|ultimad|acribill|mataron"),
    ("Secuestro", r"secuestr"),
    ("Bomba", r"bomba|explosiv|estall|artefacto|petard|dinamit|deton|voladura|explosi[oó]n"),
    ("Incendio", r"incendi|molotov"),
    ("Copamiento", r"\bcop(aron|ó|amiento|ado)\b|tomaron (la|el|un|una)|irrumpi|ocuparon|ocupación"),
    ("Asalto o robo", r"asalt|robaron|\brob[oó]\b|sustraj|despoj|desarmaron|desarmado"),
    ("Ataque armado", r"ametrall|atac|emboscad|tiroteo|enfrentamiento|balear|balead|dispar|a tiros|lanzacohete|herid|atentado"),
    ("Abatido o detenido", r"abatid|detenid|detuvieron|allanamiento|arsenal|incaut"),
    ("Propaganda armada", r"propaganda"),
]
def tipos(texto):
    t = texto.lower()
    out = [n for n, pat in TIPOS if re.search(pat, t)]
    return out or ["Otro"]

# ---------- armado ----------
def main():
    victimas = json.load(open(RAIZ / "victimas.json", encoding="utf-8"))
    hechos, contexto, fuera = [], [], 0
    for n in (1, 2, 3):
        for linea in open(AQUI / "crudo" / f"tomo{n}.jsonl", encoding="utf-8"):
            d = json.loads(linea)
            if d["seccion"] != "cronología": continue
            t = d["texto"]
            if d["fecha_texto"] and t.startswith(d["fecha_texto"]):
                t = t[len(d["fecha_texto"]):].lstrip(" .:-")
            primer = t.split("\n\n")[0]
            seg = re.split(r"\.\s+", primer)
            orgs, derecha = organizaciones(seg[0])
            if orgs is None and (es_lugar(seg[0]) or re.match(r"Secuestros|Enfrentamiento de grupos", seg[0])):
                orgs, derecha = ["No identificada"], False
                seg = [""] + seg
            h = {"id": "%d-%d" % (d["tomo"], d["orden"]), "f": d["fecha"]}
            if d.get("fecha_aprox"): h["a"] = 1
            h["tm"], h["pg"] = d["tomo"], d["pagina"]
            t = re.sub(r"[\ue000-\uf8ff]", "•", t)       # viñetas en fuente de símbolos
            h["tx"] = t
            if d["notas"]: h["nt"] = d["notas"]
            if orgs is None:
                contexto.append(h); continue
            if derecha and d["fecha"] >= GOLPE:
                fuera += 1; continue
            p, l = lugar(seg[1:])
            h["r"] = inicio_relato(t, seg)
            if not p: p = provincia_en_texto(primer)
            h.update({"o": orgs, "p": p, "l": l, "tp": tipos(t), "v": []})
            hechos.append(h)

    # víctimas del memorial: mismo día y el apellido en el texto
    por_dia = collections.defaultdict(list)
    for h in hechos: por_dia[h["f"]].append(h)
    enlazadas = 0
    for i, v in enumerate(victimas):
        if len(v.get("f", "")) != 10 or "," not in v["n"]: continue
        ape = [w for w in re.split(r"[\s-]+", sin_tildes(v["n"].split(",")[0])) if len(w) >= 3 and w not in ("del", "las", "los")]
        if not ape: continue
        hits = [h for h in por_dia.get(v["f"], []) if all(re.search(r"\b" + re.escape(w) + r"\b", sin_tildes(h["tx"])) for w in ape)]
        if not hits:
            hits = [h for h in por_dia.get(v["f"], []) if any(re.search(r"\b" + re.escape(w) + r"\b", sin_tildes(h["tx"])) for w in ape if len(w) >= 5)]
        for h in hits[:2]:
            h["v"].append(i)
        if hits: enlazadas += 1
    for h in hechos:
        if not h["v"]: del h["v"]
        if "Asesinato" not in h["tp"] and h.get("v"):
            h["tp"].insert(0, "Asesinato")

    sal = AQUI / "web"; sal.mkdir(exist_ok=True)
    json.dump(hechos, open(sal / "hechos.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # mapa chico víctima -> hecho, para el botón de la ficha sin cargar todo
    vh = {}
    for h in hechos:
        for i in h.get("v", []): vh.setdefault(str(i), h["id"])
    json.dump(vh, open(sal / "hechos_victimas.json", "w", encoding="utf-8"), separators=(",", ":"))
    json.dump(contexto, open(sal / "contexto.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    sinprov = sum(1 for h in hechos if not h["p"])
    print("hechos", len(hechos), "| contexto", len(contexto), "| derecha posterior al golpe (afuera)", fuera)
    print("sin provincia", sinprov, "| víctimas del memorial enlazadas", enlazadas, "de", len(victimas))
    print(collections.Counter(o for h in hechos for o in h["o"]).most_common())
    print(collections.Counter(h["p"] for h in hechos).most_common())
    print(collections.Counter(x for h in hechos for x in h["tp"]).most_common())

if __name__ == "__main__":
    main()
