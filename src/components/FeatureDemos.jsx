import React from 'react'

/*
 * FeatureDemos — mini-demo beranimasi (berulang) untuk section fitur landing.
 * Terlihat seperti rekaman layar/video, tapi murni CSS (ringan, tanpa file video).
 * Dipasang di FeaturesSection saat mode preview (ctx.animatedMocks).
 * Nanti bila ada rekaman layar asli, frame ini bisa diganti <video>.
 */

// Bingkai jendela browser (sama gaya BrowserFrame landing) + isi demo.
function DemoFrame({ children }) {
  return (
    <div className="rounded-2xl border border-[#D5D8E8] bg-white shadow-[0_24px_60px_-28px_rgba(28,26,23,0.4)] overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#E8EAF5] bg-[#F4F4FA]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E0573E]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E0A23E]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#3FB950]/70" />
        <span className="ml-2 text-[10px] text-[#9c9ab8] font-medium">app.sembapos.com</span>
        <span className="fd-live ml-auto">● Live</span>
      </div>
      <div className="aspect-[16/10] bg-[#F7F7FC] p-4 sm:p-5">{children}</div>
    </div>
  )
}

function PosDemo() {
  const items = ['Potong rambut', 'Cuci + styling', 'Cukur jenggot']
  const price = ['45.000', '35.000', '25.000']
  return (
    <div className="fd h-full flex flex-col">
      <div className="fd-row-head">Transaksi · Kasir</div>
      <div className="flex-1 space-y-1.5 mt-1.5">
        {items.map((it, i) => (
          <div key={it} className="fd-line" style={{ '--d': `${i * 0.5}s` }}>
            <span>{it}</span><b>Rp{price[i]}</b>
          </div>
        ))}
      </div>
      <div className="fd-total"><span>Total</span><b>Rp105.000</b></div>
      <div className="fd-pay">Bayar<span className="fd-paid">✓ Lunas</span></div>
    </div>
  )
}

function BookingDemo() {
  const slots = ['13.00', '14.00', '15.00', '16.00']
  return (
    <div className="fd h-full flex flex-col">
      <div className="fd-row-head">Jadwal hari ini<span className="fd-badge">Antrean 6</span></div>
      <div className="flex-1 grid grid-cols-4 gap-1.5 mt-2">
        {slots.map((s, i) => (
          <div key={s} className={`fd-slot ${i === 2 ? 'fd-slot-new' : ''}`}>
            <small>{s}</small>
            {i === 0 && <span className="fd-chip">Andi</span>}
            {i === 1 && <span className="fd-chip">Budi</span>}
            {i === 2 && <span className="fd-chip fd-chip-in">Rian</span>}
          </div>
        ))}
      </div>
      <div className="fd-toast"><span className="fd-dot" /> Booking baru masuk — Rian, 15.00</div>
    </div>
  )
}

function BranchesDemo() {
  const rows = [['Kemang', 92, '4,8jt'], ['Tebet', 71, '3,6jt'], ['Depok', 54, '2,7jt']]
  return (
    <div className="fd h-full flex flex-col">
      <div className="fd-row-head">Omzet per cabang · hari ini</div>
      <div className="flex-1 flex flex-col justify-center gap-3">
        {rows.map(([n, w, v], i) => (
          <div key={n} className="fd-branch">
            <span className="fd-bname">{n}</span>
            <div className="fd-track"><span className="fd-fill" style={{ '--w': `${w}%`, '--d': `${i * 0.25}s` }} /></div>
            <b className="fd-bval">{v}</b>
          </div>
        ))}
      </div>
      <div className="fd-foot">3 cabang aktif · total <b>Rp11,1jt</b></div>
    </div>
  )
}

