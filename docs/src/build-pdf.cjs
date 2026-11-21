/**
 * Génère les PDF de docs/ à partir des sources HTML de docs/src/.
 * Usage (depuis la racine du dépôt) : node docs/src/build-pdf.cjs
 * Prérequis : Playwright (Chromium) et pdf-lib (npm i -D pdf-lib playwright),
 *             polices Inter et JetBrains Mono installées.
 */
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('playwright')
const { PDFDocument } = require('pdf-lib')

const DOCS = [
  ['documentation-technique-lws.html', 'MM-Cosmetiques-Stock-Pro_Documentation-technique-LWS.pdf', 'Documentation technique — Hébergement sur LWS'],
  ['guide-utilisateur.html', 'MM-Cosmetiques-Stock-Pro_Guide-utilisateur.pdf', 'Guide d’utilisation — Formation des utilisateurs'],
]

const footer = (title) => `
  <div style="width:100%;font-family:Inter,sans-serif;font-size:7.5pt;color:#7a8777;padding:0 17mm;display:flex;justify-content:space-between;">
    <span>MM Cosmétiques Stock Pro — ${title}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`

;(async () => {
  const only = process.argv[2]
  const browser = await chromium.launch()
  const page = await browser.newPage()
  for (const [src, out, title] of DOCS) {
    if (only && !src.includes(only)) continue
    await page.goto('file://' + path.join(__dirname, src), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const target = path.join(__dirname, '..', out)
    const common = { format: 'A4', printBackground: true, preferCSSPageSize: true }
    // Deux rendus : la couverture sans pied de page, le reste avec pied de page numéroté.
    const withFooter = await page.pdf({ ...common, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer(title) })
    const cover = await page.pdf({ ...common, pageRanges: '1' })
    const merged = await PDFDocument.create()
    const [coverPage] = await merged.copyPages(await PDFDocument.load(cover), [0])
    merged.addPage(coverPage)
    const body = await PDFDocument.load(withFooter)
    const rest = await merged.copyPages(body, body.getPageIndices().slice(1))
    rest.forEach((p) => merged.addPage(p))
    merged.setTitle(title.replace('’', "'") + ' — MM Cosmétiques Stock Pro')
    merged.setAuthor('MM Cosmétiques')
    merged.setLanguage('fr-FR')
    fs.writeFileSync(target, await merged.save())
    console.log('PDF écrit :', target, '(' + merged.getPageCount() + ' pages)')
  }
  await browser.close()
})()
