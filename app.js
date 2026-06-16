// ─── CONFIG ───────────────────────────────────────────────
const SUPABASE_URL = 'https://gkaflynhmehfdryuzqye.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XT_l_ELZVbkvCfQY1Aw6nQ_7J35GtIR';
// La API key de Anthropic vive en el servidor (api/generar.js), no acá
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── ESTADO ───────────────────────────────────────────────
let currentUser = null;
let currentConfig = null;
let informeTexto = null;
let informeData = null;
let listaPacientes = [];

const DEFAULT_PRUEBAS = [
  "ACE-R (Addenbrooke's Cognitive Examination - Revisado)",
  "WAIS III — Dígitos directos e inversos",
  "WAIS III — Dígitos símbolos",
  "WAIS III — Búsqueda de símbolos",
  "WAIS III — Ordenamiento números-letras",
  "TMT A (Test del Trazo A)",
  "TMT B (Test del Trazo B)",
  "RAVLT (Test de Aprendizaje Auditivo Verbal de Rey)",
  "FCRO — Figura Compleja de Rey Osterrieth",
  "Fluencia verbal fonológica",
  "Fluencia verbal semántica",
  "Test de Boston — Denominación por confrontación visual",
  "Test del reloj a la orden verbal",
  "Test de Stroop",
  "IFS — INECO Frontal Screening",
  "Escala de Depresión de Yesavage",
  "AVD Básicas",
  "AVD Instrumentales",
  "Cuestionario Disejecutivo (DEX)",
  "Cuestionario Neuropsiquiátrico (NPI-Q)"
];

const DEFAULT_PROMPT = `Sos una psicóloga especializada en neuropsicología clínica. Redactá un informe de evaluación neurocognitiva completo y profesional en español rioplatense.

El informe debe incluir estas secciones claramente diferenciadas:
1. DATOS PERSONALES (listado)
2. DATOS RELEVANTES (sueño, actividad física, red de apoyo)
3. APORTES DURANTE LA ENTREVISTA (párrafo narrativo detallado)
4. DESCRIPCIÓN DE LA CONDUCTA (párrafo narrativo detallado)
5. PRUEBAS ADMINISTRADAS (lista)
6. RESULTADOS (presentación organizada de puntajes por dominio)
7. ANÁLISIS DE LOS RESULTADOS (párrafos detallados por cada dominio: funcionamiento cognitivo global, atención, memoria episódica verbal, memoria episódica visual, lenguaje, habilidades visoespaciales, funciones ejecutivas, aspectos comportamentales)
8. CONCLUSIÓN (párrafo clínico con diagnóstico diferencial según criterios DSM-5)
9. SUGERENCIAS (lista con recomendaciones terapéuticas y de seguimiento)

Pautas de estilo:
- Lenguaje técnico neuropsicológico, clínico y preciso
- Párrafos bien articulados con conectores adecuados
- Nunca seas genérico: integrá los datos específicos del paciente en cada párrafo
- Considerá la edad, nivel educativo y contexto del paciente al interpretar los puntajes
- Usá Z-scores y percentiles para fundamentar las interpretaciones cualitativas
- El análisis de resultados debe ser el más extenso (aprox. 60% del informe)`;

// ─── INIT ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await initApp();
  } else {
    showScreen('login');
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      await initApp();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showScreen('login');
    }
  });
});

async function initApp() {
  document.getElementById('nav-nombre').textContent = currentUser.email;
  await cargarConfig();
  initPruebas();
  showScreen('app');
  showView('nuevo');
}

// ─── AUTH ──────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) { showLoginMsg('Completá email y contraseña.', 'error'); return; }

  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) showLoginMsg('Email o contraseña incorrectos.', 'error');
}

async function doRegister() {
  const nombre = document.getElementById('reg-nombre').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const matricula = document.getElementById('reg-matricula').value.trim();
  const tel = document.getElementById('reg-tel').value.trim();

  if (!nombre || !email || !pass) { showRegMsg('Completá nombre, email y contraseña.', 'error'); return; }
  if (pass.length < 6) { showRegMsg('La contraseña debe tener al menos 6 caracteres.', 'error'); return; }

  const { data, error } = await sb.auth.signUp({ email, password: pass });
  if (error) { showRegMsg(error.message, 'error'); return; }

  if (data.user) {
    await sb.from('psicologas').insert({
      id: data.user.id,
      email,
      nombre,
      matricula,
      telefono: tel
    });
    await sb.from('configuracion').insert({
      psicologa_id: data.user.id,
      encabezado_nombre: nombre,
      encabezado_matricula: matricula,
      encabezado_telefono: tel,
      encabezado_email: email,
      prompt_custom: DEFAULT_PROMPT,
      pruebas_lista: DEFAULT_PRUEBAS
    });
  }
  showRegMsg('Cuenta creada. Ya podés ingresar.', 'success');
  setTimeout(() => showLogin(), 1500);
}

