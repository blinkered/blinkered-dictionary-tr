/**
 * The collections that attest Turkish, and where each comes from.
 *
 * Turkish has more Internet Archive texts than any language built here: 14,020 against a
 * 638,282-word candidate list. It is also the hardest test of the drop rule, because the list is
 * mostly agglutinative inflection and a corpus can only confirm the forms people actually write.
 *
 * Every URL here was probed before it was written down. A collection that 404s does not fail
 * loudly — the build skips it with a warning and reports a healthy number over fewer families.
 */
import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import {
  fileDocuments,
  fineweb2Documents,
  gutenbergBody,
  harvestDocuments,
  leipzigLocators,
  leipzigSentences,
  tatoebaDocuments,
  verseDocuments,
  wikiDocuments,
} from '@blinkered/attestation'

export const LANGUAGE = 'tr'

const CACHE = new URL('.cache/raw/', import.meta.url).pathname

/** A Leipzig package, with its sentence-to-URL index resolved up front. */
function leipzig(pkg) {
  const base = `${CACHE}${pkg}/${pkg}`
  const locators = leipzigLocators(
    readFileSync(`${base}-inv_so.txt`, 'utf8'),
    readFileSync(`${base}-sources.txt`, 'utf8'),
  )
  const lines = createInterface({
    input: createReadStream(`${base}-sentences.txt`),
    crlfDelay: Infinity,
  })
  return leipzigSentences(lines, locators)
}

// News only. The Leipzig Wikipedia packages are deliberately absent: they are Wikipedia text
// wearing a Leipzig label, so including one would corroborate `wiki:tr` while looking
// like another family. That is the exact failure the three-families rule exists to catch.
const LEIPZIG = [
  'tur_news_2024_1M',
  'tur_news_2023_1M',
]

const ALL = [
  {
    id: 'wiki:tr',
    what: 'Turkish Wikipedia — modern encyclopedic prose',
    needs: `${CACHE}trwiki.xml.bz2`,
    documents: () => wikiDocuments(`${CACHE}trwiki.xml.bz2`),
  },
  {
    id: 'wikisource:tr',
    what: 'Turkish Wikisource — same Wikimedia family, so it corroborates rather than counts',
    needs: `${CACHE}trwikisource.xml.bz2`,
    documents: () => wikiDocuments(`${CACHE}trwikisource.xml.bz2`),
  },
  ...LEIPZIG.map((pkg) => ({
    id: `lz:${pkg}`,
    from: `https://downloads.wortschatz-leipzig.de/corpora/${pkg}.tar.gz`,
    what: `Leipzig ${pkg} — modern news, cited by the page each sentence came from`,
    needs: `${CACHE}${pkg}`,
    documents: () => leipzig(pkg),
  })),
  {
    id: 'tat',
    from: 'https://downloads.tatoeba.org/exports/per_language/tur/tur_sentences.tsv.bz2',
    what: 'Tatoeba Turkish — contemporary and conversational',
    needs: `${CACHE}tur_sentences.tsv`,
    documents: () => tatoebaDocuments(`${CACHE}tur_sentences.tsv`),
  },
  {
    id: 'fw2',
    from: 'https://huggingface.co/datasets/HuggingFaceFW/fineweb-2/resolve/main/data/tur_Latn/train/000_00000.parquet',
    what: 'FineWeb-2 Turkish — a web crawl nobody here made',
    needs: `${CACHE}fineweb2-tur.parquet`,
    documents: () => fineweb2Documents(`${CACHE}fineweb2-tur.parquet`),
  },
  {
    id: 'gut',
    from: 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv',
    what: 'Project Gutenberg Turkish, 0 texts',
    needs: `${CACHE}gutenberg-tr`,
    documents: () => {
      const dir = `${CACHE}gutenberg-tr`
      const books = readdirSync(dir)
        .filter((file) => file.endsWith('.txt'))
        .map((file) => ({ locator: file.replace('.txt', ''), path: `${dir}/${file}` }))
      return fileDocuments(books, async (path) => gutenbergBody(readFileSync(path, 'utf8')))
    },
  },
  {
    id: 'ebible:turytc',
    from: 'https://ebible.org/Scriptures/turytc_vpl.zip',
    what: 'The Turkish Bible (WEB) — a family nothing else here belongs to — a family nothing else here belongs to',
    needs: `${CACHE}ebible-turytc/turytc_vpl.txt`,
    documents: () => verseDocuments(`${CACHE}ebible-turytc/turytc_vpl.txt`),
  },
  {
    id: 'ia',
    // Scanned books are OCR, and OCR fails in a way that looks like text. Clean Gutenberg scores
    // a median 52% known words and never below 36%; the worst of these scored 1%, an English
    // book read as Cyrillic. Below this floor a book is not legible enough to attest anything.
    legible: 0.35,
    what: 'Internet Archive Turkish books — literature, and the register a newspaper never reaches',
    needs: `${CACHE}archive-tr`,
    from: 'https://archive.org/search?query=mediatype%3Atexts+AND+language%3A%22Turkish%22',
    documents: () => {
      const dir = `${CACHE}archive-tr`
      // A locator names the text, not the item: the catalogue page holds no word of the book.
      const named = new Map(
        readFileSync(`${dir}/files.tsv`, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\t')),
      )
      const books = readdirSync(dir)
        .filter((file) => file.endsWith('.txt'))
        .map((file) => file.replace('.txt', ''))
        .filter((id) => named.has(id))
        // Percent-encoded: two thirds of Archive filenames contain spaces, and the evidence
        // format spends spaces as separators.
        .map((id) => ({
          locator: `${id}/${encodeURIComponent(named.get(id))}`,
          path: `${dir}/${id}.txt`,
        }))
      return fileDocuments(books, async (path) => readFileSync(path, 'utf8'))
    },
  },
]

export const SOURCES = ALL.filter((source) => {
  if (source.needs === undefined || existsSync(source.needs)) return true
  process.stderr.write(`  (skipping ${source.id}: ${source.needs} is not in .cache/raw)\n`)
  return false
})

/**
 * Turkish publishers, for the harvest.
 *
 * Chosen because they publish in Turkish rather than because they are large. A harvester
 * reads whatever it fetches and has no idea what language it is in, so a domain that publishes
 * mostly in another language would attest that language's words against these candidates. The
 * last group is literary and cultural, for a register the dailies never reach — which is where
 * the words one family short of the rule tend to live.
 */
export const DOMAINS = [
  'hurriyet.com.tr', 'milliyet.com.tr', 'sabah.com.tr', 'cumhuriyet.com.tr', 'sozcu.com.tr',
  'ntv.com.tr', 'haberturk.com', 't24.com.tr', 'birgun.net', 'bianet.org',
  'edebiyathaber.net', 'k24.com.tr', 'sanatatak.com', 'dergipark.org.tr',
]

export const HARVEST = existsSync(new URL('searched.tsv', import.meta.url).pathname)
  ? () => harvestDocuments(new URL('searched.tsv', import.meta.url).pathname)
  : undefined

/** Carried over from Blinkered's calibration; must be re-measured before anything ships. */
export const COMMON_CUT = 17000
