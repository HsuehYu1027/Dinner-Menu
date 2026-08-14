/**
 * 登入狀態。
 *
 * 只有擁有者需要登入；沒登入的訪客一樣看得到所有店家與菜單，只是不能改。
 * 前端把編輯按鈕藏起來只是為了畫面乾淨，真正擋住寫入的是資料庫的 RLS 規則。
 */

import { supabase, describeError } from './db.js';

let currentSession = null;
const listeners = new Set();

/** 讀取本機保存的登入狀態，網站啟動時呼叫一次。 */
export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  currentSession = data.session ?? null;

  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session ?? null;
    listeners.forEach((fn) => fn(isLoggedIn()));
  });

  return isLoggedIn();
}

export function isLoggedIn() {
  return currentSession !== null;
}

export function currentEmail() {
  return currentSession?.user?.email ?? null;
}

/** 註冊登入狀態變化的回呼，回傳取消註冊的函式。 */
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(describeError(error));
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(describeError(error));
}
