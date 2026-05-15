/**
 * Parse pagination params from query string
 */
function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Build paginated response
 */
function paginatedResponse(data, total, page, limit) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  // Sediakan field flat DAN nested-meta. Frontend lama membaca flat,
  // pemakai baru bisa pakai `meta`. Hindari breaking change bila ada
  // hook lain yang sudah mengandalkan salah satu shape.
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    meta: { total, page, limit, totalPages },
  };
}

module.exports = { parsePagination, paginatedResponse };
