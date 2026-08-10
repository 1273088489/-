# ADR-004: 自研轻量 Session 认证
- 状态：Accepted
- 背景：MVP 面向个人/少量用户，避免 NextAuth 等重型依赖带来的配置负担。
- 决策：自研 session 表 + 随机 token + httpOnly cookie；登录/注册/登出 API。
- 后果：功能足够但缺少社交登录、铁安全审计等；正式上线前应替换/加固。