async function doLogout() {
  await sb.auth.signOut();
}

function showLogin() {
  showScreen('login');
}

function showRegister() {
  showScreen('register');
}

// ─── CONFIG ────────────────────────────────────────────────
async function cargarConfig() {
  const { data } = await sb.from('configuracion')
    .select('*')
    .eq('psicologa_id', currentUser.id)
    .single();

  if (data) {
    currentConfig = data;
  } else {
    const { data: prof } = await sb.from('psicologas').select('*').eq('id', currentUser.id).single();
    currentConfig = {
      encabezado_nombre: prof?.nombre || '',
      encabezado_matricula: prof?.matricula || '',
      encabezado_telefono: prof?.telefono || '',
      encabezado_email: prof?.email || currentUser.email,
      prompt_custom: DEFAULT_PROMPT,
      pruebas_lista: DEFAULT_PRUEBAS
    };
  }
}

function cargarFormConfig() {
  document.getElementById('cfg-nombre').value = currentConfig.encabezado_nombre || '';
  document.getElementById('cfg-matricula').value = currentConfig.encabezado_matricula || '';
  document.getElementById('cfg-tel').value = currentConfig.encabezado_telefono || '';
  document.getElementById('cfg-email').value = currentConfig.encabezado_email || '';
  document.getElementById('cfg-prompt').value = currentConfig.prompt_custom || DEFAULT_PROMPT;
  const pruebas = Array.isArray(currentConfig.pruebas_lista) ? currentConfig.pruebas_lista : DEFAULT_PRUEBAS;
  document.getElementById('cfg-pruebas').value = pruebas.join('\n');
}

async function guardarConfig() {
  const nuevaConfig = {
    psicologa_id: currentUser.id,
    encabezado_nombre: document.getElementById('cfg-nombre').value.trim(),
    encabezado_matricula: document.getElementById('cfg-matricula').value.trim(),
    encabezado_telefono: document.getElementById('cfg-tel').value.trim(),
    encabezado_email: document.getElementById('cfg-email').value.trim(),
    prompt_custom: document.getElementById('cfg-prompt').value.trim(),
    pruebas_lista: document.getElementById('cfg-pruebas').value.split('\n').map(s => s.trim()).filter(Boolean),
    updated_at: new Date().toISOString()
  };

  const { error } = await sb.from('configuracion')
    .upsert(nuevaConfig, { onConflict: 'psicologa_id' });

  if (!error) {
    currentConfig = nuevaConfig;
    initPruebas();
    showAppMsg('Configuración guardada correctamente.', 'success');
  } else {
    showAppMsg('Error al guardar la configuración.', 'error');
  }
}

// ─── PRUEBAS CHECKLIST ────────────────────────────────────
function initPruebas() {
  const container = document.getElementById('pruebas-checks');
  if (!container) return;
  const lista = (currentConfig?.pruebas_lista && Array.isArray(currentConfig.pruebas_lista))
    ? currentConfig.pruebas_lista : DEFAULT_PRUEBAS;

  container.innerHTML = '';
  lista.forEach((p, i) => {
    const label = document.createElement('label');
    label.className = 'check-item';
    label.innerHTML = `<input type="checkbox" id="pr${i}" value="${p}"><span>${p}</span>`;
    container.appendChild(label);
  });
}

function getPruebasSeleccionadas() {
  return Array.from(document.querySelectorAll('#pruebas-checks input:checked')).map(el => el.value);
}

