import{r as f,j as s}from"./index-D7a1bEzN.js";const n={xs:"w-6 h-6 text-xs",sm:"w-8 h-8 text-xs",md:"w-10 h-10 text-sm",lg:"w-12 h-12 text-base",xl:"w-16 h-16 text-xl","2xl":"w-20 h-20 text-2xl"},x=(r="")=>{const t=String(r||"").trim();return t&&t.split(/\s+/).slice(0,2).map(e=>e[0]).join("").toUpperCase()||"?"},o=["from-amber-500 to-orange-500","from-blue-500 to-cyan-500","from-violet-500 to-purple-500","from-green-500 to-emerald-500","from-pink-500 to-rose-500","from-brand to-brand-light"],d=(r="")=>{const t=String(r||"").trim();if(!t)return o[5];const e=t.charCodeAt(0)%o.length;return o[e]||o[5]},g=({src:r,name:t,size:e="md",className:i="",ring:l=!1})=>{const[a,m]=f.useState(!1);return s.jsx("div",{className:`
      relative flex-shrink-0 rounded-full overflow-hidden
      ${n[e]||n.md}
      ${l?"ring-2 ring-brand/50 ring-offset-2 ring-offset-dark":""}
      ${i}
    `,children:r&&!a?s.jsx("img",{src:r,alt:t||"Avatar",className:"w-full h-full object-cover",onError:()=>m(!0)}):s.jsx("div",{className:`w-full h-full flex items-center justify-center font-semibold text-white bg-gradient-to-br ${d(t)}`,children:x(t)})})};export{g as A};
