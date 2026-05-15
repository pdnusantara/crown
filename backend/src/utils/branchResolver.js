// Helpers untuk menerima branchId yang berbentuk CUID asli (Branch.id) atau
// "code" pendek per cabang (Branch.code). Frontend boleh kirim salah satunya;
// backend selalu memakai id internal saat query Prisma.

const prisma = require('../config/database');

const isCuid = (s) => typeof s === 'string' && /^[a-z0-9]{20,}$/i.test(s);

// In-memory cache kecil supaya hot path (queue / transactions) tidak hit DB
// untuk setiap request hanya buat resolve code → id. TTL pendek agar update
// nama cabang cepat terlihat.
const cache = new Map(); // key=`${tenantId}|${value}` → { id, expiresAt }
const TTL_MS = 60_000;

function cacheKey(tenantId, value) {
  return `${tenantId || ''}|${value}`;
}

async function resolveBranchId(value, tenantId) {
  if (!value) return null;

  // Sudah CUID? langsung anggap id (cek kebenaran biarkan ke query downstream).
  if (isCuid(value)) return value;

  // Tanpa tenant context, tidak aman menebak code → id (code unik per tenant,
  // bukan global). Biarkan downstream handle 404.
  if (!tenantId) return null;

  const key = cacheKey(tenantId, value);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.id;

  const branch = await prisma.branch.findFirst({
    where: { tenantId, code: value, deletedAt: null },
    select: { id: true },
  });
  const id = branch?.id || null;
  cache.set(key, { id, expiresAt: Date.now() + TTL_MS });
  return id;
}

function invalidateBranchCache() {
  cache.clear();
}

// Express middleware: replace req.params.branchId, req.query.branchId,
// req.body.branchId dari code → real id. Tidak melempar error kalau tidak
// ditemukan — biarkan handler downstream merespons 404 / forbidden seperti
// biasanya.
function resolveBranchAliasMiddleware() {
  return async function resolveBranchAlias(req, _res, next) {
    try {
      const tenantId = req.user?.tenantId || req.tenant?.id || null;
      const tasks = [];

      const swap = async (container, key) => {
        if (!container) return;
        const v = container[key];
        if (!v || isCuid(v)) return;
        const id = await resolveBranchId(v, tenantId);
        if (id) container[key] = id;
      };

      if (req.params)  tasks.push(swap(req.params, 'branchId'));
      if (req.query)   tasks.push(swap(req.query,  'branchId'));
      if (req.body)    tasks.push(swap(req.body,   'branchId'));

      await Promise.all(tasks);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  isCuid,
  resolveBranchId,
  invalidateBranchCache,
  resolveBranchAliasMiddleware,
};
