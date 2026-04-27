import React from 'react'

export const Card = ({ children, className = '', hover = false, gold = false, ...props }) => (
  <div
    className={`
      bg-dark-card rounded-2xl border border-dark-border
      ${hover ? 'card-hover cursor-pointer' : ''}
      ${gold ? 'border-gold/20 shadow-gold' : ''}
      ${className}
    `}
    {...props}
  >
    {children}
  </div>
)

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`px-6 py-4 border-b border-dark-border ${className}`} {...props}>
    {children}
  </div>
)

export const CardBody = ({ children, className = '', ...props }) => (
  <div className={`px-6 py-4 ${className}`} {...props}>
    {children}
  </div>
)

export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`px-6 py-4 border-t border-dark-border ${className}`} {...props}>
    {children}
  </div>
)

export default Card
