"""Pasa el sitio a www.victimasdelterrorismo.com.ar (correr SOLO cuando el
registro DNS «www CNAME romanvenica.github.io» ya exista; si no, el sitio deja
de abrir). Cambia el dominio de GitHub Pages, le dice a Google cuál es la
dirección oficial y agrega robots.txt y sitemap.xml.
Uso: python3 herramientas/pasar_a_www.py [etiqueta-de-verificacion-de-google]
"""
import io, os, sys, datetime
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://www.victimasdelterrorismo.com.ar/"
io.open(os.path.join(RAIZ, "CNAME"), "w").write("www.victimasdelterrorismo.com.ar\n")
p = os.path.join(RAIZ, "index.html")
h = io.open(p, encoding="utf-8").read()
extra = '<link rel="canonical" href="%s">\n' % URL
if len(sys.argv) > 1 and sys.argv[1].startswith("<meta"):
    extra += sys.argv[1].strip() + "\n"
if 'rel="canonical"' not in h:
    h = h.replace("<title>", extra + "<title>", 1)
    io.open(p, "w", encoding="utf-8").write(h)
io.open(os.path.join(RAIZ, "robots.txt"), "w").write("User-agent: *\nAllow: /\nSitemap: %ssitemap.xml\n" % URL)
hoy = datetime.date.today().isoformat()
io.open(os.path.join(RAIZ, "sitemap.xml"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    '  <url><loc>%s</loc><lastmod>%s</lastmod></url>\n</urlset>\n' % (URL, hoy))
print("listo: CNAME, canonical, robots.txt y sitemap.xml")
