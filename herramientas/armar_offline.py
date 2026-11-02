"""Arma una copia del memorial que se abre con doble clic, sin internet.

Con doble clic el navegador no deja que la pagina lea archivos .json del
disco, asi que los datos van adentro del index.html. Las fotos siguen
siendo archivos: eso si lo deja.
"""
import io, json, os, re, shutil, sys, zipfile

REPO, DESTINO = sys.argv[1], sys.argv[2]
CARPETA = "Memorial victimas del terrorismo"
raiz = os.path.join(DESTINO, CARPETA)
shutil.rmtree(raiz, ignore_errors=True)
os.makedirs(raiz)

h = io.open(os.path.join(REPO, "index.html"), encoding="utf-8").read()

datos = {}
for nombre in ("victimas.json", "fotos/indice.json", "fotos/altas.json"):
    datos[nombre] = json.load(open(os.path.join(REPO, nombre), encoding="utf-8"))
    viejo = 'fetch("%s",{cache:"no-cache"})' % nombre
    assert h.count(viejo) == 1, nombre
    h = h.replace(viejo, 'leerLocal("%s")' % nombre)

js = json.dumps(datos, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
bloque = ("<script>\n// copia sin internet: los datos viajan adentro de la pagina\n"
          "const DATOS_LOCALES=" + js + ";\n"
          "function leerLocal(n){ return Promise.resolve({json:function(){ return DATOS_LOCALES[n]; }}); }\n"
          "</script>\n")
# antes del primer <script> propio de la pagina
i = h.index("<script>")
h = h[:i] + bloque + h[i:]

# sin internet no tiene sentido el contador de visitas
h = re.sub(r'<!-- contador de visitas:.*?</script>\s*', '', h, flags=re.S)
assert "goatcounter" not in h
io.open(os.path.join(raiz, "index.html"), "w", encoding="utf-8").write(h)

shutil.copytree(os.path.join(REPO, "fotos"), os.path.join(raiz, "fotos"),
                ignore=shutil.ignore_patterns("*.json"))
shutil.copy(os.path.join(REPO, "cruz.png"), raiz)
io.open(os.path.join(raiz, "LEEME.txt"), "w", encoding="utf-8").write(
    "Memorial de las victimas del terrorismo en la Argentina\n\n"
    "Para verlo: abri el archivo index.html con doble clic.\n"
    "Funciona sin internet. Tiene que quedar dentro de esta carpeta,\n"
    "junto con la carpeta fotos y el archivo cruz.png.\n\n"
    "Version en internet: https://victimasdelterrorismo.com.ar\n")

zp = os.path.join(DESTINO, "memorial-victimas-del-terrorismo.zip")
if os.path.exists(zp): os.remove(zp)
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for base, _, archivos in os.walk(raiz):
        for a in sorted(archivos):
            p = os.path.join(base, a)
            z.write(p, os.path.relpath(p, DESTINO))
print("zip:", zp, round(os.path.getsize(zp) / 1e6, 1), "MB")
print("index.html:", round(len(h.encode()) / 1e6, 1), "MB | fotos:",
      len(os.listdir(os.path.join(raiz, "fotos"))))
