# Rencana: Builder Landing Page Super-Admin (Block/Section Builder)

Status: rencana siap eksekusi. Target: `sembapos.com/` dapat disusun bebas oleh
super-admin lewat block builder (drag-reorder section, tambah/hapus/duplikat
blok, sembunyikan, live preview, upload gambar nyata).

---

## Phase 0 — Temuan Discovery (sudah dikumpulkan)

**Drag-and-drop:** `@dnd-kit/core@^6.3.1` + `@dnd-kit/sortable@^10.0.0` +
`@dnd-kit/utilities@^3.2.2` SUDAH terpasang. Pola copy-ready ada di
`src/pages/kasir/QueuePage.jsx` (import baris 6–19, sensor 258–260,
`SortableTicketCard` 133–165, `handleDragEnd` 363–377, `DndContext` 465–496).
JANGAN pakai `framer-motion` Reorder — pola proyek = @dnd-kit.

**UI components** (`src/components/ui/`): `Card`/`CardHeader`/`CardBody`/`CardFooter`,
`Button` (variant primary/secondary/ghost/danger/success/outline; size xs–xl;
props loading/icon/fullWidth), `Input` + `Textarea` (forwardRef; label/error/hint/icon),
`Modal` (isOpen/onClose/title/size). Tema editor super-admin = GELAP
(`bg-dark-card`, `text-off-white`, `text-muted`, `bg-gold`).

**i18n:** terkonfigurasi tapi TIDAK dipakai di landing maupun SALandingPage —
semua string Indonesia hardcoded. Builder ikut pola ini: hardcoded Indonesia,
JANGAN tambah `useTranslation()`.

**Backend landing** (`backend/src/routes/landing.js`): konten di tabel
`SystemSetting` (`key String @id`, `value String`). `SETTING_KEYS` +
`JSON_KEYS=['features','trustItems','steps','sections','closingCta']` +
`DEFAULTS`. `GET /api/landing` → `{hero,testimonials,faqs,packages,stats}`.
`PATCH /api/landing/hero` (super_admin) → `emitLandingUpdate()` emit
`'landing:updated'`. Router mount: `index.js` → `router.use('/landing', ...)`.
Auth: `authenticate` + `requireRole('super_admin')` dari `src/middleware/auth.js`.

**Upload gambar:** TIDAK ada infrastruktur. Tidak ada `multer`, tidak ada
`express.static`, tidak ada S3/Cloudinary. Pola sekarang = base64-in-JSON
(`fileToCompressedDataUrl` di `TASettingsPage.jsx`). `express.json({limit:'10mb'})`
di `server.js:43`.

**LandingPage** (`src/pages/LandingPage.jsx`): section berurutan hardcoded —
Nav → Hero → Stats → Fitur → Cara Mulai → Harga → Testimoni → FAQ → CTA Penutup
→ Footer (+ FAB WhatsApp). Subkomponen: `Nav`, `SectionHeading`, `FAQItem`,
`Footer`, `DashboardMock`, `renderHeroTitle`. Route editor: `/super-admin/landing`.

---

## Keputusan Arsitektur

### A. Penyimpanan layout — `SystemSetting` JSON, BUKAN tabel baru
Key baru `landing_layout` (masuk `SETTING_KEYS` + `JSON_KEYS`). Nilainya array
`[{ id, type, visible, config? }]`. Alasan: konsisten dgn semua konten landing
lain (hero/sections/steps/closingCta sudah JSON di SystemSetting); landing cuma
~10–15 blok → tidak butuh query per-blok; satu sumber, tanpa migrasi Prisma.

### B. Model hibrida blok — core vs free
- **Blok core (singleton, konten di sumber lama):** `hero`, `stats`, `features`,
  `steps`, `pricing`, `testimonials`, `faq`, `closingCta`. Layout HANYA atur
  urutan + visibilitas. Konten tetap diedit di tab lama (Hero & Branding,
  Section & Footer, Testimoni, FAQ) — TANPA migrasi data, TANPA duplikasi editor.
