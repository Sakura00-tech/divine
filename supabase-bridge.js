/* Divine Mercy Supabase bridge. Browser-safe publishable key only. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://zkjyukyqwiwbqnvcxijs.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_KLWZMYvm-Cs1OZToGL8thA_ai4CLaji';
  const STORAGE_KEY = 'dm_church_data';
  const TABLES = ['announcements', 'schedule', 'posts'];
  const EMPTY = { announcements: [], schedule: [], posts: [], bookings: [], attendance: [], attendanceEvents: [], parishRecords: { baptism: [], firstCommunion: [], confirmation: [], marriage: [], death: [] } };

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Divine Mercy] Supabase JS did not load. Check network/CDN script order.');
    window.dmRefreshData = () => Promise.reject(new Error('Supabase client unavailable'));
    window.dmIsAdmin = async () => false;
    window.dmRequireAdmin = async () => false;
    window.dmLogin = async () => ({ ok: false, message: 'Supabase client unavailable. Reload the page.' });
    return;
  }

  const client = window.dmSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const nativeGet = Storage.prototype.getItem;
  const nativeSet = Storage.prototype.setItem;
  let ready = false;
  let busy = false;
  let baseline = null;
  let refreshTimer = null;
  const parse = raw => { try { return raw ? { ...EMPTY, ...JSON.parse(raw) } : structuredClone(EMPTY); } catch (_) { return structuredClone(EMPTY); } };
  const rawState = () => parse(nativeGet.call(localStorage, STORAGE_KEY));
  const writeLocal = state => nativeSet.call(localStorage, STORAGE_KEY, JSON.stringify(state));
  const dispatchUpdate = state => {
    try { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(state) })); } catch (_) {}
    window.dispatchEvent(new CustomEvent('dm:data-updated', { detail: state }));
  };

  async function currentAdmin() {
    const { data: { user } = {}, error } = await client.auth.getUser();
    if (error || !user) return false;
    // Verify through SECURITY DEFINER RPC so dm_admins RLS cannot hide the row.
    const { data, error: adminError } = await client.rpc('dm_is_admin');
    if (adminError) {
      console.error('[Divine Mercy] Admin verification RPC failed:', adminError.message || adminError);
      return false;
    }
    return data === true;
  }
  window.dmIsAdmin = currentAdmin;

  async function syncContent(state, onlyIfEmpty) {
    const { data: rows, error } = await client.from('dm_content').select('id,items');
    if (error) throw error;
    const existing = new Map((rows || []).map(r => [r.id, r.items]));
    for (const key of TABLES) {
      const old = existing.get(key);
      if (onlyIfEmpty && Array.isArray(old) && old.length) continue;
      const { error: upsertError } = await client.from('dm_content').upsert({ id: key, items: Array.isArray(state[key]) ? state[key] : [], updated_at: new Date().toISOString() });
      if (upsertError) throw upsertError;
    }
  }

  async function fetchCloud() {
    const state = rawState();
    const { data: content, error } = await client.from('dm_content').select('id,items');
    if (error) throw error;
    const admin = await currentAdmin();
    const cloudHasContent = (content || []).some(row => TABLES.includes(row.id) && Array.isArray(row.items) && row.items.length > 0);
    let migratedLocalContent = false;
    if (admin && !cloudHasContent) {
      const hasLocalContent = TABLES.some(key => Array.isArray(state[key]) && state[key].length > 0);
      if (hasLocalContent) { await syncContent(state, true); migratedLocalContent = true; }
    }
    if (!migratedLocalContent) (content || []).forEach(row => { if (TABLES.includes(row.id)) state[row.id] = Array.isArray(row.items) ? row.items : []; });
    if (admin) {
      const [bookings, attendance, events] = await Promise.all([
        client.from('dm_bookings').select('source_id,payload,status,created_at').order('created_at', { ascending: false }),
        client.from('dm_attendance').select('source_id,event_id,payload,created_at').order('created_at', { ascending: false }),
        client.from('dm_attendance_events').select('id,payload,is_active')
      ]);
      if (bookings.error) throw bookings.error;
      if (attendance.error) throw attendance.error;
      if (events.error) throw events.error;
      state.bookings = (bookings.data || []).map(r => ({ ...(r.payload || {}), id: r.source_id ?? r.payload?.id, status: r.status }));
      state.attendance = (attendance.data || []).map(r => ({ ...(r.payload || {}), id: r.source_id ?? r.payload?.id, eventId: r.payload?.eventId ?? r.event_id }));
      state.attendanceEvents = (events.data || []).map(r => ({ ...(r.payload || {}), id: r.id, active: r.is_active }));
    } else {
      // Never expose private booking or attendance rows in a public browser.
      state.bookings = [];
      // Keep only this browser's local attendance draft/history; private cloud rows are never fetched.
      const { data: events, error: eventError } = await client.from('dm_attendance_events').select('id,payload,is_active').eq('is_active', true);
      if (eventError) throw eventError;
      state.attendanceEvents = (events || []).map(r => ({ ...(r.payload || {}), id: r.id, active: r.is_active }));
    }
    writeLocal(state);
    baseline = structuredClone(state);
    dispatchUpdate(state);
    return state;
  }

  async function syncNewRows(before, after, admin) {
    const oldBookings = Array.isArray(before?.bookings) ? before.bookings : [];
    const newBookings = Array.isArray(after.bookings) ? after.bookings : [];
    const changedBookings = admin ? newBookings : newBookings.filter(b => !oldBookings.some(o => String(o.id) === String(b.id)));
    for (const b of changedBookings) {
      const sourceId = String(b.id ?? b.createdAt ?? ('booking_' + crypto.randomUUID()));
      const payload = { ...b, id: sourceId };
      const { error } = await client.from('dm_bookings').upsert({ source_id: sourceId, payload, status: String(b.status || 'pending') }, { onConflict: 'source_id' });
      if (error) throw error;
    }

    const oldAttendance = Array.isArray(before?.attendance) ? before.attendance : [];
    const attendance = Array.isArray(after.attendance) ? after.attendance : [];
    const newAttendance = admin ? attendance : attendance.filter(a => !oldAttendance.some(o => String(o.id) === String(a.id)));
    for (const a of newAttendance) {
      const sourceId = String(a.id ?? ('attendance_' + crypto.randomUUID()));
      const eventId = String(a.eventId || '');
      if (!eventId) { console.warn('[Divine Mercy] Skipping attendance row without eventId.'); continue; }
      const payload = { ...a, id: sourceId };
      const { error } = await client.from('dm_attendance').upsert({ source_id: sourceId, event_id: eventId, payload }, { onConflict: 'source_id' });
      if (error) throw error;
    }

    if (!admin && before) {
      for (const a of attendance) {
        const old = oldAttendance.find(o => String(o.id) === String(a.id));
        if (old && old.timeOut !== a.timeOut && a.timeOut) {
          const { error } = await client.rpc('dm_mark_attendance_timeout', { p_source_id: String(a.id), p_time_out: String(a.timeOut) });
          if (error) throw error;
        }
      }
    }

    if (admin) {
      const currentBookingIds = new Set(newBookings.map(b => String(b.id)));
      for (const old of oldBookings) {
        if (old.id != null && !currentBookingIds.has(String(old.id))) {
          const { error } = await client.from('dm_bookings').delete().eq('source_id', String(old.id));
          if (error) throw error;
        }
      }
      const currentAttendanceIds = new Set(attendance.map(a => String(a.id)));
      for (const old of oldAttendance) {
        if (old.id != null && !currentAttendanceIds.has(String(old.id))) {
          const { error } = await client.from('dm_attendance').delete().eq('source_id', String(old.id));
          if (error) throw error;
        }
      }
      const oldEvents = Array.isArray(before?.attendanceEvents) ? before.attendanceEvents : [];
      const currentEventIds = new Set((Array.isArray(after.attendanceEvents) ? after.attendanceEvents : []).map(ev => String(ev.id)));
      for (const old of oldEvents) {
        if (old.id != null && !currentEventIds.has(String(old.id))) {
          const { error } = await client.from('dm_attendance_events').delete().eq('id', String(old.id));
          if (error) throw error;
        }
      }
      for (const ev of (Array.isArray(after.attendanceEvents) ? after.attendanceEvents : [])) {
        const sourceId = String(ev.id || '');
        if (!sourceId) continue;
        const { error } = await client.from('dm_attendance_events').upsert({ id: sourceId, payload: ev, is_active: ev.active !== false });
        if (error) throw error;
      }
      // Admin changes to existing events (including deactivation) are persisted above.
      void oldEvents;
    }
  }

  async function persistChange(next) {
    if (!ready || busy) return;
    busy = true;
    try {
      const admin = await currentAdmin();
      const before = baseline || EMPTY;
      if (admin) await syncContent(next, false);
      await syncNewRows(before, next, admin);
      baseline = structuredClone(next);
    } catch (error) {
      console.error('[Divine Mercy] Cloud save failed:', error.message || error);
      window.dispatchEvent(new CustomEvent('dm:sync-error', { detail: error }));
    } finally { busy = false; }
  }

  Storage.prototype.getItem = function (key) {
    if (key === STORAGE_KEY) return nativeGet.call(this, key) || JSON.stringify(EMPTY);
    return nativeGet.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    const previous = key === STORAGE_KEY ? parse(nativeGet.call(this, key)) : null;
    nativeSet.call(this, key, value);
    if (key === STORAGE_KEY && ready) {
      const next = parse(value);
      // Keep the comparison baseline from the last successful cloud load/save.
      persistChange(next);
      if (previous && !baseline) baseline = previous;
    }
  };

  window.dmRefreshData = async function () {
    const state = await fetchCloud();
    ready = true;
    return state;
  };
  window.dmLogin = async function (email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    // Check admin membership through the database function, not a direct table query.
    const { data: isAdmin, error: adminError } = await client.rpc('dm_is_admin');
    if (adminError || isAdmin !== true) {
      console.error('[Divine Mercy] Admin verification:', adminError?.message || 'User ID is not registered', 'User ID:', data.user?.id);
      await client.auth.signOut();
      return {
        ok: false,
        message: adminError
          ? 'Administrator verification failed. Please run admin-login-fix.sql in Supabase SQL Editor.'
          : 'This signed-in account is not registered as an administrator. Please run admin-login-fix.sql in Supabase SQL Editor.'
      };
    }
    sessionStorage.setItem('dm_admin_logged_in', 'true');
    sessionStorage.setItem('dm_admin_role', 'admin');
    return { ok: true };
  };
  window.dmRequireAdmin = async function () {
    if (!(await currentAdmin())) {
      await client.auth.signOut();
      sessionStorage.removeItem('dm_admin_logged_in');
      sessionStorage.removeItem('dm_admin_role');
      location.replace('admin-login.html');
      return false;
    }
    sessionStorage.setItem('dm_admin_logged_in', 'true');
    sessionStorage.setItem('dm_admin_role', 'admin');
    return true;
  };
  window.dmLogout = async function () {
    await client.auth.signOut();
    sessionStorage.removeItem('dm_admin_logged_in');
    sessionStorage.removeItem('dm_admin_role');
    location.href = 'admin-login.html';
  };
  window.dmSendPasswordReset = async function (email) {
    return client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, 'admin-login.html') });
  };
  // Persist attendance event definitions immediately so public QR pages on other devices can see them.
  window.dmSaveAttendanceEvents = async function (events) {
    if (!(await currentAdmin())) throw new Error('Admin access only.');
    const list = Array.isArray(events) ? events : [];
    const { data: existing, error: readError } = await client.from('dm_attendance_events').select('id');
    if (readError) throw readError;
    const keep = new Set(list.map(ev => String(ev.id)));
    for (const row of (existing || [])) {
      if (!keep.has(String(row.id))) {
        const { error } = await client.from('dm_attendance_events').delete().eq('id', String(row.id));
        if (error) throw error;
      }
    }
    for (const ev of list) {
      const id = String(ev.id || '');
      if (!id) continue;
      const { error } = await client.from('dm_attendance_events').upsert({ id, payload: ev, is_active: ev.active !== false });
      if (error) throw error;
    }
    return true;
  };

  window.dmRecordAttendance = async function (record) {
    const { data, error } = await client.rpc('dm_record_attendance', {
      p_event_id: String(record.eventId), p_name: String(record.name),
      p_ministry: String(record.ministry), p_date: String(record.date), p_time: String(record.time)
    });
    if (error) throw error;
    return data;
  };

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      sessionStorage.removeItem('dm_admin_logged_in');
      sessionStorage.removeItem('dm_admin_role');
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(() => window.dmRefreshData?.().catch(console.error), 0);
  });

  client.channel('dm-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_content' }, () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => window.dmRefreshData().catch(console.error), 150); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_attendance_events' }, () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => window.dmRefreshData().catch(console.error), 150); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_bookings' }, () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => window.dmRefreshData().catch(console.error), 150); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_attendance' }, () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => window.dmRefreshData().catch(console.error), 150); })
    .subscribe();

  client.auth.getSession().then(() => window.dmRefreshData().catch(error => console.error('[Divine Mercy] Initial cloud load failed:', error.message || error)));
  window.addEventListener('focus', () => { if (ready) window.dmRefreshData().catch(console.error); });
  window.addEventListener('dm:data-updated', () => {
    try {
      if (typeof window.load === 'function') window.load();
      ['renderAnnouncements', 'renderSchedule', 'renderPosts', 'renderBookings'].forEach(name => { if (typeof window[name] === 'function') window[name](); });
    } catch (error) { console.warn('[Divine Mercy] UI refresh:', error); }
  });
})();
