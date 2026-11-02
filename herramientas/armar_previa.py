"""Copia del sitio para revisar antes de publicar, como artefacto privado.

Saca la envoltura del documento (el artefacto pone la suya), el contador de
visitas (las revisiones no son visitas) y agrega una franja que avisa que es
la vista previa, para no confundirla con el sitio de verdad.
"""
import io, os, re, shutil, sys

REPO, DEST = sys.argv[1], sys.argv[2]
shutil.rmtree(DEST, ignore_errors=True)
os.makedirs(os.path.join(DEST, "fotos"))

h = io.open(os.path.join(REPO, "index.html"), encoding="utf-8").read()
cab = h[:h.index("</head>")]
cuerpo = h[h.index("<body>") + len("<body>"):h.rindex("</body>")]
titulo = '<meta charset="utf-8"><title>Memorial — vista previa</title>'
estilos = "".join(re.findall(r"<style>.*?</style>", cab, re.S))
franja = ('<style>.previa{position:fixed;left:50%;top:env(safe-area-inset-top,0px);'
          'transform:translateX(-50%);z-index:60;background:#d94f38;color:#fff;'
          'font:600 11px/1 "Inter","Helvetica Neue",Arial,sans-serif;letter-spacing:.12em;'
          'text-transform:uppercase;padding:6px 12px;border-radius:0 0 4px 4px;pointer-events:none}'
          '</style><div class="previa">Vista previa · todavía no está publicado</div>')
cuerpo = re.sub(r'<!-- contador de visitas:.*?</script>\s*', '', cuerpo, flags=re.S)
assert "goatcounter" not in cuerpo
io.open(os.path.join(DEST, "index.html"), "w", encoding="utf-8").write(titulo + estilos + franja + cuerpo)

for f in ("victimas.json", "cruz.png"):
    shutil.copy(os.path.join(REPO, f), DEST)
# la cronología: si está publicada va en la raíz; si no, sale de datos/atentados/web
for f in ("hechos.json", "hechos_victimas.json"):
    for origen in (os.path.join(REPO, f), os.path.join(REPO, "datos", "atentados", "web", f)):
        if os.path.exists(origen):
            shutil.copy(origen, DEST); break
for f in sorted(os.listdir(os.path.join(REPO, "fotos"))):
    shutil.copy(os.path.join(REPO, "fotos", f), os.path.join(DEST, "fotos"))
archivos = sorted(os.path.relpath(os.path.join(b, a), DEST)
                  for b, _, aa in os.walk(DEST) for a in aa if a != "index.html")
io.open(os.path.join(DEST, "_archivos.txt"), "w").write("\n".join(archivos))
print(len(archivos), "archivos ·", round(sum(os.path.getsize(os.path.join(DEST, a)) for a in archivos) / 1e6, 1), "MB")