// ─── FORM DATA ────────────────────────────────────────────
function getFormData() {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  return {
    nombre: g('nombre'), edad: g('edad'), fnac: g('fnac'), sexo: g('sexo'),
    educacion: g('educacion'), ocupacion: g('ocupacion'), lentes: g('lentes'),
    audifonos: g('audifonos'), dominancia: g('dominancia'), fechas_eval: g('fechas_eval'),
    derivado: g('derivado'), motivo: g('motivo'), antecedentes: g('antecedentes'),
    antec_familiares: g('antec_familiares'), habitos: g('habitos'), actividad: g('actividad'),
    sueno: g('sueno'), red_apoyo: g('red_apoyo'), estudios: g('estudios'),
    aportes: g('aportes'), conducta: g('conducta'),
    pruebas: getPruebasSeleccionadas(),
    ace_orient: g('ace_orient'), ace_aten: g('ace_aten'), ace_mem: g('ace_mem'),
    ace_flu: g('ace_flu'), ace_leng: g('ace_leng'), ace_visoes: g('ace_visoes'),
    ace_total: g('ace_total'), ace_corte: g('ace_corte'),
    at_dig_d: g('at_dig_d'), at_dig_i: g('at_dig_i'), at_dig_s: g('at_dig_s'),
    at_nl: g('at_nl'), at_bus: g('at_bus'), at_tmta: g('at_tmta'), at_tmtb: g('at_tmtb'),
    mem_curva: g('mem_curva'), mem_inm: g('mem_inm'), mem_interf: g('mem_interf'),
    mem_cp: g('mem_cp'), mem_lp: g('mem_lp'), mem_rec: g('mem_rec'),
    mem_intrus: g('mem_intrus'), mem_fp: g('mem_fp'), mem_fcro: g('mem_fcro'),
    mem_fcro_rec: g('mem_fcro_rec'),
    leng_fon: g('leng_fon'), leng_sem: g('leng_sem'), leng_bos: g('leng_bos'),
    leng_comp: g('leng_comp'), leng_rep: g('leng_rep'),
    vis_fcro_ex: g('vis_fcro_ex'), vis_fcro_t: g('vis_fcro_t'), vis_reloj: g('vis_reloj'),
    vis_pent: g('vis_pent'), vis_cubo: g('vis_cubo'),
    ej_tmtb: g('ej_tmtb'), ej_vel: g('ej_vel'), ej_strp: g('ej_strp'),
    ej_strc: g('ej_strc'), ej_strpc: g('ej_strpc'), ej_stri: g('ej_stri'),
    ej_ifs: g('ej_ifs'), ej_ifs_mt: g('ej_ifs_mt'), ej_ifs_pm: g('ej_ifs_pm'),
    ej_ifs_abs: g('ej_ifs_abs'), ej_fcro_plan: g('ej_fcro_plan'),
    comp_yes: g('comp_yes'), comp_avdb: g('comp_avdb'), comp_avdi: g('comp_avdi'),
    comp_dex: g('comp_dex'), comp_npi: g('comp_npi'),
    obs_adicionales: g('obs_adicionales')
  };
}

