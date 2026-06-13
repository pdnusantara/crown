import{j as a,r as p,m as r,S as d,A as c,k as x,B as N,T as u,M as b}from"./index-D7a1bEzN.js";import{C as k}from"./calendar-clock-D4lOV_dE.js";import{Z as z}from"./zap-CUaV_CUg.js";import{C as h}from"./check-CZtMs52l.js";import{S as v}from"./sparkles-BmZNmU74.js";import{C as q}from"./crown-B7SMsDKi.js";import{u as C}from"./use-in-view-CFhTPPDd.js";import{a as S}from"./index-SwAuOLvL.js";const f="semba-preview-b-fonts";function B(){p.useEffect(()=>{if(document.getElementById(f))return;const i=document.createElement("link");i.id=f,i.rel="stylesheet",i.href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap",document.head.appendChild(i)},[])}const s=[.22,1,.36,1],l=(i=0)=>({initial:{y:26,opacity:0},animate:{y:0,opacity:1},transition:{duration:.75,ease:s,delay:i}});function m({to:i,format:e=t=>Math.round(t).toLocaleString("id-ID"),duration:n=1.4}){const t=p.useRef(null),o=C(t,{once:!0,margin:"-40px"}),[j,w]=p.useState(0);return p.useEffect(()=>{if(!o)return;const y=S(0,i,{duration:n,ease:s,onUpdate:w});return()=>y.stop()},[o,i,n]),a.jsx("span",{ref:t,children:e(j)})}function aa(){return B(),a.jsxs("div",{className:"sbb",children:[a.jsx("style",{children:V}),a.jsxs("div",{className:"atmos","aria-hidden":!0,children:[a.jsx("div",{className:"orb orb-i"}),a.jsx("div",{className:"orb orb-m"}),a.jsx("div",{className:"orb orb-g"}),a.jsx("div",{className:"grid-lines"}),a.jsx("div",{className:"grain"})]}),a.jsx(A,{}),a.jsx(P,{}),a.jsx(E,{}),a.jsx(M,{}),a.jsx(O,{}),a.jsx(W,{}),a.jsx(G,{}),a.jsx(K,{}),a.jsx(R,{})]})}function A(){return a.jsxs(r.nav,{initial:{y:-22,opacity:0},animate:{y:0,opacity:1},transition:{duration:.6,ease:s},className:"nav",children:[a.jsxs("a",{className:"brand",href:"#",children:[a.jsx("span",{className:"bmark",children:a.jsx(d,{size:15,strokeWidth:2.6})}),"Semba",a.jsx("span",{className:"acc",children:"POS"})]}),a.jsxs("div",{className:"nlinks",children:[a.jsx("a",{href:"#fitur",children:"Fitur"}),a.jsx("a",{href:"#harga",children:"Harga"}),a.jsx("a",{href:"#cerita",children:"Cerita"})]}),a.jsxs("div",{className:"ncta",children:[a.jsx("a",{className:"ghost",href:"#",children:"Masuk"}),a.jsxs("a",{className:"btn btn-glow",href:"#",children:["Coba gratis ",a.jsx(c,{size:15})]})]})]})}function P(){return a.jsxs("header",{className:"hero",children:[a.jsxs(r.div,{...l(.05),className:"badge",children:[a.jsx("span",{className:"dot"})," Perangkat lunak barbershop kelas pro"]}),a.jsxs(r.h1,{...l(.12),className:"serif h1",children:["Barbershop kamu,",a.jsx("br",{}),a.jsx("span",{className:"ital gold",children:"dijalankan"})," seperti ",a.jsx("span",{className:"ul",children:"pro."})]}),a.jsx(r.p,{...l(.2),className:"lede",children:"Satu ruang kendali untuk antrean, kasir, cabang, dan laporan — rapi, cepat, dan kebaca. Biar kamu fokus ke kursi, bukan ke catatan."}),a.jsxs(r.div,{...l(.28),className:"cta-row",children:[a.jsxs("a",{className:"btn btn-glow lg",href:"#",children:["Mulai gratis 14 hari ",a.jsx(c,{size:18})]}),a.jsx("a",{className:"btn btn-out lg",href:"#harga",children:"Lihat harga"})]}),a.jsxs(r.div,{...l(.36),className:"trust",children:[a.jsx("div",{className:"avs",children:["#6366F1","#34D399","#C9A84C","#818CF8"].map((i,e)=>a.jsx("span",{style:{background:i,zIndex:4-e}},e))}),a.jsx("span",{className:"stars",children:Array.from({length:5}).map((i,e)=>a.jsx(x,{size:13,fill:"currentColor"},e))}),a.jsxs("span",{className:"trust-txt",children:[a.jsx("b",{children:"500+"})," barbershop sudah pindah"]})]}),a.jsx(F,{})]})}function F(){return a.jsxs(r.div,{initial:{opacity:0,y:40,scale:.96},animate:{opacity:1,y:0,scale:1},transition:{duration:.9,ease:s,delay:.3},className:"stage",children:[a.jsx("div",{className:"stage-glow","aria-hidden":!0}),a.jsx(D,{}),a.jsxs(r.div,{className:"chip chip-a",initial:{opacity:0,x:24},animate:{opacity:1,x:0,y:[0,-7,0]},transition:{x:{delay:1,duration:.6,ease:s},opacity:{delay:1,duration:.6},y:{delay:1.7,duration:4.6,repeat:1/0,ease:"easeInOut"}},children:[a.jsx("span",{className:"ci ci-i",children:a.jsx(k,{size:15})}),a.jsxs("div",{children:[a.jsx("b",{children:"Booking baru"}),a.jsx("small",{children:"Andi · 16.00"})]})]}),a.jsxs(r.div,{className:"chip chip-b",initial:{opacity:0,x:-24},animate:{opacity:1,x:0,y:[0,8,0]},transition:{x:{delay:1.25,duration:.6,ease:s},opacity:{delay:1.25,duration:.6},y:{delay:2,duration:5.2,repeat:1/0,ease:"easeInOut"}},children:[a.jsx("span",{className:"ci ci-m",children:a.jsx(b,{size:15})}),a.jsxs("div",{children:[a.jsx("b",{children:"Struk terkirim"}),a.jsx("small",{children:"WhatsApp ✓"})]})]})]})}function D(){const i=[40,54,46,72,60,88,66];return a.jsxs("div",{className:"dash",children:[a.jsxs("div",{className:"d-top",children:[a.jsxs("div",{className:"d-id",children:[a.jsx("span",{className:"d-logo",children:a.jsx(d,{size:12})}),a.jsxs("div",{children:[a.jsx("b",{children:"Barberque Kemang"}),a.jsx("small",{children:"Cabang Jakarta"})]})]}),a.jsxs("span",{className:"d-live",children:[a.jsx("span",{className:"dot"})," Live"]})]}),a.jsxs("div",{className:"d-kpis",children:[a.jsxs("div",{className:"d-kpi",children:[a.jsx("small",{children:"Omzet hari ini"}),a.jsxs("b",{children:["Rp ",a.jsx(m,{to:4820,format:e=>Math.round(e).toLocaleString("id-ID")+"rb"})]}),a.jsxs("span",{className:"up",children:[a.jsx(u,{size:10})," +12%"]})]}),a.jsxs("div",{className:"d-kpi",children:[a.jsx("small",{children:"Antrean"}),a.jsx("b",{children:a.jsx(m,{to:6,duration:1})}),a.jsx("span",{children:"2 diproses"})]}),a.jsxs("div",{className:"d-kpi",children:[a.jsx("small",{children:"Booking"}),a.jsx("b",{children:a.jsx(m,{to:14,duration:1.1})}),a.jsx("span",{className:"up",children:"hari ini"})]})]}),a.jsxs("div",{className:"d-chart",children:[a.jsxs("div",{className:"d-ch-head",children:[a.jsx("small",{children:"Omzet 7 hari"}),a.jsx("small",{className:"m",children:"Sen–Min"})]}),a.jsx("div",{className:"d-bars",children:i.map((e,n)=>a.jsx(r.span,{initial:{height:0},animate:{height:`${e}%`},transition:{delay:.8+n*.07,duration:.7,ease:s},className:n===5?"b peak":"b"},n))})]}),a.jsxs("div",{className:"d-lead",children:[a.jsxs("div",{className:"d-lh",children:[a.jsx(q,{size:12})," Barber terlaris"]}),[["Rizky","2,1jt",92],["Dimas","1,7jt",74]].map(([e,n,t],o)=>a.jsxs("div",{className:"d-lr",children:[a.jsx("span",{className:"rk",children:o+1}),a.jsx("span",{className:"nm",children:e}),a.jsx("div",{className:"tr",children:a.jsx(r.span,{initial:{width:0},animate:{width:`${t}%`},transition:{delay:1.1+o*.12,duration:.7,ease:s}})}),a.jsx("b",{children:n})]},e))]})]})}function E(){const i=["Tutup buku 30 detik","Antrean online","Multi-cabang","Struk WhatsApp","Laporan otomatis","Komisi barber otomatis","Loyalti pelanggan"],e=[...i,...i];return a.jsx("div",{className:"mq",children:a.jsx("div",{className:"mq-tr",children:e.map((n,t)=>a.jsxs("span",{className:"mq-i",children:[n,a.jsx("i",{className:"mq-d"})]},t))})})}const I=[{k:"big",icon:d,title:"Kasir khusus barbershop",desc:"Catat layanan, produk, sampai komisi barber sekali tap. Antrean nggak numpuk, transaksi kelar dalam hitungan detik.",a:"i"},{k:"tall",icon:k,title:"Booking & antrian online",desc:"Pelanggan booking sendiri lewat link toko. Giliran rapi otomatis, nggak ada rebutan kursi.",a:"m"},{k:"s",icon:N,title:"Banyak cabang, satu layar",desc:"Pantau semua cabang dari satu dashboard.",a:"i"},{k:"s",icon:u,title:"Laporan yang ngerti sendiri",desc:"Omzet & performa barber kebaca otomatis tanpa Excel.",a:"g"},{k:"s",icon:b,title:"WhatsApp otomatis",desc:"Konfirmasi booking & struk mampir ke WA pelanggan.",a:"m"},{k:"s",icon:x,title:"Loyalti pelanggan",desc:"Poin & pelanggan setia tercatat otomatis.",a:"g"}];function M(){return a.jsxs("section",{id:"fitur",className:"bento-wrap",children:[a.jsx(g,{kicker:"Satu paket, semua beres",title:a.jsxs(a.Fragment,{children:["Semua yang barbershop kamu butuhin —",a.jsx("br",{}),a.jsx("span",{className:"ital gold",children:"tanpa"})," spreadsheet."]})}),a.jsx("div",{className:"bento",children:I.map((i,e)=>a.jsxs(r.article,{initial:{y:28,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0,margin:"-60px"},transition:{duration:.6,ease:s,delay:e%3*.08},className:`tile tile-${i.k} a-${i.a}`,children:[a.jsx("span",{className:"t-ic",children:a.jsx(i.icon,{size:19,strokeWidth:2.2})}),a.jsx("h3",{className:"serif",children:i.title}),a.jsx("p",{children:i.desc}),i.k==="big"&&a.jsxs("div",{className:"t-chips",children:[a.jsxs("span",{children:[a.jsx(z,{size:12})," Tap cepat"]}),a.jsxs("span",{children:[a.jsx(h,{size:12})," Komisi auto"]}),a.jsxs("span",{children:[a.jsx(v,{size:12})," Struk instan"]})]})]},i.title))})]})}function g({kicker:i,title:e,center:n}){return a.jsxs(r.div,{initial:{y:20,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0},transition:{duration:.6,ease:s},className:`shead${n?" shead-c":""}`,children:[a.jsxs("span",{className:"kick",children:[a.jsx("i",{})," ",i]}),a.jsx("h2",{className:"serif",children:e})]})}const L=[{name:"Basic",price:99,tag:"Pas buat barbershop yang baru mulai rapi-rapi.",inherit:null,lines:["Kasir & transaksi tanpa batas","Booking + antrian online","Data pelanggan & layanan","Laporan omzet harian","1 cabang"]},{name:"Pro",price:199,tag:"Buat toko yang sudah ramai dan pengin tumbuh lebih cepat.",inherit:"Basic",featured:!0,lines:["Struk & konfirmasi via WhatsApp","Komisi barber otomatis","Loyalti & poin pelanggan","Sampai 3 cabang","Laporan performa barber"]},{name:"Enterprise",price:399,tag:"Skala besar, banyak cabang, semua fitur kebuka.",inherit:"Pro",lines:["Cabang tanpa batas","Absensi & GPS staf","Backup data terjadwal","Dukungan prioritas","Semua fitur kebuka"]}];function O(){return a.jsxs("section",{id:"harga",className:"price-wrap",children:[a.jsx(g,{kicker:"Paket Harga",title:a.jsxs(a.Fragment,{children:["Harga jelas, ",a.jsx("span",{className:"ital gold",children:"tanpa"})," kejutan."]}),center:!0}),a.jsx("p",{className:"ssub",children:"Mulai gratis 14 hari. Bayar cuma kalau toko makin ramai — bisa naik paket kapan saja."}),a.jsx("div",{className:"plans",children:L.map((i,e)=>a.jsxs(r.div,{initial:{y:30,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0,margin:"-60px"},transition:{duration:.6,ease:s,delay:e*.08},className:`plan ${i.featured?"plan-f":""}`,children:[i.featured&&a.jsxs("span",{className:"ribbon",children:[a.jsx(x,{size:11,fill:"currentColor"})," Paling banyak dipilih"]}),a.jsx("h3",{className:"serif p-name",children:i.name}),a.jsx("p",{className:"p-tag",children:i.tag}),a.jsxs("div",{className:"p-price",children:[a.jsxs("b",{className:"serif",children:["Rp",i.price,"rb"]}),a.jsx("span",{children:"/bulan"})]}),a.jsx("p",{className:"p-annual",children:"Tahunan hemat 17%"}),a.jsx("div",{className:"p-div"}),i.inherit&&a.jsxs("p",{className:"p-inherit",children:["Semua di paket ",i.inherit,", plus:"]}),a.jsx("ul",{className:"p-lines",children:i.lines.map(n=>a.jsxs("li",{children:[a.jsx("span",{className:"tk",children:a.jsx(h,{size:11,strokeWidth:3.2})}),n]},n))}),a.jsxs("a",{className:"btn lg p-cta btn-glow",href:"#",children:["Pilih ",i.name," ",a.jsx(c,{size:16})]}),a.jsxs("p",{className:"p-foot",children:[a.jsx(h,{size:12,strokeWidth:3})," Gratis 14 hari · tanpa kartu kredit"]})]},i.name))}),a.jsxs("p",{className:"p-note",children:[a.jsx(v,{size:14})," Semua paket termasuk SSL, keamanan data, update gratis & dukungan tim kami."]})]})}const T=[{m:"Dulu tutup buku bisa sejam, sekarang 5 menit kelar. Barber juga seneng komisinya kebaca jelas tiap hari.",n:"Reza Maulana",r:"Owner · Kapten Barber, Bekasi"},{m:"Pelanggan booking sendiri lewat link, antrean jadi rapi banget. Nggak ada lagi drama rebutan giliran pas rame.",n:"Dimas Prayoga",r:"Owner · Gentlemen Cut, Depok"},{m:"Punya 4 cabang, sekarang semua kepantau dari HP. Tahu cabang mana paling cuan tanpa harus keliling.",n:"Bayu Saputra",r:"Pemilik · Pangkas Bro, Bandung"}];function W(){return a.jsxs("section",{id:"cerita",className:"testi-wrap",children:[a.jsx(g,{kicker:"Cerita Owner",title:a.jsxs(a.Fragment,{children:["Mereka pindah dari buku catatan —",a.jsx("br",{}),a.jsx("span",{className:"ital gold",children:"dan"})," nggak mau balik lagi."]})}),a.jsx("div",{className:"testi-grid",children:T.map((i,e)=>a.jsxs(r.figure,{initial:{y:28,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0,margin:"-50px"},transition:{duration:.6,ease:s,delay:e*.1},className:"testi",children:[a.jsx("div",{className:"t-stars",children:Array.from({length:5}).map((n,t)=>a.jsx(x,{size:14,fill:"currentColor"},t))}),a.jsxs("blockquote",{className:"serif",children:["“",i.m,"”"]}),a.jsxs("figcaption",{children:[a.jsx("span",{className:"t-av",style:{background:["#6366F1","#34D399","#C9A84C"][e%3]},children:i.n[0]}),a.jsxs("span",{className:"t-who",children:[a.jsx("b",{children:i.n}),a.jsx("small",{children:i.r})]})]})]},i.n))})]})}const H=[{q:"Perlu install aplikasi atau alat khusus?",a:"Nggak. SembaPOS jalan langsung di browser HP, tablet, atau komputer. Cukup buka, login, langsung pakai. Cetak struk pun bisa lewat printer Bluetooth biasa."},{q:"Data toko saya aman?",a:"Aman. Semua data dienkripsi, di-backup otomatis, dan tiap orang punya akses sesuai perannya. Datamu nggak bisa dilihat toko lain."},{q:"Ribet nggak buat pindah dari catatan manual?",a:"Gampang. Daftar cuma semenit, ada checklist panduan, dan toko bisa jalan hari itu juga. Bingung? Tim kami bantu lewat WhatsApp."},{q:"Kalau punya banyak cabang gimana?",a:"Bisa. Pantau semua cabang dari satu dashboard + perbandingan omzet per cabang. Mulai Pro untuk 3 cabang, atau Enterprise tanpa batas."},{q:"Bisa berhenti kapan saja?",a:"Bisa, tanpa penalti. Coba dulu gratis 14 hari tanpa kartu kredit. Lanjut cuma kalau kamu merasa terbantu."}];function G(){const[i,e]=p.useState(0);return a.jsxs("section",{className:"faq-wrap",children:[a.jsx(g,{kicker:"Tanya Jawab",title:a.jsxs(a.Fragment,{children:["Masih ragu? ",a.jsx("span",{className:"ital gold",children:"Wajar"})," kok."]}),center:!0}),a.jsx("div",{className:"faq-list",children:H.map((n,t)=>{const o=i===t;return a.jsxs(r.div,{initial:{y:16,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0},transition:{duration:.5,ease:s,delay:t*.04},className:`faq ${o?"faq-o":""}`,children:[a.jsxs("button",{className:"faq-q",onClick:()=>e(o?-1:t),children:[a.jsx("span",{className:"serif",children:n.q}),a.jsx("span",{className:"faq-s",children:o?"−":"+"})]}),a.jsx(r.div,{initial:!1,animate:{height:o?"auto":0,opacity:o?1:0},transition:{duration:.32,ease:s},className:"faq-aw",children:a.jsx("p",{className:"faq-a",children:n.a})})]},t)})}),a.jsxs("p",{className:"faq-help",children:["Belum nemu jawabannya? ",a.jsx("a",{href:"#",children:"Chat tim kami via WhatsApp →"})]})]})}function K(){return a.jsx("section",{className:"closer",children:a.jsxs(r.div,{initial:{y:24,opacity:0},whileInView:{y:0,opacity:1},viewport:{once:!0},transition:{duration:.7,ease:s},className:"closer-card",children:[a.jsx("div",{className:"closer-glow","aria-hidden":!0}),a.jsxs("span",{className:"badge",children:[a.jsx("span",{className:"dot"})," Gratis 14 hari · tanpa kartu kredit"]}),a.jsxs("h2",{className:"serif closer-title",children:["Siap bikin barbershop kamu",a.jsx("br",{}),"makin ",a.jsx("span",{className:"ital gold",children:"rapi"})," & cuan?"]}),a.jsx("p",{children:"Daftar sekarang, toko kamu bisa jalan hari ini juga. Beneran."}),a.jsxs("div",{className:"cta-row center",children:[a.jsxs("a",{className:"btn btn-glow lg",href:"#",children:["Mulai gratis sekarang ",a.jsx(c,{size:18})]}),a.jsx("a",{className:"btn btn-out lg",href:"#",children:"Ngobrol via WhatsApp"})]})]})})}function R(){return a.jsxs("footer",{className:"foot",children:[a.jsxs("div",{className:"foot-b",children:[a.jsx("span",{className:"bmark sm",children:a.jsx(d,{size:12})}),"Semba",a.jsx("span",{className:"acc",children:"POS"})]}),a.jsx("p",{children:"Pratinjau desain landing (versi gelap) · belum tersambung ke konten asli."})]})}const V=`
.sbb{
  --bg:#0A0A12; --panel:#12121F; --panel-2:#16162a; --line:#262640; --line-2:#33334f;
  --ink:#F0F0F7; --soft:#B8B8D0; --mute:#7C7C9A;
  --indigo:#6366F1; --indigo-l:#A5B4FC; --mint:#34D399; --gold:#D4B25E;
  --serif:'Fraunces', Georgia, serif; --body:'Hanken Grotesk', ui-sans-serif, sans-serif;
  position:relative; min-height:100vh; background:var(--bg); color:var(--ink); font-family:var(--body); overflow-x:clip; -webkit-font-smoothing:antialiased;
}
.sbb *{box-sizing:border-box;}
.sbb .serif{font-family:var(--serif); letter-spacing:-0.01em;}
.sbb .ital{font-style:italic; font-family:var(--serif);}
.sbb a{text-decoration:none; color:inherit;}
.gold{color:var(--gold);}

.atmos{position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0;}
.orb{position:absolute; border-radius:50%; filter:blur(100px);}
.orb-i{width:620px;height:620px; top:-200px; left:50%; transform:translateX(-55%); background:radial-gradient(circle,#6366F140,transparent 68%);}
.orb-m{width:460px;height:460px; top:560px; right:-160px; background:radial-gradient(circle,#34D39922,transparent 70%);}
.orb-g{width:420px;height:420px; top:1400px; left:-180px; background:radial-gradient(circle,#D4B25E18,transparent 70%);}
.grid-lines{position:absolute; inset:0; background-image:linear-gradient(#ffffff06 1px,transparent 1px),linear-gradient(90deg,#ffffff06 1px,transparent 1px); background-size:56px 56px; mask-image:radial-gradient(120% 80% at 50% 0%, #000, transparent 75%);}
.grain{position:absolute; inset:0; opacity:.05; mix-blend-mode:overlay; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}

.btn{display:inline-flex; align-items:center; gap:8px; font-weight:600; border-radius:12px; padding:11px 20px; font-size:14px; cursor:pointer; transition:transform .15s, box-shadow .25s, background .2s, border-color .2s; white-space:nowrap;}
.btn:active{transform:translateY(1px);}
.btn.lg{padding:15px 26px; font-size:15.5px;}
.btn-glow{background:linear-gradient(180deg,#6f72f5,#5457e6); color:#fff; box-shadow:0 0 0 1px #ffffff20 inset, 0 14px 36px -12px #6366f1cc;}
.btn-glow:hover{transform:translateY(-1px); box-shadow:0 0 0 1px #ffffff30 inset, 0 18px 46px -12px #6366f1ee;}
.btn-out{background:#ffffff08; color:var(--ink); border:1px solid var(--line-2);}
.btn-out:hover{border-color:var(--indigo); background:#ffffff10;}

.badge{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:500; color:var(--soft); background:#ffffff08; border:1px solid var(--line-2); padding:7px 14px; border-radius:999px;}
.dot{width:7px;height:7px;border-radius:50%; background:var(--mint); box-shadow:0 0 0 0 #34d39966; animation:pulse 2s infinite;}
@keyframes pulse{0%{box-shadow:0 0 0 0 #34d39955;}70%{box-shadow:0 0 0 7px #34d39900;}100%{box-shadow:0 0 0 0 #34d39900;}}

.ul{position:relative;}
.ul::after{content:''; position:absolute; left:0; right:0; bottom:.04em; height:.09em; background:linear-gradient(90deg,var(--indigo),var(--mint)); border-radius:2px;}

/* nav */
.nav{position:relative; z-index:5; max-width:1180px; margin:0 auto; padding:22px 24px; display:flex; align-items:center; justify-content:space-between; gap:20px;}
.brand{display:inline-flex; align-items:center; gap:10px; font-weight:700; font-size:19px; font-family:var(--serif);}
.bmark{display:grid; place-items:center; width:30px;height:30px;border-radius:9px; background:linear-gradient(135deg,var(--indigo),#4f46e5); color:#fff; box-shadow:0 8px 20px -8px #6366f1cc;}
.bmark.sm{width:24px;height:24px;border-radius:7px;}
.acc{color:var(--indigo-l);}
.nlinks{display:flex; gap:26px; font-size:14.5px; color:var(--soft);}
.nlinks a:hover{color:var(--ink);}
.ncta{display:flex; align-items:center; gap:14px;}
.ncta .ghost{font-size:14.5px; font-weight:500; color:var(--soft);}
.ncta .ghost:hover{color:var(--ink);}
@media(max-width:860px){.nlinks{display:none;}}

/* hero */
.hero{position:relative; z-index:2; max-width:880px; margin:0 auto; padding:54px 24px 0; text-align:center;}
.hero .badge{margin-bottom:26px;}
.h1{font-size:clamp(42px,7vw,82px); font-weight:600; line-height:1.0; margin:0;}
.lede{font-size:clamp(16px,2.1vw,19px); line-height:1.6; color:var(--soft); max-width:30em; margin:24px auto 0;}
.cta-row{display:flex; gap:14px; margin-top:32px; flex-wrap:wrap; justify-content:center;}
.trust{display:flex; align-items:center; gap:11px; margin-top:28px; justify-content:center; flex-wrap:wrap;}
.avs{display:flex;}
.avs span{width:32px;height:32px;border-radius:50%; border:2px solid var(--bg); margin-left:-9px;}
.avs span:first-child{margin-left:0;}
.stars{display:flex; gap:1px; color:var(--gold);}
.stars svg{fill:var(--gold);}
.trust-txt{font-size:13px; color:var(--mute);}
.trust-txt b{color:var(--ink);}

/* hero stage */
.stage{position:relative; max-width:760px; margin:52px auto 0; padding-bottom:30px;}
.stage-glow{position:absolute; inset:-40px -10px 0; background:radial-gradient(60% 50% at 50% 30%, #6366f133, transparent 70%); filter:blur(20px); z-index:0;}
.dash{position:relative; z-index:2; background:linear-gradient(180deg,#14142400,#0e0e1a00), var(--panel); border:1px solid var(--line-2); border-radius:20px; padding:16px; box-shadow:0 50px 100px -40px #000c, 0 0 0 1px #ffffff08 inset; text-align:left;}
.d-top{display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;}
.d-id{display:flex; align-items:center; gap:10px;}
.d-logo{display:grid; place-items:center; width:32px;height:32px;border-radius:9px; color:#fff; background:linear-gradient(135deg,#2a2a48,#16162a); border:1px solid var(--line-2);}
.d-id b{display:block; font-size:13.5px; font-family:var(--serif); font-weight:600;}
.d-id small{font-size:11px; color:var(--mute);}
.d-live{display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:var(--mint); background:#34d3991a; border:1px solid #34d39933; padding:5px 10px; border-radius:999px;}
.d-kpis{display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin-bottom:12px;}
.d-kpi{background:var(--panel-2); border:1px solid var(--line); border-radius:12px; padding:10px 11px;}
.d-kpi small{font-size:10px; color:var(--mute); text-transform:uppercase; letter-spacing:.04em; font-weight:600;}
.d-kpi b{display:block; font-family:var(--serif); font-weight:600; font-size:18px; margin:3px 0 2px;}
.d-kpi span{font-size:10.5px; color:var(--mute); font-weight:600;}
.d-kpi .up{color:var(--mint); display:inline-flex; align-items:center; gap:3px;}
.d-chart{background:var(--panel-2); border:1px solid var(--line); border-radius:12px; padding:11px 12px; margin-bottom:12px;}
.d-ch-head{display:flex; justify-content:space-between; margin-bottom:9px;}
.d-ch-head small{font-size:10.5px; font-weight:600; color:var(--soft);}
.d-ch-head .m{color:var(--mute);}
.d-bars{display:flex; align-items:flex-end; gap:7px; height:60px;}
.b{flex:1; border-radius:5px 5px 2px 2px; background:#34344f; min-height:5px;}
.b.peak{background:linear-gradient(to top,var(--indigo),#8b8df7); box-shadow:0 0 16px -2px #6366f1aa;}
.d-lead{background:var(--panel-2); border:1px solid var(--line); border-radius:12px; padding:11px 12px;}
.d-lh{display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:var(--gold); margin-bottom:8px;}
.d-lr{display:flex; align-items:center; gap:9px; margin-top:7px;}
.rk{width:16px;height:16px;border-radius:5px; background:#2a2a48; color:#fff; font-size:9.5px; font-weight:700; display:grid; place-items:center;}
.nm{font-size:12px; font-weight:600; width:42px;}
.tr{flex:1; height:6px; border-radius:99px; background:#26263e; overflow:hidden;}
.tr span{display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,var(--indigo),var(--mint));}
.d-lr b{font-size:11.5px; font-family:var(--serif); width:38px; text-align:right;}
.chip{position:absolute; display:flex; align-items:center; gap:10px; background:var(--panel); border:1px solid var(--line-2); border-radius:13px; padding:10px 13px; z-index:3; box-shadow:0 24px 48px -22px #000d;}
.chip div{line-height:1.25;}
.chip b{display:block; font-size:12px; font-family:var(--serif); font-weight:600;}
.chip small{font-size:10.5px; color:var(--mute);}
.ci{display:grid; place-items:center; width:28px;height:28px;border-radius:8px; color:#fff; flex:none;}
.ci-i{background:linear-gradient(135deg,var(--indigo),#4f46e5);}
.ci-m{background:linear-gradient(135deg,var(--mint),#0c9b6e);}
.chip-a{top:-18px; right:-20px;}
.chip-b{bottom:54px; left:-30px;}
@media(max-width:560px){.chip-a{right:-4px; top:-12px;} .chip-b{left:-4px;}}

/* marquee */
.mq{position:relative; z-index:2; margin-top:40px; padding:15px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); overflow:hidden; background:#ffffff04;}
.mq-tr{display:flex; width:max-content; animation:scroll 32s linear infinite;}
.mq-i{display:inline-flex; align-items:center; font-family:var(--serif); font-style:italic; font-weight:500; font-size:17px; color:var(--soft); padding:0 4px;}
.mq-d{display:inline-block; width:5px;height:5px;border-radius:50%; background:var(--gold); margin:0 26px;}
@keyframes scroll{to{transform:translateX(-50%);}}

/* shared section head */
.shead{max-width:680px; margin-bottom:42px;}
.shead-c{text-align:center; margin-left:auto; margin-right:auto;}
.shead-c .kick{justify-content:center;}
.kick{display:inline-flex; align-items:center; gap:8px; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.1em; color:var(--indigo-l);}
.kick i{width:20px;height:1px; background:var(--indigo-l);}
.shead h2{font-size:clamp(30px,4.8vw,52px); font-weight:600; line-height:1.06; margin-top:14px;}
.ssub{text-align:center; max-width:38em; margin:14px auto 0; color:var(--soft); font-size:16px; line-height:1.55;}

/* bento */
.bento-wrap{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:88px 24px;}
.bento{display:grid; grid-template-columns:repeat(3,1fr); gap:16px;}
.tile{position:relative; background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:24px; transition:transform .25s, box-shadow .25s, border-color .25s; overflow:hidden;}
.tile::before{content:''; position:absolute; inset:0; border-radius:18px; padding:1px; background:linear-gradient(180deg,#ffffff14,transparent 40%); -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none;}
.tile:hover{transform:translateY(-4px); border-color:var(--line-2); box-shadow:0 30px 60px -30px #000a;}
.tile h3{font-size:18.5px; font-weight:600; margin:15px 0 8px;}
.tile p{font-size:14px; line-height:1.55; color:var(--soft);}
.tile-big{grid-column:span 2; padding:30px;}
.tile-big h3{font-size:25px;}
.tile-big p{font-size:15.5px; max-width:34em;}
.tile-tall{grid-row:span 2; display:flex; flex-direction:column;}
.tile-tall p{flex:1;}
.t-ic{display:grid; place-items:center; width:44px;height:44px;border-radius:12px; color:#fff;}
.a-i .t-ic{background:linear-gradient(135deg,var(--indigo),#4f46e5);}
.a-m .t-ic{background:linear-gradient(135deg,var(--mint),#0c9b6e);}
.a-g .t-ic{background:linear-gradient(135deg,var(--gold),#a9863e);}
.t-chips{display:flex; gap:8px; flex-wrap:wrap; margin-top:18px;}
.t-chips span{display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:500; color:var(--soft); background:#ffffff08; border:1px solid var(--line-2); padding:5px 11px; border-radius:999px;}
@media(max-width:840px){.bento{grid-template-columns:repeat(2,1fr);} .tile-tall{grid-row:span 1;}}
@media(max-width:560px){.bento{grid-template-columns:1fr;} .tile-big{grid-column:span 1;}}

/* pricing */
.price-wrap{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:30px 24px 92px;}
.plans{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:44px; align-items:start;}
.plan{position:relative; background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:28px; display:flex; flex-direction:column; transition:transform .25s, box-shadow .25s;}
.plan:hover{transform:translateY(-5px); box-shadow:0 34px 64px -32px #000a;}
.plan-f{border-color:transparent; background:linear-gradient(180deg,#1a1a30,#111122); box-shadow:0 0 0 1px #6366f155, 0 34px 70px -30px #6366f155; }
@media(min-width:841px){.plan-f{margin-top:-16px; margin-bottom:-16px; padding-top:40px; padding-bottom:40px;}}
.ribbon{position:absolute; top:-12px; left:50%; transform:translateX(-50%); display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; background:linear-gradient(180deg,#6f72f5,#5457e6); color:#fff; padding:5px 13px; border-radius:999px; white-space:nowrap; box-shadow:0 10px 24px -8px #6366f1cc;}
.p-name{font-size:22px; font-weight:600;}
.p-tag{font-size:13px; color:var(--mute); margin-top:6px; min-height:38px; line-height:1.45;}
.p-price{display:flex; align-items:flex-end; gap:7px; margin-top:16px;}
.p-price b{font-size:40px; font-weight:600; line-height:1;}
.p-price span{font-size:13px; color:var(--mute); padding-bottom:4px;}
.p-annual{font-size:12px; color:var(--gold); font-weight:600; margin-top:7px;}
.p-div{height:1px; background:var(--line); margin:22px 0;}
.p-inherit{font-size:12px; font-weight:600; color:var(--indigo-l); margin-bottom:12px;}
.p-lines{list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:12px; flex:1;}
.p-lines li{display:flex; align-items:flex-start; gap:10px; font-size:13.5px; color:var(--soft); line-height:1.4;}
.tk{margin-top:1px; flex:none; width:17px;height:17px;border-radius:50%; display:grid; place-items:center; background:#26263e; color:var(--indigo-l);}
.plan-f .tk{background:var(--indigo); color:#fff;}
.p-cta{width:100%; justify-content:center;}
.plan:not(.plan-f) .p-cta{background:#ffffff0c; border:1px solid var(--line-2); box-shadow:none; color:var(--ink);}
.plan:not(.plan-f) .p-cta:hover{border-color:var(--indigo); background:#ffffff14;}
.p-foot{display:inline-flex; align-items:center; justify-content:center; gap:6px; width:100%; margin-top:12px; font-size:11px; color:var(--mute);}
.p-note{display:flex; align-items:center; justify-content:center; gap:8px; margin-top:40px; font-size:13px; color:var(--mute); text-align:center;}
.p-note svg{color:var(--gold); flex:none;}
@media(max-width:840px){.plans{grid-template-columns:1fr; max-width:400px; margin-left:auto; margin-right:auto;}}

/* testimonials */
.testi-wrap{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:40px 24px 92px;}
.testi-grid{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:40px; align-items:start;}
.testi{background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:24px; display:flex; flex-direction:column; transition:transform .25s, border-color .25s;}
.testi:hover{transform:translateY(-4px); border-color:var(--line-2);}
.t-stars{display:flex; gap:2px; margin-bottom:13px; color:var(--gold);}
.t-stars svg{fill:var(--gold);}
.testi blockquote{font-size:16px; line-height:1.55; color:var(--ink); margin:0; flex:1; font-weight:500; font-style:italic;}
.testi figcaption{display:flex; align-items:center; gap:11px; margin-top:18px; padding-top:16px; border-top:1px solid var(--line);}
.t-av{width:38px;height:38px;border-radius:50%; display:grid; place-items:center; color:#0A0A12; font-weight:700; font-family:var(--serif); font-size:15px; flex:none;}
.t-who{display:flex; flex-direction:column; min-width:0;}
.t-who b{font-size:13.5px;}
.t-who small{font-size:12px; color:var(--mute);}
@media(max-width:840px){.testi-grid{grid-template-columns:1fr; max-width:440px; margin-left:auto; margin-right:auto;}}

/* faq */
.faq-wrap{position:relative; z-index:2; max-width:760px; margin:0 auto; padding:40px 24px 92px;}
.faq-list{margin-top:38px; display:flex; flex-direction:column; gap:12px;}
.faq{background:var(--panel); border:1px solid var(--line); border-radius:15px; overflow:hidden; transition:border-color .2s;}
.faq-o{border-color:var(--line-2);}
.faq-q{width:100%; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 20px; background:none; border:none; cursor:pointer; text-align:left; font-size:15.5px; font-weight:600; color:var(--ink); font-family:var(--serif);}
.faq-s{font-size:24px; color:var(--indigo-l); line-height:1; flex:none; font-family:var(--body); font-weight:400;}
.faq-aw{overflow:hidden;}
.faq-a{padding:0 20px 20px; font-size:14.5px; line-height:1.62; color:var(--soft); margin:0;}
.faq-help{text-align:center; margin-top:30px; font-size:14px; color:var(--mute);}
.faq-help a{color:var(--indigo-l); font-weight:600;}

/* closer */
.closer{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:0 24px 92px;}
.closer-card{position:relative; border-radius:28px; overflow:hidden; padding:74px 28px; text-align:center; background:linear-gradient(180deg,#16162c,#0d0d1a); border:1px solid var(--line-2);}
.closer-glow{position:absolute; inset:0; background:radial-gradient(70% 90% at 50% 0%, #6366f140, transparent 60%); pointer-events:none;}
.closer-card>*{position:relative;}
.closer-title{font-size:clamp(30px,5vw,54px); font-weight:600; color:#fff; line-height:1.05; margin:20px 0 0;}
.closer p{color:var(--soft); font-size:16px; margin:16px 0 0;}
.closer .cta-row{margin-top:28px;}

/* footer */
.foot{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:26px 24px 50px; display:flex; align-items:center; justify-content:space-between; gap:16px; color:var(--mute); font-size:13px; flex-wrap:wrap; border-top:1px solid var(--line);}
.foot-b{display:inline-flex; align-items:center; gap:9px; font-family:var(--serif); font-weight:600; font-size:16px; color:var(--ink);}
`;export{aa as default};