function ReportDemo() {
  const bars = [42, 58, 48, 74, 62, 90, 70]
  return (
    <div className="fd h-full flex flex-col">
      <div className="fd-row-head">Laporan omzet<span className="fd-delta">▲ 12%</span></div>
      <div className="fd-kpi">Rp<span className="fd-num">6,7jt</span><small>7 hari terakhir</small></div>
      <div className="flex-1 flex items-end gap-2 mt-2">
        {bars.map((h, i) => (
          <span key={i} className={`fd-bar ${i === 5 ? 'fd-bar-peak' : ''}`} style={{ '--h': `${h}%`, '--d': `${i * 0.09}s` }} />
        ))}
      </div>
    </div>
  )
}

function ChatDemo() {
  return (
    <div className="fd h-full flex flex-col">
      <div className="fd-row-head">WhatsApp · otomatis</div>
      <div className="flex-1 flex flex-col justify-end gap-2 pb-1">
        <div className="fd-bubble fd-in">Halo, booking kamu jam 16.00 sudah dikonfirmasi ✅</div>
        <div className="fd-bubble fd-out">
          <span className="fd-typing"><i /><i /><i /></span>
          <span className="fd-sent">Struk #1240 · Rp105.000 — terima kasih! <b>✓✓</b></span>
        </div>
      </div>
      <div className="fd-foot">Konfirmasi &amp; struk terkirim otomatis</div>
    </div>
  )
}

const MAP = {
  scissors: PosDemo, creditcard: PosDemo, shoppingbag: PosDemo,
  calendarclock: BookingDemo, calendar: BookingDemo, clock: BookingDemo, listordered: BookingDemo,
  building2: BranchesDemo, building: BranchesDemo, store: BranchesDemo,
  trendingup: ReportDemo, barchart3: ReportDemo, barchart: ReportDemo, linechart: ReportDemo,
  messagecircle: ChatDemo, messagesquare: ChatDemo, send: ChatDemo, smartphone: ChatDemo,
}

export function FeatureDemo({ icon }) {
  const key = String(icon || '').toLowerCase()
  const Demo = MAP[key] || ReportDemo
  return <DemoFrame><Demo /></DemoFrame>
}

export function FeatureDemoStyles() {
  return <style>{CSS}</style>
}

