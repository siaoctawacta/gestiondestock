/** Identité MM Cosmétiques, partagée par l'interface et les documents PDF. */
export const BRAND = {
  name: 'MM Cosmétiques',
  green: '#184620',
  sage: '#B2CD8A',
  greenRgb: [24, 70, 32] as [number, number, number],
  sageRgb: [178, 205, 138] as [number, number, number],
}

const cache = new Map<string, Promise<{ data: string; ratio: number }>>()

/** Charge une image publique en data URL (pour jsPDF), avec son ratio largeur/hauteur. */
export function loadImage(url: string) {
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          c.getContext('2d')!.drawImage(img, 0, 0)
          resolve({ data: c.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight })
        }
        img.onerror = () => reject(new Error(`Logo introuvable : ${url}`))
        img.src = url
      }),
    )
  }
  return cache.get(url)!
}
