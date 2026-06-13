import{j as a,r as p,m as r,S as x,A as d,B as w,T as b,M as N,k as h}from"./index-D7a1bEzN.js";import{C as c}from"./check-CZtMs52l.js";import{C as z}from"./calendar-clock-D4lOV_dE.js";import{Z as S}from"./zap-CUaV_CUg.js";import{S as k}from"./sparkles-BmZNmU74.js";import{C as q}from"./crown-B7SMsDKi.js";import{u as B}from"./use-in-view-CFhTPPDd.js";import{a as C}from"./index-SwAuOLvL.js";const u="semba-preview-fonts";function F(){p.useEffect(()=>{if(document.getElementById(u))return;const e=document.createElement("link");e.rel="preconnect",e.href="https://fonts.googleapis.com";const i=document.createElement("link");i.rel="preconnect",i.href="https://fonts.gstatic.com",i.crossOrigin="anonymous";const n=document.createElement("link");n.id=u,n.rel="stylesheet",n.href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap",document.head.append(e,i,n)},[])}function m({to:e,prefix:i="",format:n=s=>Math.round(s).toLocaleString("id-ID"),duration:t=1.4}){const s=p.useRef(null),f=B(s,{once:!0,margin:"-40px"}),[v,j]=p.useState(0);return p.useEffect(()=>{if(!f)return;const y=C(0,e,{duration:t,ease:[.22,1,.36,1],onUpdate:j});return()=>y.stop()},[f,e,t]),a.jsxs("span",{ref:s,children:[i,n(v)]})}function ea(){return F(),a.jsxs("div",{className:"semba-preview",children:[a.jsx("style",{children:$}),a.jsxs("div",{className:"bg-atmos","aria-hidden":!0,children:[a.jsx("div",{className:"dots"}),a.jsx("div",{className:"rule-top"})]}),a.jsx(E,{}),a.jsx(P,{}),a.jsx(M,{}),a.jsx(I,{}),a.jsx(W,{}),a.jsx(K,{}),a.jsx(G,{}),a.jsx(O,{}),a.jsx(V,{})]})}function E(){return a.jsxs(r.nav,{initial:{y:-24,opacity:0},animate:{y:0,opacity:1},transition:{duration:.6,ease:[.22,1,.36,1]},className:"nav",children:[a.jsxs("a",{className:"brand",href:"#",children:[a.jsx("span",{className:"brand-mark",children:a.jsx(x,{size:16,strokeWidth:2.6})}),a.jsxs("span",{className:"brand-name",children:["Semba",a.jsx("span",{className:"brand-accent",children:"POS"})]})]}),a.jsxs("div",{className:"nav-links",children:[a.jsx("a",{href:"#fitur",children:"Fitur"}),a.jsx("a",{href:"#harga",children:"Harga"}),a.jsx("a",{href:"#cerita",children:"Cerita"})]}),a.jsxs("div",{className:"nav-cta",children:[a.jsx("a",{className:"ghost",href:"#",children:"Masuk"}),a.jsxs("a",{className:"btn btn-ink",href:"#",children:["Coba gratis",a.jsx(d,{size:15})]})]})]})}const o=[.22,1,.36,1],l=(e=0)=>({initial:{y:26,opacity:0},animate:{y:0,opacity:1},transition:{duration:.7,ease:o,delay:e}});function P(){return a.jsx("header",{className:"hero",children:a.jsxs("div",{className:"hero-grid",children:[a.jsxs("div",{className:"hero-copy",children:[a.jsxs(r.div,{...l(.05),className:"eyebrow",children:[a.jsx("span",{className:"eyebrow-bar"})," Sistem kasir & booking barbershop"]}),a.jsxs(r.h1,{...l(.12),className:"display headline",children:["Antrean rapi,",a.jsx("br",{}),"kasir ngebut,",a.jsx("br",{}),"cuan ",a.jsx("span",{className:"mark",children:"kebaca"}),"."]}),a.jsx(r.p,{...l(.2),className:"lede",children:"Satu aplikasi buat ngurus seluruh barbershop kamu — dari giliran pelanggan, kasir, sampai laporan pemilik. Berhenti ngurus catatan, mulai ngurus pelanggan."}),a.jsxs(r.div,{...l(.28),className:"cta-row",children:[a.jsxs("a",{className:"btn btn-indigo lg cta-primary",href:"#",children:["Mulai gratis 14 hari ",a.jsx(d,{size:18,className:"cta-arrow"})]}),a.jsxs("a",{className:"link-cta",href:"#harga",children:["Lihat harga ",a.jsx(d,{size:15})]})]}),a.jsxs(r.p,{...l(.33),className:"reassure",children:[a.jsx(c,{size:13,strokeWidth:3})," Tanpa kartu kredit · siap pakai dalam 5 menit"]}),a.jsxs(r.div,{...l(.4),className:"figs",children:[a.jsxs("div",{className:"fig",children:[a.jsx("b",{children:"500+"}),a.jsx("span",{children:"barbershop aktif"})]}),a.jsxs("div",{className:"fig",children:[a.jsxs("b",{children:["4,9",a.jsx("i",{children:"★"})]}),a.jsx("span",{children:"rata-rata penilaian"})]}),a.jsxs("div",{className:"fig",children:[a.jsx("b",{children:"12rb"}),a.jsx("span",{children:"potongan / hari"})]})]})]}),a.jsx(A,{})]})})}function A(){return a.jsxs(r.div,{initial:{opacity:0,y:28},animate:{opacity:1,y:0},transition:{duration:.85,ease:o,delay:.25},className:"stage",children:[a.jsxs("div",{className:"stage-frame",children:[a.jsx("span",{className:"stage-panel","aria-hidden":!0}),a.jsx(L,{})]}),a.jsxs("p",{className:"stage-cap",children:[a.jsx("b",{children:"Dasbor pemilik."})," Pantau omzet & antrean semua cabang, langsung dari HP."]})]})}function L(){const e=[38,52,44,70,58,86,64];return a.jsxs("div",{className:"dash",children:[a.jsxs("div",{className:"chrome",children:[a.jsxs("span",{className:"chrome-dots",children:[a.jsx("i",{}),a.jsx("i",{}),a.jsx("i",{})]}),a.jsx("span",{className:"chrome-url",children:"barberque.sembapos.com"})]}),a.jsxs("div",{className:"dash-body",children:[a.jsxs("div",{className:"dash-top",children:[a.jsxs("div",{className:"dash-id",children:[a.jsx("span",{className:"dash-logo",children:a.jsx(x,{size:13})}),a.jsxs("div",{children:[a.jsx("b",{children:"Barberque Kemang"}),a.jsx("small",{children:"Cabang Jakarta"})]})]}),a.jsxs("span",{className:"live",children:[a.jsx("span",{className:"ping",children:a.jsx("span",{})}),"Live"]})]}),a.jsxs("div",{className:"kpis",children:[a.jsxs("div",{className:"kpi",children:[a.jsx("small",{children:"Omzet hari ini"}),a.jsxs("b",{className:"num",children:["Rp ",a.jsx(m,{to:482e4,format:i=>Math.round(i/1e3).toLocaleString("id-ID")+"rb"})]}),a.jsxs("span",{className:"delta up",children:[a.jsx(b,{size:11})," +12%"]})]}),a.jsxs("div",{className:"kpi",children:[a.jsx("small",{children:"Antrean"}),a.jsx("b",{className:"num",children:a.jsx(m,{to:6,duration:1})}),a.jsx("span",{className:"delta",children:"2 lagi diproses"})]}),a.jsxs("div",{className:"kpi",children:[a.jsx("small",{children:"Booking"}),a.jsx("b",{className:"num",children:a.jsx(m,{to:14,duration:1.1})}),a.jsx("span",{className:"delta up",children:"hari ini"})]})]}),a.jsxs("div",{className:"chart",children:[a.jsxs("div",{className:"chart-head",children:[a.jsx("small",{children:"Omzet 7 hari"}),a.jsx("small",{className:"muted",children:"Sen–Min"})]}),a.jsx("div",{className:"bars",children:e.map((i,n)=>a.jsx(r.span,{initial:{height:0},animate:{height:`${i}%`},transition:{delay:.7+n*.07,duration:.7,ease:o},className:n===5?"bar peak":"bar"},n))})]}),a.jsxs("div",{className:"lead",children:[a.jsxs("div",{className:"lead-head",children:[a.jsx(q,{size:13})," Barber terlaris"]}),[["Rizky","2,1jt",92],["Dimas","1,7jt",74],["Bayu","1,3jt",58]].map(([i,n,t],s)=>a.jsxs("div",{className:"lead-row",children:[a.jsx("span",{className:"rank",children:s+1}),a.jsx("span",{className:"lead-name",children:i}),a.jsx("div",{className:"lead-track",children:a.jsx(r.span,{initial:{width:0},animate:{width:`${t}%`},transition:{delay:1+s*.12,duration:.7,ease:o}})}),a.jsx("b",{className:"lead-val",children:n})]},i))]})]})]})}function M(){const e=["Tutup buku 30 detik","Antrean online","Multi-cabang satu layar","Struk via WhatsApp","Laporan otomatis","Komisi barber otomatis","Loyalti pelanggan"],i=[...e,...e];return a.jsx("div",{className:"marquee","aria-hidden":!0,children:a.jsx("div",{className:"marquee-track",children:i.map((n,t)=>a.jsxs("span",{className:"mq-item",children:[n,a.jsx("i",{className:"mq-dot"})]},t))})})}const D=[{k:"big",icon:x,title:"Kasir khusus barbershop",desc:"Catat layanan, produk, sampai komisi barber sekali tap. Antrean nggak numpuk, transaksi kelar dalam hitungan detik.",accent:"indigo"},{k:"tall",icon:z,title:"Booking & antrian online",desc:"Pelanggan booking sendiri lewat link toko. Giliran rapi otomatis, nggak ada lagi rebutan kursi.",accent:"mint"},{k:"s",icon:w,title:"Banyak cabang, satu layar",desc:"Pantau semua cabang dari satu dashboard.",accent:"indigo"},{k:"s",icon:b,title:"Laporan yang ngerti sendiri",desc:"Omzet, layanan terlaris, performa barber — kebaca otomatis tanpa Excel.",accent:"gold"},{k:"s",icon:N,title:"WhatsApp otomatis",desc:"Konfirmasi booking & struk mampir langsung ke WhatsApp pelanggan.",accent:"mint"},{k:"s",icon:h,title:"Loyalti pelanggan",desc:"Poin & pelanggan setia tercatat otomatis, bikin mereka balik lagi.",accent:"gold"}];function I(){return a.jsxs("section",{id:"fitur",className:"bento-wrap",children:[a.jsx(g,{kicker:"Satu paket, semua beres",title:a.jsxs(a.Fragment,{children:["Semua yang barbershop kamu butuhin —",a.jsx("br",{}),a.jsx("span",{className:"hl hl-indigo",children:"tanpa"})," spreadsheet."]})}),a.jsx("div",{className:"bento",children:D.map((e,i)=>a.jsxs(r.article,{initial:{y:30,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0,margin:"-60px"},transition:{duration:.6,ease:o,delay:i%3*.08},className:`tile tile-${e.k} acc-${e.accent}`,children:[a.jsxs("div",{className:"tile-top",children:[a.jsx("span",{className:"tile-icon",children:a.jsx(e.icon,{size:20,strokeWidth:2.2})}),a.jsx("span",{className:"tile-no",children:String(i+1).padStart(2,"0")})]}),a.jsx("h3",{className:"display",children:e.title}),a.jsx("p",{children:e.desc}),e.k==="big"&&a.jsxs("div",{className:"tile-chips",children:[a.jsxs("span",{children:[a.jsx(S,{size:12})," Tap cepat"]}),a.jsxs("span",{children:[a.jsx(c,{size:12})," Komisi auto"]}),a.jsxs("span",{children:[a.jsx(k,{size:12})," Struk instan"]})]})]},e.title))})]})}function g({kicker:e,title:i,center:n}){return a.jsxs(r.div,{initial:{y:20,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0},transition:{duration:.6,ease:o},className:`sec-head${n?" sec-head-center":""}`,children:[a.jsxs("span",{className:"kicker",children:[a.jsx("i",{})," ",e]}),a.jsx("h2",{className:"display",children:i})]})}function O(){return a.jsx("section",{id:"harga",className:"closer",children:a.jsxs("div",{className:"closer-card",children:[a.jsx("div",{className:"closer-pole","aria-hidden":!0}),a.jsxs(r.div,{initial:{y:24,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0},transition:{duration:.7,ease:o},className:"closer-inner",children:[a.jsxs("span",{className:"badge badge-dark",children:[a.jsx("span",{className:"ping",children:a.jsx("span",{})})," Gratis 14 hari · tanpa kartu kredit"]}),a.jsxs("h2",{className:"display closer-title",children:["Siap bikin barbershop kamu",a.jsx("br",{})," makin ",a.jsx("span",{className:"hl hl-gold",children:"rapi"})," & ",a.jsx("span",{className:"hl hl-mint",children:"cuan"}),"?"]}),a.jsx("p",{children:"Daftar sekarang, toko kamu bisa jalan hari ini juga. Beneran."}),a.jsxs("div",{className:"cta-row center",children:[a.jsxs("a",{className:"btn btn-light lg",href:"#",children:["Mulai gratis sekarang ",a.jsx(d,{size:18})]}),a.jsx("a",{className:"btn btn-ghost-light lg",href:"#",children:"Ngobrol dulu via WhatsApp"})]})]})]})})}const T=[{name:"Basic",price:99e3,tag:"Pas buat barbershop yang baru mulai rapi-rapi.",inherit:null,lines:["Kasir & transaksi tanpa batas","Booking + antrian online","Data pelanggan & layanan","Laporan omzet harian","1 cabang"]},{name:"Pro",price:199e3,tag:"Buat toko yang sudah ramai dan pengin tumbuh lebih cepat.",inherit:"Basic",featured:!0,lines:["Struk & konfirmasi via WhatsApp","Komisi barber otomatis","Loyalti & poin pelanggan","Sampai 3 cabang","Laporan performa barber"]},{name:"Enterprise",price:399e3,tag:"Skala besar, banyak cabang, semua fitur kebuka.",inherit:"Pro",lines:["Cabang tanpa batas","Absensi & GPS staf","Backup data terjadwal","Dukungan prioritas","Semua fitur kebuka"]}];function W(){return a.jsxs("section",{id:"harga",className:"price-wrap",children:[a.jsx(g,{kicker:"Paket Harga",title:a.jsxs(a.Fragment,{children:["Harga jelas, ",a.jsx("span",{className:"hl hl-mint",children:"tanpa"})," kejutan."]}),center:!0}),a.jsx("p",{className:"sec-sub",children:"Mulai gratis 14 hari. Bayar cuma kalau toko makin ramai — bisa naik paket kapan saja."}),a.jsx("div",{className:"plans",children:T.map((e,i)=>{const n=Math.round(e.price*12*.83/1e3)*1e3;return a.jsxs(r.div,{initial:{y:30,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0,margin:"-60px"},transition:{duration:.6,ease:o,delay:i*.08},className:`plan ${e.featured?"plan-feat":""}`,children:[e.featured&&a.jsxs("span",{className:"plan-ribbon",children:[a.jsx(h,{size:11,fill:"currentColor"})," Paling banyak dipilih"]}),a.jsx("h3",{className:"display plan-name",children:e.name}),a.jsx("p",{className:"plan-tag",children:e.tag}),a.jsxs("div",{className:"plan-price",children:[a.jsxs("b",{className:"display",children:["Rp",(e.price/1e3).toLocaleString("id-ID"),"rb"]}),a.jsx("span",{children:"/bulan"})]}),a.jsxs("p",{className:"plan-annual",children:["Tahunan Rp",(n/1e3).toLocaleString("id-ID"),"rb — hemat 17%"]}),a.jsx("div",{className:"plan-div"}),e.inherit&&a.jsxs("p",{className:"plan-inherit",children:["Semua di paket ",e.inherit,", plus:"]}),a.jsx("ul",{className:"plan-lines",children:e.lines.map(t=>a.jsxs("li",{children:[a.jsx("span",{className:"tick",children:a.jsx(c,{size:11,strokeWidth:3.2})}),t]},t))}),a.jsxs("a",{className:`btn lg plan-cta ${e.featured?"btn-indigo":"btn-ink"}`,href:"#",children:["Pilih ",e.name," ",a.jsx(d,{size:16})]}),a.jsxs("p",{className:"plan-foot",children:[a.jsx(c,{size:12,strokeWidth:3})," Gratis 14 hari · tanpa kartu kredit"]})]},e.name)})}),a.jsxs("p",{className:"price-note",children:[a.jsx(k,{size:14})," Semua paket sudah termasuk SSL, keamanan data, update gratis & dukungan tim kami."]})]})}const H=[{m:"Dulu tutup buku bisa sejam, sekarang 5 menit kelar. Barber juga seneng komisinya kebaca jelas tiap hari.",n:"Reza Maulana",r:"Owner",b:"Kapten Barber, Bekasi",t:4},{m:"Pelanggan booking sendiri lewat link, antrean jadi rapi banget. Nggak ada lagi drama rebutan giliran pas rame.",n:"Dimas Prayoga",r:"Owner",b:"Gentlemen Cut, Depok",t:3},{m:"Punya 4 cabang, sekarang semua kepantau dari HP. Tahu cabang mana paling cuan tanpa harus keliling.",n:"Bayu Saputra",r:"Pemilik",b:"Pangkas Bro, Bandung",t:5}];function K(){return a.jsx("section",{id:"cerita",className:"testi-wrap",children:a.jsxs("div",{className:"testi-inner",children:[a.jsx(g,{kicker:"Cerita Owner",title:a.jsxs(a.Fragment,{children:["Mereka pindah dari buku catatan —",a.jsx("br",{}),a.jsx("span",{className:"hl hl-gold",children:"dan"})," nggak mau balik lagi."]})}),a.jsx("div",{className:"testi-grid",children:H.map((e,i)=>a.jsxs(r.figure,{initial:{y:28,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0,margin:"-50px"},transition:{duration:.6,ease:o,delay:i*.1},className:"testi",children:[a.jsx("div",{className:"testi-stars",children:Array.from({length:5}).map((n,t)=>a.jsx(h,{size:14,fill:"currentColor"},t))}),a.jsxs("blockquote",{children:["“",e.m,"”"]}),a.jsxs("figcaption",{children:[a.jsx("span",{className:"testi-av",style:{background:["#6366F1","#10B981","#C9A84C"][i%3]},children:e.n[0]}),a.jsxs("span",{className:"testi-who",children:[a.jsx("b",{children:e.n}),a.jsxs("small",{children:[e.r," · ",e.b]})]})]})]},e.n))})]})})}const R=[{q:"Perlu install aplikasi atau alat khusus?",a:"Nggak. SembaPOS jalan langsung di browser HP, tablet, atau komputer. Cukup buka, login, langsung pakai. Mau cetak struk pun bisa lewat printer Bluetooth biasa."},{q:"Data toko saya aman?",a:"Aman. Semua data dienkripsi, di-backup otomatis, dan tiap orang (owner/kasir/barber) punya akses sesuai perannya. Datamu nggak bisa dilihat toko lain."},{q:"Ribet nggak buat pindah dari catatan manual?",a:"Gampang banget. Daftar cuma semenit, ada checklist panduan, dan toko bisa jalan hari itu juga. Kalau bingung, tim kami bantu lewat WhatsApp."},{q:"Kalau punya banyak cabang gimana?",a:"Bisa. Pantau semua cabang dari satu dashboard, lengkap dengan perbandingan omzet per cabang. Mulai paket Pro untuk 3 cabang, atau Enterprise untuk tanpa batas."},{q:"Bisa berhenti kapan saja?",a:"Bisa, tanpa penalti. Coba dulu gratis 14 hari tanpa kartu kredit. Lanjut cuma kalau kamu merasa terbantu."}];function G(){const[e,i]=p.useState(0);return a.jsxs("section",{className:"faq-wrap",children:[a.jsx(g,{kicker:"Tanya Jawab",title:a.jsxs(a.Fragment,{children:["Masih ragu? ",a.jsx("span",{className:"hl hl-indigo",children:"Wajar"})," kok."]}),center:!0}),a.jsx("div",{className:"faq-list",children:R.map((n,t)=>{const s=e===t;return a.jsxs(r.div,{initial:{y:16,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0},transition:{duration:.5,ease:o,delay:t*.04},className:`faq ${s?"faq-open":""}`,children:[a.jsxs("button",{className:"faq-q",onClick:()=>i(s?-1:t),children:[a.jsx("span",{className:"display",children:n.q}),a.jsx("span",{className:"faq-sign",children:s?"−":"+"})]}),a.jsx(r.div,{initial:!1,animate:{height:s?"auto":0,opacity:s?1:0},transition:{duration:.32,ease:o},className:"faq-a-wrap",children:a.jsx("p",{className:"faq-a",children:n.a})})]},t)})}),a.jsxs("p",{className:"faq-help",children:["Belum nemu jawabannya? ",a.jsx("a",{href:"#",children:"Chat tim kami via WhatsApp →"})]})]})}function V(){return a.jsxs("footer",{className:"foot",children:[a.jsxs("div",{className:"foot-brand",children:[a.jsx("span",{className:"brand-mark sm",children:a.jsx(x,{size:13})}),"Semba",a.jsx("span",{className:"brand-accent",children:"POS"})]}),a.jsx("p",{children:"Pratinjau desain landing · belum tersambung ke konten asli."})]})}const $=`
.semba-preview{
  --ink:#0E0E1A; --ink-soft:#3A3950; --mute:#6B6A82;
  --indigo:#6366F1; --indigo-deep:#4F46E5; --mint:#10B981; --gold:#C9A84C;
  --canvas:#F4F4FB; --paper:#FFFFFF; --line:#E4E4F0;
  --display:'Schibsted Grotesk', ui-sans-serif, sans-serif;
  --body:'Hanken Grotesk', ui-sans-serif, sans-serif;
  position:relative; min-height:100vh; background:var(--canvas);
  color:var(--ink); font-family:var(--body); overflow-x:clip;
  -webkit-font-smoothing:antialiased;
}
.semba-preview *{box-sizing:border-box;}
.semba-preview .display{font-family:var(--display); letter-spacing:-0.02em;}
.semba-preview a{text-decoration:none; color:inherit;}

/* atmosphere — crisp & editorial, ZERO blur (blur glow = ciri AI) */
.bg-atmos{position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0;}
.dots{position:absolute; inset:0;
  background-image:radial-gradient(#1e1b4e10 1px, transparent 1.5px);
  background-size:23px 23px;
  mask-image:linear-gradient(to bottom, #000 0, #000 560px, transparent 820px);}
.rule-top{position:absolute; top:0; left:0; right:0; height:4px;
  background:linear-gradient(90deg, var(--indigo) 0 33%, var(--mint) 33% 66%, var(--gold) 66% 100%);}

/* shared atoms */
.btn{display:inline-flex; align-items:center; gap:8px; font-weight:700; font-family:var(--body);
  border-radius:999px; padding:11px 20px; font-size:14px; cursor:pointer; transition:transform .15s, box-shadow .2s, background .2s; white-space:nowrap;}
.btn:active{transform:translateY(1px) scale(.99);}
.btn.lg{padding:15px 26px; font-size:15.5px;}
.btn-indigo{background:var(--indigo); color:#fff;}
.btn-indigo:hover{background:var(--indigo-deep);}
.btn-ink{background:var(--ink); color:#fff;}
.btn-ink:hover{transform:translateY(-1px);}
.btn-line{background:transparent; color:var(--ink); border:1.5px solid var(--line);}
.btn-line:hover{border-color:var(--indigo); color:var(--indigo);}
.btn-light{background:#fff; color:var(--ink); box-shadow:0 14px 36px -12px #0006;}
.btn-light:hover{transform:translateY(-1px);}
.btn-ghost-light{background:#ffffff1a; color:#fff; border:1.5px solid #ffffff33;}
.btn-ghost-light:hover{background:#ffffff2a;}

.badge{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600;
  color:var(--indigo-deep); background:#6366F112; border:1px solid #6366F126;
  padding:7px 13px; border-radius:999px;}
.badge-dark{color:#fff; background:#ffffff14; border-color:#ffffff26;}
.ping{position:relative; width:8px; height:8px; display:inline-flex;}
.ping span{position:absolute; inset:0; border-radius:50%; background:var(--mint);}
.ping::after{content:''; position:absolute; inset:0; border-radius:50%; background:var(--mint); animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite;}
@keyframes ping{75%,100%{transform:scale(2.4); opacity:0;}}

.hl{font-style:normal; position:relative; white-space:nowrap;}
.hl-indigo{color:var(--indigo);}
.hl-mint{color:var(--mint);}
.hl-gold{color:var(--gold);}
/* highlighter-marker — kesan ditandai tangan, bukan gradient generik */
.mark{display:inline-block; position:relative; color:var(--ink); z-index:0;}
.mark::after{content:''; position:absolute; left:-3px; right:-3px; bottom:.07em; height:.30em;
  background:var(--mint); opacity:.34; border-radius:3px; transform:rotate(-1.4deg); z-index:-1;}

/* eyebrow editorial */
.eyebrow{display:inline-flex; align-items:center; gap:11px; font-size:11.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.16em; color:var(--ink-soft);}
.eyebrow-bar{width:26px; height:2px; background:var(--ink); flex:none;}

/* editorial figures (ganti avatar-cluster + bintang) */
.figs{display:flex; align-items:stretch; margin-top:34px;}
.fig{padding-right:24px; margin-right:24px; border-right:1px solid var(--line);}
.fig:last-child{border-right:none; margin-right:0; padding-right:0;}
.fig b{display:block; font-family:var(--display); font-size:27px; font-weight:800; letter-spacing:-0.03em; line-height:1;}
.fig b i{font-style:normal; color:var(--gold); font-size:18px;}
.fig span{font-size:12px; color:var(--mute); margin-top:5px; display:block;}

/* nav */
.nav{position:relative; z-index:5; max-width:1180px; margin:0 auto; padding:22px 24px;
  display:flex; align-items:center; justify-content:space-between; gap:20px;}
.brand{display:inline-flex; align-items:center; gap:10px; font-weight:800; font-size:19px; font-family:var(--display);}
.brand-mark{display:grid; place-items:center; width:30px; height:30px; border-radius:9px;
  background:linear-gradient(135deg, var(--indigo), var(--indigo-deep)); color:#fff; box-shadow:0 8px 18px -8px #6366F1cc;}
.brand-mark.sm{width:24px;height:24px;border-radius:7px;}
.brand-accent{color:var(--indigo);}
.nav-links{display:flex; gap:26px; font-size:14.5px; font-weight:500; color:var(--ink-soft);}
.nav-links a:hover{color:var(--indigo);}
.nav-cta{display:flex; align-items:center; gap:14px;}
.nav-cta .ghost{font-size:14.5px; font-weight:600; color:var(--ink-soft);}
.nav-cta .ghost:hover{color:var(--ink);}
@media(max-width:860px){.nav-links{display:none;} }

/* hero */
.hero{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:56px 24px 44px;}
.hero-grid{display:grid; grid-template-columns:1.06fr .94fr; gap:clamp(40px,5vw,64px); align-items:center;}
@media(max-width:960px){.hero-grid{grid-template-columns:1fr; gap:48px;} }
.headline{font-size:clamp(43px, 6.8vw, 84px); font-weight:800; line-height:.95; letter-spacing:-0.035em; margin:22px 0 0;}
.lede{font-size:clamp(16px,2.1vw,19px); line-height:1.62; color:var(--ink-soft); max-width:29em; margin:24px 0 0;}
.cta-row{display:flex; align-items:center; gap:18px; margin-top:32px; flex-wrap:wrap;}
.cta-primary .cta-arrow{transition:transform .2s;}
.cta-primary:hover .cta-arrow{transform:translateX(3px);}
.link-cta{display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:15px; color:var(--ink);}
.link-cta svg{transition:transform .2s;}
.link-cta:hover{color:var(--indigo);}
.link-cta:hover svg{transform:translateX(3px);}
.reassure{display:inline-flex; align-items:center; gap:7px; margin-top:16px; font-size:13px; color:var(--mute);}
.reassure svg{color:var(--mint); flex:none;}
.cta-row.center{justify-content:center;}
.trust{display:flex; align-items:center; gap:14px; margin-top:30px;}
.avatars{display:flex;}
.avatars span{width:34px;height:34px;border-radius:50%; border:2.5px solid var(--canvas); margin-left:-10px;
  box-shadow:0 2px 6px #0002;}
.avatars span:first-child{margin-left:0;}
.trust-txt{font-size:13px; color:var(--mute); line-height:1.3;}
.trust-txt b{color:var(--ink);}
.stars{display:flex; gap:1px; color:var(--gold); margin-bottom:2px;}
.stars svg{fill:var(--gold);}

/* hero stage — kartu jujur di atas blok warna (editorial), tanpa kartu mengambang */
.stage{position:relative; margin-top:6px;}
.stage-frame{position:relative;}
.stage-panel{position:absolute; top:18px; left:18px; right:-14px; bottom:-14px; border-radius:20px;
  background:var(--ink); z-index:0;
  background-image:repeating-linear-gradient(45deg, #ffffff0a 0 10px, transparent 10px 20px);}
.stage-cap{position:relative; z-index:2; margin:26px 2px 0 4px; font-size:13px; color:var(--mute); line-height:1.5; max-width:30em;}
.stage-cap b{color:var(--ink); font-weight:700;}

.dash{position:relative; z-index:2; background:var(--paper); border:1px solid var(--line);
  border-radius:20px; overflow:hidden; box-shadow:0 28px 56px -34px #1e1b4e4d;}
.chrome{display:flex; align-items:center; gap:12px; padding:11px 15px; border-bottom:1px solid var(--line); background:#fafaff;}
.chrome-dots{display:flex; gap:6px; flex:none;}
.chrome-dots i{width:9px;height:9px;border-radius:50%; background:#d8d9ec;}
.chrome-url{flex:1; text-align:center; font-size:11px; color:var(--mute); background:#fff; border:1px solid var(--line);
  border-radius:7px; padding:4px 10px; max-width:240px; margin:0 auto;}
.dash-body{padding:16px;}
.dash-top{display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;}
.dash-id{display:flex; align-items:center; gap:10px;}
.dash-logo{display:grid; place-items:center; width:34px;height:34px;border-radius:10px; color:#fff;
  background:linear-gradient(135deg,#0E0E1A,#2a2745);}
.dash-id b{display:block; font-size:14px; font-family:var(--display); font-weight:700;}
.dash-id small{font-size:11.5px; color:var(--mute);}
.live{display:inline-flex; align-items:center; gap:7px; font-size:11.5px; font-weight:700; color:var(--mint);
  background:#10B98114; border:1px solid #10B98130; padding:5px 10px; border-radius:999px;}

.kpis{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;}
.kpi{background:var(--canvas); border:1px solid var(--line); border-radius:14px; padding:11px 12px;}
.kpi small{font-size:10.5px; color:var(--mute); text-transform:uppercase; letter-spacing:.04em; font-weight:600;}
.kpi .num{display:block; font-family:var(--display); font-weight:800; font-size:19px; margin:3px 0 2px; letter-spacing:-0.02em;}
.kpi .delta{font-size:11px; color:var(--mute); font-weight:600;}
.kpi .delta.up{color:var(--mint); display:inline-flex; align-items:center; gap:3px;}

.chart{background:var(--canvas); border:1px solid var(--line); border-radius:14px; padding:12px 13px 13px; margin-bottom:14px;}
.chart-head{display:flex; justify-content:space-between; margin-bottom:9px;}
.chart-head small{font-size:11px; font-weight:600; color:var(--ink-soft);}
.chart-head .muted{color:var(--mute); font-weight:500;}
.bars{display:flex; align-items:flex-end; gap:7px; height:66px;}
.bar{flex:1; border-radius:5px 5px 3px 3px; background:linear-gradient(to top,#c7c9f5,#a5a8f0); min-height:6px;}
.bar.peak{background:linear-gradient(to top,var(--indigo),#8b8df7); box-shadow:0 6px 14px -6px #6366f1aa;}

.lead{background:var(--canvas); border:1px solid var(--line); border-radius:14px; padding:12px 13px;}
.lead-head{display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; color:var(--gold); margin-bottom:9px;}
.lead-row{display:flex; align-items:center; gap:9px; margin-top:8px;}
.rank{width:17px;height:17px;border-radius:5px; background:#0E0E1A; color:#fff; font-size:10px; font-weight:700; display:grid; place-items:center;}
.lead-name{font-size:12.5px; font-weight:600; width:46px;}
.lead-track{flex:1; height:6px; border-radius:99px; background:#e6e6f2; overflow:hidden;}
.lead-track span{display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,var(--indigo),var(--mint));}
.lead-val{font-size:12px; font-family:var(--display); font-weight:700; width:42px; text-align:right;}

/* marquee */
.marquee{position:relative; z-index:2; margin-top:46px; padding:16px 0; background:var(--ink); color:#fff; overflow:hidden;
  border-top:1px solid #ffffff10; border-bottom:1px solid #ffffff10;}
.marquee-track{display:flex; width:max-content; animation:scroll 30s linear infinite;}
.mq-item{display:inline-flex; align-items:center; font-family:var(--display); font-weight:700; font-size:17px; letter-spacing:-0.01em; padding:0 4px;}
.mq-dot{display:inline-block; width:7px;height:7px;border-radius:50%; background:var(--mint); margin:0 26px;}
@keyframes scroll{to{transform:translateX(-50%);}}

/* bento */
.bento-wrap{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:86px 24px;}
.sec-head{max-width:680px; margin-bottom:40px;}
.kicker{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; text-transform:uppercase;
  letter-spacing:.08em; color:var(--indigo);}
.kicker i{width:22px; height:2px; border-radius:2px; background:var(--indigo);}
.sec-head h2{font-size:clamp(30px,4.6vw,50px); font-weight:800; line-height:1.04; margin-top:14px;}
.bento{display:grid; grid-template-columns:repeat(3,1fr); gap:16px;}
@media(max-width:840px){.bento{grid-template-columns:repeat(2,1fr);} }
@media(max-width:560px){.bento{grid-template-columns:1fr;} }
.tile{position:relative; background:var(--paper); border:1px solid var(--line); border-radius:20px; padding:24px;
  transition:transform .25s, box-shadow .25s, border-color .25s; overflow:hidden;}
.tile:hover{transform:translateY(-4px); box-shadow:0 26px 50px -28px #1e1b4e40; border-color:#cfd0ee;}
.tile h3{font-size:18.5px; font-weight:700; margin:16px 0 8px;}
.tile p{font-size:14px; line-height:1.55; color:var(--ink-soft);}
.tile-big{grid-column:span 2; padding:30px;}
.tile-big h3{font-size:24px;}
.tile-big p{font-size:15.5px; max-width:34em;}
.tile-tall{grid-row:span 2; display:flex; flex-direction:column;}
.tile-tall p{flex:1;}
@media(max-width:840px){.tile-big{grid-column:span 2;} .tile-tall{grid-row:span 1;} }
@media(max-width:560px){.tile-big,.tile-tall{grid-column:span 1;} }
.tile-top{display:flex; align-items:center; justify-content:space-between;}
.tile-no{font-family:var(--display); font-size:13px; font-weight:800; letter-spacing:.06em; color:#cdd0ea;}
.tile-icon{display:grid; place-items:center; width:46px;height:46px; border-radius:13px; color:#fff;}
.acc-indigo .tile-icon{background:linear-gradient(135deg,var(--indigo),var(--indigo-deep));}
.acc-mint .tile-icon{background:linear-gradient(135deg,var(--mint),#0c9b6e);}
.acc-gold .tile-icon{background:linear-gradient(135deg,var(--gold),#b08f3a);}
.acc-indigo{background:linear-gradient(180deg,#fbfbff,#f3f3fd);}
.tile-chips{display:flex; gap:8px; flex-wrap:wrap; margin-top:18px;}
.tile-chips span{display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:var(--ink-soft);
  background:#6366F10e; border:1px solid #6366F11f; padding:5px 11px; border-radius:999px;}

/* closer */
.closer{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:0 24px 90px;}
.closer-card{position:relative; border-radius:30px; overflow:hidden; padding:72px 28px; text-align:center;
  background:radial-gradient(120% 130% at 80% 0%, #2c2858 0%, #0E0E1A 60%);}
.closer-pole{position:absolute; inset:0; opacity:.5; pointer-events:none;
  background:repeating-linear-gradient(45deg,#6366F11f 0 18px,#10B9811a 18px 36px,transparent 36px 72px);
  mask-image:radial-gradient(120% 120% at 80% 0%, #000, transparent 65%);}
.closer-inner{position:relative;}
.closer-title{font-size:clamp(30px,5vw,52px); font-weight:800; color:#fff; line-height:1.05; margin:20px 0 0;}
.closer p{color:#c7c6dd; font-size:16px; margin:16px 0 0;}
.closer .cta-row{margin-top:28px;}

/* footer */
.foot{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:26px 24px 50px;
  display:flex; align-items:center; justify-content:space-between; gap:16px; color:var(--mute); font-size:13px; flex-wrap:wrap;}
.foot-brand{display:inline-flex; align-items:center; gap:9px; font-family:var(--display); font-weight:800; font-size:16px; color:var(--ink);}

/* section head variants */
.sec-head-center{text-align:center; margin-left:auto; margin-right:auto;}
.sec-head-center .kicker{justify-content:center;}
.sec-sub{text-align:center; max-width:38em; margin:14px auto 0; color:var(--ink-soft); font-size:16px; line-height:1.55;}

/* pricing */
.price-wrap{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:30px 24px 92px;}
.plans{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:44px; align-items:start;}
.plan{position:relative; background:var(--paper); border:1px solid var(--line); border-radius:22px; padding:28px; display:flex; flex-direction:column; transition:transform .25s, box-shadow .25s;}
.plan:hover{transform:translateY(-5px); box-shadow:0 32px 64px -32px #1e1b4e44;}
.plan-feat{background:radial-gradient(130% 130% at 50% 0%, #2c2858 0%, #0E0E1A 72%); border-color:#2c2858; color:#cfceea; box-shadow:0 36px 70px -30px #1e1b4e88;}
@media(min-width:841px){.plan-feat{margin-top:-16px; margin-bottom:-16px; padding-top:40px; padding-bottom:40px;}}
.plan-ribbon{position:absolute; top:-12px; left:50%; transform:translateX(-50%); display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; background:var(--indigo); color:#fff; padding:5px 13px; border-radius:999px; white-space:nowrap; box-shadow:0 10px 22px -8px #6366f1cc;}
.plan-name{font-size:22px; font-weight:800;}
.plan-feat .plan-name{color:#fff;}
.plan-tag{font-size:13px; color:var(--mute); margin-top:6px; min-height:38px; line-height:1.45;}
.plan-feat .plan-tag{color:#a5a2c8;}
.plan-price{display:flex; align-items:flex-end; gap:7px; margin-top:16px;}
.plan-price b{font-size:38px; font-weight:800; line-height:1;}
.plan-feat .plan-price b{color:#fff;}
.plan-price span{font-size:13px; color:var(--mute); padding-bottom:3px;}
.plan-annual{font-size:12px; color:var(--indigo-deep); font-weight:600; margin-top:7px;}
.plan-feat .plan-annual{color:#a5a2ff;}
.plan-div{height:1px; background:var(--line); margin:22px 0;}
.plan-feat .plan-div{background:#ffffff14;}
.plan-inherit{font-size:12px; font-weight:700; color:var(--indigo-deep); margin-bottom:12px;}
.plan-feat .plan-inherit{color:#a5a2ff;}
.plan-lines{list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:12px; flex:1;}
.plan-lines li{display:flex; align-items:flex-start; gap:10px; font-size:13.5px; color:var(--ink-soft); line-height:1.4;}
.plan-feat .plan-lines li{color:#cfceea;}
.tick{margin-top:1px; flex:none; width:17px;height:17px;border-radius:50%; display:grid; place-items:center; background:#e8eaf5; color:var(--indigo-deep);}
.plan-feat .tick{background:var(--indigo); color:#fff;}
.plan-cta{width:100%; justify-content:center;}
.plan-foot{display:inline-flex; align-items:center; justify-content:center; gap:6px; width:100%; margin-top:12px; font-size:11px; color:var(--mute);}
.plan-feat .plan-foot{color:#a5a2c8;}
.price-note{display:flex; align-items:center; justify-content:center; gap:8px; margin-top:40px; font-size:13px; color:var(--mute); text-align:center;}
.price-note svg{color:var(--gold); flex:none;}
@media(max-width:840px){.plans{grid-template-columns:1fr; max-width:400px; margin-left:auto; margin-right:auto;}}

/* testimonials */
.testi-wrap{position:relative; z-index:2; background:#ECECF6; padding:84px 0; margin-top:10px;}
.testi-inner{max-width:1180px; margin:0 auto; padding:0 24px;}
.testi-grid{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:40px; align-items:start;}
.testi{background:#fff; border:1px solid var(--line); border-radius:20px; padding:24px; display:flex; flex-direction:column;
  box-shadow:0 20px 44px -30px #1e1b4e3a; transition:transform .25s, box-shadow .25s;}
.testi:hover{transform:translateY(-4px); box-shadow:0 28px 54px -28px #1e1b4e4a;}
.testi-stars{display:flex; gap:2px; margin-bottom:13px; color:var(--gold);}
.testi-stars svg{fill:var(--gold);}
.testi blockquote{font-size:15.5px; line-height:1.6; color:var(--ink); margin:0; flex:1; font-weight:500;}
.testi figcaption{display:flex; align-items:center; gap:11px; margin-top:18px; padding-top:16px; border-top:1px solid var(--line);}
.testi-av{width:38px;height:38px;border-radius:50%; display:grid; place-items:center; color:#fff; font-weight:700; font-family:var(--display); font-size:15px; flex:none;}
.testi-who{display:flex; flex-direction:column; min-width:0;}
.testi-who b{font-size:13.5px;}
.testi-who small{font-size:12px; color:var(--mute);}
@media(max-width:840px){.testi-grid{grid-template-columns:1fr; max-width:440px; margin-left:auto; margin-right:auto;}}

/* faq */
.faq-wrap{position:relative; z-index:2; max-width:760px; margin:0 auto; padding:88px 24px 92px;}
.faq-list{margin-top:38px; display:flex; flex-direction:column; gap:12px;}
.faq{background:var(--paper); border:1px solid var(--line); border-radius:16px; overflow:hidden; transition:border-color .2s, box-shadow .25s;}
.faq-open{border-color:#cfd0ee; box-shadow:0 18px 40px -28px #1e1b4e40;}
.faq-q{width:100%; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 20px;
  background:none; border:none; cursor:pointer; text-align:left; font-size:15.5px; font-weight:700; color:var(--ink); font-family:var(--display);}
.faq-sign{font-size:24px; color:var(--indigo); line-height:1; flex:none; font-family:var(--body); font-weight:400;}
.faq-a-wrap{overflow:hidden;}
.faq-a{padding:0 20px 20px; font-size:14.5px; line-height:1.62; color:var(--ink-soft); margin:0;}
.faq-help{text-align:center; margin-top:30px; font-size:14px; color:var(--mute);}
.faq-help a{color:var(--indigo); font-weight:600;}
`;export{ea as default};