- **Blok free (bisa banyak instance, konten inline di `config`):** `gallery`,
  `video`, `logoStrip`, `banner`, `richText`. Konten disimpan di `config` tiap
  entri layout.

### C. Hero, Footer, Nav — terkunci
`Nav` & `Hero` selalu paling atas; `Footer` selalu paling bawah. Tidak bisa
di-drag, tidak bisa disembunyikan. Hanya blok di antaranya yang bebas diatur →
hasil selalu rapi.

### D. Upload gambar — disk + multer (storage nyata)
`npm i multer`. Simpan ke `backend/uploads/landing/<uuid>.<ext>`, layani via
`express.static`. Endpoint `POST /api/landing/upload`. BUKAN base64. `uploads/`
masuk `.gitignore`. (Optimasi opsional nanti: serve `/uploads` langsung via
nginx.)

### E. Migrasi — nol
`landing_layout` default (saat key belum ada) = urutan sekarang:
`[hero, stats, features, steps, pricing, testimonials, faq, closingCta]`.
Instalasi lama otomatis dapat tampilan identik.

### F. Live preview — iframe
Panel `<iframe src="/">` di builder. Saat super-admin simpan, backend emit
`landing:updated` → `useLanding` di dalam iframe invalidasi → preview segar
otomatis. Preview drag-belum-disimpan = enhancement Phase 5 (postMessage).

---

## Phase 1 — Backend: API layout + upload gambar

**Implementasi:**
1. `backend/src/routes/landing.js`:
   - Tambah `landing_layout: 'landing_layout'` ke `SETTING_KEYS`; tambah
     `'layout'` ke `JSON_KEYS`; tambah `DEFAULTS.layout =
     JSON.stringify([{id:'hero',type:'hero',visible:true}, ...urutan sekarang])`.
   - `getAllHero()` sudah otomatis parse JSON_KEYS — pindahkan `layout` agar
     ikut ter-parse (atau parse terpisah). Pastikan `GET /api/landing` data
     menyertakan `layout` (top-level, sejajar `hero`).
   - Tambah `PATCH /api/landing/layout` (`authenticate`+`requireRole('super_admin')`):
     validasi zod `z.array(blockSchema)`, `setSetting('landing_layout', JSON.stringify(...))`,
     `emitLandingUpdate()`, balas layout tersimpan.
   - `blockSchema` zod: `{ id: string, type: enum(semua tipe), visible: boolean,
     config: z.record(z.any()).optional() }`. Validasi: tipe core unik (maks 1).
2. Upload gambar:
   - `npm install multer` di `backend/`.
   - `server.js`: `app.use('/uploads', express.static(path.join(__dirname,'uploads')))`.
   - Endpoint `POST /api/landing/upload` (super_admin): `multer` diskStorage →
     `backend/uploads/landing/`, filename `crypto.randomUUID()+ext`, `fileFilter`
     mime image (jpeg/png/webp/gif), `limits.fileSize` 5MB. Balas
     `{ success:true, data:{ url:'/uploads/landing/<file>' } }`.
   - Opsional `DELETE /api/landing/upload` hapus file.
   - Tambah `backend/uploads/` ke `.gitignore`.

**Referensi pola:** `SETTING_KEYS`/`JSON_KEYS`/`DEFAULTS`/`PATCH /hero` di
`landing.js`; `requireRole` di `landing.js:178`.

**Verifikasi:**
- `node -c backend/src/routes/landing.js` lolos.
- `GET /api/landing` mengembalikan `data.layout` array.
- `curl -X PATCH .../api/landing/layout` dengan token super_admin menyimpan.
- `curl -F image=@foo.jpg .../api/landing/upload` balas URL; file ada di
  `backend/uploads/landing/`; URL dapat diakses lewat browser.

