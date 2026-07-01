/**
 * General Barber Shop — API Client
 * یک فایل مشترک برای اتصال همه صفحات به بک‌اند
 * این فایل رو با <script src="api.js"></script> قبل از اسکریپت اصلی هر صفحه لود کن
 */

const API_BASE = (() => {
  // در توسعه از localhost، در تولید از همون دامنه استفاده می‌کنه
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return '/api';
})();

const BarberAPI = {

  // ── TOKEN MANAGEMENT ──
  getToken(role = 'customer') {
    return localStorage.getItem(`gbs_token_${role}`);
  },
  setToken(token, role = 'customer') {
    localStorage.setItem(`gbs_token_${role}`, token);
  },
  clearToken(role = 'customer') {
    localStorage.removeItem(`gbs_token_${role}`);
  },
  isLoggedIn(role = 'customer') {
    return !!this.getToken(role);
  },

  // ── CORE REQUEST ──
  async request(method, path, body = null, role = 'customer', isFormData = false) {
    const token = this.getToken(role);
    const headers = {};
    if (!isFormData) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = new Error(data.error || 'خطایی رخ داد');
        error.status = res.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        const netErr = new Error('اتصال به سرور برقرار نشد. اینترنت رو چک کن.');
        netErr.isNetworkError = true;
        throw netErr;
      }
      throw err;
    }
  },

  get(path, role)        { return this.request('GET', path, null, role); },
  post(path, body, role) { return this.request('POST', path, body, role); },
  patch(path, body, role){ return this.request('PATCH', path, body, role); },
  del(path, role)        { return this.request('DELETE', path, null, role); },

  // ═══════════════════════════════════
  // AUTH
  // ═══════════════════════════════════
  auth: {
    sendOtp(phone) {
      return BarberAPI.post('/auth/send-otp', { phone });
    },
    async verifyOtp(phone, code) {
      const res = await BarberAPI.post('/auth/verify-otp', { phone, code });
      if (res.success) BarberAPI.setToken(res.token, 'customer');
      return res;
    },
    async adminLogin(pin) {
      const res = await BarberAPI.post('/auth/admin/login', { pin });
      if (res.success) BarberAPI.setToken(res.token, 'admin');
      return res;
    },
    async workerLogin(phone, password) {
      const res = await BarberAPI.post('/auth/worker/login', { phone, password });
      if (res.success) BarberAPI.setToken(res.token, 'worker');
      return res;
    },
    me() { return BarberAPI.get('/auth/me', 'customer'); },
    workerMe() { return BarberAPI.get('/auth/worker/me', 'worker'); },
    logout(role = 'customer') { BarberAPI.clearToken(role); }
  },

  // ═══════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════
  services: {
    list(category) {
      const q = category ? `?category=${category}` : '';
      return BarberAPI.get(`/services${q}`);
    },
    get(id) { return BarberAPI.get(`/services/${id}`); },
  },

  // ═══════════════════════════════════
  // WORKERS
  // ═══════════════════════════════════
  workers: {
    list() { return BarberAPI.get('/workers'); },
    myStats() { return BarberAPI.get('/workers/me/stats', 'worker'); },
    mySchedule() { return BarberAPI.get('/workers/me/schedule', 'worker'); },
    myLeaves() { return BarberAPI.get('/workers/me/leaves', 'worker'); },
    requestLeave(data) { return BarberAPI.post('/workers/me/leaves', data, 'worker'); },
    updateProfile(data) { return BarberAPI.patch('/workers/me', data, 'worker'); },
  },

  // ═══════════════════════════════════
  // APPOINTMENTS
  // ═══════════════════════════════════
  appointments: {
    getSlots(workerId, date, serviceIds) {
      const ids = serviceIds.join(',');
      return BarberAPI.get(`/appointments/slots?worker_id=${workerId}&date=${date}&service_ids=${ids}`);
    },
    create(data) { return BarberAPI.post('/appointments', data, 'customer'); },
    myList(status, page = 1) {
      const q = `?page=${page}${status ? `&status=${status}` : ''}`;
      return BarberAPI.get(`/appointments/my${q}`, 'customer');
    },
    cancel(id, reason) { return BarberAPI.patch(`/appointments/${id}/cancel`, { reason }, 'customer'); },
    workerList(date) {
      const q = date ? `?date=${date}` : '';
      return BarberAPI.get(`/appointments/worker${q}`, 'worker');
    },
    markDone(id) { return BarberAPI.patch(`/appointments/${id}/done`, {}, 'worker'); },
  },

  // ═══════════════════════════════════
  // CUSTOMER (profile, wallet, points, saved)
  // ═══════════════════════════════════
  customer: {
    me() { return BarberAPI.get('/customers/me', 'customer'); },
    update(data) { return BarberAPI.patch('/customers/me', data, 'customer'); },
    saved() { return BarberAPI.get('/customers/me/saved', 'customer'); },
    toggleSave(serviceId) { return BarberAPI.post(`/customers/me/saved/${serviceId}`, {}, 'customer'); },
    wallet() { return BarberAPI.get('/customers/me/wallet', 'customer'); },
    points() { return BarberAPI.get('/customers/me/points', 'customer'); },
  },

  // ═══════════════════════════════════
  // REVIEWS
  // ═══════════════════════════════════
  reviews: {
    forWorker(workerId, page = 1) { return BarberAPI.get(`/reviews/worker/${workerId}?page=${page}`); },
    submit(data) { return BarberAPI.post('/reviews', data, 'customer'); },
  },

  // ═══════════════════════════════════
  // COUPONS
  // ═══════════════════════════════════
  coupons: {
    validate(code, totalPrice) {
      return BarberAPI.post('/coupons/validate', { code, total_price: totalPrice }, 'customer');
    },
  },

  // ═══════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════
  payments: {
    initiate(appointmentId) { return BarberAPI.post('/payments/initiate', { appointment_id: appointmentId }, 'customer'); },
    chargeWallet(amount) { return BarberAPI.post('/payments/wallet/charge', { amount }, 'customer'); },
  },

  // ═══════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════
  notifications: {
    list(type, page = 1) {
      const q = `?page=${page}${type && type !== 'all' ? `&type=${type}` : ''}`;
      return BarberAPI.get(`/notifications${q}`, 'customer');
    },
    markRead(id) { return BarberAPI.patch(`/notifications/${id}/read`, {}, 'customer'); },
    markAllRead() { return BarberAPI.patch('/notifications/read-all', {}, 'customer'); },
    delete(id) { return BarberAPI.del(`/notifications/${id}`, 'customer'); },
  },

  // ═══════════════════════════════════
  // GALLERY
  // ═══════════════════════════════════
  gallery: {
    list(workerId) {
      const q = workerId ? `?worker_id=${workerId}` : '';
      return BarberAPI.get(`/gallery${q}`);
    },
    upload(file, caption) {
      const fd = new FormData();
      fd.append('image', file);
      if (caption) fd.append('caption', caption);
      return BarberAPI.request('POST', '/gallery/upload', fd, 'customer', true);
    },
  },

  // ═══════════════════════════════════
  // SURVEYS
  // ═══════════════════════════════════
  surveys: {
    active() { return BarberAPI.get('/surveys/active'); },
    respond(id, answers) { return BarberAPI.post(`/surveys/${id}/respond`, { answers }, 'customer'); },
  },

  // ═══════════════════════════════════
  // CHATBOT
  // ═══════════════════════════════════
  chatbot: {
    send(message) { return BarberAPI.post('/chatbot/message', { message }); },
    suggestions() { return BarberAPI.get('/chatbot/suggestions'); },
  },

  // ═══════════════════════════════════
  // DATE / CALENDAR (Jalali)
  // ═══════════════════════════════════
  calendar: {
    getMonth(jy, jm) {
      const q = (jy && jm) ? `?jy=${jy}&jm=${jm}` : '';
      return BarberAPI.get(`/settings/jalali-calendar${q}`);
    },
    jalaliToGregorian(displayDate) {
      return BarberAPI.get(`/settings/jalali-to-gregorian?date=${encodeURIComponent(displayDate)}`);
    },
    gregorianToJalali(isoDate) {
      return BarberAPI.get(`/settings/gregorian-to-jalali?date=${isoDate}`);
    },
  },

  // ═══════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════
  admin: {
    dashboard() { return BarberAPI.get('/admin/dashboard', 'admin'); },
    setTarget(amount) { return BarberAPI.post('/admin/target', { amount }, 'admin'); },
    report(from, to) { return BarberAPI.get(`/admin/report?from=${from}&to=${to}`, 'admin'); },
    waitingList() { return BarberAPI.get('/admin/waiting-list', 'admin'); },

    appointments(filters = {}) {
      const q = new URLSearchParams(filters).toString();
      return BarberAPI.get(`/appointments?${q}`, 'admin');
    },
    transferAppointment(id, newWorkerId) {
      return BarberAPI.patch(`/appointments/${id}/transfer`, { new_worker_id: newWorkerId }, 'admin');
    },

    customers(filters = {}) {
      const q = new URLSearchParams(filters).toString();
      return BarberAPI.get(`/customers?${q}`, 'admin');
    },
    blacklistCustomer(id, blacklisted) {
      return BarberAPI.patch(`/customers/${id}/blacklist`, { is_blacklisted: blacklisted }, 'admin');
    },

    createService(data) { return BarberAPI.post('/services', data, 'admin'); },
    updateService(id, data) { return BarberAPI.patch(`/services/${id}`, data, 'admin'); },
    deleteService(id) { return BarberAPI.del(`/services/${id}`, 'admin'); },

    createWorker(data) { return BarberAPI.post('/workers', data, 'admin'); },
    approveLeave(id, status) { return BarberAPI.patch(`/workers/leaves/${id}`, { status }, 'admin'); },

    pendingReviews() { return BarberAPI.get('/reviews/pending', 'admin'); },
    reviewStatus(id, status) { return BarberAPI.patch(`/reviews/${id}/status`, { status }, 'admin'); },

    coupons() { return BarberAPI.get('/coupons', 'admin'); },
    createCoupon(data) { return BarberAPI.post('/coupons', data, 'admin'); },
    toggleCoupon(id) { return BarberAPI.patch(`/coupons/${id}/toggle`, {}, 'admin'); },

    campaigns() { return BarberAPI.get('/campaigns', 'admin'); },
    createCampaign(data) { return BarberAPI.post('/campaigns', data, 'admin'); },
    sendCampaign(id) { return BarberAPI.post(`/campaigns/${id}/send`, {}, 'admin'); },

    sendNotification(data) { return BarberAPI.post('/notifications/send', data, 'admin'); },

    settings() { return BarberAPI.get('/settings', 'admin'); },
    updateSettings(data) { return BarberAPI.patch('/settings', data, 'admin'); },

    pendingGallery() { return BarberAPI.get('/gallery?approved=0', 'admin'); },
    approveGallery(id) { return BarberAPI.patch(`/gallery/${id}/approve`, {}, 'admin'); },

    surveys() { return BarberAPI.get('/surveys', 'admin'); },
    createSurvey(data) { return BarberAPI.post('/surveys', data, 'admin'); },
    toggleSurvey(id) { return BarberAPI.patch(`/surveys/${id}/toggle`, {}, 'admin'); },
    surveyResults(id) { return BarberAPI.get(`/surveys/${id}/results`, 'admin'); },
    deleteSurvey(id) { return BarberAPI.del(`/surveys/${id}`, 'admin'); },
  },
};

// ── UTILITY: Persian number formatting ──
BarberAPI.utils = {
  toPersianDigits(num) {
    return String(num).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  },
  formatPrice(num) {
    return this.toPersianDigits(Number(num).toLocaleString('en-US'));
  },
  // Redirect helper for guarding pages
  requireAuth(role = 'customer', redirectTo = 'login.html') {
    if (!BarberAPI.isLoggedIn(role)) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  }
};

if (typeof module !== 'undefined') module.exports = BarberAPI;
