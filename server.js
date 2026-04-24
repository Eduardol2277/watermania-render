const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CSS_STYLES = `<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f0f4f8; }
.brochure { width: 820px; margin: 0 auto; background: #fff; }
.header { background: #29ABE2; padding: 36px 40px; text-align: center; }
.header .brand { font-size: 32px; font-weight: 900; color: #fff; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
.header .tagline { font-size: 14px; color: rgba(255,255,255,0.85); margin-bottom: 16px; }
.header .product-name { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.header .product-sub { font-size: 14px; color: rgba(255,255,255,0.9); }
.photo-section { padding: 24px 40px; text-align: center; border-bottom: 1px solid #e8f0f5; }
.photo-section img { max-width: 400px; max-height: 300px; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
.no-photo { display: inline-block; padding: 32px 48px; background: #f0f8ff; border: 2px dashed #29ABE2; border-radius: 10px; color: #1a7aab; font-size: 14px; }
.section { padding: 28px 40px; border-bottom: 1px solid #e8f0f5; }
.section-title { font-size: 16px; font-weight: 700; color: #29ABE2; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #29ABE2; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
th { background: #29ABE2; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; }
td { padding: 9px 12px; border-bottom: 1px solid #e8f0f5; color: #333; }
tr:nth-child(even) td { background: #f0f8fd; }
.source-tag { font-size: 11px; color: #888; font-style: italic; }
.warning-box { background: #fff8e1; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 4px; margin: 8px 0; font-size: 13px; }
.info-box { background: #e8f5fc; border-left: 4px solid #29ABE2; padding: 12px 16px; border-radius: 4px; margin: 8px 0; font-size: 13px; }
p { font-size: 13px; line-height: 1.7; color: #333; margin-bottom: 8px; }
ul { padding-left: 20px; margin: 8px 0; }
li { font-size: 13px; line-height: 1.8; color: #333; }
.footer { background: #29ABE2; padding: 20px 40px; text-align: center; }
.footer p { color: rgba(255,255,255,0.9); font-size: 12px; margin: 2px 0; }
.sources-list { font-size: 11px; }
.sources-list a { color: #29ABE2; }
</style>`;

app.post('/api/generate', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada' });

  const { productId, fmt, hasPhotos, textContent, docPart, photoParts } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requerido' });

  try {
    const today = new Date().toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });

    const researchPrompt = `Investiga el producto "${productId}" para Grupo Watermania Guatemala.
Busca en la web: especificaciones tecnicas, consumo electrico, certificaciones, garantia fabricante, 3 competidores con precios, normas de seguridad, imagen oficial exacta.
${textContent ? 'Informacion del cliente: ' + textContent : ''}

Responde SOLO con JSON valido, sin explicaciones ni markdown:
{"nombre":"","descripcion":"","aplicaciones":"","publico":"","specs":[{"p":"","v":"","f":""}],"consumo":{"aplica":true,"voltaje":"","amperaje":"","watts":"","costo_gtq":"","fuente":""},"comparativa":[{"marca":"","modelo":"","precio":"","ventaja":"","desventaja":""}],"garantia":{"anios":"","condiciones":"","fuente":""},"seguridad":[""],"certs":[{"nombre":"","desc":"","fuente":""}],"compatibilidad":[""],"imagen_url":"","fuentes":[""]}`;

    let userContent = [];
    if (docPart) userContent.push(docPart);
    if (photoParts && photoParts.length > 0) userContent.push(...photoParts);
    userContent.push({ type: 'text', text: researchPrompt });
    if (userContent.length === 1) userContent = userContent[0].text;

    const r1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: userContent }]
      })
    });

    const d1 = await r1.json();
    if (!r1.ok) throw new Error(d1.error?.message || 'Error API');

    let researchText = d1.content?.find(b => b.type === 'text')?.text || '';

    if (!researchText || researchText.length < 50) {
      const r1b = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [
            { role: 'user', content: userContent },
            { role: 'assistant', content: d1.content },
            { role: 'user', content: 'Responde ahora con el JSON completo de la investigacion.' }
          ]
        })
      });
      const d1b = await r1b.json();
      researchText = d1b.content?.find(b => b.type === 'text')?.text || '{}';
    }

    let R = {};
    try {
      const m = researchText.match(/\{[\s\S]*\}/);
      if (m) R = JSON.parse(m[0]);
    } catch(e) { R = {}; }

    // Build photo
    let photoHTML = '';
    if (photoParts && photoParts.length > 0) {
      photoHTML = photoParts.map((p,i) => `<img src="data:${p.source.media_type};base64,${p.source.data}" alt="Foto ${i+1}" style="max-width:380px;border-radius:8px;margin:4px;">`).join('');
    } else if (R.imagen_url && R.imagen_url.startsWith('http')) {
      photoHTML = `<img src="${R.imagen_url}" alt="${productId}" onerror="this.parentElement.innerHTML='<div class=no-photo>📷 Imagen no disponible — Contactar a Watermanía</div>'">`;
    } else {
      photoHTML = `<div class="no-photo">📷 Imagen no disponible — Contactar a Watermanía para fotografía oficial</div>`;
    }

    const specsHTML = R.specs?.length > 0
      ? `<table><tr><th>Parámetro</th><th>Valor</th><th>Fuente</th></tr>${R.specs.map(s=>`<tr><td><strong>${s.p||''}</strong></td><td>${s.v||'N/D'}</td><td class="source-tag">${s.f||''}</td></tr>`).join('')}</table>`
      : '<div class="info-box">Especificaciones no disponibles públicamente. Consultar con Watermanía.</div>';

    const compHTML = R.comparativa?.length > 0
      ? `<table><tr><th>Marca / Modelo</th><th>Precio Est.</th><th>Ventaja vs ${R.nombre||productId}</th><th>Desventaja</th></tr>${R.comparativa.map(c=>`<tr><td><strong>${c.marca||''} ${c.modelo||''}</strong></td><td>${c.precio||'N/D'}</td><td>${c.ventaja||'N/D'}</td><td>${c.desventaja||'N/D'}</td></tr>`).join('')}</table>`
      : '<div class="info-box">Información comparativa no disponible. Consultar con Watermanía.</div>';

    const consumoHTML = R.consumo?.aplica
      ? `<table><tr><th>Parámetro</th><th>Valor</th></tr><tr><td>Voltaje</td><td>${R.consumo.voltaje||'N/D'}</td></tr><tr><td>Amperaje</td><td>${R.consumo.amperaje||'N/D'}</td></tr><tr><td>Potencia</td><td>${R.consumo.watts||'N/D'}</td></tr><tr><td>Costo est./hora (Guatemala)</td><td>${R.consumo.costo_gtq||'N/D'}</td></tr></table>${R.consumo.fuente?`<p class="source-tag">Fuente: ${R.consumo.fuente}</p>`:''}`
      : '<div class="info-box">Este producto no requiere consumo eléctrico directo o información no disponible públicamente.</div>';

    const certHTML = R.certs?.length > 0
      ? `<table><tr><th>Certificación</th><th>Descripción</th><th>Fuente</th></tr>${R.certs.map(c=>`<tr><td><strong>${c.nombre||''}</strong></td><td>${c.desc||''}</td><td class="source-tag">${c.fuente||''}</td></tr>`).join('')}</table>`
      : '<div class="info-box">Certificaciones no publicadas por el fabricante en fuentes verificables. Consultar con Watermanía o el fabricante.</div>';

    const seguridadHTML = R.seguridad?.filter(s=>s).length > 0
      ? R.seguridad.filter(s=>s).map(s=>`<div class="warning-box">⚠️ ${s}</div>`).join('')
      : '<div class="info-box">Seguir instrucciones del fabricante. Instalación por técnico certificado. Consultar con Watermanía.</div>';

    const compatHTML = R.compatibilidad?.filter(c=>c).length > 0
      ? `<ul>${R.compatibilidad.filter(c=>c).map(c=>`<li>${c}</li>`).join('')}</ul>`
      : '<div class="info-box">Información de compatibilidad no disponible. Consultar con el equipo técnico de Watermanía.</div>';

    const fuentesHTML = R.fuentes?.filter(f=>f).length > 0
      ? `<ul class="sources-list">${R.fuentes.filter(f=>f).map(f=>`<li><a href="${f}" target="_blank">${f}</a></li>`).join('')}</ul>`
      : '<p class="source-tag">Información compilada de fuentes web verificadas durante la generación.</p>';

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${R.nombre||productId} — Grupo Watermanía</title>
${CSS_STYLES}
</head>
<body><div class="brochure">
<div class="header">
  <div class="brand">GRUPO WATERMANÍA</div>
  <div class="tagline">Especialistas en Construcción de Piscinas y Acuitectura</div>
  <div class="product-name">${R.nombre||productId}</div>
  <div class="product-sub">${(R.descripcion||'').substring(0,120)}</div>