**Anti-pattern:** jangan bikin tabel `LandingBlock` (keputusan A). Jangan simpan
gambar base64. Jangan lupa `express.static` sebelum 404 handler.

---

## Phase 2 — Frontend: LandingPage render dari layout

**Implementasi (`src/pages/LandingPage.jsx`):**
1. Pecah tiap `<section>` jadi komponen terpisah: `HeroSection`, `StatsSection`,
   `FeaturesSection`, `StepsSection`, `PricingSection`, `TestimonialsSection`,
   `FaqSection`, `ClosingCtaSection` — masing-masing terima props dari `data`
   (hero/testimonials/faqs/packages/stats) seperti sekarang. Pindahkan JSX
   apa adanya; JANGAN ubah styling/warna HEX.
2. Komponen blok FREE baru: `GallerySection`, `VideoSection`, `LogoStripSection`,
   `BannerSection`, `RichTextSection` — render dari prop `config`. Pakai warna
   HEX eksplisit tema terang (`#FBFAF6/#F5EFE3/#1C1A17/#C9A84C/#A8893A`), pola
   sama `SectionHeading`. Gambar dari `config` = URL (prefix API origin).
3. `BLOCK_REGISTRY = { hero: HeroSection, stats: StatsSection, ... }`.
4. Render: `Nav` → `HeroSection` (selalu) → `layout.filter(b=>b.visible &&
   b.type!=='hero').map(b => BLOCK_REGISTRY[b.type])` → `Footer` (selalu) → FAB.
   `layout` dari `data.layout` (fallback `FALLBACK_LAYOUT` urutan sekarang).
5. Kompat: kalau `data.layout` kosong → pakai urutan default.

**Verifikasi:**
- Build (`NODE_OPTIONS=--max-old-space-size=2800 npx vite build`) sukses.
- Dengan layout default, `sembapos.com/` tampil IDENTIK dgn sekarang.
- Mengubah urutan/`visible` di `landing_layout` (via DB/PATCH) mengubah urutan
  & visibilitas section di landing.
- Blok free render benar dari config dummy.

**Anti-pattern:** jangan pakai class tema (`bg-dark` dll) di komponen landing —
landing SELALU terang. Jangan ubah copy/warna section lama.

---

## Phase 3 — Frontend: Builder UI (tab "Tata Letak")

**Implementasi (`src/pages/super-admin/SALandingPage.jsx`):**
1. Tambah tab `layout` → `{ id:'layout', label:'Tata Letak', icon: LayoutTemplate }`
   (sudah ada import `LayoutTemplate`). Render `<LayoutBuilder />`.
2. `LayoutBuilder`:
   - Fetch `data.layout` via `useLanding()`; state lokal `blocks`.
   - Daftar sortable @dnd-kit — COPY pola `QueuePage.jsx` (import 6–19, sensors
     258–260, `useSortable` 133–165, `handleDragEnd` 363–377, `DndContext`
     465–496) tapi list vertikal tunggal (`verticalListSortingStrategy`).
   - Tiap kartu blok: drag handle (`GripVertical`), label tipe + ikon,
     toggle `visible` (`Eye`/`EyeOff`), tombol Hapus & Duplikat (HANYA blok
     free), tombol "Edit konten":
       - blok core → pindah ke tab terkait (Hero & Branding / Section & Footer
         / Testimoni / FAQ).
       - blok free → buka `Modal` editor `config` per tipe.
   - Hero & Footer ditampilkan sebagai baris terkunci (badge "Tetap", tanpa
     handle/hapus/sembunyi).
   - Tombol "Tambah Blok" → palet tipe free (`gallery/video/logoStrip/banner/
     richText`) → push entri baru `{id:randomUUID(), type, visible:true, config:{}}`.
