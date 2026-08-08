# 个人设置功能完善 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已登录用户提供独立的个人设置页面，支持修改用户名/职业/密码/密保，并扩展 AuthContext 实现用户名即时同步。

**Architecture:** 新建 3 个 API 路由（PATCH `/api/user/profile`、PUT `/api/user/password`、PUT `/api/user/security`）+ 1 个 `/settings` 页面。修改 AuthContext 新增 `updateUser` 方法，修改 Sidebar 增加导航入口。所有 API 遵循 `getTokenFromHeaders` → `verifyToken` → `prisma.user.update` 的现有模式。

**Tech Stack:** Next.js 16 (App Router), Prisma + MySQL, bcryptjs, Tailwind CSS

## Global Constraints

- 禁止使用英文，所有文案使用中文
- 所有 API 路由必须验证 `Authorization: Bearer <token>` 请求头
- 前端 fetch 必须携带 `Authorization` 请求头（token 来自 `useAuth()`）
- 游客账号（`isGuest: true`）禁止修改账户信息
- TypeScript 编译必须零错误（`npx tsc --noEmit`）

---

### Task 1: AuthContext — 新增 `updateUser` 方法

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: 现有的 `User` 接口 `{ id, username, isGuest, professionId? }`
- Produces: `updateUser(partial: Partial<User>) => void` — 更新 user state + localStorage

- [ ] **Step 1: 在 AuthContextType 接口中添加 `updateUser` 声明**

在 `AuthContextType` 接口的 `refreshCredits` 之后添加：
```ts
  /** 部分更新当前用户信息（如用户名），同步写入 localStorage */
  updateUser: (partial: Partial<User>) => void;
```

- [ ] **Step 2: 在 AuthProvider 中实现 `updateUser`**

在 `refreshCredits` 函数定义之后添加：
```ts
  const updateUser = (partial: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const merged = { ...prev, ...partial };
      localStorage.setItem('user', JSON.stringify(merged));
      localStorage.setItem('auth_user', JSON.stringify(merged));
      return merged;
    });
  };
```

- [ ] **Step 3: 将 `updateUser` 加入 Provider value**

在 `AuthContext.Provider` 的 `value` 对象中添加 `updateUser`：
```ts
      <AuthContext.Provider value={{ user, token, login, logout, loading, creditsVersion, refreshCredits, updateUser }}>
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: AuthContext 新增 updateUser 方法"
```

---

### Task 2: API — PATCH `/api/user/profile` 修改用户名/职业

**Files:**
- Create: `src/app/api/user/profile/route.ts`

**Interfaces:**
- Consumes: `getTokenFromHeaders`, `verifyToken` from `@/lib/auth`; `prisma` from `@/lib/prisma`
- Produces: `PATCH` handler, 接受 `{ username?: string, occupation?: string }`，返回 `{ user: { id, username, occupation } }` 或错误

- [ ] **Step 1: 创建 API 路由文件**

```ts
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function isValidUsername(u: string): boolean {
  return typeof u === 'string' && u.length >= 3 && u.length <= 20;
}

export async function PATCH(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    if (payload.isGuest) {
      return NextResponse.json({ error: '游客账号不支持此操作，请先注册' }, { status: 403 });
    }

    const body = await request.json();
    const { username, occupation } = body || {};

    if (!username && occupation === undefined) {
      return NextResponse.json({ error: '请至少提供用户名或职业' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    // 用户名校验
    if (username !== undefined) {
      if (!isValidUsername(username)) {
        return NextResponse.json({ error: '用户名长度需在3-20个字符之间' }, { status: 400 });
      }
      // 唯一性查重（排除自身）
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== payload.userId) {
        return NextResponse.json({ error: '用户名已被占用' }, { status: 409 });
      }
      data.username = username;
    }

    // 职业
    if (occupation !== undefined) {
      const occ = typeof occupation === 'string' ? occupation.trim() : '';
      if (occ.length > 50) {
        return NextResponse.json({ error: '职业名称不能超过50个字符' }, { status: 400 });
      }
      data.occupation = occ || null;
    }

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data,
      select: { id: true, username: true, occupation: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('修改个人信息失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 3: Commit**

```bash
git add src/app/api/user/profile/route.ts
git commit -m "feat: 新增 PATCH /api/user/profile 修改用户名/职业 API"
```

---

### Task 3: API — PUT `/api/user/password` 修改密码

**Files:**
- Create: `src/app/api/user/password/route.ts`

**Interfaces:**
- Consumes: `getTokenFromHeaders`, `verifyToken` from `@/lib/auth`; `prisma` from `@/lib/prisma`; `bcrypt` from `bcryptjs`
- Produces: `PUT` handler，接受 `{ oldPassword: string, newPassword: string }`，返回 `{ success: true }` 或错误

- [ ] **Step 1: 创建 API 路由文件**

```ts
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

