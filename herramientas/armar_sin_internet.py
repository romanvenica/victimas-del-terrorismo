"""Copia de la web para usar sin internet: se abre con doble clic en index.html.

Con doble clic el navegador no deja leer los .json sueltos, así que todos los
datos van juntos en datos.js (que sí se puede cargar así) y la página los toma
de ahí en vez de pedirlos. Se saca el contador de visitas.

Uso: python3 herramientas/armar_sin_internet.py REPO CARPETA_DESTINO
"""
import io, json, os, re, shutil, sys

REPO, DEST = sys.argv[1], sys.argv[2]
shutil.rmtree(DEST, ignore_errors=True)
os.makedirs(DEST)

# todos los datos que la página pide, con la misma ruta como nombre
archivos = ["victimas.json", "hechos_grafico.json", "hechos_victimas.json",
            "fotos/indice.json", "fotos/altas.json"]
archivos += ["textos/" + f for f in sorted(os.listdir(os.path.join(REPO, "textos"))) if f.endswith(".json")]
datos = {}
for a in archivos:
    datos[a] = json.load(io.open(os.path.join(REPO, a), encoding="utf-8"))
with io.open(os.path.join(DEST, "datos.js"), "w", encoding="utf-8") as f:
    f.write("window.ARCHIVOS_SIN_INTERNET=")
    json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

# la página pide los datos con fetch(): se le responde desde datos.js
puente = """<script src="datos.js"></script>
<script>
(function(){
  var real=window.fetch;
  window.fetch=function(u,o){
    var k=String(u).split("?")[0], A=window.ARCHIVOS_SIN_INTERNET||{};
    if(Object.prototype.hasOwnProperty.call(A,k)){
      var d=A[k];
      return Promise.resolve({ok:true,status:200,
        json:function(){ return Promise.resolve(d); },
        text:function(){ return Promise.resolve(JSON.stringify(d)); }});
    }
    return real ? real(u,o) : Promise.reject(new Error("sin internet"));
  };
})();
</script>
"""
h = io.open(os.path.join(REPO, "index.html"), encoding="utf-8").read()
h = re.sub(r'<!-- contador de visitas:.*?</script>\s*', '', h, flags=re.S)
assert "goatcounter" not in h
i = h.index("<script>")
h = h[:i] + puente + h[i:]
io.open(os.path.join(DEST, "index.html"), "w", encoding="utf-8").write(h)

shutil.copy(os.path.join(REPO, "cruz.png"), DEST)
shutil.copytree(os.path.join(REPO, "fotos"), os.path.join(DEST, "fotos"),
                ignore=shutil.ignore_patterns("*.json"))

io.open(os.path.join(DEST, "LEEME.txt"), "w", encoding="utf-8").write(
    "Víctimas del terrorismo en Argentina - copia para ver sin internet\r\n"
    "\r\n"
    "1. Descomprimí esta carpeta (clic derecho > Extraer todo).\r\n"
    "2. Abrí el archivo index.html con doble clic.\r\n"
    "\r\n"
    "Se abre en el navegador (Chrome, Firefox, Edge, Safari) y funciona sin conexión.\r\n"
    "La versión siempre actualizada está en https://victimasdelterrorismo.com.ar\r\n")
total = sum(os.path.getsize(os.path.join(b, a)) for b, _, aa in os.walk(DEST) for a in aa)
print(len(archivos), "archivos de datos ·", round(total / 1e6, 1), "MB en total")
