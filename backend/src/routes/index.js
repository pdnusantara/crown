const router = require('express').Router();

const { enforceSubscription } = require('../middleware/enforceSubscription');

const publicRoutes = require('./public');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const tenantRoutes = require('./tenants');
const branchRoutes = require('./branches');
const serviceRoutes = require('./services');
const customerRoutes = require('./customers');
const transactionRoutes = require('./transactions');
const queueRoutes = require('./queue');
const bookingRoutes = require('./bookings');
const voucherRoutes = require('./vouchers');
const subscriptionRoutes = require('./subscriptions');
const packageRoutes = require('./packages');
const featureFlagRoutes = require('./featureFlags');
const ticketRoutes = require('./tickets');
const broadcastRoutes = require('./broadcasts');
const shiftRoutes = require('./shifts');
const reportRoutes = require('./reports');
const errorLogRoutes = require('./errorLogs');
const whatsappRoutes = require('./whatsapp');
const paymentRoutes  = require('./payment');
const promotionRoutes = require('./promotions');
const landingRoutes  = require('./landing');
const superAdminUsageRoutes = require('./superAdminUsage');
const superAdminAuditLogRoutes = require('./superAdminAuditLog');
const barberScheduleRoutes = require('./barberSchedules');
const barberRatingRoutes = require('./barberRatings');
const shopRatingRoutes = require('./shopRatings');
const expenseRoutes = require('./expenses');
const auditLogRoutes = require('./auditLogs');
const attendanceRoutes = require('./attendance');
const affiliatesRoutes = require('./affiliates');
const affiliateSelfRoutes = require('./affiliate');

// Tolak operasi tulis dari tenant yang langganannya berakhir (allowlist:
// auth/subscriptions/payment/public/landing). GET tetap lolos.
router.use(enforceSubscription);

router.use('/public', publicRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/branches', branchRoutes);
router.use('/services', serviceRoutes);
router.use('/customers', customerRoutes);
router.use('/transactions', transactionRoutes);
router.use('/queue', queueRoutes);
router.use('/bookings', bookingRoutes);
router.use('/vouchers', voucherRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/packages', packageRoutes);
router.use('/feature-flags', featureFlagRoutes);
router.use('/tickets', ticketRoutes);
router.use('/broadcasts', broadcastRoutes);
router.use('/shifts', shiftRoutes);
router.use('/reports', reportRoutes);
router.use('/error-logs', errorLogRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/payment',  paymentRoutes);
router.use('/promotions', promotionRoutes);
router.use('/landing',    landingRoutes);
router.use('/super-admin/usage', superAdminUsageRoutes);
router.use('/super-admin/audit-log', superAdminAuditLogRoutes);
router.use('/barber-schedules', barberScheduleRoutes);
router.use('/barber-ratings',   barberRatingRoutes);
router.use('/shop-ratings',     shopRatingRoutes);
router.use('/expenses',         expenseRoutes);
router.use('/audit-logs',       auditLogRoutes);
router.use('/attendance',       attendanceRoutes);
router.use('/affiliates',       affiliatesRoutes);
router.use('/affiliate',        affiliateSelfRoutes);

module.exports = router;
