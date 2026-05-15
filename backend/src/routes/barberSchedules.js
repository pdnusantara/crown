const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');

function emitScheduleEvent(event, payload, tenantId) {
  try {
    const io = getIO();
    if (!io) return;
    if (tenantId) io.to(tenantRoom(tenantId)).emit(event, payload);
  } catch { /* observability */ }
}

const scheduleSchema = z.object({
  staffId:   z.string().min(1),
  branchId:  z.string().nullish(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
  shift:     z.string().max(20),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/),
  notes:     z.string().max(300).nullish(),
});

// Resolve tenantId from request: tenant_admin uses own; super_admin can pass tenantId
function resolveTenantId(req) {
  if (req.user.role === 'super_admin') return req.body?.tenantId || req.query?.tenantId || null;
  return req.user.tenantId;
}

// Helpers — hour math for overlap detection.
function hhmmToMinutes(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
function overlaps(a, b) {
  return hhmmToMinutes(a.startTime) < hhmmToMinutes(b.endTime)
      && hhmmToMinutes(b.startTime) < hhmmToMinutes(a.endTime);
}

// GET /api/barber-schedules?weekStart=YYYY-MM-DD&staffId=&branchId=
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'barber'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'barber'
      ? req.user.tenantId
      : (req.user.role === 'super_admin' ? (req.query.tenantId || null) : req.user.tenantId);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const where = { tenantId };
    if (req.query.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(req.query.weekStart)) {
      // Week range: 7 days starting from weekStart inclusive
      const start = req.query.weekStart;
      const startD = new Date(`${start}T00:00:00.000Z`);
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startD);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });
      where.date = { in: dates };
    } else if (req.query.from && req.query.to) {
      where.date = { gte: req.query.from, lte: req.query.to };
    }
    if (req.query.staffId) where.staffId = req.query.staffId;
    if (req.query.branchId) where.branchId = req.query.branchId;
    // barber can only see their own schedule
    if (req.user.role === 'barber') where.staffId = req.user.id;

    const data = await prisma.barberSchedule.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/barber-schedules
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });
    const body = scheduleSchema.parse(req.body);

    // Verify staff belongs to tenant + role barber
    const staff = await prisma.user.findFirst({
      where: { id: body.staffId, tenantId, role: 'barber', isActive: true, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!staff) return res.status(400).json({ success: false, error: 'Barber tidak ditemukan di tenant ini' });

    // Verify branchId belongs to tenant (kalau di-pass) — cegah cross-tenant injection
    if (body.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: body.branchId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) return res.status(400).json({ success: false, error: 'Cabang tidak ditemukan di tenant ini' });
    }

    if (hhmmToMinutes(body.endTime) <= hhmmToMinutes(body.startTime)) {
      return res.status(400).json({ success: false, error: 'Jam selesai harus setelah jam mulai' });
    }

    // Conflict detection — same staff & date with overlapping hours
    const sameDay = await prisma.barberSchedule.findMany({
      where: { tenantId, staffId: body.staffId, date: body.date },
      select: { id: true, startTime: true, endTime: true, shift: true },
    });
    const conflict = sameDay.find(s => overlaps(s, body));
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: `Bentrok dengan jadwal ${conflict.shift} (${conflict.startTime}–${conflict.endTime})`,
      });
    }

    const created = await prisma.barberSchedule.create({
      data: {
        tenantId, branchId: body.branchId || null,
        staffId: body.staffId,
        date: body.date, shift: body.shift,
        startTime: body.startTime, endTime: body.endTime,
        notes: body.notes || null,
      },
    });
    await recordAudit(req, {
      action: 'schedule.create',
      target: `tenant:${tenantId}`,
      detail: `${staff.name}: ${body.date} ${body.shift} (${body.startTime}–${body.endTime})`,
      severity: 'info',
    });
    emitScheduleEvent('schedule:created', created, tenantId);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// PATCH /api/barber-schedules/:id
