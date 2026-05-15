const { getBranchLicenseStatus } = require('../utils/branchLicense');

const UNLICENSED_PAYLOAD = {
  success: false,
  code: 'BRANCH_UNLICENSED',
  error:
    'Cabang ini belum berlisensi. Hubungi super admin untuk membeli lisensi cabang tambahan.',
};

/**
 * Memastikan operasi terhadap suatu cabang hanya dilakukan jika cabang tersebut
 * sudah berlisensi (kuota paket atau invoice branch_addon yang sudah dibayar).
 *
 * Sumber branchId diperiksa berurutan: req.body.branchId → req.params.branchId →
 * req.query.branchId. Kalau resource yang sedang dimutasi tidak mengirim
 * branchId secara eksplisit (mis. PUT /queue/:id), route boleh memberi
 * `lookupFromExistingRecord(req)` yang mengembalikan branchId dari DB.
 *
 * super_admin selalu lolos. Kalau tidak ada branchId yang bisa ditentukan,
 * middleware diam-diam meneruskan request — bukan urusan guard ini.
 *
 * @param {object} [opts]
 * @param {(req) => Promise<string|null>} [opts.lookupFromExistingRecord]
 */
function requireLicensedBranch(opts = {}) {
  const { lookupFromExistingRecord } = opts;

  return async function licensedBranchGuard(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      if (req.user.role === 'super_admin') return next();

      let branchId =
        req.body?.branchId ||
        req.params?.branchId ||
        req.query?.branchId ||
        null;

      if (!branchId && typeof lookupFromExistingRecord === 'function') {
        branchId = await lookupFromExistingRecord(req);
      }

      if (!branchId) return next();

      const license = await getBranchLicenseStatus(req.user.tenantId);
      if (license.unlicensed.has(branchId)) {
        return res.status(403).json(UNLICENSED_PAYLOAD);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireLicensedBranch, UNLICENSED_PAYLOAD };
