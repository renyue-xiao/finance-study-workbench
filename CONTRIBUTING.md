# 贡献约定

使用Node24和锁文件安装依赖。所有开发在本仓库的新数据目录或临时测试目录运行，不使用任何人的学习数据库，也不引入个人路径、部署脚本、令牌或未授权教材内容。

提交前：

```sh
npm ci
npm run format
npm run format:check
npm run lint
npm test
npm run build
npm run verify:vendor
git diff --check
```

Prettier和ESLint排除vendor原始模块及生成物。TypeScript严格检查与erasableSyntaxOnly保证Node可直接运行。不要用全局禁用跳过静态问题；非法输入测试的类型转换应限定在运行时校验边界。

修改学习逻辑时检查：未揭示不评分/不泄露解释；每组同词只判一次；错词等待与跨组间隔；新词/复习数量；请求重放与冲突；进度、原始判断的事务原子性；恢复失败不覆盖数据。格式修改不新增镜像测试。

前端修改需检查320/390px、键盘与触摸按钮、长释义、暂停恢复、刷新和坏备份。选择题选项错误不能被自判记对绕过。页面用textContent呈现自有内容，避免HTML注入。

内容贡献应原创或明确可公开分发，保留许可与来源。样例不得使用考试官方标识暗示认可。FSRS更新需保留上游MIT与版本哈希，不能将其算法称作本项目原创。

通过主题分支提交GitHub PR，写明实际检查与未验证边界。CI在PR和main推送触发，使用固定Actions SHA和只读权限。本地测试不等于GitHub CI成功；原API函数加桩也不等于真实服务验证。