</div>
<div class="photo-section">${photoHTML}</div>
<div class="section"><div class="section-title">1. Generalidades</div>
  <p><strong>Descripción:</strong> ${R.descripcion||'Consultar con Watermanía.'}</p>
  <p><strong>Aplicaciones:</strong> ${R.aplicaciones||'Consultar con Watermanía.'}</p>
  <p><strong>Público objetivo:</strong> ${R.publico||'Consultar con Watermanía.'}</p>
</div>
<div class="section"><div class="section-title">2. Especificaciones Técnicas</div>${specsHTML}</div>
<div class="section"><div class="section-title">3. Tabla Comparativa vs Mercado</div>${compHTML}</div>
<div class="section"><div class="section-title">4. Consumo Eléctrico</div>${consumoHTML}</div>
<div class="section"><div class="section-title">5. Garantías</div>
  <div class="info-box"><strong>Fabricante:</strong> ${R.garantia?.anios?R.garantia.anios+' año(s) de garantía':'Consultar con fabricante'} ${R.garantia?.condiciones?'— '+R.garantia.condiciones:''} ${R.garantia?.fuente?'<br><span class="source-tag">Fuente: '+R.garantia.fuente+'</span>':''}</div>
  <div class="info-box" style="margin-top:8px"><strong>Watermanía:</strong> Ofrece sus propias políticas de garantía y servicio técnico especializado. Contactar: <strong>www.watermania.com.gt</strong> | Tel: <strong>2383-6700</strong></div>
</div>
<div class="section"><div class="section-title">6. Seguridad</div>${seguridadHTML}</div>
<div class="section"><div class="section-title">7. Certificaciones</div>${certHTML}</div>
<div class="section"><div class="section-title">8. Compatibilidad con Equipos</div>${compatHTML}</div>
<div class="section"><div class="section-title">9. Fuentes y Referencias</div>${fuentesHTML}</div>
<div class="footer">
  <p><strong>GRUPO WATERMANÍA</strong> — Especialistas en Construcción de Piscinas y Acuitectura</p>
  <p>www.watermania.com.gt | Tel: 2383-6700 | Guatemala, C.A.</p>
  <p style="margin-top:8px;opacity:0.8;font-size:11px">Generado el ${today} con asistencia de IA. Información basada en fuentes verificadas públicamente.</p>
</div>
</div></body></html>`;

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
