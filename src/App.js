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

function getRiesgoColorByTasa(t) {
  if (t >= 3000) return RIESGO_COLOR['Alto'];
  if (t >= 1500) return RIESGO_COLOR['Medio'];
  return RIESGO_COLOR['Bajo'];
}

function sinTildes(s) {
  return (s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

// ── useCSV ────────────────────────────────────────────────────────────────────
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

// ── Nav ───────────────────────────────────────────────────────────────────────
const NAV = [
  { id:'intro',          label:'Contexto'        },
  { id:'exploratory',    label:'Exploración'     },
  { id:'temporal',       label:'Serie temporal'  },
  { id:'spatial',        label:'Autocorrelación' },
  { id:'ml',             label:'Clustering ML'   },
  { id:'model',          label:'Modelo espacial' },
  { id:'validation',     label:'Validación'      },
  { id:'interpretation', label:'Conclusiones'    },
];

// ── Mapa de calor ─────────────────────────────────────────────────────────────
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

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeSection, setActiveSection] = useState('intro');
  const [menuOpen, setMenuOpen]           = useState(false);
  const sectionRefs = useRef({});

  const [tasas,      tasasOk]     = useCSV('tasas_localidades.csv');
  const [moran,      moranOk]     = useCSV('moran_global.csv');
  const [lisa,       lisaOk]      = useCSV('lisa_resultados.csv');
  const [clusters,   clustersOk]  = useCSV('clustering_ml.csv');
  const [perfil,     perfilOk]    = useCSV('perfil_clusters.csv');
  const [validacion, validOk]     = useCSV('validacion_resultados.csv');
  const [codo,       codoOk]      = useCSV('metodo_codo.csv');
  const [serie,      serieOk]     = useCSV('serie_temporal.csv');
  const [vecindad,   vecindadOk]  = useCSV('vecindad_espacial.csv');
  const [comparativa,comparOk]    = useCSV('comparativa_lisa_ml.csv');
  const [slagCoefs,  slagCoefsOk] = useCSV('slag_coeficientes.csv');
  const [slagPred,   slagPredOk]  = useCSV('slag_predicciones.csv');
  const [slagMet,    slagMetOk]   = useCSV('slag_metricas.csv');

  const allReady = tasasOk && moranOk && lisaOk && clustersOk && perfilOk &&
                   validOk && codoOk && serieOk && vecindadOk && comparOk &&
                   slagCoefsOk && slagPredOk && slagMetOk;

  // ── Datos derivados ────────────────────────────────────────────────────────
  const sortedTasas = [...tasas].sort((a,b) => b.tasa_total - a.tasa_total);

  const enriched = tasas.map(d => {
    const key = d.LOCALIDAD || '';
    const l   = lisa.find(x => x.LOCALIDAD_KEY === key) || {};
    const cl  = clusters.find(x => x.LOCALIDAD_KEY === key) || {};
    return { ...d, ...l, ...cl };
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

  const perfilConColor = [...perfil]
    .sort((a,b) => a.tasa_total - b.tasa_total)
    .map((c,i)=>({ ...c, color:CLUSTER_COLOR[i]??'#94a3b8', label:CLUSTER_LABEL[i]??c.cluster }));

  // Spatial Lag Model — separar constante y rho
  const slagVars    = slagCoefs.filter(d => !['CONSTANTE','W_tasa_total (Rho)'].includes(d.variable));
  const slagRho     = slagCoefs.find(d => d.variable === 'W_tasa_total (Rho)') || {};
  const slagMetrica = slagMet[0] || {};

  // Textos limpios para la validacion (quitar texto técnico del CSV)
  const validacionLabels = [
    {
      tipo: 'Tradicional (Leave-One-Out)',
      desc: 'Una localidad como prueba, las demas como entrenamiento. Sin restriccion espacial.',
      interp: 'Evalua el desempeno promedio al excluir cada localidad. Puede ser optimista si existe autocorrelacion espacial.'
    },
    {
      tipo: 'Espacial (Spatial Block CV)',
      desc: 'Al excluir la localidad de prueba, tambien se excluyen sus vecinas directas.',
      interp: 'Evalua el desempeno real en zonas sin datos vecinos. Es la metrica mas honesta para datos espacialmente autocorrelacionados.'
    }
  ];

  const lisaSignificativas = [
    { nombre:'Santa Fe',       tipo:'HH', color:'#fca5a5', desc:'Alta criminalidad rodeada de vecinas tambien altas. Epicentro espacial del riesgo en Bogota.' },
    { nombre:'Usme',           tipo:'LL', color:'#93c5fd', desc:'Baja criminalidad con vecinas similares. La periferia sur forma un entorno de menor riesgo relativo.' },
    { nombre:'Ciudad Bolivar', tipo:'LL', color:'#93c5fd', desc:'Baja criminalidad con vecinas similares. Coincide con el cluster de riesgo bajo del K-Means.' },
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
      <p>Cargando datos...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div className="app">

      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand"><span className="nav-dot"/>Criminalidad · Bogota</div>
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

      {/* 00 - INTRO */}
      <section id="intro" className="section section-hero">
        <div className="hero-content">
          <p className="hero-eyebrow">Analisis Espacial - Bogota D.C. - 2021-2024</p>
          <h1 className="hero-title">¿Donde se<br/>concentra el<br/>delito en Bogota?</h1>
          <p className="hero-sub">
            Bogota registra mas de <strong>176 mil eventos delictivos</strong> entre 2021 y 2024,
            distribuidos de forma muy desigual entre sus 19 localidades urbanas.
            Este analisis combina <strong>datos abiertos SIEDCO</strong>, estadistica espacial
            y aprendizaje automatico para construir una tipologia de riesgo comprensible para cualquier ciudadano.
          </p>
          <div className="hero-stats">
            <div className="stat"><span>19</span><p>Localidades</p></div>
            <div className="stat"><span>176K</span><p>Eventos 2021-24</p></div>
            <div className="stat"><span>12</span><p>Tipos de delito</p></div>
            <div className="stat"><span>4</span><p>Anos analizados</p></div>
          </div>
          <button className="btn-scroll" onClick={()=>scrollTo('exploratory')}>Explorar analisis</button>
        </div>
        <div className="hero-note">
          <strong>Nota sobre los datos:</strong> SIEDCO registra solo delitos <em>denunciados</em>.
          Los delitos sexuales y la violencia intrafamiliar presentan alta no-denuncia, por lo que
          sus tasas subestiman la realidad.
        </div>
      </section>

      {/* 01 - EXPLORACION */}
      <section id="exploratory" className="section">
        <SectionHeader
          eyebrow="01 - Exploracion"
          title="¿Cuantos delitos hay por localidad?"
          desc="Comparar conteos absolutos es enganoso: Suba tiene 1.3 millones de habitantes y La Candelaria apenas 18 mil. Usamos tasas por 10.000 habitantes para una comparacion justa entre localidades."
        />
        <div className="card" style={{marginBottom:22}}>
          <h3 className="card-title">Mapa de calor - Tasa de delitos por localidad</h3>
          <p className="card-sub">
            Pasa el cursor sobre cada localidad para ver su tasa exacta.
            <span style={{marginLeft:12}}>
              <span style={{display:'inline-block',width:10,height:10,background:'#fca5a5',borderRadius:2,marginRight:4}}/>Alto (3.000 o mas)
              <span style={{display:'inline-block',width:10,height:10,background:'#fde68a',borderRadius:2,margin:'0 4px 0 10px'}}/>Medio (1.500 a 3.000)
              <span style={{display:'inline-block',width:10,height:10,background:'#bbf7d0',borderRadius:2,margin:'0 4px 0 10px'}}/>Bajo (menos de 1.500)
            </span>
          </p>
          <MapaHotspots tasas={tasas}/>
        </div>
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">Tasa total de delitos por 10.000 hab.</h3>
            <p className="card-sub">Los Martires y La Candelaria lideran con tasas que triplican la media.</p>
            <ResponsiveContainer width="100%" height={460}>
              <BarChart data={sortedTasas} layout="vertical" margin={{left:120,right:20,top:4,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10,fill:'#6b7280'}} tickLine={false}/>
                <YAxis type="category" dataKey="LOCALIDAD" tick={{fontSize:10,fill:'#374151'}} tickLine={false} width={118}
                  tickFormatter={v=>v.charAt(0)+v.slice(1).toLowerCase()}/>
                <Tooltip formatter={v=>[`${Number(v).toFixed(1)} por 10.000 hab.`,'Tasa']}
                  contentStyle={{borderRadius:8,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,.08)',fontSize:12}}/>
                <Bar dataKey="tasa_total" radius={[0,4,4,0]}>
                  {sortedTasas.map((d,i)=><Cell key={i} fill={getRiesgoColorByTasa(d.tasa_total)}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="right-panel">
            <div className="hotspots-list">
              <h3 className="card-title">Las 5 zonas mas criticas</h3>
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
              <p style={{fontSize:12,color:'#6b7280',marginBottom:10}}>Umbrales basados en los grupos del analisis de clustering.</p>
              {[
                {label:'Alto (3.000 o mas)',     color:RIESGO_COLOR.Alto},
                {label:'Medio (1.500 a 3.000)',  color:RIESGO_COLOR.Medio},
                {label:'Bajo (menos de 1.500)',  color:RIESGO_COLOR.Bajo},
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
                  <Bar dataKey="media" fill="#e0e7ff" name="Media Bogota" radius={[3,3,0,0]}/>
                  <Legend iconSize={10} wrapperStyle={{fontSize:11,color:'#1a1a1a'}}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="insight-box">
              <p>Los Martires (5.872) y La Candelaria (5.166) tienen tasas que <strong>superan 3 veces la media de Bogota</strong>. Alto flujo peatonal, comercio informal y nocturnidad generan las condiciones.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 02 - SERIE TEMPORAL */}
      <section id="temporal" className="section section-alt">
        <SectionHeader
          eyebrow="02 - Serie temporal"
          title="¿Como han evolucionado los delitos mes a mes?"
          desc="La serie temporal permite identificar tendencias, estacionalidad y cambios abruptos. Ver si el problema mejora, empeora o se mantiene estable es clave para evaluar politicas de seguridad."
        />
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">Total de delitos en Bogota por mes</h3>
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
            <p className="chart-note">Fuente: SIEDCO - Periodo 2021-2024</p>
          </div>
          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">Evolucion mensual: top 5 localidades</h3>
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
                <span className="explain-tag" style={{background:'#6366f1'}}>Tendencia</span>
                <div><strong>¿Que buscar?</strong><p>Picos en diciembre-enero, tendencias sostenidas y cambios despues de intervenciones de politica publica.</p></div>
              </div>
              <div className="explain-item">
                <span className="explain-tag" style={{background:'#10b981'}}>Estacionalidad</span>
                <div><strong>Patron anual</strong><p>Meses de alto flujo de personas tienden a concentrar mas hurtos. La serie revela si estos patrones son consistentes ano a ano.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 03 - AUTOCORRELACION */}
      <section id="spatial" className="section">
        <SectionHeader
          eyebrow="03 - Autocorrelacion espacial"
          title="¿Los delitos se agrupan geograficamente?"
          desc="El I de Moran mide si localidades con tasas altas tienden a estar rodeadas de otras con tasas altas. Un valor positivo y significativo confirma que el delito no es aleatorio: hay clusters espaciales reales."
        />
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">I de Moran global por tipo de delito</h3>
            <p className="card-sub">Todos los delitos muestran I mayor a 0 y p menor a 0.05: hay clustering espacial significativo.</p>
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
            <p className="chart-note">Azul = significativo (p menor a 0.05, 999 permutaciones). Gris = no significativo.</p>
            <div style={{marginTop:24}}>
              <h4 style={{fontSize:14,fontWeight:600,marginBottom:4}}>Matriz W - Vecinos por localidad (Queen)</h4>
              <p className="card-sub">Define quien influye en quien. Dos localidades son vecinas si comparten cualquier punto de borde.</p>
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
              <h3 className="card-title">LISA - ¿Donde estan los clusters locales?</h3>
              <p className="card-sub">
                Mientras el I de Moran dice "hay clustering", el analisis LISA dice exactamente donde.
                Con 19 localidades, solo 3 muestran un patron espacial estadisticamente significativo.
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
                espacial significativo (NS, p mayor o igual a 0.05). El I de Moran{' '}
                <strong style={{color:'#374151'}}>global es 0.43 (p = 0.001)</strong>, confirmando agrupamiento
                a nivel de ciudad. Con N = 19, el test local no tiene poder suficiente para detectarlo zona por zona.
              </div>
            </div>
            <div className="explain-cards">
              {[
                {tag:'HH', label:'Alto-Alto',       desc:'Alta criminalidad rodeada de vecinas tambien altas. Hotspot consolidado.',            color:'#fca5a5'},
                {tag:'LL', label:'Bajo-Bajo',        desc:'Baja criminalidad con vecinas similares. Efecto protector del entorno geografico.',  color:'#93c5fd'},
                {tag:'NS', label:'No significativo', desc:'Sin evidencia local de clustering. No implica ausencia de riesgo.',                  color:'#e2e8f0'},
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

      {/* 04 - CLUSTERING ML */}
      <section id="ml" className="section section-alt">
        <SectionHeader
          eyebrow="04 - Clustering de Machine Learning"
          title="¿Que tipologia de zonas emerge de los datos?"
          desc="K-Means, DBSCAN y clustering jerarquico agrupan localidades por su perfil completo de 12 delitos, sin considerar la geografia. El resultado son 3 grupos con perfiles claramente distintos."
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
                    <div><label>Extorsion</label><span>{Number(c.tasa_extorsion||0).toFixed(1)}</span></div>
                  </div>
                  <p style={{fontSize:11,color:'#6b7280',marginTop:8}}>
                    {i===0&&'Tunjuelito, R. Uribe, Usaquen, San Cristobal, Usme, C. Bolivar, Bosa, Kennedy, Fontibon, Engativa, Suba'}
                    {i===1&&'Candelaria, Los Martires, Santa Fe'}
                    {i===2&&'Antonio Narino, Barrios Unidos, Teusaquillo, Puente Aranda, Chapinero'}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">Metodo del codo - Justificacion de K</h3>
              <p className="card-sub">K=2 tiene el silhouette mas alto (0.584) pero es demasiado grueso. K=3 permite distinguir el corredor central.</p>
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
              <h3 className="card-title">Asignacion de localidades</h3>
              <p className="card-sub">K-Means asigno cada localidad a uno de los 3 grupos.</p>
              <div className="loc-cluster-list">
                {enriched.map(d=>{
                  const idx = Number(d.cluster_kmeans ?? 0);
                  return (
                    <div className="loc-cluster-row" key={d.LOCALIDAD}>
                      <span className="loc-dot" style={{background:CLUSTER_COLOR[idx]||'#ccc'}}/>
                      <span className="loc-name">{String(d.LOCALIDAD||'').charAt(0)+String(d.LOCALIDAD||'').slice(1).toLowerCase()}</span>
                      <span className="loc-label" style={{color:CLUSTER_COLOR[idx]||'#6b7280'}}>{CLUSTER_LABEL[idx]||'-'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 05 - MODELO ESPACIAL */}
      <section id="model" className="section">
        <SectionHeader
          eyebrow="05 - Modelo de regresion espacial"
          title="¿Que explica la tasa de criminalidad en cada localidad?"
          desc="El Spatial Lag Model extiende la regresion clasica incorporando la influencia de los vecinos geograficos. Produce coeficientes directamente interpretables que cuantifican el efecto de cada tipo de delito sobre la tasa total de criminalidad."
        />
        <div className="two-col">
          <div className="card">
            <h3 className="card-title">Coeficientes del modelo</h3>
            <p className="card-sub">
              Cada coeficiente indica cuanto aumenta la tasa total por cada unidad adicional en ese tipo de delito,
              controlando por los demas. Variables con p menor a 0.05 son estadisticamente significativas.
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={slagVars} layout="vertical" margin={{left:148,right:32,top:4,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10,fill:'#6b7280'}} tickFormatter={v=>v.toFixed(1)} domain={['auto','auto']}/>
                <YAxis type="category" dataKey="variable_legible" tick={{fontSize:10,fill:'#374151'}} width={144}/>
                <Tooltip
                  formatter={(v,n,props)=>[
                    `${Number(v).toFixed(4)} (p = ${Number(props.payload.p_valor).toFixed(4)})`,
                    'Coeficiente'
                  ]}
                  contentStyle={{borderRadius:8,border:'none',fontSize:12}}
                />
                <Bar dataKey="coeficiente" radius={[0,4,4,0]}>
                  {slagVars.map((d,i)=>(
                    <Cell key={i} fill={Number(d.p_valor) < 0.05 ? '#6366f1' : '#d1d5db'}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="chart-note">Azul = significativo (p menor a 0.05). Gris = no significativo. Modelo ML Spatial Lag, N=13 localidades.</p>

            {/* Tabla de coeficientes */}
            <div style={{marginTop:20}}>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,fontSize:11,fontWeight:600,color:'#6b7280',borderBottom:'1px solid #e8e6e1',paddingBottom:6,marginBottom:6}}>
                <span>Variable</span>
                <span style={{textAlign:'right'}}>Coef.</span>
                <span style={{textAlign:'right'}}>p-valor</span>
                <span style={{textAlign:'right'}}>Sig.</span>
              </div>
              {slagVars.map((d,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,fontSize:11,padding:'5px 0',borderBottom:'1px solid #f3f4f6',alignItems:'center'}}>
                  <span style={{color:'#374151'}}>{d.variable_legible}</span>
                  <span style={{textAlign:'right',fontWeight:500}}>{Number(d.coeficiente).toFixed(3)}</span>
                  <span style={{textAlign:'right',color:Number(d.p_valor)<0.05?'#6366f1':'#9ca3af'}}>{Number(d.p_valor).toFixed(4)}</span>
                  <span style={{textAlign:'right'}}>
                    <span style={{
                      background: Number(d.p_valor)<0.05 ? '#eef2ff' : '#f3f4f6',
                      color:      Number(d.p_valor)<0.05 ? '#4f46e5' : '#9ca3af',
                      padding:'1px 6px', borderRadius:4, fontSize:10, fontWeight:600
                    }}>
                      {Number(d.p_valor)<0.05 ? 'Si' : 'No'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="right-panel">
            {/* Metricas del modelo */}
            <div className="card">
              <h3 className="card-title">Desempeno del modelo</h3>
              <p className="card-sub">El R indica que proporcion de la variacion en criminalidad explica el modelo.</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                {[
                  { label:'R pseudo',        value:`${(Number(slagMetrica.r2||0)*100).toFixed(1)}%`, desc:'Variacion explicada por el modelo' },
                  { label:'N observaciones', value: slagMetrica.n || 13,                              desc:'Localidades incluidas en el modelo' },
                  { label:'AIC',             value: Number(slagMetrica.aic||0).toFixed(1),            desc:'Criterio de informacion - menor es mejor' },
                  { label:'Log-likelihood',  value: Number(slagMetrica.log_likelihood||0).toFixed(1), desc:'Ajuste del modelo - mayor es mejor' },
                ].map(m=>(
                  <div key={m.label} style={{background:'#fafaf8',borderRadius:8,padding:'12px',border:'1px solid #e8e6e1'}}>
                    <p style={{fontSize:10,color:'#6b7280',marginBottom:4}}>{m.label}</p>
                    <p style={{fontSize:20,fontWeight:700,color:'#1a1a1a',fontFamily:'DM Serif Display, serif'}}>{m.value}</p>
                    <p style={{fontSize:10,color:'#9ca3af',marginTop:2}}>{m.desc}</p>
                  </div>
                ))}
              </div>
              <div style={{background:'#f3f2ef',borderRadius:8,padding:'14px'}}>
                <p style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>
                  Rho (efecto espacial de los vecinos) = {Number(slagRho.coeficiente||0).toFixed(4)}
                </p>
                <p style={{fontSize:12,color:'#6b7280',lineHeight:1.5}}>
                  {Number(slagRho.p_valor||1) < 0.05
                    ? 'El efecto de los vecinos es estadisticamente significativo. Las tasas de criminalidad de una localidad estan influenciadas por las de sus localidades vecinas.'
                    : `El Rho no es significativo (p = ${Number(slagRho.p_valor||1).toFixed(4)}). Controlando por el perfil de delitos propios, el efecto de los vecinos desaparece. El riesgo de cada localidad se explica por su dinamica interna, no por contagio geografico.`
                  }
                </p>
              </div>
            </div>

            {/* Predicciones vs reales */}
            <div className="card">
              <h3 className="card-title">Predicciones vs. valores reales</h3>
              <p className="card-sub">Cada fila compara la tasa real con lo que predice el modelo. Residuos pequenos indican buen ajuste.</p>
              <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:280,overflowY:'auto'}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,fontSize:10,fontWeight:600,color:'#6b7280',borderBottom:'1px solid #e8e6e1',paddingBottom:5,marginBottom:4}}>
                  <span>Localidad</span>
                  <span style={{textAlign:'right'}}>Real</span>
                  <span style={{textAlign:'right'}}>Predicho</span>
                  <span style={{textAlign:'right'}}>Residuo</span>
                </div>
                {[...slagPred].sort((a,b)=>b.tasa_real-a.tasa_real).map((d,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:4,fontSize:11,padding:'4px 0',borderBottom:'1px solid #f3f4f6',alignItems:'center'}}>
                    <span style={{color:'#374151',fontSize:10}}>{String(d.localidad||'').charAt(0)+String(d.localidad||'').slice(1).toLowerCase()}</span>
                    <span style={{textAlign:'right',fontWeight:500}}>{Number(d.tasa_real).toFixed(0)}</span>
                    <span style={{textAlign:'right',color:'#6366f1'}}>{Number(d.tasa_predicha).toFixed(0)}</span>
                    <span style={{textAlign:'right',color:Math.abs(Number(d.residuo))>50?'#ef4444':'#10b981',fontSize:10}}>
                      {Number(d.residuo)>0?'+':''}{Number(d.residuo).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="chart-note">Verde = residuo pequeno (buen ajuste). Rojo = residuo mayor a 50.</p>
            </div>

            <div className="insight-box">
              <p>
                <strong>¿Por que regresion espacial?</strong> El Spatial Lag Model produce
                coeficientes interpretables directamente: cada numero tiene un significado concreto
                en el contexto de la criminalidad. El R de {(Number(slagMetrica.r2||0)*100).toFixed(1)}%
                indica que el modelo explica practicamente toda la variacion observada con solo 6 variables de delito.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 06 - VALIDACION */}
      <section id="validation" className="section section-alt">
        <SectionHeader
          eyebrow="06 - Validacion"
          title="¿El modelo funciona bien cuando los vecinos no estan disponibles?"
          desc="Comparamos Leave-One-Out (clasica) y Spatial Block CV (espacial). La segunda excluye tambien las vecinas de la localidad de prueba, evitando que el modelo aproveche la autocorrelacion espacial."
        />
        <div className="two-col">
          <div className="validation-cards">
            {validacion.map((v,i)=>(
              <div className="val-card" key={i}>
                <span className="val-type">{validacionLabels[i]?.tipo || v.tipo_validacion}</span>
                <p className="val-desc">{validacionLabels[i]?.desc || v.descripcion}</p>
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
                <p className="val-interp">{validacionLabels[i]?.interp || v.interpretacion}</p>
              </div>
            ))}
          </div>
          <div className="right-panel">
            <div className="card">
              <h3 className="card-title">Comparacion visual de metricas</h3>
              <p className="card-sub">La diferencia revela cuanto depende el modelo de la autocorrelacion espacial.</p>
              <div className="diff-viz">
                {validacion.map((v,i)=>(
                  <div className="diff-bar-container" key={i}>
                    <div className="diff-label">{validacionLabels[i]?.tipo || v.tipo_validacion}</div>
                    <div className="diff-bar-track">
                      <div className="diff-bar-fill" style={{width:`${Number(v.accuracy)*100}%`,background:i===0?'#6366f1':'#8b5cf6'}}/>
                      <span className="diff-bar-val">{(Number(v.accuracy)*100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {validacion.length===2&&(
                  <div className="diff-conclusion">
                    <span className="diff-delta">
                      Diferencia = {Math.abs((Number(validacion[0].accuracy)-Number(validacion[1].accuracy))*100).toFixed(1)} pp
                    </span>
                    <p>Una diferencia pequena indica que el modelo generaliza bien incluso sin la informacion de los vecinos geograficos.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="explain-cards">
              <div className="explain-item">
                <span className="explain-tag" style={{background:'#6366f1'}}>LOO</span>
                <div><strong>Leave-One-Out</strong><p>Cada localidad se prueba con las 18 restantes. Puede ser optimista si las vecinas estan en el set de entrenamiento.</p></div>
              </div>
              <div className="explain-item">
                <span className="explain-tag" style={{background:'#8b5cf6'}}>SCV</span>
                <div><strong>Spatial Block CV</strong><p>Al evaluar la localidad i, tambien se excluyen sus vecinas directas. La metrica mas honesta para datos autocorrelacionados.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 07 - CONCLUSIONES */}
      <section id="interpretation" className="section">
        <SectionHeader
          eyebrow="07 - Conclusiones"
          title="¿Que nos dice el analisis sobre la criminalidad en Bogota?"
          desc="Los modelos no hablan solos. Traducimos los resultados tecnicos en conclusiones sobre la dinamica urbana del delito en la capital colombiana."
        />
        <div className="interpretation-grid">
          <InterpCard
            title="Epicentro claro en el centro historico"
            body="Los Martires (5.872), La Candelaria (5.166) y Santa Fe (4.117) son zonas criticas segun LISA (Santa Fe = HH) y K-Means (Cluster Alto). Alto flujo peatonal, comercio informal y nocturnidad generan las condiciones para el hurto."
          />
          <InterpCard
            title="La periferia sur tiene un riesgo diferente"
            body="Ciudad Bolivar, Usme y Bosa tienen las tasas totales mas bajas y son identificadas como LL en LISA. Pero su violencia intrafamiliar y homicidios son proporcionalmente mas altos. El riesgo domestico requiere respuestas de politica social, no solo policial."
          />
          <InterpCard
            title="Los delitos no son aleatorios"
            body="Todos los delitos presentan I de Moran positivo y significativo (999 permutaciones). El hurto a personas (I=0.469) tiene el clustering mas fuerte. Las intervenciones focalizadas geograficamente tienen sustento estadistico robusto."
          />
          <InterpCard
            title="El hurto y el comercio explican el riesgo"
            body="El Spatial Lag Model confirma que el hurto a personas (coef. 0.95, p=0.00) y el hurto a comercio (coef. 1.77, p=0.00) son los predictores mas significativos de la tasa total. Los homicidios no son significativos, lo que cuestiona politicas centradas solo en ese indicador."
          />
          <InterpCard
            title="El riesgo es propio, no contagiado"
            body="El Rho del modelo espacial no es significativo (p=0.277), lo que indica que controlando por el perfil de delitos propios, el efecto de los vecinos desaparece. El riesgo de cada localidad se explica por su dinamica interna, no por contagio geografico."
          />
          <InterpCard
            title="Limitaciones que importan"
            body="El modelo cubre 13 de 19 localidades por limitaciones del merge geoespacial. Con N pequeno los modelos son ilustrativos. El subregistro afecta delitos intimos. Un analisis a nivel UPZ daria mayor resolucion estadistica y conclusiones mas robustas."
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <p>Analisis Espacial de Criminalidad Urbana - Bogota D.C. - 2021-2024</p>
        <p className="footer-sub">Datos: SIEDCO (Policia Nacional) - Cartografia: Datos Abiertos Bogota - Analisis: Python - pysal - spreg - scikit-learn</p>
        <p className="footer-sub">Proyecto academico - Series Temporales y Datos Geoespaciales</p>
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

function InterpCard({ title, body }) {
  return (
    <div className="interp-card">
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  );
}