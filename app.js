/* ==========================================================
   Huellas del Valle · Sistema de agendamiento
   - Vista "Agendar cita": formulario propio que dispara el webhook
     del Escenario 1 de Make y muestra lo que el proceso respondió.
   - Vista "Agenda del día": lee la misma hoja de Google que usa Make.
   La página NO decide si hay cupo: esa lógica vive en el Escenario 1.
   ========================================================== */
(() => {
  "use strict";

  const CFG = Object.assign({
    WEBHOOK_URL: "", SHEET_ID: "", HOJA_AGENDA: "agenda", HOJA_CITAS: "citas",
    TIEMPO_ESPERA: 40, HORAS: ["08:00", "09:00", "10:00", "11:00"]
  }, window.CONFIG || {});

  const webhookListo = /^https:\/\/hook\.[a-z0-9.]*make\.com\//i.test(CFG.WEBHOOK_URL);
  const urlPublicada = (n) => {
    const u = n === CFG.HOJA_AGENDA ? CFG.CSV_AGENDA_URL : n === CFG.HOJA_CITAS ? CFG.CSV_CITAS_URL : "";
    return /^https:\/\/docs\.google\.com\/spreadsheets\//.test(u || "") ? u : "";
  };
  const hojaLista = /^[A-Za-z0-9_-]{25,}$/.test(CFG.SHEET_ID) || (!!urlPublicada(CFG.HOJA_AGENDA) && !!urlPublicada(CFG.HOJA_CITAS));
  const CLAVE_HISTORIAL = "huellas.historial";

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

  /* ---------------- Utilidades ---------------- */
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Quita tildes, pasa a minúsculas y cambia espacios por "_" (para comparar encabezados)
  const clave = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().toLowerCase().replace(/\s+/g, "_");

  const limpiar = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

  const hoyISO = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

  // Asegura AAAA-MM-DD aunque la hoja devuelva 2026/10/14 o 14/10/2026
  function normFecha(v) {
    const t = limpiar(v);
    let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return t;
  }

  // Asegura HH:MM aunque la hoja devuelva 8:00 o 08:00:00
  function normHora(v) {
    const m = limpiar(v).match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : limpiar(v);
  }

  function sumarDias(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString("en-CA");
  }

  function fechaLarga(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return new Date(iso + "T12:00:00").toLocaleDateString("es-CO",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  const horaActual = () => new Date().toLocaleTimeString("es-CO",
    { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  // Normaliza lo que responde Make a uno de los 4 resultados del proceso
  function normEstado(v) {
    const t = clave(v).replace(/-/g, "_");
    if (!t) return "";
    if (t.includes("alerta")) return "CONFIRMADA_ALERTA";
    if (t.startsWith("confirmada")) return "CONFIRMADA";
    if (t.startsWith("rechaz")) return "RECHAZADA";
    if (t.startsWith("respaldo") || t.includes("inexistente") || t.includes("no_existe")) return "RESPALDO";
    return t.toUpperCase();
  }

  const ESTADOS = {
    CONFIRMADA:        { titulo: "Confirmada",             placa: "ok",       punto: "ok",      insignia: "ok" },
    CONFIRMADA_ALERTA: { titulo: "Confirmada con alerta",  placa: "alerta",   punto: "alerta",  insignia: "alerta" },
    RECHAZADA:         { titulo: "Rechazada",              placa: "rechazo",  punto: "rechazo", insignia: "rechazo" },
    RESPALDO:          { titulo: "Franja no disponible",   placa: "respaldo", punto: "",        insignia: "neutra" }
  };

  /* ---------------- Aviso de configuración ---------------- */
  function avisoConfig() {
    const faltan = [];
    if (!webhookListo) faltan.push("la URL del webhook de Make");
    if (!hojaLista) faltan.push("el ID de la hoja de Google");
    if (!faltan.length) return;
    const aviso = $("#aviso-config");
    aviso.textContent = `Falta configurar ${faltan.join(" y ")} en el archivo config.js.`;
    aviso.hidden = false;
  }

  /* ---------------- Pestañas ---------------- */
  function initPestanas() {
    const tabs = $$(".pestana");
    const activar = (tab, foco = false) => {
      tabs.forEach((t) => {
        const activa = t === tab;
        t.setAttribute("aria-selected", activa);
        t.tabIndex = activa ? 0 : -1;
        $("#vista-" + t.dataset.vista).hidden = !activa;
      });
      if (foco) tab.focus();
      if (tab.dataset.vista === "agenda") cargarAgenda();
      history.replaceState(null, "", "#" + tab.dataset.vista);
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => activar(tab));
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const sig = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        activar(sig, true);
      });
    });
    if (location.hash === "#agenda") activar(tabs[1]);
  }

  /* ---------------- Lectura de la hoja (CSV) ---------------- */
  const cacheHojas = new Map(); // nombre → { t, filas }

  async function leerHoja(nombre, fresco = false) {
    if (!hojaLista) throw new Error("Configura SHEET_ID en config.js para leer la hoja.");
    const guardada = cacheHojas.get(nombre);
    if (!fresco && guardada && Date.now() - guardada.t < 15000) return guardada.filas;

    const ayuda = `No se pudo leer la pestaña "${nombre}". Revisa que la hoja esté compartida con "Cualquier persona con el enlace" y que la pestaña se llame así.`;
    let filas;
    const publicada = urlPublicada(nombre);
    if (publicada) {
      // Opción 1: enlace CSV de "Publicar en la web"
      let resp, texto;
      try {
        resp = await fetch(`${publicada}${publicada.includes("?") ? "&" : "?"}_=${Date.now()}`, { cache: "no-store" });
        texto = await resp.text();
      } catch { throw new Error(ayuda); }
      if (!resp.ok || texto.trimStart().startsWith("<")) throw new Error(ayuda);
      filas = aObjetos(parseCSV(texto));
    } else {
      // Opción 2 (por defecto): JSONP de Google Visualization. Se carga con <script>,
      // así que no depende de CORS y funciona igual en file:// y en GitHub Pages.
      filas = await leerHojaJSONP(nombre, ayuda);
    }
    cacheHojas.set(nombre, { t: Date.now(), filas });
    return filas;
  }

  let contadorJSONP = 0;
  function leerHojaJSONP(nombre, ayuda) {
    return new Promise((resolve, reject) => {
      const cb = `__huellas_cb_${Date.now()}_${contadorJSONP++}`;
      const script = document.createElement("script");
      const limpiar = () => { delete window[cb]; script.remove(); clearTimeout(reloj); };
      const reloj = setTimeout(() => { limpiar(); reject(new Error(ayuda)); }, 12000);
      window[cb] = (resp) => {
        limpiar();
        if (!resp || resp.status === "error" || !resp.table) {
          const det = resp?.errors?.[0]?.detailed_message || resp?.errors?.[0]?.message || "";
          return reject(new Error(`${ayuda} ${det}`.trim()));
        }
        const enc = resp.table.cols.map((c) => clave(c.label || c.id));
        const filas = (resp.table.rows || [])
          .map((r) => (r.c || []).map((cel) => {
            if (!cel || cel.v === null || cel.v === undefined) return "";
            return String(cel.f ?? cel.v).trim();
          }))
          .filter((f) => f.some((v) => v !== ""))
          .map((f) => Object.fromEntries(enc.map((h, i) => [h, f[i] ?? ""])));
        resolve(filas);
      };
      script.onerror = () => { limpiar(); reject(new Error(ayuda)); };
      script.src = `https://docs.google.com/spreadsheets/d/${CFG.SHEET_ID}/gviz/tq` +
        `?tqx=responseHandler:${cb}&headers=1&sheet=${encodeURIComponent(nombre)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  function parseCSV(txt) {
    const filas = []; let fila = [], campo = "", comillas = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (comillas) {
        if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') comillas = false;
        else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === ",") { fila.push(campo); campo = ""; }
      else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
      else if (c !== "\r") campo += c;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  function aObjetos(filas) {
    if (!filas.length) return [];
    const enc = filas[0].map(clave);
    return filas.slice(1)
      .filter((f) => f.some((c) => c.trim() !== ""))
      .map((f) => Object.fromEntries(enc.map((h, i) => [h, (f[i] ?? "").trim()])));
  }

  /* ---------------- Vista Agendar: horas con cupos ---------------- */
  const form = $("#form-cita");
  const campoFecha = $("#fecha");
  const cajaHoras = $("#horas");
  const ayudaHoras = $("#ayuda-horas");

  function pintarHoras(cupos = null) {
    const elegida = form.hora?.value || $("input[name=hora]:checked", form)?.value;
    cajaHoras.innerHTML = CFG.HORAS.map((h) => {
      let texto = "", extra = "";
      if (cupos) {
        const f = cupos.get(h);
        if (!f) { texto = "Sin franja"; }
        else {
          const libres = f.cupo - f.ocupados;
          texto = libres <= 0 ? "Llena" : libres === 1 ? "1 libre" : `${libres} libres`;
          extra = libres <= 0 ? " hora--llena" : libres === 1 ? " hora--poca" : "";
        }
      }
      return `<label class="hora${extra}">
          <input type="radio" name="hora" value="${h}" ${h === elegida ? "checked" : ""} required>
          <span class="hora__caja"><span class="hora__h">${h}</span>
          <span class="hora__cupo">${texto || "&nbsp;"}</span></span>
        </label>`;
    }).join("");
  }

  async function actualizarCupos() {
    const fecha = campoFecha.value;
    if (!fecha) { pintarHoras(); ayudaHoras.textContent = "Elige la fecha para ver los cupos disponibles."; return; }
    if (!hojaLista) { pintarHoras(); ayudaHoras.textContent = "Los cupos se confirman al enviar la solicitud."; return; }
    ayudaHoras.textContent = "Consultando cupos…";
    try {
      const agenda = await leerHoja(CFG.HOJA_AGENDA);
      const cupos = new Map();
      agenda.filter((f) => normFecha(f.fecha) === fecha).forEach((f) => {
        cupos.set(normHora(f.hora), { cupo: Number(f.cupo) || 0, ocupados: Number(f.ocupados) || 0 });
      });
      pintarHoras(cupos);
      ayudaHoras.textContent = cupos.size
        ? "Cupos de referencia. El sistema los vuelve a verificar al enviar."
        : "No hay franjas abiertas para esta fecha. Puedes enviar la solicitud y quedará registrada.";
    } catch {
      pintarHoras();
      ayudaHoras.textContent = "No se pudieron consultar los cupos. El sistema los verificará al enviar.";
    }
  }

  /* ---------------- Validación ---------------- */
  const reglas = {
    propietario: (v) => v.length >= 3 || "Escribe el nombre del dueño (mínimo 3 letras).",
    correo: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || "Escribe un correo válido, por ejemplo ana@correo.com.",
    mascota: (v) => v.length >= 2 || "Escribe el nombre de la mascota.",
    especie: (v) => !!v || "Elige si es perro o gato.",
    servicio: (v) => !!v || "Elige el servicio.",
    fecha: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || "Elige la fecha de la cita.",
    hora: (v) => /^\d{2}:\d{2}$/.test(v) || "Elige la hora de la cita."
  };

  function leerFormulario() {
    const valor = (n) => {
      const el = form.elements[n];
      return limpiar(el instanceof RadioNodeList ? el.value : el?.value);
    };
    return {
      propietario: valor("propietario"),
      correo: valor("correo").toLowerCase(),
      mascota: valor("mascota"),
      especie: valor("especie"),
      servicio: valor("servicio"),
      fecha: normFecha(valor("fecha")),
      hora: normHora(valor("hora"))
    };
  }

  function validar(datos) {
    let primero = null;
    Object.entries(reglas).forEach(([campo, regla]) => {
      const r = regla(datos[campo]);
      const msg = r === true ? "" : r;
      $("#err-" + campo).textContent = msg;
      const input = $("#" + campo);
      if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
      const grupo = campo === "hora" ? cajaHoras : $(`[aria-labelledby="lbl-${campo}"]`);
      if (grupo) grupo.classList.toggle("invalido", !!msg);
      if (msg && !primero) primero = input || $(`input[name=${campo}]`, form);
    });
    if (primero) primero.focus();
    return !primero;
  }

  form.addEventListener("input", (e) => {
    const n = e.target.name;
    if (!n || !$("#err-" + n)?.textContent) return;
    $("#err-" + n).textContent = "";
    e.target.setAttribute("aria-invalid", "false");
    (n === "hora" ? cajaHoras : $(`[aria-labelledby="lbl-${n}"]`))?.classList.remove("invalido");
  });

  /* ---------------- Envío al webhook (trigger del Escenario 1) ---------------- */
  const btn = $("#btn-enviar");
  let enviando = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando) return;
    const datos = leerFormulario();
    if (!validar(datos)) return;

    if (!webhookListo) {
      pintarPlaca({ tipo: "respaldo", estado: "Sin conexión al proceso",
        texto: "Falta la URL del webhook de Make en config.js." }, datos);
      return;
    }

    enviando = true;
    btn.disabled = true;
    btn.classList.add("cargando");
    $(".boton__texto", btn).textContent = "Consultando cupo…";
    pintarPlaca({ tipo: "espera", estado: "Procesando", texto: "El sistema está revisando la franja." }, datos);

    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), CFG.TIEMPO_ESPERA * 1000);

    try {
      // Se envía como formulario (application/x-www-form-urlencoded):
      // es una petición "simple" para el navegador, sin preflight CORS,
      // y Make la convierte en los 7 campos del webhook.
      const resp = await fetch(CFG.WEBHOOK_URL, {
        method: "POST",
        body: new URLSearchParams(datos),
        signal: control.signal
      });
      const texto = (await resp.text()).trim();

      if (!resp.ok) throw new Error(`El proceso respondió con un error (HTTP ${resp.status}). ${texto.slice(0, 160)}`);

      let r;
      try { r = JSON.parse(texto); }
      catch {
        r = /accepted/i.test(texto)
          ? { resultado: "", mensaje: "Make recibió la solicitud pero no devolvió un resultado. Revisa que cada ruta termine en un módulo Webhook response." }
          : { resultado: "", mensaje: texto };
      }

      const estado = normEstado(r.resultado ?? r.estado);
      const info = ESTADOS[estado];
      pintarPlaca({
        tipo: info?.placa || "respaldo",
        estado: info?.titulo || "Respuesta sin estado",
        texto: r.mensaje || "",
        libres: r.libres,
        codigo: r.id_cita
      }, datos, true);
      guardarHistorial({ ...datos, estado, momento: horaActual() });
      cacheHojas.clear();
      actualizarCupos();
      if (estado === "CONFIRMADA" || estado === "CONFIRMADA_ALERTA") limpiarCita();
    } catch (err) {
      const msg = err.name === "AbortError"
        ? `El proceso no respondió en ${CFG.TIEMPO_ESPERA} segundos. Revisa que el Escenario 1 esté activo en Make.`
        : err.message === "Failed to fetch"
          ? "No se pudo contactar el proceso. Revisa tu conexión, la URL del webhook y que el Webhook response tenga el encabezado Access-Control-Allow-Origin: *."
          : err.message;
      pintarPlaca({ tipo: "rechazo", estado: "No se pudo enviar", texto: msg }, datos, true);
    } finally {
      clearTimeout(reloj);
      enviando = false;
      btn.disabled = false;
      btn.classList.remove("cargando");
      $(".boton__texto", btn).textContent = "Solicitar cita";
    }
  });

  // Tras una cita confirmada se limpia solo la mascota y la cita; los datos del dueño se conservan
  function limpiarCita() {
    form.mascota.value = "";
    $$("input[name=especie], input[name=servicio], input[name=hora]", form).forEach((r) => (r.checked = false));
  }

  /* ---------------- Placa de resultado ---------------- */
  function pintarPlaca(r, d, animar = false) {
    const libres = r.libres !== undefined && r.libres !== null && r.libres !== ""
      ? `<dt>Cupos libres</dt><dd>${esc(r.libres)}</dd>` : "";
    $("#resultado").innerHTML = `
      <div class="placa placa--${r.tipo}${animar ? " placa--nueva" : ""}">
        <span class="placa__argolla" aria-hidden="true"></span>
        <p class="placa__estado">${esc(r.estado)}</p>
        <p class="placa__mascota">${esc(d.mascota)}${d.especie ? ` <span class="sutil">(${esc(d.especie)})</span>` : ""}</p>
        ${r.texto ? `<p class="placa__texto">${esc(r.texto)}</p>` : ""}
        <dl class="placa__datos">
          <dt>Servicio</dt><dd>${esc(d.servicio)}</dd>
          <dt>Fecha</dt><dd>${esc(d.fecha)}</dd>
          <dt>Hora</dt><dd>${esc(d.hora)}</dd>
          ${libres}
        </dl>
        ${r.codigo ? `<p class="placa__codigo">Código ${esc(r.codigo)}</p>` : ""}
      </div>`;
    // En pantallas angostas el resultado queda debajo del formulario: se lleva a la vista
    if (animar && window.matchMedia("(max-width: 960px)").matches) {
      const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("#resultado").scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
    }
  }

  /* ---------------- Historial (solo este navegador) ---------------- */
  function leerHistorial() {
    try { return JSON.parse(localStorage.getItem(CLAVE_HISTORIAL)) || []; } catch { return []; }
  }
  function guardarHistorial(item) {
    const lista = [item, ...leerHistorial()].slice(0, 12);
    try { localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(lista)); } catch { /* almacenamiento no disponible */ }
    pintarHistorial(lista);
  }
  function pintarHistorial(lista = leerHistorial()) {
    $("#lista-historial").innerHTML = lista.map((h) => {
      const info = ESTADOS[h.estado];
      return `<li>
        <span class="punto ${info?.punto ? "punto--" + info.punto : ""}" aria-hidden="true"></span>
        <span><b>${esc(h.mascota)}</b>, ${esc(h.fecha)} ${esc(h.hora)}<br>
          <span class="sutil">${esc(info?.titulo || "Sin resultado")}</span></span>
        <span class="historial__hora">${esc(h.momento)}</span>
      </li>`;
    }).join("");
    $("#historial-vacio").hidden = lista.length > 0;
    $("#btn-limpiar").hidden = lista.length === 0;
  }
  $("#btn-limpiar").addEventListener("click", () => {
    try { localStorage.removeItem(CLAVE_HISTORIAL); } catch { /* nada */ }
    pintarHistorial([]);
  });

  /* ---------------- Casos de prueba del parcial ---------------- */
  const CASOS = [
    { id: "C1", propietario: "Carolina Gómez", mascota: "Luna",   especie: "perro", servicio: "Consulta general", fecha: "2026-10-14", hora: "08:00" },
    { id: "C2", propietario: "Andrés Ruiz",    mascota: "Michi",  especie: "gato",  servicio: "Vacunación",       fecha: "2026-10-14", hora: "10:00" },
    { id: "C3", propietario: "Julián Torres",  mascota: "Rocky",  especie: "perro", servicio: "Baño",             fecha: "2026-10-14", hora: "11:00" },
    { id: "C4", propietario: "Marta López",    mascota: "Pelusa", especie: "gato",  servicio: "Consulta general", fecha: "2026-10-20", hora: "08:00" },
    { id: "C5", propietario: "Carolina Gómez", mascota: "Luna",   especie: "perro", servicio: "Baño",             fecha: "2026-10-14", hora: "09:00" }
  ];

  function initCasos() {
    $("#casos").innerHTML = CASOS.map((c) =>
      `<button type="button" data-caso="${c.id}">${c.id}: ${c.mascota}</button>`).join("");
    $("#casos").addEventListener("click", async (e) => {
      const c = CASOS.find((x) => x.id === e.target.dataset.caso);
      if (!c) return;
      form.propietario.value = c.propietario;
      form.mascota.value = c.mascota;
      $(`input[name=especie][value="${c.especie}"]`, form).checked = true;
      $(`input[name=servicio][value="${c.servicio}"]`, form).checked = true;
      campoFecha.value = c.fecha;
      await actualizarCupos();
      const h = $(`input[name=hora][value="${c.hora}"]`, form);
      if (h) h.checked = true;
      $$(".error", form).forEach((p) => (p.textContent = ""));
      $$(".invalido", form).forEach((g) => g.classList.remove("invalido"));
      if (!form.correo.value) {
        form.correo.focus();
        $("#err-correo").textContent = "Escribe tu correo para recibir la confirmación. Usa el mismo en C1 y C5.";
      } else {
        btn.focus();
      }
    });
  }

  /* ---------------- Vista Agenda del día ---------------- */
  const inputAgenda = $("#fecha-agenda");

  async function cargarAgenda(fresco = false) {
    const fecha = inputAgenda.value || hoyISO();
    inputAgenda.value = fecha;
    $("#fecha-larga").textContent = fechaLarga(fecha);
    const contFranjas = $("#franjas"), contCitas = $("#tabla-citas");

    if (!hojaLista) {
      const vacio = `<div class="estado-vacio"><b>La agenda aún no está conectada.</b>Agrega el ID de la hoja de Google en config.js.</div>`;
      contFranjas.innerHTML = ""; contCitas.innerHTML = vacio; $("#resumen").textContent = "";
      return;
    }

    $("#resumen").textContent = "Cargando…";
    try {
      const [agenda, citas] = await Promise.all([leerHoja(CFG.HOJA_AGENDA, fresco), leerHoja(CFG.HOJA_CITAS, fresco)]);

      // Franjas de la fecha
      const franjas = agenda.filter((f) => normFecha(f.fecha) === fecha)
        .map((f) => ({ hora: normHora(f.hora), cupo: Number(f.cupo) || 0, ocupados: Number(f.ocupados) || 0 }))
        .sort((a, b) => a.hora.localeCompare(b.hora));

      contFranjas.innerHTML = franjas.length ? franjas.map((f) => {
        const libres = Math.max(f.cupo - f.ocupados, 0);
        const clase = libres === 0 ? " franja--llena" : libres === 1 ? " franja--poca" : "";
        const puntos = Array.from({ length: f.cupo }, (_, i) =>
          `<span class="cupo${i < f.ocupados ? " cupo--ocupado" : ""}"></span>`).join("");
        return `<div class="franja${clase}">
            <p class="franja__hora">${esc(f.hora)}</p>
            <div class="franja__cupos" role="img" aria-label="${f.ocupados} de ${f.cupo} cupos ocupados">${puntos}</div>
            <p class="franja__texto">${libres === 0 ? "Sin cupos" : `${libres} ${libres === 1 ? "cupo libre" : "cupos libres"}`} de ${f.cupo}</p>
          </div>`;
      }).join("") : `<div class="estado-vacio"><b>No hay franjas abiertas este día.</b>Las solicitudes para esta fecha se registran como incidencia.</div>`;

      // Citas de la fecha
      const delDia = citas.filter((c) => normFecha(c.fecha) === fecha)
        .sort((a, b) => normHora(a.hora).localeCompare(normHora(b.hora)));

      const cuenta = (e) => delDia.filter((c) => normEstado(c.resultado) === e).length;
      const n = delDia.length, ok = cuenta("CONFIRMADA"), al = cuenta("CONFIRMADA_ALERTA");
      $("#resumen").innerHTML = n
        ? `<b>${n}</b> ${n === 1 ? "cita" : "citas"}: <b>${ok}</b> ${ok === 1 ? "confirmada" : "confirmadas"} y <b>${al}</b> con alerta.`
        : "Sin citas para esta fecha.";

      contCitas.innerHTML = n ? `<table>
          <thead><tr><th>Hora</th><th>Mascota</th><th>Servicio</th><th>Dueño</th><th>Resultado</th><th>Estado</th><th>Observación</th></tr></thead>
          <tbody>${delDia.map((c) => {
            const est = normEstado(c.resultado);
            const info = ESTADOS[est];
            return `<tr>
              <td class="hora-celda">${esc(normHora(c.hora))}</td>
              <td><b>${esc(c.mascota)}</b><br><span class="sutil">${esc(c.especie)}</span></td>
              <td>${esc(c.servicio)}</td>
              <td>${esc(c.propietario)}<br><span class="sutil">${esc(c.correo)}</span></td>
              <td><span class="insignia insignia--${info?.insignia || "neutra"}">${esc(info?.titulo || c.resultado || "—")}</span></td>
              <td>${esc(c.estado || "—")}</td>
              <td class="sutil">${esc(c.observacion || "")}${c.id_cita ? `<br>${esc(c.id_cita)}` : ""}</td>
            </tr>`;
          }).join("")}</tbody></table>`
        : `<div class="estado-vacio"><b>No hay citas para esta fecha.</b>Las citas agendadas desde el formulario aparecen aquí.</div>`;

      $("#actualizado").textContent = `Actualizado a las ${horaActual()}. Google puede tardar unos segundos en reflejar las últimas citas.`;
      try { localStorage.setItem("huellas.fechaAgenda", fecha); } catch { /* nada */ }
    } catch (err) {
      $("#resumen").textContent = "";
      contFranjas.innerHTML = "";
      contCitas.innerHTML = `<div class="estado-vacio"><b>No se pudo cargar la agenda.</b>${esc(err.message)}</div>`;
    }
  }

  function initAgenda() {
    let guardada = "";
    try { guardada = localStorage.getItem("huellas.fechaAgenda") || ""; } catch { /* nada */ }
    inputAgenda.value = guardada || hoyISO();
    inputAgenda.addEventListener("change", () => cargarAgenda());
    $("#dia-anterior").addEventListener("click", () => { inputAgenda.value = sumarDias(inputAgenda.value || hoyISO(), -1); cargarAgenda(); });
    $("#dia-siguiente").addEventListener("click", () => { inputAgenda.value = sumarDias(inputAgenda.value || hoyISO(), 1); cargarAgenda(); });
    $("#btn-actualizar").addEventListener("click", () => cargarAgenda(true));
  }

  /* ---------------- Inicio ---------------- */
  avisoConfig();
  initPestanas();
  pintarHoras();
  campoFecha.addEventListener("change", actualizarCupos);
  initCasos();
  pintarHistorial();
  initAgenda();
})();