router.patch('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.barberSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Jadwal tidak ditemukan' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }
    const body = scheduleSchema.partial().parse(req.body);

    // Validate branch ownership kalau ganti branchId
    if (body.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: body.branchId, tenantId: existing.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) return res.status(400).json({ success: false, error: 'Cabang tidak ditemukan di tenant ini' });
    }

    // Validate staff kalau ganti staffId
    if (body.staffId) {
      const staff = await prisma.user.findFirst({
        where: { id: body.staffId, tenantId: existing.tenantId, role: 'barber', isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!staff) return res.status(400).json({ success: false, error: 'Barber tidak ditemukan di tenant ini' });
    }

    const merged = {
      staffId:   body.staffId   ?? existing.staffId,
      date:      body.date      ?? existing.date,
      startTime: body.startTime ?? existing.startTime,
      endTime:   body.endTime   ?? existing.endTime,
      shift:     body.shift     ?? existing.shift,
    };
    if (hhmmToMinutes(merged.endTime) <= hhmmToMinutes(merged.startTime)) {
      return res.status(400).json({ success: false, error: 'Jam selesai harus setelah jam mulai' });
    }

    // Re-check conflict with OTHER schedules of same staff/date
    const others = await prisma.barberSchedule.findMany({
      where: {
        tenantId: existing.tenantId,
        staffId: merged.staffId,
        date: merged.date,
        NOT: { id: existing.id },
      },
      select: { id: true, startTime: true, endTime: true, shift: true },
    });
    const conflict = others.find(s => overlaps(s, merged));
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: `Bentrok dengan jadwal ${conflict.shift} (${conflict.startTime}–${conflict.endTime})`,
      });
    }

    const updated = await prisma.barberSchedule.update({ where: { id: req.params.id }, data: body });
    await recordAudit(req, {
      action: 'schedule.update',
      target: `tenant:${existing.tenantId}`,
      detail: `${updated.date} ${updated.shift}`,
      severity: 'info',
    });
    emitScheduleEvent('schedule:updated', updated, existing.tenantId);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// DELETE /api/barber-schedules/:id
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.barberSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Jadwal tidak ditemukan' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }
    await prisma.barberSchedule.delete({ where: { id: req.params.id } });
    await recordAudit(req, {
      action: 'schedule.delete',
      target: `tenant:${existing.tenantId}`,
      detail: `${existing.date} ${existing.shift}`,
      severity: 'info',
    });
    emitScheduleEvent('schedule:deleted', { id: existing.id }, existing.tenantId);
    res.json({ success: true, data: { id: existing.id } });
  } catch (err) { next(err); }
});