3. Editor `config` per tipe free (di `Modal`):
   - `gallery`: daftar gambar (upload via endpoint Phase 1) + caption.
   - `video`: URL embed (YouTube/Vimeo) + judul.
   - `logoStrip`: daftar logo (upload) + nama.
   - `banner`: gambar (upload) + heading + teks + label/URL CTA.
   - `richText`: heading + body (textarea) + opsional CTA.
   - Komponen upload baru `ImageUploadField` — `<input type=file>` + `FormData`
     POST ke `/api/landing/upload`, tampilkan preview dari URL balasan.
     (Pola FormData BARU — belum ada di repo; ini satu-satunya pola non-base64.)
4. Simpan: tombol "Simpan Tata Letak" → `PATCH /api/landing/layout` →
   `invalidateQueries(['landing'])`.
5. Hook `useLanding.js`: tambah `useUpdateLayout()` mutation (pola `useUpdateHero`).

**Verifikasi:**
- Build sukses.
- Drag mengubah urutan; Simpan persist; reload tetap.
- Toggle visible menyembunyikan blok di landing.
- Tambah blok banner + upload gambar → tampil di landing.
- Duplikat & hapus blok free berfungsi; blok core tidak bisa dihapus.

**Anti-pattern:** jangan pakai `react-beautiful-dnd`/`Reorder` — pakai @dnd-kit.
Jangan simpan gambar base64 — pakai endpoint upload. Jangan duplikasi editor
konten core — arahkan ke tab lama.

---

## Phase 4 — Live preview

**Implementasi:** Di `LayoutBuilder`, panel kanan `<iframe src="/" />` (atau
`/?preview=1`). Saat Simpan sukses, backend sudah emit `landing:updated` →
`useLanding` di dalam iframe auto-refresh. Tambah tombol "Segarkan preview" +
toggle lebar mobile/desktop. Preview mencerminkan kondisi TERSIMPAN.

**Verifikasi:** simpan layout → iframe ikut berubah tanpa reload manual.

**Enhancement opsional:** preview perubahan belum-disimpan via `postMessage`
dari builder ke iframe.

---

## Phase 5 — Verifikasi akhir

1. Semua build (frontend `vite build` + `node -c` backend) lolos.
2. grep anti-pattern: tidak ada `bg-dark`/`text-off-white` di komponen landing;
   tidak ada base64 di payload upload; tidak ada `react-beautiful-dnd`.
3. Uji end-to-end: reorder, hide, add/duplicate/delete free block, upload
   gambar, live preview, realtime `landing:updated`.
4. Landing dgn layout default = identik kondisi awal (regression check).
5. `git add` + commit + push `main` (repo pdnusantara/crown).
6. Restart backend produksi diperlukan (multer + route baru):
   `pm2 restart crown-backend --update-env` (dijalankan user).

---

## File Kritis

| File | Phase | Aksi |
|---|---|---|
| `backend/src/routes/landing.js` | 1 | layout key + `PATCH /layout` |
| `backend/src/routes/landing.js` atau route baru | 1 | `POST /upload` (multer) |
| `backend/server.js` | 1 | `express.static('/uploads')` |
| `backend/package.json` | 1 | `+ multer` |
| `backend/.gitignore` | 1 | `+ uploads/` |
| `src/pages/LandingPage.jsx` | 2 | pecah section + registry + render dari layout |
| `src/hooks/useLanding.js` | 3 | `useUpdateLayout()` |
| `src/pages/super-admin/SALandingPage.jsx` | 3 | tab "Tata Letak" + `LayoutBuilder` |
| `src/components/...ImageUploadField` (baru) | 3 | upload FormData |
| (komponen blok free baru) | 2–3 | gallery/video/logoStrip/banner/richText |

## Urutan kerja
Phase 1 → 2 → 3 → 4 → 5. Phase 1 & 2 bisa paralel sebagian (kontrak `layout`
disepakati dulu). Phase 3 bergantung 1+2. Phase 4 bergantung 3.