function isValidPassword(p: string): boolean {
  return typeof p === 'string' && p.length >= 6;
}

export async function PUT(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    if (payload.isGuest) {
      return NextResponse.json({ error: '游客账号不支持此操作，请先注册' }, { status: 403 });
    }

    const body = await request.json();
    const { oldPassword, newPassword } = body || {};

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: '请输入当前密码和新密码' }, { status: 400 });
    }
    if (!isValidPassword(newPassword)) {
      return NextResponse.json({ error: '新密码至少需要6个字符' }, { status: 400 });
    }
    if (oldPassword === newPassword) {
      return NextResponse.json({ error: '新密码不能与当前密码相同' }, { status: 400 });
    }

    // 获取当前用户密码哈希
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { password: true },
    });
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    // 验证旧密码
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: '当前密码不正确' }, { status: 400 });
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: payload.userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('修改密码失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 3: Commit**

```bash
git add src/app/api/user/password/route.ts
git commit -m "feat: 新增 PUT /api/user/password 修改密码 API"
```

---

### Task 4: API — PUT `/api/user/security` 设置密保

**Files:**
- Create: `src/app/api/user/security/route.ts`

**Interfaces:**
- Consumes: `getTokenFromHeaders`, `verifyToken` from `@/lib/auth`; `prisma` from `@/lib/prisma`; `bcrypt` from `bcryptjs`; `PREDEFINED_QUESTIONS` from `@/lib/securityQuestions`
- Produces: `PUT` handler，接受 `{ securityQuestion: string, securityAnswer: string }`，返回 `{ success: true }` 或错误

- [ ] **Step 1: 创建 API 路由文件**

```ts
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { PREDEFINED_QUESTIONS } from '@/lib/securityQuestions';

export async function PUT(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    if (payload.isGuest) {
      return NextResponse.json({ error: '游客账号不支持此操作，请先注册' }, { status: 403 });
    }

    const body = await request.json();
    const { securityQuestion, securityAnswer } = body || {};

    if (!securityQuestion || !securityAnswer) {
      return NextResponse.json({ error: '密保问题和答案不能为空' }, { status: 400 });
    }

    const validKeys = PREDEFINED_QUESTIONS.map((q) => q.key);
    if (!validKeys.includes(securityQuestion)) {
      return NextResponse.json({ error: '无效的密保问题' }, { status: 400 });
    }

    const answerTrimmed = String(securityAnswer).trim();
    if (answerTrimmed.length < 2) {
      return NextResponse.json({ error: '密保答案至少2个字符' }, { status: 400 });
    }

    const securityAnswerHash = await bcrypt.hash(answerTrimmed.toLowerCase(), 10);

    await prisma.user.update({
      where: { id: payload.userId },
      data: { securityQuestion, securityAnswerHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('设置密保失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 3: Commit**

```bash
git add src/app/api/user/security/route.ts
git commit -m "feat: 新增 PUT /api/user/security 设置密保 API"
```

---

### Task 5: Settings 页面 — `src/app/settings/page.tsx`

**Files:**
- Create: `src/app/settings/page.tsx`
- Modify: `src/app/api/auth/me/route.ts` — 在 select 和响应中添加 `securityQuestion` 字段

**Interfaces:**
- Consumes: `useAuth` from `@/contexts/AuthContext`; `useRouter` from `next/navigation`; `useDialog` from `@/components/DialogProvider`; `PREDEFINED_QUESTIONS` from `@/lib/securityQuestions`; `getQuestionText` from `@/lib/securityQuestions`; `GET /api/auth/me` (扩展后返回 `securityQuestion`)
- Produces: 完整的 `/settings` 页面组件，四区卡片布局

- [ ] **Step 1: 扩展 `/api/auth/me` 返回密保问题状态**

在 `src/app/api/auth/me/route.ts` 中，修改 `select` 添加 `securityQuestion: true`：

```ts
      select: {
        id: true,
        username: true,
        isGuest: true,
        disabled: true,
        createdAt: true,
        professionId: true,
        occupation: true,
        securityQuestion: true,
        profession: { select: { id: true, name: true } },
      },
```

同时在返回的 `user` 对象中添加 `securityQuestion`：

```ts
      return NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          isGuest: user.isGuest,
          disabled: user.disabled,
          createdAt: user.createdAt,
          professionId: user.professionId ?? null,
          professionName: user.profession?.name ?? null,
          occupation: user.occupation ?? null,
          securityQuestion: user.securityQuestion ?? null,
        },
      });
