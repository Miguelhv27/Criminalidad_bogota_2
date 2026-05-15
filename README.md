# Criminalidad Urbana · Bogotá D.C.

Página web de análisis espacial — Proyecto académico · Series Temporales y Datos Geoespaciales

## Instalación

```bash
npm install
npm start
```

## Estructura

```
criminalidad-bogota/
├── public/
│   ├── index.html
│   └── data/              ← COPIAR AQUÍ los outputs del notebook
│       ├── tasas_localidades.csv
│       ├── serie_temporal.csv
│       ├── vecindad_espacial.csv
│       ├── moran_global.csv
│       ├── lisa_resultados.csv
│       ├── comparativa_lisa_ml.csv
│       ├── clustering_ml.csv
│       ├── perfil_clusters.csv
│       ├── metodo_codo.csv
│       ├── random_forest_importancia.csv
│       ├── predicciones_riesgo.csv
│       └── validacion_resultados.csv
├── src/
│   ├── App.js
│   ├── App.css
│   └── index.js
├── package.json
└── vercel.json
```

## Despliegue en Vercel

1. Subir a GitHub
2. Conectar en vercel.com → New Project
3. Framework: Create React App (auto-detectado)
4. Deploy

## Datos requeridos

Los CSV deben venir de `criminalidad_bogota_refactor.ipynb`.
Copiarlos de `output/` a `public/data/`.

## Columnas esperadas por CSV

| Archivo | Columnas clave |
|---|---|
| `tasas_localidades.csv` | LOCALIDAD, tasa_total, tasa_hurto_a_personas, poblacion, … |
| `serie_temporal.csv` | anio, mes, localidad, cantidad, fecha |
| `vecindad_espacial.csv` | localidad, vecina |
| `moran_global.csv` | delito, I, p_valor, interpretacion |
| `lisa_resultados.csv` | LOCALIDAD_KEY, lisa_total, lisa_total_p |
| `comparativa_lisa_ml.csv` | LOCALIDAD_KEY, lisa_total, cluster_kmeans, tasa_total |
| `clustering_ml.csv` | LOCALIDAD_KEY, cluster_kmeans, cluster_dbscan, cluster_hier |
| `perfil_clusters.csv` | cluster, tasa_total, tasa_hurto_a_personas, tasa_homicidios, … |
| `metodo_codo.csv` | k, inercia, silhouette |
| `random_forest_importancia.csv` | variable_legible, importancia_gini, importancia_permutacion |
| `predicciones_riesgo.csv` | localidad, riesgo_real, riesgo_predicho, tasa_total |
| `validacion_resultados.csv` | tipo_validacion, descripcion, accuracy, f1_weighted, interpretacion |
