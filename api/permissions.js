// ============================================================
//  permissions.js — הרשאות משתמש
//  לכל משתמש רשימת הרשאות. "ניהול המערכת" (is_admin) כולל את כולן.
//  השרת חוסם כל פעולה שאין לה הרשאה – האתר רק מסתיר את הכפתורים.
// ============================================================
import { forbidden } from './http.js';

export const PERMISSIONS = {
  clients_view: 'צפייה בלקוחות',
  clients_edit: 'עריכת לקוחות',
  nedarim_charge: 'טעינות וכרטיסים',
  exams_view: 'צפייה במבחנים',
  exams_manage: 'ניהול מבחנים',
  old_site: 'אתר ישן',
  admin: 'ניהול המערכת',
};

// ברירת מחדל למשתמש חדש: כל העבודה באתר, בלי ניהול המערכת
export const DEFAULT_PERMISSIONS = ['clients_view', 'clients_edit', 'nedarim_charge', 'exams_view', 'exams_manage', 'old_site'];

export function permissionsOf(account) {
  if (!account) return [];
  if (account.is_admin) return Object.keys(PERMISSIONS);
  let list = [];
  try { list = JSON.parse(account.permissions || '[]'); } catch { list = []; }
  return list.filter((p) => p !== 'admin' && PERMISSIONS[p]);
}

export function cleanPermissions(input) {
  return [...new Set((Array.isArray(input) ? input : []).filter((p) => p !== 'admin' && PERMISSIONS[p]))];
}

export const can = (ctx, perm) => permissionsOf(ctx?.account).includes(perm);

export function requirePermission(ctx, perm) {
  if (!can(ctx, perm)) throw forbidden(`אין לכם הרשאה: ${PERMISSIONS[perm] || perm}`);
}

export function requireAnyPermission(ctx, perms) {
  if (!perms.some((p) => can(ctx, p))) throw forbidden(`אין לכם הרשאה: ${perms.map((p) => PERMISSIONS[p]).join(' / ')}`);
}