// ─── GENERAR INFORME ──────────────────────────────────────
async function generarInforme() {
  const d = getFormData();
  if (!d.nombre) { showAppMsg('Ingresá al menos el nombre del paciente.', 'error'); return; }

  const btn = document.getElementById('btn-generar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generando...';
  document.getElementById('resultado-area').style.display = 'none';

  const promptBase = currentConfig?.prompt_custom || DEFAULT_PROMPT;

  const prompt = `${promptBase}

DATOS DEL PACIENTE PARA ESTE INFORME:
Nombre: ${d.nombre} | Edad: ${d.edad} | Fecha nac.: ${d.fnac} | Sexo: ${d.sexo}
Educación: ${d.educacion} | Ocupación: ${d.ocupacion}
Lentes: ${d.lentes} | Audífonos: ${d.audifonos} | Dominancia: ${d.dominancia}
Fecha evaluación: ${d.fechas_eval} | Derivado por: ${d.derivado}
Motivo: ${d.motivo}
Antecedentes neurológicos/psiquiátricos: ${d.antecedentes}
Antecedentes familiares: ${d.antec_familiares}
Hábitos tóxicos: ${d.habitos} | Actividad física: ${d.actividad}
Estudios complementarios: ${d.estudios}
Sueño: ${d.sueno}
Red de apoyo: ${d.red_apoyo}

APORTES DURANTE LA ENTREVISTA:
${d.aportes}

DESCRIPCIÓN DE LA CONDUCTA:
${d.conducta}

PRUEBAS ADMINISTRADAS: ${d.pruebas.join(', ')}

RESULTADOS:
ACE-R → Orientación: ${d.ace_orient} | Atención: ${d.ace_aten} | Memoria: ${d.ace_mem} | Fluencia: ${d.ace_flu} | Lenguaje: ${d.ace_leng} | Visoespacial: ${d.ace_visoes} | TOTAL: ${d.ace_total} (corte: ${d.ace_corte})

ATENCIÓN → Dígitos directos: ${d.at_dig_d} | Inversos: ${d.at_dig_i} | Dígitos-símbolos: ${d.at_dig_s} | Núm-letras: ${d.at_nl} | Búsqueda símbolos: ${d.at_bus} | TMT-A: ${d.at_tmta} | TMT-B: ${d.at_tmtb}

MEMORIA → Curva RAVLT: ${d.mem_curva} | Inmediata: ${d.mem_inm} | Interferencia: ${d.mem_interf} | CP: ${d.mem_cp} | LP: ${d.mem_lp} | Reconocimiento: ${d.mem_rec} | Intrusiones: ${d.mem_intrus} | Falsos positivos: ${d.mem_fp} | FCRO diferido: ${d.mem_fcro} | FCRO reconocimiento: ${d.mem_fcro_rec}

LENGUAJE → Fonológica: ${d.leng_fon} | Semántica: ${d.leng_sem} | Boston: ${d.leng_bos} | Comprensión: ${d.leng_comp} | Repetición: ${d.leng_rep}

VISOESPACIAL → FCRO exactitud: ${d.vis_fcro_ex} | Tiempo: ${d.vis_fcro_t} | Reloj: ${d.vis_reloj} | Pentágonos: ${d.vis_pent} | Cubo: ${d.vis_cubo}

FUNCIONES EJECUTIVAS → TMT-B: ${d.ej_tmtb} | Vel. procesamiento: ${d.ej_vel} | Stroop P: ${d.ej_strp} | Stroop C: ${d.ej_strc} | Stroop PC: ${d.ej_strpc} | Stroop interf: ${d.ej_stri} | IFS total: ${d.ej_ifs} | IFS-MT: ${d.ej_ifs_mt} | IFS-PM: ${d.ej_ifs_pm} | IFS-Abs: ${d.ej_ifs_abs} | FCRO planif: ${d.ej_fcro_plan}

COMPORTAMENTALES → Yesavage: ${d.comp_yes} | AVD básicas: ${d.comp_avdb} | AVD instr: ${d.comp_avdi}
DEX: ${d.comp_dex}
NPI-Q: ${d.comp_npi}

OBSERVACIONES ADICIONALES: ${d.obs_adicionales}

Redactá el informe completo y detallado.`;

  try {
    const resp = await fetch('/api/generar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const texto = data.content?.[0]?.text || '';
    informeTexto = texto;
    informeData = d;
    document.getElementById('texto-generado').textContent = texto;
    document.getElementById('resultado-area').style.display = 'block';
    document.getElementById('resultado-area').scrollIntoView({ behavior: 'smooth' });
  } catch(e) {
    showAppMsg('Error al generar el informe: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.innerHTML = '<svg class="icon-btn" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generar informe con IA';
}

// ─── GUARDAR / DESCARGAR ──────────────────────────────────
async function guardarEnNube() {
  if (!informeTexto) { showAppMsg('Primero generá el informe.', 'error'); return; }
  const { error } = await sb.from('informes').insert({
    psicologa_id: currentUser.id,
    nombre: informeData.nombre,
    edad: informeData.edad,
    fecha_evaluacion: informeData.fechas_eval,
    motivo: informeData.motivo,
    informe_texto: informeTexto,
    datos_json: informeData
  });
  if (!error) showAppMsg('Informe guardado en la nube.', 'success');
  else showAppMsg('Error al guardar: ' + error.message, 'error');
}

function copiarTexto() {
  navigator.clipboard.writeText(informeTexto || '').then(() => showAppMsg('Texto copiado.', 'success'));
}

function descargarPDF(texto, datos) {
  const t = texto || informeTexto;
  const d = datos || informeData;
  if (!t) { showAppMsg('No hay informe para descargar.', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 22;
  const pw = 210;
  const uw = pw - margin * 2;
  let y = 18;

  const cfg = currentConfig || {};
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(cfg.encabezado_nombre || 'Informe Neurocognitivo', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const subtitulo = [cfg.encabezado_matricula, cfg.encabezado_telefono, cfg.encabezado_email].filter(Boolean).join(' | ');
  doc.text(subtitulo, margin, y);
  y += 3;
  doc.setDrawColor(180, 178, 170);
  doc.line(margin, y, pw - margin, y);
  y += 8;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(t, uw);
  const lineH = 5.2;
  lines.forEach(line => {
    if (y > 278) { doc.addPage(); y = 18; }
    doc.text(line, margin, y);
    y += lineH;
  });

  const fn = `Informe_${(d?.nombre || 'paciente').replace(/\s+/g,'_')}_${new Date().toLocaleDateString('es-AR').replace(/\//g,'-')}.pdf`;
  doc.save(fn);
}

// ─── LISTA PACIENTES ──────────────────────────────────────
async function cargarLista() {
  const container = document.getElementById('lista-pacientes');
  container.innerHTML = '<p style="color:var(--text-3);font-size:13px">Cargando...</p>';

  const { data, error } = await sb.from('informes')
    .select('id, nombre, edad, fecha_evaluacion, motivo, creado_en')
    .eq('psicologa_id', currentUser.id)
    .order('creado_en', { ascending: false });

  if (error || !data?.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:13px">No hay pacientes guardados todavía.</p>';
    listaPacientes = [];
    return;
  }
  listaPacientes = data;
  renderLista(data);
}

function renderLista(data) {
  const container = document.getElementById('lista-pacientes');
  if (!data.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:13px">No se encontraron resultados.</p>';
    return;
  }
  container.innerHTML = data.map(p => {
    const fecha = p.creado_en ? new Date(p.creado_en).toLocaleDateString('es-AR') : '';
    return `
    <div class="patient-row">
      <div>
        <div class="patient-name">${p.nombre}</div>
        <div class="patient-meta">${p.edad || ''} · ${p.motivo || ''} · Guardado: ${fecha}</div>
      </div>
      <div class="patient-actions">
        <button class="btn-outline" style="font-size:12px;padding:5px 10px" onclick="verInforme(${p.id})">Ver</button>
        <button class="btn-outline" style="font-size:12px;padding:5px 10px" onclick="descargarGuardado(${p.id})">PDF</button>
        <button class="btn-danger-sm" onclick="eliminarPaciente(${p.id})">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

function filtrarLista() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const filtrados = listaPacientes.filter(p => p.nombre?.toLowerCase().includes(q));
  renderLista(filtrados);
}

async function verInforme(id) {
  const { data } = await sb.from('informes').select('nombre, informe_texto, datos_json').eq('id', id).single();
  if (data) {
    informeTexto = data.informe_texto;
    informeData = data.datos_json || { nombre: data.nombre };
    showView('nuevo');
    document.getElementById('texto-generado').textContent = data.informe_texto;
    document.getElementById('resultado-area').style.display = 'block';
    setTimeout(() => document.getElementById('resultado-area').scrollIntoView({ behavior: 'smooth' }), 100);
  }
}

async function descargarGuardado(id) {
  const { data } = await sb.from('informes').select('nombre, informe_texto, datos_json').eq('id', id).single();
  if (data) descargarPDF(data.informe_texto, data.datos_json || { nombre: data.nombre });
}

async function eliminarPaciente(id) {
  if (!confirm('¿Eliminar este paciente y su informe? Esta acción no se puede deshacer.')) return;
  await sb.from('informes').delete().eq('id', id);
  cargarLista();
}

// ─── UI HELPERS ───────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  const tabs = document.querySelectorAll('.nav-tab');
  const map = { nuevo: 0, lista: 1, config: 2 };
  if (map[name] !== undefined && tabs[map[name]]) tabs[map[name]].classList.add('active');
  if (name === 'lista') cargarLista();
  if (name === 'config') cargarFormConfig();
}

function limpiarForm() {
  document.querySelectorAll('#view-nuevo input, #view-nuevo select, #view-nuevo textarea').forEach(el => el.value = '');
  document.querySelectorAll('#pruebas-checks input[type=checkbox]').forEach(el => el.checked = false);
  document.getElementById('resultado-area').style.display = 'none';
  document.getElementById('app-msg').innerHTML = '';
  informeTexto = null; informeData = null;
}

function showAppMsg(msg, type) {
  const el = document.getElementById('app-msg');
  el.innerHTML = `<div class="msg msg-${type}">${msg}</div>`;
  setTimeout(() => el.innerHTML = '', 4000);
}

function showLoginMsg(msg, type) {
  document.getElementById('login-msg').innerHTML = `<div class="msg msg-${type}">${msg}</div>`;
}

function showRegMsg(msg, type) {
  document.getElementById('register-msg').innerHTML = `<div class="msg msg-${type}">${msg}</div>`;
}