```

- [ ] **Step 2: 创建 Settings 页面**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/components/DialogProvider';
import { PREDEFINED_QUESTIONS, getQuestionText } from '@/lib/securityQuestions';

export default function SettingsPage() {
  const { user, token, logout, updateUser } = useAuth();
  const router = useRouter();
  const dialog = useDialog();

  // 基本信息
  const [username, setUsername] = useState('');
  const [occupation, setOccupation] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // 修改密码
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');

  // 密保
  const [secQuestion, setSecQuestion] = useState('');
  const [secAnswer, setSecAnswer] = useState('');
  const [currentSecQuestion, setCurrentSecQuestion] = useState<string | null>(null);
  const [secLoading, setSecLoading] = useState(false);
  const [secError, setSecError] = useState('');

  // 退出登录
  const [showLogout, setShowLogout] = useState(false);

  // 加载当前用户信息
  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUsername(data.user.username || '');
          setOccupation(data.user.occupation || '');
          if (data.user.securityQuestion) {
            setCurrentSecQuestion(data.user.securityQuestion);
          }
        }
      })
      .catch(() => {});
  }, [token]);

  // 保存基本信息
  async function handleSaveProfile() {
    if (!username.trim() || username.trim().length < 3) {
      setProfileError('用户名长度需在3-20个字符之间');
      return;
    }
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          occupation: occupation.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // 同步更新 AuthContext 中的用户名
        updateUser({ username: data.user.username });
        await dialog.alert({ title: '保存成功', message: '基本信息已更新' });
      } else if (res.status === 409) {
        setProfileError('用户名已被占用');
      } else {
        setProfileError(data.error || '保存失败');
      }
    } catch {
      setProfileError('网络错误，请稍后重试');
    } finally {
      setProfileLoading(false);
    }
  }

  // 修改密码
  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('新密码至少需要6个字符');
      return;
    }
    setPwdLoading(true);
    setPwdError('');
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await dialog.alert({ title: '修改成功', message: '密码已更新，下次登录请使用新密码' });
      } else {
        setPwdError(data.error || '修改失败');
      }
    } catch {
      setPwdError('网络错误，请稍后重试');
    } finally {
      setPwdLoading(false);
    }
  }

  // 保存密保
  async function handleSaveSecurity() {
    if (!secQuestion) {
      setSecError('请选择密保问题');
      return;
    }
    if (!secAnswer.trim() || secAnswer.trim().length < 2) {
      setSecError('密保答案至少需要2个字符');
      return;
    }
    setSecLoading(true);
    setSecError('');
    try {
      const res = await fetch('/api/user/security', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          securityQuestion: secQuestion,
          securityAnswer: secAnswer.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentSecQuestion(secQuestion);
        setSecAnswer('');
        await dialog.alert({ title: '保存成功', message: '密保信息已更新' });
      } else {
        setSecError(data.error || '保存失败');
      }
    } catch {
      setSecError('网络错误，请稍后重试');
    } finally {
      setSecLoading(false);
    }
  }

  // 退出登录
  function handleLogout() {
    logout();
    window.location.href = '/login';
  }

  // 密码一致性
  const pwdMismatch = confirmPassword && newPassword !== confirmPassword;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">请先登录</p>
      </div>
    );
  }

  if (user.isGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 text-lg mb-4">游客账号不支持个人设置</p>
          <button
            onClick={() => router.push('/login?mode=register')}
            className="bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            注册账号
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 头部 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">⚙️ 个人设置</h1>
        <p className="text-sm text-slate-500 mt-1">管理账户信息与安全设置</p>
      </div>

      {/* 第一行：基本信息 + 修改密码 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 基本信息 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">👤 基本信息</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setProfileError(''); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                maxLength={20}
                minLength={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">职业</label>
              <input
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="例如：软件工程师"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                maxLength={50}
              />
            </div>
            {profileError && (
              <p className="text-xs text-red-500">{profileError}</p>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={profileLoading || !username.trim()}
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {profileLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* 修改密码 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">🔒 修改密码</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">当前密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => { setOldPassword(e.target.value); setPwdError(''); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPwdError(''); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                placeholder="至少6个字符"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPwdError(''); }}
                className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 ${
                  pwdMismatch ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
              />
              {pwdMismatch && (
                <p className="text-xs text-red-500 mt-1">两次输入的新密码不一致</p>
              )}
            </div>
            {pwdError && (
              <p className="text-xs text-red-500">{pwdError}</p>
            )}
            <button
              onClick={handleChangePassword}
              disabled={pwdLoading || !oldPassword || !newPassword || !confirmPassword || pwdMismatch}
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {pwdLoading ? '修改中...' : '修改密码'}
            </button>
          </div>
        </div>
      </div>

      {/* 第二行：密保设置 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">🛡️ 密保设置</h3>
        <p className="text-xs text-slate-400 mb-4">密保用于忘记密码时找回账号，请妥善保管答案</p>

        {currentSecQuestion && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
            <span className="text-sm text-emerald-700">
              当前问题：{getQuestionText(currentSecQuestion)}
            </span>
            <span className="text-xs text-emerald-500 bg-emerald-100 px-1.5 py-0.5 rounded">已设置</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1.5">密保问题</label>
            <select
              value={secQuestion}
              onChange={(e) => { setSecQuestion(e.target.value); setSecError(''); }}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="">-- 请选择 --</option>
              {PREDEFINED_QUESTIONS.map((q) => (
                <option key={q.key} value={q.key}>{q.text}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1.5">密保答案</label>
            <input
              type="text"
              value={secAnswer}
              onChange={(e) => { setSecAnswer(e.target.value); setSecError(''); }}
              placeholder="至少2个字符"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
              maxLength={100}
            />
          </div>
        </div>
        {secError && (
          <p className="text-xs text-red-500 mt-2">{secError}</p>
        )}
        <div className="mt-4">
          <button
            onClick={handleSaveSecurity}
            disabled={secLoading || !secQuestion || !secAnswer.trim()}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {secLoading ? '保存中...' : currentSecQuestion ? '更换密保' : '设置密保'}
          </button>
        </div>
      </div>

      {/* 第三行：危险操作 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-rose-600 mb-4">⚠️ 危险操作</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">退出登录</p>
            <p className="text-xs text-slate-400 mt-0.5">清除本地会话并返回登录页</p>
          </div>
          <button
            onClick={() => setShowLogout(true)}
            className="text-sm text-rose-600 hover:text-rose-700 border border-rose-200 hover:border-rose-300 px-4 py-2 rounded-lg hover:bg-rose-50 transition-colors"
          >
            退出当前账号
          </button>
        </div>
      </div>

      {/* 退出确认弹窗 */}
      {showLogout && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowLogout(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-slate-800 mb-1.5">确认退出？</h4>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">
              当前账号将从本设备登出，已提交的答题记录会保留在云端。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 py-2.5 rounded-xl text-sm text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl text-sm text-white bg-gradient-to-r from-rose-400 to-pink-500 hover:from-rose-500 hover:to-pink-600 shadow-md shadow-rose-200 transition-all"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx src/app/api/auth/me/route.ts
git commit -m "feat: 新建个人设置页面 /settings，扩展 /api/auth/me 返回密保状态"
```

