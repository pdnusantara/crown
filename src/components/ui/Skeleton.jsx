import React from 'react'

export const Skeleton = ({ className = '', ...props }) => (
  <div
    className={`skeleton-shimmer rounded-lg ${className}`}
    {...props}
  />
)

export const SkeletonCard = () => (
  <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
    <div className="flex items-center gap-4 mb-4">
      <Skeleton className="w-12 h-12 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
    <Skeleton className="h-3 w-full mb-2" />
    <Skeleton className="h-3 w-4/5 mb-2" />
    <Skeleton className="h-3 w-3/5" />
  </div>
)

export const SkeletonRow = ({ cols = 4 }) => (
  <div className="flex items-center gap-4 py-3 px-4 border-b border-dark-border">
    {Array.from({ length: cols }).map((_, i) => (
      <Skeleton key={i} className="h-4 flex-1" />
    ))}
  </div>
)

export const SkeletonTable = ({ rows = 5 }) => (
  <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden">
    <div className="flex gap-4 px-4 py-3 border-b border-dark-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1 bg-dark-surface" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonRow key={i} />
    ))}
  </div>
)

export const SkeletonChart = ({ height = 200 }) => (
  <Skeleton className={`w-full rounded-2xl`} style={{ height }} />
)

export default Skeleton
