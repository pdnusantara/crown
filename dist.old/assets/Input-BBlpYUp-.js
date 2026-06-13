import{r as l,j as e}from"./index-D7a1bEzN.js";const m=l.forwardRef(({label:t,error:s,hint:d,icon:r,iconRight:a,className:n="",containerClassName:i="",fullWidth:x=!0,...o},c)=>e.jsxs("div",{className:`${x?"w-full":""} ${i}`,children:[t&&e.jsx("label",{className:"block text-sm font-medium text-muted mb-1.5",children:t}),e.jsxs("div",{className:"relative",children:[r&&e.jsx("div",{className:"absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none",children:e.jsx(r,{className:"w-4 h-4 text-muted"})}),e.jsx("input",{ref:c,className:`
            w-full bg-dark-surface border text-off-white placeholder-muted
            rounded-xl px-4 py-2.5 text-sm
            transition-all duration-200
            outline-none
            ${r?"pl-10":""}
            ${a?"pr-10":""}
            ${s?"border-red-500/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/20":"border-dark-border focus:border-brand/60 focus:ring-2 focus:ring-brand/15"}
            ${n}
          `,...o}),a&&e.jsx("div",{className:"absolute inset-y-0 right-0 pr-3.5 flex items-center",children:e.jsx(a,{className:"w-4 h-4 text-muted"})})]}),s&&e.jsx("p",{className:"mt-1.5 text-xs text-red-400",children:s}),d&&!s&&e.jsx("p",{className:"mt-1.5 text-xs text-muted",children:d})]}));m.displayName="Input";const u=l.forwardRef(({label:t,error:s,className:d="",...r},a)=>e.jsxs("div",{className:"w-full",children:[t&&e.jsx("label",{className:"block text-sm font-medium text-muted mb-1.5",children:t}),e.jsx("textarea",{ref:a,className:`
        w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted
        rounded-xl px-4 py-2.5 text-sm resize-none
        transition-all duration-200 outline-none
        focus:border-brand/60 focus:ring-2 focus:ring-brand/15
        ${s?"border-red-500/60":""}
        ${d}
      `,...r}),s&&e.jsx("p",{className:"mt-1.5 text-xs text-red-400",children:s})]}));u.displayName="Textarea";export{m as I};