const CSS = `
.fd{font-family:inherit; color:#1E1B2E; font-size:12px;}
.fd-live{font-size:9.5px;font-weight:700;color:#10B981;}
.fd-row-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;color:#56548A;text-transform:uppercase;letter-spacing:.04em;}
.fd-badge{font-size:9.5px;font-weight:700;color:#4F46E5;background:#6366F114;border:1px solid #6366F126;padding:2px 7px;border-radius:99px;text-transform:none;letter-spacing:0;}
.fd-foot{margin-top:8px;font-size:10.5px;color:#7C7AA8;}
.fd-foot b{color:#1E1B2E;}

/* POS */
.fd-line{display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #E8EAF5;border-radius:9px;padding:7px 10px;font-size:11.5px;font-weight:600;opacity:0;transform:translateY(6px);animation:fdLine 6s var(--d) infinite;}
.fd-line b{color:#4F46E5;}
@keyframes fdLine{0%,6%{opacity:0;transform:translateY(6px);}14%,82%{opacity:1;transform:translateY(0);}92%,100%{opacity:0;transform:translateY(-4px);}}
.fd-total{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed #D5D8E8;font-size:12px;font-weight:700;}
.fd-total b{font-size:15px;color:#1E1B2E;}
.fd-pay{position:relative;margin-top:9px;height:34px;border-radius:10px;background:linear-gradient(135deg,#6366F1,#4F46E5);color:#fff;font-weight:700;font-size:12.5px;display:grid;place-items:center;overflow:hidden;}
.fd-paid{position:absolute;inset:0;display:grid;place-items:center;background:#10B981;color:#fff;opacity:0;animation:fdPaid 6s infinite;}
@keyframes fdPaid{0%,72%{opacity:0;}80%,94%{opacity:1;}100%{opacity:0;}}

/* Booking */
.fd-slot{position:relative;background:#fff;border:1px solid #E8EAF5;border-radius:9px;padding:7px 6px;display:flex;flex-direction:column;gap:5px;min-height:74px;}
.fd-slot small{font-size:10px;color:#9c9ab8;font-weight:600;}
.fd-slot-new{border-color:#6366F1;box-shadow:0 0 0 2px #6366F11f;}
.fd-chip{font-size:10px;font-weight:700;background:#E8EAF5;color:#4F46E5;border-radius:6px;padding:3px 5px;text-align:center;}
.fd-chip-in{background:#6366F1;color:#fff;opacity:0;transform:translateY(8px);animation:fdChip 5s infinite;}
@keyframes fdChip{0%,12%{opacity:0;transform:translateY(8px);}22%,86%{opacity:1;transform:translateY(0);}96%,100%{opacity:0;}}
.fd-toast{margin-top:9px;display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:#1E1B2E;background:#fff;border:1px solid #E8EAF5;border-radius:9px;padding:7px 10px;opacity:0;transform:translateY(8px);animation:fdToast 5s infinite;}
.fd-dot{width:7px;height:7px;border-radius:50%;background:#10B981;}
@keyframes fdToast{0%,16%{opacity:0;transform:translateY(8px);}26%,84%{opacity:1;transform:translateY(0);}96%,100%{opacity:0;transform:translateY(-4px);}}

/* Branches */
.fd-branch{display:flex;align-items:center;gap:10px;}
.fd-bname{font-size:11.5px;font-weight:600;width:48px;}
.fd-track{flex:1;height:9px;border-radius:99px;background:#E8EAF5;overflow:hidden;}
.fd-fill{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#6366F1,#10B981);animation:fdFill 5s var(--d) infinite;}
@keyframes fdFill{0%{width:0;}30%,84%{width:var(--w);}100%{width:0;}}
.fd-bval{font-size:11.5px;font-weight:700;width:42px;text-align:right;color:#4F46E5;}

/* Report */
.fd-delta{font-size:10px;font-weight:700;color:#10B981;text-transform:none;letter-spacing:0;}
.fd-kpi{margin-top:6px;font-size:12px;font-weight:700;display:flex;align-items:baseline;gap:5px;}
.fd-num{font-size:22px;font-weight:800;color:#1E1B2E;letter-spacing:-0.02em;}
.fd-kpi small{font-size:10px;color:#9c9ab8;font-weight:500;margin-left:2px;}
.fd-bar{flex:1;border-radius:5px 5px 2px 2px;background:linear-gradient(to top,#c7c9f5,#a5a8f0);height:0;align-self:flex-end;animation:fdBar 5s var(--d) infinite;}
.fd-bar-peak{background:linear-gradient(to top,#6366F1,#8b8df7);}
@keyframes fdBar{0%{height:0;}24%,86%{height:var(--h);}100%{height:0;}}

/* Chat */
.fd-bubble{max-width:80%;font-size:11.5px;line-height:1.4;padding:8px 11px;border-radius:13px;}
.fd-in{align-self:flex-start;background:#fff;border:1px solid #E8EAF5;border-bottom-left-radius:4px;opacity:0;transform:translateY(8px);animation:fdToast 6s infinite;}
.fd-out{align-self:flex-end;background:linear-gradient(135deg,#6366F1,#4F46E5);color:#fff;border-bottom-right-radius:4px;position:relative;min-width:62%;}
.fd-typing{display:flex;gap:4px;padding:2px 0;opacity:0;animation:fdTyping 6s infinite;}
.fd-typing i{width:6px;height:6px;border-radius:50%;background:#ffffffcc;animation:fdBlink 1.2s infinite;}
.fd-typing i:nth-child(2){animation-delay:.2s;}
.fd-typing i:nth-child(3){animation-delay:.4s;}
@keyframes fdBlink{0%,60%,100%{opacity:.3;}30%{opacity:1;}}
@keyframes fdTyping{0%,32%{opacity:1;}40%,100%{opacity:0;height:0;}}
.fd-sent{display:block;opacity:0;animation:fdSent 6s infinite;}
.fd-sent b{color:#A7F3D0;}
@keyframes fdSent{0%,40%{opacity:0;}48%,92%{opacity:1;}100%{opacity:0;}}
`
