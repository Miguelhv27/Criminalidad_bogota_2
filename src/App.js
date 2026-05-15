import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, Cell
} from 'recharts';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import Papa from 'papaparse';
import './App.css';

// ── Paleta ────────────────────────────────────────────────────────────────────
const RIESGO_COLOR  = { Bajo:'#4ade80', Medio:'#f59e0b', Alto:'#ef4444' };
const LISA_COLOR    = { HH:'#fca5a5', HL:'#fcd34d', LH:'#bfdbfe', LL:'#93c5fd', NS:'#e2e8f0' };
const CLUSTER_COLOR = { 0:'#4ade80', 1:'#ef4444', 2:'#f59e0b' };
const CLUSTER_LABEL = { 0:'Riesgo bajo', 1:'Riesgo alto', 2:'Riesgo medio' };

function riesgoColor(r) { return RIESGO_COLOR[r] || '#94a3b8'; }
function getRiesgoColorByTasa(t) {
  if (t >= 3000) return RIESGO_COLOR['Alto'];
  if (t >= 1500) return RIESGO_COLOR['Medio'];
  return RIESGO_COLOR['Bajo'];
}

function sinTildes(s) {
  return (s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function useCSV(filename) {
  const [data, setData]   = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch(`/data/${filename}`)
      .then(r => r.text())
      .then(csv => {
        const { data: rows } = Papa.parse(csv, { header:true, dynamicTyping:true, skipEmptyLines:true });
        setData(rows);
        setReady(true);
      })
      .catch(err => { console.error(`Error cargando ${filename}:`, err); setReady(true); });
  }, [filename]);
  return [data, ready];
}

const NAV = [
  { id:'intro',          label:'Contexto'       },
  { id:'exploratory',    label:'Exploración'    },
  { id:'temporal',       label:'Serie temporal' },
  { id:'spatial',        label:'Autocorrelación'},
  { id:'ml',             label:'Clustering ML'  },
  { id:'model',          label:'Modelo RF'      },
  { id:'validation',     label:'Validación'     },
  { id:'interpretation', label:'Conclusiones'   },
];

