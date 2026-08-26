/**
 * Estructura jerárquica de Células y Microceldas — Región Occidente
 * Fuente: diseño operacional de la red
 */
export const CELULAS = {
  'Cali': [
    'Cali Norte',
    'Cali Sur',
  ],
  'Valle': [
    'Norte Valle',
    'Centro Valle',
    'Palmira',
    'Sevilla-Caicedonia',
  ],
  'Cauca': [
    'Popayán',
    'Norte Cauca',
  ],
  'Nariño': [
    'Pasto',
    'Ipiales',
  ],
  'Huila-Caquetá': [
    'Neiva',
    'Pitalito-Garzón',
    'Florencia',
  ],
  'Tolima': [
    'Ibagué',
    'Sur Tolima',
  ],
}

/** Municipios / zonas cubiertas por cada microcelda */
export const MICROCELDA_CIUDADES = {
  'Cali Norte':          ['Comunas 1–8', 'Aguablanca', 'Yumbo'],
  'Cali Sur':            ['Comunas 9–22', 'Jamundí', 'Cali Sur'],
  'Norte Valle':         ['Cartago', 'Zarzal', 'La Victoria', 'Roldanillo', 'Ansermanuevo'],
  'Centro Valle':        ['Tuluá', 'Buga', 'Andalucía', 'Bugalagrande', 'Trujillo'],
  'Palmira':             ['Palmira', 'El Cerrito', 'Pradera', 'Florida'],
  'Sevilla-Caicedonia':  ['Sevilla', 'Caicedonia', 'Argelia', 'El Águila'],
  'Popayán':             ['Popayán', 'Timbío', 'El Tambo', 'Sotará'],
  'Norte Cauca':         ['Santander de Quilichao', 'Puerto Tejada', 'Miranda', 'Corinto'],
  'Pasto':               ['Pasto', 'Tangua', 'La Florida', 'Sandoná', 'Consacá'],
  'Ipiales':             ['Ipiales', 'Túquerres', 'Cumbal', 'Guachucal', 'Pupiales'],
  'Neiva':               ['Neiva', 'Rivera', 'Campoalegre', 'Hobo', 'Algeciras'],
  'Pitalito-Garzón':     ['Pitalito', 'Garzón', 'La Plata', 'Agrado', 'Isnos'],
  'Florencia':           ['Florencia', 'San Vicente del Caguán', 'Morelia', 'Albania'],
  'Ibagué':              ['Ibagué', 'Cajamarca', 'Rovira', 'Anzoátegui'],
  'Sur Tolima':          ['Espinal', 'Melgar', 'Flandes', 'Chaparral', 'Purificación'],
}

/** Devuelve los municipios de una microcelda, o [] si no existe */
export const getCiudadesDeMicrocelda = (microcelda) => MICROCELDA_CIUDADES[microcelda] ?? []

/** Lista plana de todas las células */
export const CELULAS_LIST = Object.keys(CELULAS).sort()

/** Devuelve las microceldas de una célula, o [] si no existe */
export const getMicroceldas = (celula) => CELULAS[celula] ?? []

/** Devuelve la célula padre de una microcelda, o null */
export const getCelulaDeMicrocelda = (microcelda) => {
  for (const [celula, micros] of Object.entries(CELULAS)) {
    if (micros.includes(microcelda)) return celula
  }
  return null
}
