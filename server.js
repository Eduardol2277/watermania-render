const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Shared CSS ───────────────────────────────────────────────────────────────
const BASE_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f0f4f8; }
.wrap { margin: 0 auto; background: #fff; }
.header { background: #29ABE2; padding: 32px 40px; text-align: center; }
.header .brand { font-size: 28px; font-weight: 900; color: #fff; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
.header .tagline { font-size: 13px; color: rgba(255,255,255,0.82); margin-bottom: 14px; }
.header .prod { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.header .sub { font-size: 13px; color: rgba(255,255,255,0.9); }
.photo-box { padding: 20px 40px; text-align: center; border-bottom: 1px solid #e8f0f5; }
.photo-box img { max-width: 380px; max-height: 280px; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
.no-photo { display:inline-block; padding:28px 40px; background:#f0f8ff; border:2px dashed #29ABE2; border-radius:10px; color:#1a7aab; font-size:13px; }
.sec { padding: 24px 40px; border-bottom: 1px solid #e8f0f5; }
.sec-title { font-size:15px; font-weight:700; color:#29ABE2; text-transform:uppercase; letter-spacing:1px; margin-bottom:14px; padding-bottom:7px; border-bottom:2px solid #29ABE2; }
table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }
th { background:#29ABE2; color:#fff; padding:9px 11px; text-align:left; font-weight:600; }
td { padding:8px 11px; border-bottom:1px solid #e8f0f5; color:#333; vertical-align:top; }
tr:nth-child(even) td { background:#f0f8fd; }
.warn { background:#fff8e1; border-left:4px solid #ffc107; padding:11px 14px; border-radius:4px; margin:7px 0; font-size:13px; }
.info { background:#e8f5fc; border-left:4px solid #29ABE2; padding:11px 14px; border-radius:4px; margin:7px 0; font-size:13px; }
p { font-size:13px; line-height:1.7; color:#333; margin-bottom:7px; }
ul { padding-left:18px; margin:6px 0; }
li { font-size:13px; line-height:1.8; color:#333; }
.footer { background:#29ABE2; padding:18px 40px; text-align:center; }
.footer p { color:rgba(255,255,255,0.9); font-size:11px; margin:2px 0; }
.badge { display:inline-block; background:#29ABE2; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:12px; margin:2px; text-transform:uppercase; letter-spacing:0.5px; }
.tag { display:inline-block; background:#e8f5fc; color:#1a7aab; font-size:11px; padding:3px 10px; border-radius:12px; margin:2px; border:1px solid #b8dff0; }
`;

// ─── Research prompt (shared) ─────────────────────────────────────────────────
function buildResearchPrompt(productId, textContent) {
  return `Investiga el producto "${productId}" para Grupo Watermania Guatemala.
${textContent ? 'Informacion del cliente: ' + textContent : ''}

Busca en la web:
1. Especificaciones tecnicas oficiales del producto
2. Consumo electrico si aplica
3. Certificaciones oficiales
4. Garantia del fabricante
5. OBLIGATORIO: busca al menos 3 productos competidores o alternativos similares en el mercado (misma categoria, diferente marca). Compara caracteristicas, no precios.
6. Normas de seguridad
7. Imagen oficial exacta del producto

Responde SOLO con JSON valido sin explicaciones ni markdown:
{
  "nombre":"",
  "descripcion":"",
  "caracteristicas_principales":[""],
  "ventajas_competitivas":[""],
  "aplicaciones":[""],
  "materiales_construccion":"",
  "dimensiones_disponibles":"",
  "capacidad_cobertura":"",
  "specs":[{"p":"","v":""}],
  "consumo":{"aplica":true,"voltaje":"","amperaje":"","watts":"","costo_gtq":""},
  "comparativa":[{"marca":"","modelo":"","ventaja":"descripcion de ventaja de este competidor vs el producto principal","desventaja":"descripcion de desventaja de este competidor vs el producto principal"}],
  "garantia":{"anios":"","condiciones":""},
  "seguridad":[""],
  "certs":[{"nombre":"","desc":""}],
  "compatibilidad":[""],
  "imagen_url":""
}

REGLAS CRITICAS:
- Solo datos verificados con fuente web
- Si no encuentras algo usa null o []
- NUNCA inventes datos
- No incluyas precios en comparativa
- La comparativa DEBE tener al menos 2-3 competidores reales de la misma categoria`;
}

// ─── Research call ─────────────────────────────────────────────────────────────
async function doResearch(apiKey, productId, textContent, userContent) {
  const prompt = buildResearchPrompt(productId, textContent);

  let msgs = [{ role: 'user', content: userContent || prompt }];
  if (userContent && typeof userContent !== 'string') {
    // has files — append text prompt
    const arr = Array.isArray(userContent) ? userContent : [userContent];
    arr.push({ type: 'text', text: prompt });
    msgs = [{ role: 'user', content: arr }];
  }

  const r1 = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: msgs
    })
  });

  const d1 = await r1.json();
  if (!r1.ok) throw new Error(d1.error?.message || 'Error API');

  let text = d1.content?.find(b => b.type === 'text')?.text || '';

  if (!text || text.length < 50) {
    const r2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [
          ...msgs,
          { role: 'assistant', content: d1.content },
          { role: 'user', content: 'Responde ahora con el JSON completo de la investigacion.' }
        ]
      })
    });
    const d2 = await r2.json();
    text = d2.content?.find(b => b.type === 'text')?.text || '{}';
  }

  let R = {};
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) R = JSON.parse(m[0]);
  } catch(e) { R = {}; }
  return R;
}

// ─── Photo HTML ───────────────────────────────────────────────────────────────
function photoHTML(R, photoParts) {
  if (photoParts && photoParts.length > 0) {
    return photoParts.map((p,i) => `<img src="data:${p.source.media_type};base64,${p.source.data}" alt="Foto ${i+1}" style="max-width:360px;border-radius:8px;margin:4px;">`).join('');
  }
  if (R.imagen_url && R.imagen_url.startsWith('http')) {
    return `<img src="${R.imagen_url}" alt="${R.nombre||''}" onerror="this.parentElement.innerHTML='<div class=no-photo>📷 Imagen no disponible — Contactar a Watermanía para fotografía oficial</div>'">`;
  }
  return `<div class="no-photo">📷 Imagen no disponible — Contactar a Watermanía para fotografía oficial</div>`;
}

function footer(today) {
  return `<div class="footer">
  <p><strong>GRUPO WATERMANÍA</strong> — Especialistas en Construcción de Piscinas y Acuitectura</p>
  <p>www.watermania.com.gt | Tel: 2383-6700 | Guatemala, C.A.</p>
  <p style="margin-top:6px;opacity:0.75;font-size:10px">Generado el ${today} con asistencia de IA. Información basada en fuentes verificadas públicamente.</p>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT 1: BROCHURE — Documento completo de marketing con 8 secciones
// ─────────────────────────────────────────────────────────────────────────────
function buildBrochure(R, photoParts, productId, today) {
  const name = R.nombre || productId;

  // Specs table
  const specsHTML = R.specs?.length > 0
    ? `<table><tr><th>Parámetro</th><th>Valor</th></tr>${R.specs.map(s=>`<tr><td><strong>${s.p||''}</strong></td><td>${s.v||'N/D'}</td></tr>`).join('')}</table>`
    : '<div class="info">Especificaciones no disponibles públicamente. Consultar con Watermanía.</div>';

  // Comparativa — sin precio
  const compHTML = R.comparativa?.length > 0
    ? `<table><tr><th>Marca / Modelo</th><th>Ventaja vs ${name}</th><th>Desventaja vs ${name}</th></tr>${R.comparativa.map(c=>`<tr><td><strong>${c.marca||''} ${c.modelo||''}</strong></td><td>${c.ventaja||'N/D'}</td><td>${c.desventaja||'N/D'}</td></tr>`).join('')}</table>`
    : '<div class="info">Información comparativa no disponible. Consultar con Watermanía.</div>';

  const consumoHTML = R.consumo?.aplica
    ? `<table><tr><th>Parámetro</th><th>Valor</th></tr><tr><td>Voltaje</td><td>${R.consumo.voltaje||'N/D'}</td></tr><tr><td>Amperaje</td><td>${R.consumo.amperaje||'N/D'}</td></tr><tr><td>Potencia</td><td>${R.consumo.watts||'N/D'}</td></tr><tr><td>Costo est./hora (Guatemala)</td><td>${R.consumo.costo_gtq||'N/D'}</td></tr></table>`
    : '<div class="info">Este producto no requiere consumo eléctrico directo o información no disponible.</div>';

  const certHTML = R.certs?.length > 0
    ? `<table><tr><th>Certificación</th><th>Descripción</th></tr>${R.certs.map(c=>`<tr><td><strong>${c.nombre||''}</strong></td><td>${c.desc||''}</td></tr>`).join('')}</table>`
    : '<div class="info">Certificaciones no publicadas por el fabricante. Consultar con Watermanía.</div>';

  const segHTML = R.seguridad?.filter(s=>s).length > 0
    ? R.seguridad.filter(s=>s).map(s=>`<div class="warn">⚠️ ${s}</div>`).join('')
    : '<div class="info">Seguir instrucciones del fabricante. Instalación por técnico certificado.</div>';

  const compatHTML = R.compatibilidad?.filter(c=>c).length > 0
    ? `<ul>${R.compatibilidad.filter(c=>c).map(c=>`<li>${c}</li>`).join('')}</ul>`
    : '<div class="info">Consultar compatibilidad con el equipo técnico de Watermanía.</div>';

  // Generalidades enriquecidas (sin público objetivo)
  const generalesHTML = `
    <p><strong>Descripción:</strong> ${R.descripcion||'Consultar con Watermanía.'}</p>
    ${R.aplicaciones?.filter(a=>a).length > 0 ? `<p><strong>Aplicaciones:</strong></p><ul>${R.aplicaciones.filter(a=>a).map(a=>`<li>${a}</li>`).join('')}</ul>` : ''}
    ${R.caracteristicas_principales?.filter(c=>c).length > 0 ? `<p style="margin-top:10px"><strong>Características principales:</strong></p><ul>${R.caracteristicas_principales.filter(c=>c).map(c=>`<li>${c}</li>`).join('')}</ul>` : ''}
    ${R.ventajas_competitivas?.filter(v=>v).length > 0 ? `<p style="margin-top:10px"><strong>Ventajas competitivas:</strong></p><ul>${R.ventajas_competitivas.filter(v=>v).map(v=>`<li>${v}</li>`).join('')}</ul>` : ''}
    ${R.materiales_construccion ? `<p style="margin-top:10px"><strong>Materiales:</strong> ${R.materiales_construccion}</p>` : ''}
    ${R.dimensiones_disponibles ? `<p><strong>Dimensiones disponibles:</strong> ${R.dimensiones_disponibles}</p>` : ''}
    ${R.capacidad_cobertura ? `<p><strong>Capacidad / Cobertura:</strong> ${R.capacidad_cobertura}</p>` : ''}
  `;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${name} — Grupo Watermanía</title>
<style>${BASE_CSS} .wrap { width: 820px; }</style></head>
<body><div class="wrap">
<div class="header">
  <div class="brand">GRUPO WATERMANÍA</div>
  <div class="tagline">Especialistas en Construcción de Piscinas y Acuitectura</div>
  <div class="prod">${name}</div>
  <div class="sub">${(R.descripcion||'').substring(0,110)}</div>
</div>
<div class="photo-box">${photoHTML(R, photoParts)}</div>
<div class="sec"><div class="sec-title">1. Generalidades</div>${generalesHTML}</div>
<div class="sec"><div class="sec-title">2. Especificaciones Técnicas</div>${specsHTML}</div>
<div class="sec"><div class="sec-title">3. Comparativa vs Mercado</div>${compHTML}</div>
<div class="sec"><div class="sec-title">4. Consumo Eléctrico</div>${consumoHTML}</div>
<div class="sec"><div class="sec-title">5. Garantías</div>
  <div class="info"><strong>Fabricante:</strong> ${R.garantia?.anios?R.garantia.anios+' año(s)':'Consultar con fabricante'} ${R.garantia?.condiciones?'— '+R.garantia.condiciones:''}</div>
  <div class="info" style="margin-top:8px"><strong>Watermanía:</strong> Ofrece sus propias políticas de garantía y servicio técnico especializado. <strong>www.watermania.com.gt</strong> | Tel: <strong>2383-6700</strong></div>
</div>
<div class="sec"><div class="sec-title">6. Seguridad</div>${segHTML}</div>
<div class="sec"><div class="sec-title">7. Certificaciones</div>${certHTML}</div>
<div class="sec"><div class="sec-title">8. Compatibilidad con Equipos</div>${compatHTML}</div>
${footer(today)}
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT 2: INFOGRAFÍA — Visual compacto tipo poster con datos destacados
// ─────────────────────────────────────────────────────────────────────────────
function buildInfografia(R, photoParts, productId, today) {
  const name = R.nombre || productId;

  const topSpecs = (R.specs||[]).slice(0, 6);
  const specsGrid = topSpecs.map(s => `
    <div style="background:#f0f8fd;border-radius:8px;padding:14px;text-align:center;border:1px solid #b8dff0;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${s.p||''}</div>
      <div style="font-size:18px;font-weight:700;color:#29ABE2">${s.v||'N/D'}</div>
    </div>`).join('');

  const certs = (R.certs||[]).map(c => `<span class="badge">${c.nombre||''}</span>`).join('') || '<span class="tag">Consultar con Watermanía</span>';
  const caract = (R.caracteristicas_principales||[]).filter(c=>c).slice(0,6);
  const ventajas = (R.ventajas_competitivas||[]).filter(v=>v).slice(0,4);
  const compat = (R.compatibilidad||[]).filter(c=>c).slice(0,4);

  const consumoBadge = R.consumo?.aplica
    ? `<div style="display:inline-block;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 16px;margin:4px;font-size:13px;"><strong>⚡ ${R.consumo.watts||'N/D'}</strong> — ${R.consumo.voltaje||''} | ~${R.consumo.costo_gtq||'N/D'}/hora</div>`
    : `<div class="tag">No requiere energía eléctrica directa</div>`;

  const garantiaBadge = R.garantia?.anios
    ? `<div style="display:inline-block;background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:10px 16px;font-size:13px;"><strong>✅ ${R.garantia.anios} año(s)</strong> de garantía del fabricante</div>`
    : `<div class="tag">Consultar garantía con Watermanía</div>`;

  const comparativaHTML = (R.comparativa||[]).length > 0
    ? `<table><tr><th>Competidor</th><th>✅ Ventaja Watermanía</th><th>⚠️ A considerar</th></tr>
       ${R.comparativa.map(c=>`<tr><td><strong>${c.marca||''} ${c.modelo||''}</strong></td><td>${c.desventaja||'N/D'}</td><td>${c.ventaja||'N/D'}</td></tr>`).join('')}</table>`
    : '<div class="info">Sin datos comparativos disponibles.</div>';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${name} — Infografía Watermanía</title>
<style>${BASE_CSS} .wrap { width: 780px; }</style></head>
<body><div class="wrap">

<div class="header" style="padding:28px 32px;">
  <div class="brand" style="font-size:22px">GRUPO WATERMANÍA</div>
  <div class="tagline">Especialistas en Construcción de Piscinas y Acuitectura</div>
  <div class="prod" style="font-size:26px;margin-top:10px">${name}</div>
</div>

<!-- Foto + descripción -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e8f0f5">
  <div style="padding:20px 24px;text-align:center;border-right:1px solid #e8f0f5">
    ${photoHTML(R, photoParts)}
  </div>
  <div style="padding:20px 24px;">
    <div style="font-size:13px;font-weight:700;color:#29ABE2;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">¿Qué es?</div>
    <p style="font-size:13px;line-height:1.7">${R.descripcion||'Consultar con Watermanía.'}</p>
    ${R.capacidad_cobertura ? `<p style="margin-top:8px"><strong>Cobertura:</strong> ${R.capacidad_cobertura}</p>` : ''}
    ${R.materiales_construccion ? `<p><strong>Materiales:</strong> ${R.materiales_construccion}</p>` : ''}
  </div>
</div>

<!-- Specs en grid -->
<div class="sec">
  <div class="sec-title">⚙️ Datos técnicos clave</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${specsGrid}</div>
</div>

<!-- Características y ventajas -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e8f0f5">
  <div style="padding:20px 24px;border-right:1px solid #e8f0f5">
    <div class="sec-title">✅ Características</div>
    <ul>${caract.length>0?caract.map(c=>`<li>${c}</li>`).join(''):'<li>Consultar con Watermanía</li>'}</ul>
  </div>
  <div style="padding:20px 24px;">
    <div class="sec-title">🏆 Ventajas competitivas</div>
    <ul>${ventajas.length>0?ventajas.map(v=>`<li>${v}</li>`).join(''):'<li>Consultar con Watermanía</li>'}</ul>
  </div>
</div>

<!-- Consumo y garantía -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e8f0f5">
  <div style="padding:20px 24px;border-right:1px solid #e8f0f5">
    <div class="sec-title">⚡ Consumo eléctrico</div>
    ${consumoBadge}
  </div>
  <div style="padding:20px 24px;">
    <div class="sec-title">🛡️ Garantía</div>
    ${garantiaBadge}
    <div class="info" style="margin-top:8px;font-size:12px">Watermanía ofrece garantía y servicio técnico especializado</div>
  </div>
</div>

<!-- Comparativa -->
<div class="sec">
  <div class="sec-title">📊 Comparativa vs mercado</div>
  ${comparativaHTML}
</div>

<!-- Certificaciones + Compatibilidad -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e8f0f5">
  <div style="padding:20px 24px;border-right:1px solid #e8f0f5">
    <div class="sec-title">🏅 Certificaciones</div>
    <div>${certs}</div>
  </div>
  <div style="padding:20px 24px;">
    <div class="sec-title">🔗 Compatible con</div>
    <ul>${compat.length>0?compat.map(c=>`<li>${c}</li>`).join(''):'<li>Consultar con Watermanía</li>'}</ul>
  </div>
</div>

<!-- Seguridad -->
<div class="sec">
  <div class="sec-title">⚠️ Seguridad</div>
  ${(R.seguridad||[]).filter(s=>s).length>0 ? (R.seguridad||[]).filter(s=>s).map(s=>`<div class="warn">⚠️ ${s}</div>`).join('') : '<div class="info">Seguir instrucciones del fabricante. Instalación por técnico certificado.</div>'}
</div>

${footer(today)}
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT 3: FICHA TÉCNICA — Datasheet limpio orientado a técnicos
// ─────────────────────────────────────────────────────────────────────────────
function buildFicha(R, photoParts, productId, today) {
  const name = R.nombre || productId;

  const specsHTML = R.specs?.length > 0
    ? `<table><tr><th style="width:40%">Parámetro</th><th>Valor</th></tr>${R.specs.map(s=>`<tr><td><strong>${s.p||''}</strong></td><td>${s.v||'N/D'}</td></tr>`).join('')}</table>`
    : '<div class="info">Especificaciones no disponibles. Consultar con Watermanía.</div>';

  const consumoHTML = R.consumo?.aplica
    ? `<table><tr><th style="width:40%">Parámetro</th><th>Valor</th></tr>
       <tr><td>Voltaje</td><td>${R.consumo.voltaje||'N/D'}</td></tr>
       <tr><td>Amperaje</td><td>${R.consumo.amperaje||'N/D'}</td></tr>
       <tr><td>Potencia</td><td>${R.consumo.watts||'N/D'}</td></tr>
       <tr><td>Costo est./hora (Guatemala)</td><td>${R.consumo.costo_gtq||'N/D'}</td></tr></table>`
    : '<div class="info">No aplica / No disponible.</div>';

  const compHTML = R.comparativa?.length > 0
    ? `<table><tr><th>Marca / Modelo</th><th>Ventaja vs ${name}</th><th>Desventaja vs ${name}</th></tr>
       ${R.comparativa.map(c=>`<tr><td><strong>${c.marca||''} ${c.modelo||''}</strong></td><td>${c.ventaja||'N/D'}</td><td>${c.desventaja||'N/D'}</td></tr>`).join('')}</table>`
    : '<div class="info">Sin datos comparativos disponibles.</div>';

  const certHTML = R.certs?.length > 0
    ? `<table><tr><th style="width:30%">Certificación</th><th>Descripción</th></tr>${R.certs.map(c=>`<tr><td><strong>${c.nombre||''}</strong></td><td>${c.desc||''}</td></tr>`).join('')}</table>`
    : '<div class="info">No publicadas por el fabricante. Consultar con Watermanía.</div>';

  const compatHTML = R.compatibilidad?.filter(c=>c).length > 0
    ? `<table><tr><th>Equipo / Sistema compatible</th></tr>${R.compatibilidad.filter(c=>c).map(c=>`<tr><td>${c}</td></tr>`).join('')}</table>`
    : '<div class="info">Consultar compatibilidad con Watermanía.</div>';

  const segHTML = R.seguridad?.filter(s=>s).length > 0
    ? `<table><tr><th>Norma / Advertencia</th></tr>${R.seguridad.filter(s=>s).map(s=>`<tr><td>⚠️ ${s}</td></tr>`).join('')}</table>`
    : '<div class="info">Seguir instrucciones del fabricante.</div>';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Ficha Técnica ${name} — Watermanía</title>
<style>${BASE_CSS} .wrap { width: 820px; } .sec { padding: 18px 32px; } .sec-title { font-size:13px; }</style></head>
<body><div class="wrap">

<!-- Header -->
<div style="background:#29ABE2;padding:16px 32px;display:flex;align-items:center;justify-content:space-between">
  <div>
    <div style="font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:1px">Ficha Técnica</div>
    <div style="font-size:20px;font-weight:700;color:#fff">${name}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:13px;font-weight:700;color:#fff">GRUPO WATERMANÍA</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.8)">www.watermania.com.gt | 2383-6700</div>
  </div>
</div>

<!-- Foto centrada -->
<div style="padding:20px 32px;text-align:center;border-bottom:1px solid #e8f0f5;background:#fafcfe">
  ${photoHTML(R, photoParts)}
  ${R.garantia?.anios ? `<div style="display:inline-block;margin-top:12px;font-size:12px;background:#d4edda;border-radius:6px;padding:8px 16px;color:#155724"><strong>✅ Garantía: ${R.garantia.anios} año(s)</strong> — ${R.garantia.condiciones||''}</div>` : ''}
  ${(R.certs||[]).length>0?`<div style="margin-top:10px">${R.certs.map(c=>`<span class="badge" style="font-size:10px">${c.nombre}</span>`).join('')}</div>`:''}
</div>

<!-- Descripción -->
<div class="sec" style="border-bottom:1px solid #e8f0f5">
  <div style="font-size:12px;font-weight:700;color:#29ABE2;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Descripción del producto</div>
  <p style="font-size:13px;line-height:1.7;margin-bottom:10px">${R.descripcion||'Consultar con Watermanía.'}</p>
  <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:8px">
    ${R.capacidad_cobertura?`<div style="font-size:12px;background:#f0f8fd;padding:8px 12px;border-radius:6px;border:1px solid #b8dff0"><strong>Capacidad:</strong> ${R.capacidad_cobertura}</div>`:''}
    ${R.dimensiones_disponibles?`<div style="font-size:12px;background:#f0f8fd;padding:8px 12px;border-radius:6px;border:1px solid #b8dff0"><strong>Dimensiones:</strong> ${R.dimensiones_disponibles}</div>`:''}
    ${R.materiales_construccion?`<div style="font-size:12px;background:#f0f8fd;padding:8px 12px;border-radius:6px;border:1px solid #b8dff0"><strong>Materiales:</strong> ${R.materiales_construccion}</div>`:''}
  </div>
</div>

<div class="sec"><div class="sec-title">ESPECIFICACIONES TÉCNICAS</div>${specsHTML}</div>
<div class="sec"><div class="sec-title">CONSUMO ELÉCTRICO</div>${consumoHTML}</div>
<div class="sec"><div class="sec-title">COMPARATIVA VS MERCADO</div>${compHTML}</div>
<div class="sec"><div class="sec-title">CERTIFICACIONES</div>${certHTML}</div>
<div class="sec"><div class="sec-title">COMPATIBILIDAD CON EQUIPOS</div>${compatHTML}</div>
<div class="sec"><div class="sec-title">NORMAS DE SEGURIDAD</div>${segHTML}</div>
<div class="sec"><div class="sec-title">GARANTÍAS</div>
  <div class="info"><strong>Fabricante:</strong> ${R.garantia?.anios?R.garantia.anios+' año(s)':'Consultar con fabricante'} ${R.garantia?.condiciones?'— '+R.garantia.condiciones:''}</div>
  <div class="info" style="margin-top:6px"><strong>Watermanía:</strong> Servicio técnico especializado y garantía propia. www.watermania.com.gt | 2383-6700</div>
</div>

${footer(today)}
</div></body></html>`;
}

// ─── Main route ───────────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada' });

  const { productId, fmt, hasPhotos, textContent, docPart, photoParts } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requerido' });

  try {
    const today = new Date().toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build user content with any attached files
    let userContent = null;
    if (docPart || (photoParts && photoParts.length > 0)) {
      userContent = [];
      if (docPart) userContent.push(docPart);
      if (photoParts && photoParts.length > 0) userContent.push(...photoParts);
    } else if (textContent) {
      userContent = textContent;
    }

    const R = await doResearch(apiKey, productId, textContent, userContent);

    let html = '';
    if (fmt === 'infografia') {
      html = buildInfografia(R, photoParts, productId, today);
    } else if (fmt === 'ficha') {
      html = buildFicha(R, photoParts, productId, today);
    } else {
      html = buildBrochure(R, photoParts, productId, today);
    }

    return res.status(200).json({ html });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Watermania Brochures en puerto ${PORT}`));
