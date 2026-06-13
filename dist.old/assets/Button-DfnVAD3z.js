import{j as t}from"./index-D7a1bEzN.js";import{L as p}from"./loader-circle-CzKv6zT6.js";const a={primary:"bg-brand text-dark font-semibold hover:bg-brand-light active:bg-brand-dark shadow-brand hover:shadow-brand-lg",secondary:"border border-brand/40 text-brand hover:bg-brand/10 hover:border-brand",ghost:"text-muted hover:text-off-white hover:bg-dark-card",danger:"bg-red-600 text-white hover:bg-red-500 active:bg-red-700",success:"bg-green-600 text-white hover:bg-green-500",outline:"border border-dark-border text-off-white hover:border-brand/40 hover:text-brand"},s={xs:"px-2.5 py-1 text-xs rounded-md",sm:"px-3.5 py-1.5 text-sm rounded-lg",md:"px-5 py-2.5 text-sm rounded-xl",lg:"px-6 py-3 text-base rounded-xl",xl:"px-8 py-4 text-base rounded-2xl"},f=({children:o,variant:n="primary",size:b="md",loading:e=!1,disabled:i=!1,icon:r,iconPosition:d="left",className:x="",fullWidth:l=!1,...m})=>{const h=i||e;return t.jsxs("button",{className:`
        inline-flex items-center justify-center gap-2
        font-body font-medium
        transition-all duration-200
        cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${a[n]||a.primary}
        ${s[b]||s.md}
        ${l?"w-full":""}
        ${x}
      `,disabled:h,...m,children:[e&&t.jsx(p,{className:"w-4 h-4 animate-spin"}),!e&&r&&d==="left"&&t.jsx(r,{className:"w-4 h-4"}),o,!e&&r&&d==="right"&&t.jsx(r,{className:"w-4 h-4"})]})};export{f as B};