// POST /api/barber-schedules/bulk-delete  { ids: string[] }
router.post('/bulk-delete', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const body = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }).parse(req.body);

    const targets = await prisma.barberSchedule.findMany({
      where: { id: { in: body.ids }, tenantId },
      select: { id: true, date: true },
    });
    if (!targets.length) return res.json({ success: true, data: { deleted: 0 } });

    const del = await prisma.barberSchedule.deleteMany({
      where: { id: { in: targets.map(t => t.id) }, tenantId },
    });
    await recordAudit(req, {
      action: 'schedule.bulk_delete',
      target: `tenant:${tenantId}`,
      detail: `Bulk delete ${del.count} jadwal`,
      severity: 'info',
    });
    const weekStarts = new Set(
      targets.map(t => {
        const d = new Date(`${t.date}T00:00:00.000Z`);
        const dow = d.getUTCDay(); // 0=Sun
        const offset = dow === 0 ? -6 : 1 - dow; // monday-start
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      })
    );
    weekStarts.forEach(ws => emitScheduleEvent('schedule:bulk_changed', { weekStart: ws }, tenantId));

    res.json({ success: true, data: { deleted: del.count } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// POST /api/barber-schedules/clear-week  { weekStart: 'YYYY-MM-DD', branchId?: string }
router.post('/clear-week', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const body = z.object({
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      branchId: z.string().nullish(),
    }).parse(req.body);

    const d0 = new Date(`${body.weekStart}T00:00:00.000Z`);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(d0); d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const where = { tenantId, date: { in: dates } };
    if (body.branchId) where.branchId = body.branchId;

    const del = await prisma.barberSchedule.deleteMany({ where });
    await recordAudit(req, {
      action: 'schedule.clear_week',
      target: `tenant:${tenantId}`,
      detail: `Clear week ${body.weekStart}${body.branchId ? ` (branch ${body.branchId})` : ''}: ${del.count} dihapus`,
      severity: 'info',
    });
    emitScheduleEvent('schedule:bulk_changed', { weekStart: body.weekStart }, tenantId);

    res.json({ success: true, data: { deleted: del.count } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// POST /api/barber-schedules/copy-week
// Body: { fromWeekStart: 'YYYY-MM-DD', toWeekStart: 'YYYY-MM-DD', overwrite?: boolean }
// Clone semua jadwal dari minggu sumber ke minggu target. Default skip kalau ada
// bentrok di target; overwrite=true akan hapus dulu jadwal target lalu clone.
router.post('/copy-week', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const body = z.object({
      fromWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      toWeekStart:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      overwrite:     z.boolean().optional().default(false),
      // Clone N minggu berturut-turut mulai dari toWeekStart (1=hanya target,
      // 4=4 minggu ke depan). Cap 12 minggu agar tidak meledak.
      repeatWeeks:   z.number().int().min(1).max(12).optional().default(1),
    }).parse(req.body);
    if (body.fromWeekStart === body.toWeekStart && body.repeatWeeks === 1) {
      return res.status(400).json({ success: false, error: 'Minggu sumber dan target tidak boleh sama' });
    }

    const datesOf = (start) => {
      const d0 = new Date(`${start}T00:00:00.000Z`);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(d0); d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });
    };
    const addWeeksISO = (iso, n) => {
      const d = new Date(`${iso}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + n * 7);
      return d.toISOString().slice(0, 10);
    };

    const fromDates = datesOf(body.fromWeekStart);
    const sourceList = await prisma.barberSchedule.findMany({
      where: { tenantId, date: { in: fromDates } },
    });
    if (!sourceList.length) {
      return res.json({ success: true, data: { copied: 0, skipped: 0, deleted: 0, weeks: 0 } });
    }

    let totalCopied = 0;
    let totalSkipped = 0;
    let totalDeleted = 0;
    const targetWeekStarts = [];

    // Loop tiap minggu target — tiap iterasi: optional delete, lalu skip-conflict insert
    for (let w = 0; w < body.repeatWeeks; w++) {
      const toWeekStart = addWeeksISO(body.toWeekStart, w);
      // Cegah self-copy ke minggu sumber (mis. fromWeekStart sama dengan iterasi ini)
      if (toWeekStart === body.fromWeekStart) continue;
      targetWeekStarts.push(toWeekStart);

      const toDates = datesOf(toWeekStart);
      const dateMap = Object.fromEntries(fromDates.map((d, i) => [d, toDates[i]]));

      let weekDeleted = 0;
      if (body.overwrite) {
        const del = await prisma.barberSchedule.deleteMany({
          where: { tenantId, date: { in: toDates } },
        });
        weekDeleted = del.count;
      }
      totalDeleted += weekDeleted;

      const existing = body.overwrite
        ? []
        : await prisma.barberSchedule.findMany({
            where: { tenantId, date: { in: toDates } },
            select: { staffId: true, date: true, startTime: true, endTime: true },
          });

      const toCreate = [];
      for (const src of sourceList) {
        const newDate = dateMap[src.date];
        if (!newDate) { totalSkipped++; continue; }
        const candidate = {
          tenantId,
          branchId:  src.branchId,
          staffId:   src.staffId,
          date:      newDate,
          shift:     src.shift,
          startTime: src.startTime,
          endTime:   src.endTime,
          notes:     src.notes,
        };
        const conflict = existing.find(e =>
          e.staffId === candidate.staffId &&
          e.date === candidate.date &&
          overlaps(e, candidate)
        );
        if (conflict) { totalSkipped++; continue; }
        toCreate.push(candidate);
        existing.push(candidate);
      }

      if (toCreate.length) {
        await prisma.barberSchedule.createMany({ data: toCreate });
        totalCopied += toCreate.length;
      }
    }

    await recordAudit(req, {
      action: 'schedule.copy_week',
      target: `tenant:${tenantId}`,
      detail: `${body.fromWeekStart} → ${body.toWeekStart} ×${body.repeatWeeks}: copied=${totalCopied}, skipped=${totalSkipped}, overwritten=${totalDeleted}`,
      severity: 'info',
    });
    // Single broadcast per target week — client invalidate dan refetch
    targetWeekStarts.forEach(ws => emitScheduleEvent('schedule:bulk_changed', { weekStart: ws }, tenantId));

    res.status(201).json({
      success: true,
      data: { copied: totalCopied, skipped: totalSkipped, deleted: totalDeleted, weeks: targetWeekStarts.length },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

module.exports = router;
