const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `Eres experto en materiales de marketing técnico para Grupo Watermanía, empresa guatemalteca especialista en construcción de piscinas y acuitectura.

IDENTIDAD DE MARCA WATERMANÍA:
- Color principal: #29ABE2 (Pantone 2925 C)
- Color secundario: #B8C4CC (Pantone 5445 C)
- Tipografía: Arial Rounded MT Bold (títulos), Helvetica Neue (cuerpo)
- Web: www.watermania.com.gt | Tel: 2383-6700

TU PROCESO OBLIGATORIO:
1. Analiza la información que te dan del producto
2. Usa la herramienta web_search para buscar:
   - Especificaciones técnicas oficiales del fabricante
   - Consumo eléctrico, voltaje, amperaje (si aplica)
   - Certificaciones oficiales (NSF, UL, CE, ISO, etc.)
   - Garantías del fabricante
   - Comparativa con al menos 3 productos similares del mercado
   - Imagen oficial exacta del producto (si no se subieron fotos)
   - Normativas de seguridad aplicables
3. Genera el HTML completo del brochure
4. NUNCA inventes datos — si no encuentras info verificada escribe: "No disponible / Consultar con Watermanía"
5. Cita la fuente URL de cada dato que viene de búsqueda web

FOTOGRAFÍAS:
- Si el usuario subió fotos → úsalas como imágenes base64 embebidas. Foto principal en el encabezado.
- Si NO subió fotos → busca en la web la imagen OFICIAL y EXACTA del modelo/marca. Usa la URL directa de la imagen del fabricante o distribuidor oficial. SOLO usa si confirmas que es exactamente ese producto. Si no encuentras imagen exacta → escribe: <div style="text-align:center;padding:40px;background:#f0f8ff;border:2px dashed #29ABE2;border-radius:8px;color:#1a7aab">📷 Imagen no disponible — Contactar a Watermanía para fotografía oficial</div>

SECCIONES OBLIGATORIAS (incluir TODAS):
1. ENCABEZADO — Header azul con GRUPO WATERMANÍA + nombre del producto + foto
2. GENERALIDADES — descripción, usos, público objetivo
3. ESPECIFICACIONES TÉCNICAS — tabla completa con parámetros
4. TABLA COMPARATIVA — vs mínimo 3 competidores (marca, modelo, precio est., diferencias)
5. CONSUMO ELÉCTRICO — voltaje, amperaje, watts, costo/hora estimado en Guatemala si aplica
6. GARANTÍAS — fabricante + nota: "Watermanía ofrece sus propias políticas de garantía y servicio técnico"
7. SEGURIDAD — normas de instalación, advertencias, normativas
8. CERTIFICACIONES — verificadas con fuente; si no tiene: "No publicadas / Consultar con Watermanía"
9. COMPATIBILIDAD — equipos compatibles, restricciones
10. FUENTES — lista de todas las URLs usadas

REGLAS DE DISEÑO HTML:
- Responde SOLO con HTML puro — sin explicaciones, sin markdown, sin backticks
- HTML autónomo completo con DOCTYPE, html, head y body
- Todo el CSS dentro de style en el head
- Ancho 820px centrado, fondo blanco
- Header: fondo #29ABE2, texto blanco, tipografía bold
- Encabezados de sección: color #29ABE2, borde inferior #29ABE2
- Tablas: headers fondo #29ABE2 texto blanco, filas alternas #f0f8fd
- Fotos: max-width 380px, border-radius 8px
- Footer: datos de contacto Watermanía + fecha de generación
- Diseño limpio, profesional, imprimible`;

app.post('/api/generate', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key no configurada' });
  }

  const { productId, fmt, hasPhotos, textContent, docPart, photoParts } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId requerido' });

  const userText = `Producto: ${productId}
Formato solicitado: ${fmt}
${textContent ? '\n' + textContent : ''}

INSTRUCCIONES:
1. Busca en la web las especificaciones técnicas OFICIALES de "${productId}"
2. Busca tabla comparativa con al menos 3 productos similares del mercado
3. Busca consumo eléctrico, certificaciones y garantías del fabricante
${!hasPhotos ? `4. Busca la imagen OFICIAL y EXACTA de "${productId}" — solo del fabricante o distribuidor oficial` : '4. El cliente subió fotos — úsalas como base64 en el HTML'}
5. Genera el HTML completo del brochure con TODAS las secciones y fuentes citadas`;

  let userContent = [];
  if (docPart) userContent.push(docPart);
  if (photoParts && photoParts.length > 0) userContent.push(...photoParts);
  userContent.push({ type: 'text', text: userText });
  if (userContent.length === 1) userContent = userContent[0].text;

  try {
    const r1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: userContent }]
      })
    });

    const d1 = await r1.json();
    if (!r1.ok) throw new Error(d1.error?.message || `Error ${r1.status}`);

    let html = d1.content?.find(b => b.type === 'text')?.text || '';

    if (!html || html.length < 200) {
      const r2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [
            { role: 'user', content: userContent },
            { role: 'assistant', content: d1.content },
            { role: 'user', content: 'Ahora genera el HTML completo del brochure con toda la información encontrada.' }
          ]
        })
      });
      const d2 = await r2.json();
      html = d2.content?.find(b => b.type === 'text')?.text || '';
    }

    html = html.replace(/```html/gi, '').replace(/```/g, '').trim();
    if (!html || html.length < 100) throw new Error('No se generó contenido HTML válido.');

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
app.listen(PORT, () => console.log(`Watermanía Brochures corriendo en puerto ${PORT}`));
