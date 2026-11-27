// Returns a MapLibre style URL. Uses MapTiler if key is provided, otherwise a demo style.
export default function getMapStyle(styleName){
  const key = process.env.VUE_APP_MAPTILER_KEY
  const name = styleName || process.env.VUE_APP_MAP_STYLE || 'streets' // streets | hybrid | satellite | outdoor | topo
  if(key){
    return `https://api.maptiler.com/maps/${name}/style.json?key=${key}`
  }
  // Fallback demo style (limited detail)
  return 'https://demotiles.maplibre.org/style.json'
}