function MapaHotspots({ tasas }) {
  const [geojson, setGeojson] = useState(null);
  useEffect(() => {
    fetch('/data/localidades_completo.geojson')
      .then(r => r.json())
      .then(setGeojson)
      .catch(console.error);
  }, []);

  function getColor(nombre) {
    const n = sinTildes(nombre);
    const loc = tasas.find(d => sinTildes(d.LOCALIDAD) === n);
    if (!loc) return '#e2e8f0';
    if (loc.tasa_total >= 3000) return '#fca5a5';
    if (loc.tasa_total >= 1500) return '#fde68a';
    return '#bbf7d0';
  }

  function styleFeature(feature) {
    const nombre = feature.properties.LOCALIDAD_KEY || feature.properties.LocNombre || '';
    return { fillColor: getColor(nombre), fillOpacity: 0.75, color: '#fff', weight: 1.5 };
  }

  function onEachFeature(feature, layer) {
    const nombre = feature.properties.LOCALIDAD_KEY || feature.properties.LocNombre || '';
    const n = sinTildes(nombre);
    const loc = tasas.find(d => sinTildes(d.LOCALIDAD) === n);
    if (loc) {
      layer.bindTooltip(
        `<strong>${nombre.charAt(0)+nombre.slice(1).toLowerCase()}</strong><br/>
         Tasa total: <b>${Number(loc.tasa_total).toFixed(0)}</b> / 10.000 hab.<br/>
         Hurto personas: <b>${Number(loc.tasa_hurto_a_personas||0).toFixed(0)}</b>`,
        { sticky:true, className:'map-tooltip' }
      );
    }
  }

  return (
    <div className="mapa-wrap">
      <MapContainer center={[4.6486,-74.0972]} zoom={10}
        style={{height:'100%',width:'100%'}} scrollWheelZoom={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        {geojson && (
          <GeoJSON key="geojson-layer" data={geojson}
            style={styleFeature} onEachFeature={onEachFeature}/>
        )}
      </MapContainer>
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState('intro');
  const [menuOpen, setMenuOpen]           = useState(false);
  const sectionRefs = useRef({});

  const [tasas,      tasasOk]    = useCSV('tasas_localidades.csv');
  const [moran,      moranOk]    = useCSV('moran_global.csv');
  const [lisa,       lisaOk]     = useCSV('lisa_resultados.csv');
  const [clusters,   clustersOk] = useCSV('clustering_ml.csv');
  const [perfil,     perfilOk]   = useCSV('perfil_clusters.csv');
  const [rfImp,      rfImpOk]    = useCSV('random_forest_importancia.csv');
  const [preds,      predsOk]    = useCSV('predicciones_riesgo.csv');
  const [validacion, validOk]    = useCSV('validacion_resultados.csv');
  const [codo,       codoOk]     = useCSV('metodo_codo.csv');
  const [serie,      serieOk]    = useCSV('serie_temporal.csv');
  const [vecindad,   vecindadOk] = useCSV('vecindad_espacial.csv');

  const allReady = tasasOk && moranOk && lisaOk && clustersOk && perfilOk &&
                   rfImpOk && predsOk && validOk && codoOk && serieOk && vecindadOk;

  const sortedTasas = [...tasas].sort((a,b) => b.tasa_total - a.tasa_total);

  const enriched = tasas.map(d => {
    const key = d.LOCALIDAD || '';
    const l   = lisa.find(x => x.LOCALIDAD_KEY === key) || {};
    const cl  = clusters.find(x => x.LOCALIDAD_KEY === key) || {};
    const pr  = preds.find(x => x.localidad === key) || {};
    return { ...d, ...l, ...cl, ...pr };
  });

  const seriePorFecha = (() => {
    if (!serie.length) return [];
    const map = {};
    serie.forEach(r => {
      const f = r.fecha || `${r.anio}-${String(r.mes).padStart(2,'0')}`;
      map[f] = (map[f]||0) + (r.cantidad||0);
    });
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b))
      .map(([fecha,cantidad])=>({ fecha, cantidad }));
  })();

  const top5 = sortedTasas.slice(0,5).map(d => d.LOCALIDAD);
  const LINE_COLORS = ['#6366f1','#ef4444','#f59e0b','#10b981','#8b5cf6'];

  const seriePorLoc = (() => {
    if (!serie.length) return [];
    const map = {};
    serie.forEach(r => {
      if (!top5.includes(r.localidad)) return;
      const f = r.fecha || `${r.anio}-${String(r.mes).padStart(2,'0')}`;
      if (!map[f]) map[f] = { fecha: f };
      map[f][r.localidad] = (map[f][r.localidad]||0) + (r.cantidad||0);
    });
    return Object.values(map).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  })();

  const vecindadConteo = (() => {
    if (!vecindad.length) return [];
    const map = {};
    vecindad.forEach(r => { map[r.localidad]=(map[r.localidad]||0)+1; });
    return Object.entries(map).map(([localidad,n_vecinos])=>({ localidad, n_vecinos }))
      .sort((a,b)=>b.n_vecinos-a.n_vecinos);
  })();

  const perfilConColor = [...perfil].sort((a,b)=>{
    const order = { Cluster_0:0, Cluster_1:1, Cluster_2:2 };
    return (order[a.cluster]||0)-(order[b.cluster]||0);
  }).map((c,i)=>({ ...c, color:CLUSTER_COLOR[i]??'#94a3b8', label:CLUSTER_LABEL[i]??c.cluster }));

  const rfImpDisplay = rfImp.map(d=>({
    ...d,
    importancia: d.importancia_permutacion > 0 ? d.importancia_permutacion : d.importancia_gini,
  })).sort((a,b)=>b.importancia-a.importancia);

  const lisaSignificativas = [
    { nombre:'Santa Fe',       tipo:'HH', color:'#fca5a5', desc:'Alta criminalidad rodeada de vecinas también altas. Es el epicentro espacial del riesgo en Bogotá.' },
    { nombre:'Usme',           tipo:'LL', color:'#93c5fd', desc:'Baja criminalidad con vecinas similares. La periferia sur forma un entorno de menor riesgo relativo.' },
    { nombre:'Ciudad Bolívar', tipo:'LL', color:'#93c5fd', desc:'Baja criminalidad con vecinas similares. Coincide con el cluster de riesgo bajo de K-Means.' },
  ];

  const mediaHurto = tasas.length
    ? Math.round(tasas.reduce((s,r)=>s+(r.tasa_hurto_a_personas||0),0)/tasas.length)
    : 0;

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e=>{ if(e.isIntersecting) setActiveSection(e.target.id); }),
      { threshold:0.2 }
    );
    NAV.forEach(n => {
      const el = document.getElementById(n.id);
      if (el) { sectionRefs.current[n.id]=el; obs.observe(el); }
    });
    return () => obs.disconnect();
  }, []);

  const scrollTo = id => {
    document.getElementById(id)?.scrollIntoView({ behavior:'smooth' });
    setMenuOpen(false);
  };

  if (!allReady) return (
    <div className="loading-screen">
      <div className="spinner"/>
      <p>Cargando datos…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div className="app">

      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand"><span className="nav-dot"/>Criminalidad · Bogotá</div>
        <button className="nav-hamburger" onClick={()=>setMenuOpen(!menuOpen)}>
          <span/><span/><span/>
        </button>
        <ul className={`nav-links ${menuOpen?'open':''}`}>
          {NAV.map(n=>(
            <li key={n.id}>
              <button className={activeSection===n.id?'active':''} onClick={()=>scrollTo(n.id)}>
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* 00 · INTRO */}
      <section id="intro" className="section section-hero">
        <div className="hero-content">
          <p className="hero-eyebrow">Análisis Espacial · Bogotá D.C. · 2021–2024</p>
          <h1 className="hero-title">¿Dónde se<br/>concentra el<br/>delito en Bogotá?</h1>
          <p className="hero-sub">
            Bogotá registra más de <strong>176 mil eventos delictivos</strong> entre 2021 y 2024,
            distribuidos de forma muy desigual entre sus 19 localidades urbanas.
            Este análisis combina <strong>datos abiertos SIEDCO</strong>, estadística espacial
            y aprendizaje automático para construir una tipología de riesgo comprensible para cualquier ciudadano.
          </p>
          <div className="hero-stats">
            <div className="stat"><span>19</span><p>Localidades</p></div>
            <div className="stat"><span>176K</span><p>Eventos 2021–24</p></div>
            <div className="stat"><span>12</span><p>Tipos de delito</p></div>
            <div className="stat"><span>4</span><p>Años analizados</p></div>
          </div>
          <button className="btn-scroll" onClick={()=>scrollTo('exploratory')}>Explorar análisis ↓</button>
        </div>
        <div className="hero-note">
          <strong>Nota sobre los datos:</strong> SIEDCO registra solo delitos <em>denunciados</em>.
          Los delitos sexuales y la violencia intrafamiliar presentan alta no-denuncia, por lo que
          sus tasas subestiman la realidad.
        </div>
      </section>

      {/* 01 · EXPLORACIÓN */}
      <section id="exploratory" className="section">
        <SectionHeader
          eyebrow="01 · Exploración"
          title="¿Cuántos delitos hay por localidad?"
          desc="Comparar conteos absolutos es engañoso: Suba tiene 1.3 millones de habitantes y La Candelaria apenas 18 mil. Usamos tasas por 10.000 habitantes para una comparación justa."
        />
        <div className="card" style={{marginBottom:22}}>
          <h3 className="card-title">Mapa de calor — Tasa de delitos por localidad</h3>
          <p className="card-sub">
            Pasa el cursor sobre cada localidad para ver su tasa exacta.
            <span style={{marginLeft:12}}>
              <span style={{display:'inline-block',width:10,height:10,background:'#fca5a5',borderRadius:2,marginRight:4}}/>Alto (≥ 3.000)
              <span style={{display:'inline-block',width:10,height:10,background:'#fde68a',borderRadius:2,margin:'0 4px 0 10px'}}/>Medio (1.500–3.000)
              <span style={{display:'inline-block',width:10,height:10,background:'#bbf7d0',borderRadius:2,margin:'0 4px 0 10px'}}/>Bajo (&lt; 1.500)
            </span>
          </p>
          <MapaHotspots tasas={tasas}/>
        </div>

        <div className="two-col">
          <div className="card">
            <h3 className="card-title">Tasa total de delitos por 10.000 hab.</h3>
            <p className="card-sub">Los Mártires y La Candelaria lideran con tasas que triplican la media.</p>
            <ResponsiveContainer width="100%" height={460}>
              <BarChart data={sortedTasas} layout="vertical" margin={{left:120,right:20,top:4,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10,fill:'#6b7280'}} tickLine={false}/>
                <YAxis type="category" dataKey="LOCALIDAD" tick={{fontSize:10,fill:'#374151'}} tickLine={false} width={118}
                  tickFormatter={v=>v.charAt(0)+v.slice(1).toLowerCase()}/>
                <Tooltip
                  formatter={v=>[`${Number(v).toFixed(1)} por 10.000 hab.`,'Tasa']}
                  contentStyle={{borderRadius:8,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,.08)',fontSize:12}}
                />
                <Bar dataKey="tasa_total" radius={[0,4,4,0]}>
                  {sortedTasas.map((d,i)=><Cell key={i} fill={getRiesgoColorByTasa(d.tasa_total)}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="right-panel">
            <div className="hotspots-list">
              <h3 className="card-title">Las 5 zonas más críticas</h3>
              <p className="card-sub">Por tasa de delitos por 10.000 habitantes.</p>
              {sortedTasas.slice(0,5).map((d,i)=>(
                <div className="hotspot-item" key={d.LOCALIDAD}>
                  <span className="hotspot-rank" style={{background:getRiesgoColorByTasa(d.tasa_total)}}>{i+1}</span>
                  <div>
                    <p className="hotspot-name">{d.LOCALIDAD.charAt(0)+d.LOCALIDAD.slice(1).toLowerCase()}</p>
                    <p className="hotspot-rate">{Number(d.tasa_total).toFixed(1)} delitos / 10.000 hab.</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="legend-card">
              <h4>Escala de riesgo</h4>
              <p style={{fontSize:12,color:'#6b7280',marginBottom:10}}>Umbrales derivados de los clusters K-Means del análisis.</p>
              {[
                {label:'Alto (≥ 3.000)',       color:RIESGO_COLOR.Alto},
                {label:'Medio (1.500–3.000)',   color:RIESGO_COLOR.Medio},
                {label:'Bajo (< 1.500)',        color:RIESGO_COLOR.Bajo},
              ].map(l=>(
                <div className="legend-row" key={l.label}>
                  <span className="legend-dot" style={{background:l.color}}/><span>{l.label}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <h3 className="card-title">Hurto a personas: localidades vs. media</h3>
              <p className="card-sub">El hurto es el delito dominante. Las zonas del centro superan ampliamente la media.</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={sortedTasas.slice(0,8).map(d=>({
                    loc: d.LOCALIDAD.split(' ').slice(-1)[0].toLowerCase(),
                    hurto: d.tasa_hurto_a_personas,
                    media: mediaHurto,
                  }))}
                  margin={{left:4,right:8,top:4,bottom:28}}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                  <XAxis dataKey="loc" tick={{fontSize:9,fill:'#1a1a1a'}} angle={-30} textAnchor="end" interval={0}/>
                  <YAxis tick={{fontSize:10}} tickLine={false}/>
                  <Tooltip contentStyle={{borderRadius:8,border:'none',fontSize:12}}/>
                  <Bar dataKey="hurto" fill="#6366f1" name="Tasa hurto" radius={[3,3,0,0]}/>
                  <Bar dataKey="media" fill="#e0e7ff" name="Media Bogotá" radius={[3,3,0,0]}/>
                  <Legend iconSize={10} wrapperStyle={{fontSize:11,color:'#1a1a1a'}}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="insight-box">
              <span className="insight-icon">💡</span>
              <p>Los Mártires (5.872) y La Candelaria (5.166) tienen tasas que <strong>superan 3× la media de Bogotá</strong>. Alto flujo peatonal, comercio informal y nocturnidad generan las condiciones.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 02 · SERIE TEMPORAL */}
      <section id="temporal" className="section section-alt">
        <SectionHeader
          eyebrow="02 · Serie temporal"
          title="¿Cómo han evolucionado los delitos mes a mes?"
          desc="La serie temporal permite identificar tendencias, estacionalidad y cambios abruptos. Ver si el problema mejora, empeora o se mantiene estable es clave para evaluar políticas de seguridad."
        />
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">Total de delitos en Bogotá por mes</h3>
            <p className="card-sub">Suma de las 19 localidades. Permite detectar picos y tendencias generales.</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={seriePorFecha} margin={{left:8,right:16,top:8,bottom:32}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                <XAxis dataKey="fecha" tick={{fontSize:8,fill:'#9ca3af'}} angle={-35} textAnchor="end" height={40} interval={2}/>
                <YAxis tick={{fontSize:10,fill:'#9ca3af'}} tickLine={false} width={40}/>
                <Tooltip contentStyle={{borderRadius:8,border:'none',fontSize:12}} formatter={v=>[Number(v).toLocaleString('es-CO'),'Delitos']}/>
                <Line type="monotone" dataKey="cantidad" stroke="#6366f1" strokeWidth={2.5} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
            <p className="chart-note">Fuente: SIEDCO · Período 2021–2024</p>
          </div>
          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">Evolución mensual: top 5 localidades</h3>
              <p className="card-sub">Las 5 localidades con mayor tasa y su comportamiento en el tiempo.</p>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={seriePorLoc} margin={{left:8,right:16,top:8,bottom:32}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                  <XAxis dataKey="fecha" tick={{fontSize:8,fill:'#9ca3af'}} angle={-35} textAnchor="end" height={40} interval={3}/>
                  <YAxis tick={{fontSize:10}} tickLine={false} width={36}/>
                  <Tooltip contentStyle={{borderRadius:8,border:'none',fontSize:11}}/>
                  {top5.map((loc,i)=>(
                    <Line key={loc} type="monotone" dataKey={loc} stroke={LINE_COLORS[i]}
                      strokeWidth={1.8} dot={false} name={loc.charAt(0)+loc.slice(1).toLowerCase()}/>
                  ))}
                  <Legend iconSize={8} wrapperStyle={{fontSize:10}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="explain-cards">
              <div className="explain-item">
                <span className="explain-tag" style={{background:'#6366f1'}}>📈</span>
                <div><strong>¿Qué buscar?</strong><p>Picos en diciembre-enero (festividades), tendencias sostenidas y cambios después de intervenciones de política pública.</p></div>
              </div>
              <div className="explain-item">
                <span className="explain-tag" style={{background:'#10b981'}}>📉</span>
                <div><strong>Estacionalidad</strong><p>Meses de alto flujo de personas tienden a concentrar más hurtos. La serie revela si estos patrones son consistentes año a año.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 03 · AUTOCORRELACIÓN */}
      <section id="spatial" className="section">
        <SectionHeader
          eyebrow="03 · Autocorrelación espacial"
          title="¿Los delitos se agrupan geográficamente?"
          desc="El I de Moran mide si localidades con tasas altas tienden a estar rodeadas de otras con tasas altas. Un valor positivo y significativo (p < 0.05) confirma que el delito no es aleatorio: hay clusters espaciales reales."
        />
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">I de Moran global por tipo de delito</h3>
            <p className="card-sub">Todos los delitos muestran I &gt; 0 y p &lt; 0.05: hay clustering espacial significativo.</p>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={moran} margin={{left:16,right:16,top:8,bottom:80}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                <XAxis dataKey="delito" tick={{fontSize:9,fill:'#6b7280'}} angle={-35} textAnchor="end" interval={0} height={88}/>
                <YAxis tick={{fontSize:10,fill:'#6b7280'}} domain={[0,'auto']} tickLine={false}/>
                <Tooltip formatter={v=>[Number(v).toFixed(3),'I de Moran']} contentStyle={{borderRadius:8,border:'none',fontSize:12}}/>
                <Bar dataKey="moran_I" radius={[4,4,0,0]}>
                  {moran.map((d,i)=>(
                    <Cell key={i} fill={d.p_valor < 0.05 ? '#6366f1' : '#d1d5db'}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="chart-note">Azul = significativo (p &lt; 0.05, 999 permutaciones). Gris = no significativo.</p>

            <div style={{marginTop:24}}>
              <h4 style={{fontSize:14,fontWeight:600,marginBottom:4}}>Matriz W — Vecinos por localidad (Queen)</h4>
              <p className="card-sub">Define quién influye en quién. Dos localidades son vecinas si comparten cualquier punto de borde.</p>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={vecindadConteo} margin={{left:0,right:8,top:4,bottom:44}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}/>
                  <XAxis dataKey="localidad" tick={{fontSize:7,fill:'#9ca3af'}} angle={-40} textAnchor="end" interval={0} height={50}/>
                  <YAxis tick={{fontSize:10}} tickLine={false} allowDecimals={false}/>
                  <Tooltip contentStyle={{borderRadius:8,border:'none',fontSize:12}} formatter={v=>[v,'Vecinos']}/>
                  <Bar dataKey="n_vecinos" fill="#a5b4fc" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">LISA — ¿Dónde están los clusters locales?</h3>
              <p className="card-sub">
                Mientras el I de Moran dice "hay clustering", el análisis LISA dice <em>dónde exactamente</em>.
                Con 19 localidades, solo 3 muestran un patrón espacial estadísticamente significativo (p &lt; 0.05).
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
                {lisaSignificativas.map(d=>(
                  <div key={d.nombre} style={{display:'flex',gap:12,alignItems:'flex-start',padding:'10px 12px',background:'#fafaf8',borderRadius:8,border:'1px solid #e8e6e1'}}>
                    <span style={{background:d.color,color:'#1a1a1a',fontWeight:700,fontSize:12,padding:'3px 9px',borderRadius:6,flexShrink:0,marginTop:2,border:'1px solid rgba(0,0,0,.08)'}}>
                      {d.tipo}
                    </span>
                    <div>
                      <strong style={{fontSize:13}}>{d.nombre}</strong>
                      <p style={{fontSize:12,color:'#6b7280',marginTop:2,lineHeight:1.45}}>{d.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{background:'#f3f2ef',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#6b7280',lineHeight:1.55}}>
                Las <strong style={{color:'#374151'}}>16 localidades restantes</strong> no muestran clustering
                espacial significativo (NS, p ≥ 0.05). Esto no implica ausencia de riesgo — el I de Moran{' '}
                <strong style={{color:'#374151'}}>global es 0.43 (p = 0.001)</strong>, confirmando agrupamiento
                a nivel de ciudad. Con N = 19, el test local no tiene poder suficiente para detectarlo zona por zona.
              </div>
            </div>

            <div className="explain-cards">
              {[
                {tag:'HH', label:'Alto-Alto',       desc:'Alta criminalidad rodeada de vecinas también altas. Hotspot consolidado.',           color:'#fca5a5'},
                {tag:'LL', label:'Bajo-Bajo',        desc:'Baja criminalidad con vecinas similares. Efecto protector del entorno geográfico.', color:'#93c5fd'},
                {tag:'NS', label:'No significativo', desc:'Sin evidencia local de clustering (p ≥ 0.05). No implica ausencia de riesgo.',      color:'#e2e8f0'},
              ].map(e=>(
                <div className="explain-item" key={e.tag}>
                  <span className="explain-tag" style={{background:e.tag==='NS'?'#94a3b8':'#374151'}}>{e.tag}</span>
                  <div><strong>{e.label}</strong><p>{e.desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 04 · CLUSTERING ML */}
      <section id="ml" className="section section-alt">
        <SectionHeader
          eyebrow="04 · Clustering de Machine Learning"
          title="¿Qué tipología de zonas emerge de los datos?"
          desc="K-Means, DBSCAN y clustering jerárquico agrupan localidades por su perfil completo de 12 delitos, sin considerar la geografía. El resultado son 3 grupos con perfiles claramente distintos."
        />
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">Perfil de los 3 clusters (K-Means, K=3)</h3>
            <p className="card-sub">K=3 fue elegido por interpretabilidad. Tasas por 10.000 hab.</p>
            <div className="cluster-cards">
              {perfilConColor.map((c,i)=>(
                <div className="cluster-card" key={c.cluster||i} style={{borderLeftColor:c.color}}>
                  <div className="cluster-header">
                    <span className="cluster-badge" style={{background:c.color}}>{c.label}</span>
                  </div>
                  <div className="cluster-metrics">
                    <div><label>Tasa total</label><span>{Number(c.tasa_total||0).toFixed(0)}</span></div>
                    <div><label>Hurto personas</label><span>{Number(c.tasa_hurto_a_personas||0).toFixed(0)}</span></div>
                    <div><label>Homicidios</label><span>{Number(c.tasa_homicidios||0).toFixed(1)}</span></div>
                    <div><label>Viol. intrafamiliar</label><span>{Number(c.tasa_violencia_intrafamiliar||0).toFixed(0)}</span></div>
                    <div><label>Hurto a comercio</label><span>{Number(c.tasa_hurto_a_comercio||0).toFixed(0)}</span></div>
                    <div><label>Extorsión</label><span>{Number(c.tasa_extorsion||0).toFixed(1)}</span></div>
                  </div>
                  <p style={{fontSize:11,color:'#6b7280',marginTop:8}}>
                    {i===0&&'Tunjuelito, R. Uribe, Usaquén, San Cristóbal, Usme, C. Bolívar, Bosa, Kennedy, Fontibón, Engativá, Suba'}
                    {i===1&&'Candelaria, Los Mártires, Santa Fe'}
                    {i===2&&'Antonio Nariño, Barrios Unidos, Teusaquillo, Puente Aranda, Chapinero'}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">Método del codo — Justificación de K</h3>
              <p className="card-sub">K=2 tiene el silhouette más alto (0.584) pero es demasiado grueso. K=3 permite distinguir el corredor central.</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={codo} margin={{left:8,right:16,top:8,bottom:8}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                  <XAxis dataKey="k" tick={{fontSize:11}}/>
                  <YAxis yAxisId="l" tick={{fontSize:10}}/>
                  <YAxis yAxisId="r" orientation="right" tick={{fontSize:10}} domain={[0,0.7]}/>
                  <Tooltip contentStyle={{borderRadius:8,border:'none',fontSize:12}}/>
                  <Line yAxisId="l" dataKey="inercia"    stroke="#f97316" strokeWidth={2} dot={{r:4}} name="Inercia"/>
                  <Line yAxisId="r" dataKey="silhouette" stroke="#6366f1" strokeWidth={2} dot={{r:4}} name="Silhouette"/>
                  <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3 className="card-title">Asignación de localidades</h3>
              <p className="card-sub">K-Means asignó cada localidad a uno de los 3 grupos.</p>
              <div className="loc-cluster-list">
                {enriched.map(d=>{
                  const idx = Number(d.cluster_kmeans ?? 0);
                  return (
                    <div className="loc-cluster-row" key={d.LOCALIDAD}>
                      <span className="loc-dot" style={{background:CLUSTER_COLOR[idx]||'#ccc'}}/>
                      <span className="loc-name">{String(d.LOCALIDAD||'').charAt(0)+String(d.LOCALIDAD||'').slice(1).toLowerCase()}</span>
                      <span className="loc-label" style={{color:CLUSTER_COLOR[idx]||'#6b7280'}}>{CLUSTER_LABEL[idx]||'—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 05 · MODELO RF */}
      <section id="model" className="section">
        <SectionHeader
          eyebrow="05 · Clasificación con Random Forest"
          title="¿Qué variables predicen el nivel de riesgo?"
          desc="Entrenamos un Random Forest (500 árboles) sobre los perfiles de delito para predecir el nivel de riesgo de cada localidad."
        />
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">Importancia de variables</h3>
            <p className="card-sub">El hurto a personas y las lesiones personales lideran la clasificación de riesgo territorial.</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={rfImpDisplay} layout="vertical" margin={{left:168,right:24,top:4,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10}} tickFormatter={v=>`${(v*100).toFixed(0)}%`}/>
                <YAxis type="category" dataKey="variable_legible" tick={{fontSize:9,fill:'#374151'}} width={164}/>
                <Tooltip formatter={v=>[`${(Number(v)*100).toFixed(1)}%`,'Importancia']} contentStyle={{borderRadius:8,border:'none',fontSize:12}}/>
                <Bar dataKey="importancia" fill="#6366f1" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
            <p className="chart-note">Importancia por impureza Gini (500 árboles, semilla 42).</p>
          </div>
          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">Nivel de riesgo por localidad</h3>
              <p className="card-sub">Clasificación del modelo (Bajo / Medio / Alto) con su tasa total real.</p>
              <div className="pred-list">
                {[...preds].sort((a,b)=>b.tasa_total-a.tasa_total).map(d=>(
                  <div className="pred-row" key={d.localidad}>
                    <span className="pred-name">{String(d.localidad||'').charAt(0)+String(d.localidad||'').slice(1).toLowerCase()}</span>
                    <div className="pred-bar-wrap">
                      <div className="pred-bar" style={{width:`${Math.min((Number(d.tasa_total)/6500)*100,100)}%`,background:riesgoColor(d.riesgo_predicho)}}/>
                    </div>
                    <span className="pred-badge" style={{background:riesgoColor(d.riesgo_predicho)}}>{d.riesgo_predicho}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="insight-box">
              <span className="insight-icon">⚠️</span>
              <p><strong>Nota metodológica:</strong> Las etiquetas Bajo/Medio/Alto provienen del clustering K-Means. El RF aprende a reproducir esa tipología. Es válido para perfilar zonas, pero <em>no predice riesgo futuro</em>.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 06 · VALIDACIÓN */}
      <section id="validation" className="section section-alt">
        <SectionHeader
          eyebrow="06 · Validación"
          title="¿El modelo funciona bien cuando los vecinos no están disponibles?"
          desc="Comparamos Leave-One-Out (clásica) y Spatial Block CV (espacial). La segunda excluye también las vecinas de la localidad de prueba, evitando que el modelo 'haga trampa' con la autocorrelación."
        />
        <div className="two-col">
          <div className="validation-cards">
            {validacion.map((v,i)=>(
              <div className="val-card" key={i}>
                <span className="val-type">{v.tipo_validacion}</span>
                <p className="val-desc">{v.descripcion}</p>
                <div className="val-metrics">
                  <div className="val-metric">
                    <div className="val-circle" style={{background:`conic-gradient(#6366f1 ${Number(v.accuracy)*360}deg, #e5e7eb 0deg)`}}>
                      <span>{(Number(v.accuracy)*100).toFixed(1)}%</span>
                    </div>
                    <label>Accuracy</label>
                  </div>
                  <div className="val-metric">
                    <div className="val-circle" style={{background:`conic-gradient(#8b5cf6 ${Number(v.f1_weighted)*360}deg, #e5e7eb 0deg)`}}>
                      <span>{(Number(v.f1_weighted)*100).toFixed(1)}%</span>
                    </div>
                    <label>F1-score</label>
                  </div>
                </div>
                <p className="val-interp">{v.interpretacion}</p>
              </div>
            ))}
          </div>
          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">Comparación visual de métricas</h3>
              <p className="card-sub">La diferencia revela cuánto depende el modelo de la autocorrelación espacial.</p>
              <div className="diff-viz">
                {validacion.map((v,i)=>(
                  <div className="diff-bar-container" key={i}>
                    <div className="diff-label">{v.tipo_validacion}</div>
                    <div className="diff-bar-track">
                      <div className="diff-bar-fill" style={{width:`${Number(v.accuracy)*100}%`,background:i===0?'#6366f1':'#8b5cf6'}}/>
                      <span className="diff-bar-val">{(Number(v.accuracy)*100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {validacion.length===2&&(
                  <div className="diff-conclusion">
                    <span className="diff-delta">Δ = {Math.abs((Number(validacion[0].accuracy)-Number(validacion[1].accuracy))*100).toFixed(1)} pp</span>
                    <p>Una diferencia pequeña indica que el modelo generaliza bien incluso sin la información de los vecinos geográficos.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="explain-cards">
              <div className="explain-item">
                <span className="explain-tag" style={{background:'#6366f1'}}>LOO</span>
                <div><strong>Leave-One-Out</strong><p>Cada localidad se prueba con las 18 restantes. Puede ser optimista si las vecinas están en el set de entrenamiento.</p></div>
              </div>
              <div className="explain-item">
                <span className="explain-tag" style={{background:'#8b5cf6'}}>SCV</span>
                <div><strong>Spatial Block CV</strong><p>Al evaluar la localidad i, también se excluyen sus vecinas directas. La métrica más honesta para datos autocorrelacionados.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 07 · CONCLUSIONES */}
      <section id="interpretation" className="section">
        <SectionHeader
          eyebrow="07 · Conclusiones"
          title="¿Qué nos dice el análisis sobre la criminalidad en Bogotá?"
          desc="Los modelos no hablan solos. Traducimos los resultados técnicos en conclusiones sobre la dinámica urbana del delito en la capital colombiana."
        />
        <div className="interpretation-grid">
          <InterpCard icon="🗺️" title="Epicentro claro en el centro histórico" body="Los Mártires (5.872), La Candelaria (5.166) y Santa Fe (4.117) son zonas críticas. Santa Fe es el único HH en LISA y las tres pertenecen al cluster de riesgo alto. Alto flujo peatonal, comercio informal y nocturnidad generan las condiciones para el hurto."/>
          <InterpCard icon="🏘️" title="La periferia sur tiene un riesgo diferente" body="Ciudad Bolívar, Usme y Bosa tienen las tasas totales más bajas y son identificadas como LL en LISA. Pero su violencia intrafamiliar y homicidios son proporcionalmente más altos. El riesgo doméstico requiere respuestas de política social, no solo policial."/>
          <InterpCard icon="📍" title="Los delitos no son aleatorios" body="Todos los delitos presentan I de Moran positivo y significativo (999 permutaciones). El hurto a personas (I=0.469) tiene el clustering más fuerte. Las intervenciones focalizadas geográficamente tienen sustento estadístico robusto."/>
          <InterpCard icon="⚖️" title="LISA y K-Means son complementarios" body="LISA detecta si una localidad y sus vecinas comparten tasas similares. K-Means agrupa por perfil delictivo sin importar la geografía. Con N=19 el LISA tiene poder limitado, pero K-Means revela con claridad los tres perfiles de riesgo de la ciudad."/>
          <InterpCard icon="📊" title="El hurto domina la clasificación" body="El Random Forest asigna la mayor importancia al hurto a personas y lesiones personales. Una política centrada solo en homicidios subestimaría gravemente el riesgo en el corredor central, donde el hurto callejero es el fenómeno dominante."/>
          <InterpCard icon="🔬" title="Limitaciones que importan" body="Con 19 localidades los modelos son ilustrativos. El subregistro afecta delitos íntimos. La importancia de permutación resultó 0 (modelo perfecto con N pequeño), por lo que se usó Gini. Un análisis a nivel UPZ daría mayor resolución estadística."/>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <p>Análisis Espacial de Criminalidad Urbana · Bogotá D.C. · 2021–2024</p>
        <p className="footer-sub">Datos: SIEDCO (Policía Nacional) · Cartografía: Datos Abiertos Bogotá · Análisis: Python · pysal · scikit-learn</p>
        <p className="footer-sub">Proyecto académico · Series Temporales y Datos Geoespaciales</p>
      </footer>
    </div>
  );
}

function SectionHeader({ eyebrow, title, desc }) {
  return (
    <div className="section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="section-desc">{desc}</p>
    </div>
  );
}

function InterpCard({ icon, title, body }) {
  return (
    <div className="interp-card">
      <span className="interp-icon">{icon}</span>
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  );
}