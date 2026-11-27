export const BARANGAYS = [
  'Balingayan', 'Balite', 'Baruyan', 'Batino', 'Bayanan I', 'Bayanan II', 'Biga', 'Bondoc',
  'Bucayao', 'Buhuan', 'Bulusan', 'Calero', 'Camansihan', 'Camilmil', 'Canubing I', 'Canubing II',
  'Comunal', 'Guinobatan', 'Gulod', 'Gutad', 'Ibaba East', 'Ibaba West', 'Ilaya', 'Lalud',
  'Lazareto', 'Libis', 'Lumang Bayan', 'Mahal na Pangalan', 'Maidlang', 'Malad', 'Malamig', 'Managpi',
  'Masipit', 'Nag-iba I', 'Nag-iba II', 'Navotas', 'Pachoca', 'Palhi', 'Panggalaan', 'Parang',
  'Patas', 'Personas', 'Putingtubig', 'Salong (also known as San Raphael)', 'San Antonio',
  'San Vicente Central', 'San Vicente East', 'San Vicente North', 'San Vicente South', 'San Vicente West',
  'Santa Cruz', 'Santa Isabel', 'Santa Maria Village', 'Santa Rita', 'Santo Niño', 'Sapul',
  'Silonay', 'Suqui', 'Tawagan', 'Tawiran', 'Tibag', 'Wawa'
]

export function splitAddress(address) {
  const text = String(address || '').trim()
  if (!text) return { barangay: '', details: '' }
  const first = text.split(',')[0].trim()
  if (BARANGAYS.includes(first)) {
    return {
      barangay: first,
      details: text.slice(first.length).replace(/^,\s*/, '').trim()
    }
  }
  return { barangay: '', details: text }
}

export function joinAddress(barangay, details) {
  const b = String(barangay || '').trim()
  const d = String(details || '').trim()
  if (!b) return d
  return d ? `${b}, ${d}` : b
}
