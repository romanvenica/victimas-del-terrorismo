/* JS de la interfaz. Sin dependencias. Todas las llamadas al servidor envían el token CSRF. */
(function () {
  'use strict';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const tsKey = document.querySelector('meta[name="turnstile-key"]')?.content || '';
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf, Accept: 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json().then((j) => ({ ok: r.ok, ...j })));

  // Turnstile: renderiza widgets explícitos en contenedores marcados
  const widgets = new Map();
  function renderTurnstile(el) {
    if (!tsKey || !el || widgets.has(el) || !window.turnstile) return;
    widgets.set(el, window.turnstile.render(el, { sitekey: tsKey, size: 'flexible' }));
  }
  function tokenDe(el) { if (!tsKey) return ''; const id = widgets.get(el); return id !== undefined ? window.turnstile.getResponse(id) : ''; }
  function resetDe(el) { const id = widgets.get(el); if (id !== undefined) window.turnstile.reset(id); }
  const initTurnstile = () => document.querySelectorAll('[data-turnstile]').forEach((el) => renderTurnstile(el));
  if (tsKey) { if (window.turnstile) initTurnstile(); else window.addEventListener('load', () => setTimeout(initTurnstile, 300)); }

  // Confirmaciones
  document.querySelectorAll('[data-confirmar]').forEach((el) => {
    const h = (e) => { if (!confirm(el.dataset.confirmar)) e.preventDefault(); };
    el.tagName === 'FORM' ? el.addEventListener('submit', h) : el.addEventListener('click', h);
  });
  document.querySelectorAll('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

  // ---- Ficha: galería ----
  document.querySelectorAll('.miniaturas button').forEach((b) => b.addEventListener('click', () => {
    document.getElementById('foto-principal').src = b.dataset.src;
    document.querySelectorAll('.miniaturas button').forEach((x) => x.classList.remove('activa')); b.classList.add('activa');
  }));

  // ---- Ficha: revelar teléfono ----
  const ficha = document.querySelector('.ficha[data-aviso]');
  const btnTel = document.getElementById('btn-ver-tel');
  if (ficha && btnTel) {
    const cont = document.getElementById('turnstile-tel');
    renderTurnstile(cont);
    btnTel.addEventListener('click', async () => {
      btnTel.disabled = true; btnTel.textContent = 'Cargando…';
      const r = await post(`/api/aviso/${ficha.dataset.aviso}/telefono`, { 'cf-turnstile-response': tokenDe(cont) });
      if (!r.ok) { btnTel.disabled = false; btnTel.textContent = 'Ver teléfono'; resetDe(cont); return alert(r.error || 'No se pudo obtener el teléfono.'); }
      document.getElementById('tel-mask').textContent = r.mostrar;
      btnTel.hidden = true;
      const acc = document.getElementById('contacto-acciones'); acc.hidden = false;
      const wa = document.getElementById('btn-wa'), ll = document.getElementById('btn-llamar');
      if (r.whatsapp) wa.href = r.whatsapp; else wa.hidden = true;
      if (r.llamada) ll.href = r.llamada; else ll.hidden = true;
    });
  }

  // ---- Ficha: favorito ----
  const btnFav = document.getElementById('btn-favorito');
  if (btnFav && ficha) btnFav.addEventListener('click', async () => {
    const r = await post(`/api/aviso/${ficha.dataset.aviso}/favorito`);
    if (r.login) return (location.href = r.login);
    if (!r.ok) return alert(r.error);
    btnFav.textContent = r.favorito ? 'Guardado' : 'Guardar';
  });

  // ---- Ficha: reportar ----
  const dlg = document.getElementById('dialogo-reporte');
  const btnRep = document.getElementById('btn-reportar');
  if (dlg && btnRep && ficha) {
    const cont = document.getElementById('turnstile-rep');
    btnRep.addEventListener('click', () => { dlg.showModal(); renderTurnstile(cont); });
    dlg.querySelector('[data-cerrar]').addEventListener('click', () => dlg.close());
    document.getElementById('btn-enviar-reporte').addEventListener('click', async () => {
      const r = await post(`/api/aviso/${ficha.dataset.aviso}/reportar`, { motivo: document.getElementById('rep-motivo').value, comentario: document.getElementById('rep-comentario').value, 'cf-turnstile-response': tokenDe(cont) });
      if (!r.ok) { resetDe(cont); return alert(r.error || 'No se pudo enviar.'); }
      dlg.close(); alert(r.mensaje);
    });
  }

  // ---- Buscador: crear alerta ----
  const btnAlerta = document.getElementById('btn-guardar-alerta');
  if (btnAlerta) btnAlerta.addEventListener('click', () => {
    const fd = new FormData(document.getElementById('form-filtros'));
    const filtros = {}; for (const [k, v] of fd.entries()) if (v) filtros[k] = v;
    const nombre = prompt('Nombre de la alerta', document.querySelector('.resultados-cab h1')?.firstChild?.textContent?.trim() || 'Mi búsqueda');
    if (!nombre) return;
    const f = document.createElement('form'); f.method = 'post'; f.action = '/alertas';
    for (const [k, v] of Object.entries({ _csrf: csrf, nombre, filtros: JSON.stringify(filtros) })) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); }
    document.body.appendChild(f); f.submit();
  });

  // ---- Publicar: ficha técnica dinámica y previsualización ----
  const selCat = document.getElementById('categoria');
  const fichaCampos = document.getElementById('ficha-campos');
  if (selCat && fichaCampos) {
    const fichas = JSON.parse(selCat.dataset.fichas || '{}');
    const valores = JSON.parse(fichaCampos.dataset.valores || '{}');
    const etiquetas = JSON.parse(fichaCampos.dataset.etiquetas || '{}');
    const render = () => {
      fichaCampos.innerHTML = '';
      for (const campo of fichas[selCat.value] || []) {
        const l = document.createElement('label'); l.textContent = etiquetas[campo] || campo;
        const i = document.createElement('input'); i.type = 'text'; i.name = `ficha[${campo}]`; i.maxLength = 80; i.value = valores[campo] || '';
        l.appendChild(i); fichaCampos.appendChild(l);
      }
    };
    selCat.addEventListener('change', render); render();
  }
  const inputFotos = document.getElementById('input-fotos');
  if (inputFotos) inputFotos.addEventListener('change', () => {
    const cont = document.getElementById('previsualizacion'); cont.innerHTML = '';
    [...inputFotos.files].slice(0, 20).forEach((f) => { const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.onload = () => URL.revokeObjectURL(img.src); cont.appendChild(img); });
  });
})();
