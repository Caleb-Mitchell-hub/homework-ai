# 个人设置功能完善 — 设计规格

> 日期：2026-08-08 | 状态：已确认

## 概述

为已登录用户提供账户级别的个人设置页面，支持修改用户名、职业、密码和密保信息。与现有的 `SettingsPanel`（本地偏好如字体大小、动画等）职责分离——新建独立 `/settings` 路由页面承载 DB 级别的账户操作。

## 范围

### 包含

1. **修改用户名** — 校验长度（3-20 字符）+ 唯一性查重（排除自身），更新后同步 AuthContext + localStorage
2. **修改职业** — 自由文本字段，直接更新 `User.occupation`
3. **修改密码** — 已登录状态下验证旧密码后设置新密码（≥6 字符，不与旧密码相同）
4. **设置/修改密保** — 从预设 6 个问题中选择 + 输入答案（≥2 字符），答案 bcrypt 存储
5. **退出登录** — 从现有 SettingsPanel 迁移到 `/settings` 页面
6. **AuthContext 扩展** — 新增 `updateUser` 方法实现用户名即时同步

### 不包含

- 头像上传、邮箱、手机号（User 模型无对应字段）
- 注册/登录流程修改
- 管理员端的用户管理功能（已有 `/api/admin/users`）

## API 设计

### 1. PATCH `/api/user/profile` — 修改基本信息

```
Headers: Authorization: Bearer <token>
Body: { username?: string, occupation?: string }
```

- `username` 和 `occupation` 至少传一个
- 游客拒绝（403）
- 用户名校验：3-20 字符，唯一性查重
- 成功返回 `{ user: { id, username, occupation } }`

### 2. PUT `/api/user/password` — 修改密码

```
Headers: Authorization: Bearer <token>
Body: { oldPassword: string, newPassword: string }
```

- 游客拒绝（403）
- 验证旧密码（bcrypt.compare）
- 新密码 ≥ 6 字符，不与旧密码相同
- 成功返回 `{ success: true }`

### 3. PUT `/api/user/security` — 设置/修改密保

```
Headers: Authorization: Bearer <token>
Body: { securityQuestion: string, securityAnswer: string }
```

- 游客拒绝（403）
- `securityQuestion` 必须在 `PREDEFINED_QUESTIONS` 的 key 列表中
- `securityAnswer` ≥ 2 字符，做 `.trim().toLowerCase()` 后 bcrypt 存储
- 成功返回 `{ success: true }`

### 复用现有路由

| 路由 | 方法 | 用途 |
|---|---|---|
| `/api/user/profession` | `PATCH` | 修改 professionId（职业关联），已存在，不动 |
| `/api/auth/me` | `GET` | 获取当前用户信息（含 occupation），已存在，不动 |

## 页面设计

### 路由

新建 `src/app/settings/page.tsx`

### 侧边栏入口

- `src/components/Sidebar.tsx`：在"我的笔记"下方新增"个人设置"导航项（齿轮图标），点击跳转 `/settings`
- 底部用户卡片点击行为：从打开 `SettingsPanel` 改为跳转 `/settings`

### 布局

`max-w-6xl` mx-auto，两列 + 两行卡片布局（同 `/notes` 风格）：

```
第一行（两列）：
┌── 基本信息 ──────────┐  ┌── 修改密码 ──────────┐
│ 用户名    [______]   │  │ 旧密码    [______]   │
│ 职业      [______]   │  │ 新密码    [______]   │
│            [保存]    │  │ 确认密码  [______]   │
│                      │  │            [修改]    │
└──────────────────────┘  └──────────────────────┘

第二行（全宽）：
┌── 密保设置 ────────────────────────────────────┐
│ 密保问题  <下拉选择>  密保答案 [______]         │
│                                        [保存]  │
└────────────────────────────────────────────────┘

第三行（全宽）：
┌── 危险操作 ────────────────────────────────────┐
│ 退出登录                        [退出当前账号]  │
└────────────────────────────────────────────────┘
```

### 交互细节

- 用户名保存成功后调用 `updateUser({ username })` 即时刷新侧边栏
- 密码：新密码与确认密码前端比对，不匹配时按钮 disabled + 红色提示
- 密保：已设置时显示当前问题文案 + "更换"按钮；未设置时显示"未设置"标签
- 游客账号：页面显示"游客请先注册"提示，不展示表单
- 操作成功：调用 `dialog.alert()` 显示成功提示

## AuthContext 扩展

`src/contexts/AuthContext.tsx` 新增：

```ts
interface AuthContextType {
  // ... 现有字段
  updateUser: (partial: Partial<User>) => void;
}
```

实现：
```ts
const updateUser = (partial: Partial<User>) => {
  setUser(prev => {
    if (!prev) return prev;
    const merged = { ...prev, ...partial };
    localStorage.setItem('user', JSON.stringify(merged));
    return merged;
  });
};
```

## 错误处理

| 场景 | HTTP | 前端行为 |
|---|---|---|
| 未登录 | 401 | 跳转 `/login` |
| 游客账号 | 403 | alert "游客账号不支持此操作，请先注册" |
| 用户名重复 | 409 | 在用户名字段下方显示红色错误文案 |
| 旧密码错误 | 400 | 在旧密码字段下方显示"当前密码不正确" |
| 校验失败 | 400 | 在各字段下方显示具体错误 |
| 服务器错误 | 500 | alert "服务器错误，请稍后重试" |

## 涉及文件

| 操作 | 文件 | 说明 |
|---|---|---|
| 新建 | `src/app/settings/page.tsx` | 个人设置页面 |
| 新建 | `src/app/api/user/profile/route.ts` | 修改用户名/职业 API |
| 新建 | `src/app/api/user/password/route.ts` | 修改密码 API |
| 新建 | `src/app/api/user/security/route.ts` | 设置密保 API |
| 修改 | `src/components/Sidebar.tsx` | 添加"个人设置"导航项，用户卡片跳转 `/settings` |
| 修改 | `src/contexts/AuthContext.tsx` | 新增 `updateUser` 方法 |
| 修改 | `src/components/SettingsPanel.tsx` | 无需修改。退出登录保留双入口（SettingsPanel + /settings 页面），两者不冲突 |

## 数据模型

不需要数据库迁移。使用 `User` 现有字段：

- `username` — `String @unique`
- `password` — `String`（bcrypt）
- `occupation` — `String?`（自由文本职业）
- `securityQuestion` — `String?`（预设问题 key）
- `securityAnswerHash` — `String?`（bcrypt）
- `professionId` — `String?`（职业关联，已有单独 API）