---

### Task 6: Sidebar — 导航项 + 用户卡片跳转

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `useRouter` from `next/navigation`; `usePathname` from `next/navigation`
- Produces: 新增"个人设置"导航项（在"我的笔记"下方），用户卡片点击从打开 SettingsPanel 改为跳转 `/settings`

- [ ] **Step 1: 在"我的笔记"导航项下方添加"个人设置"导航项**

在 `Sidebar.tsx` 中，找到"我的笔记" `NavItem`（约第 348-361 行），在其下方添加：

```tsx
              <NavItem
                tone={TONE_KEY}
                icon={
                  <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                label="个人设置"
                active={pathname === '/settings'}
                onClick={() => {
                  onClose();
                  router.push('/settings');
                }}
              />
```

- [ ] **Step 2: 修改底部用户卡片点击行为**

找到 `UserCard` 组件（约第 534-539 行），将 `onClick` 从 `setSettingsOpen(true)` 改为跳转 `/settings`：

将：
```tsx
          <UserCard
            username={user.username}
            isGuest={user.isGuest}
            tone={TONE_KEY}
            onClick={() => setSettingsOpen(true)}
          />
```

改为：
```tsx
          <UserCard
            username={user.username}
            isGuest={user.isGuest}
            tone={TONE_KEY}
            onClick={() => {
              onClose();
              router.push('/settings');
            }}
          />
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: 侧边栏新增个人设置入口，用户卡片跳转 /settings"
```

---

## 验证清单

完成所有 Task 后，执行以下验证：

1. `npx tsc --noEmit` — 零 TypeScript 错误
2. 手动测试：
   - 登录 → 点击侧边栏"个人设置" → 页面正常加载，显示用户名和职业
   - 修改用户名 → 保存成功 → 侧边栏用户名即时更新
   - 修改密码 → 旧密码错误时报错 → 正确旧密码保存成功 → 用新密码重新登录
   - 设置密保 → 选择问题 + 输入答案 → 保存成功
   - 退出登录 → 确认弹窗 → 退出到登录页
   - 游客账号 → 页面显示"不支持"提示 + 注册按钮
