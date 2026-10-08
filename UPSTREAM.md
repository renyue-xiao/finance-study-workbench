# 来源与抽离边界

## FSRS

唯一随仓库保留的第三方运行时代码是 [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)，版本 **5.4.2**，MIT，Copyright (c) 2026 Open Spaced Repetition。

| 本项目文件              | 上游 npm 包文件                        | SHA-256                                                          |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| vendor/fsrs.mjs         | dist/index.mjs                         | ad4a4b3b7e259fcbf02764454c8f9db4ea3bf5aae2f473198129ecb7728f1a19 |
| vendor/fsrs.d.mts       | dist/index.d.ts，仅改扩展名适配本地ESM | 86619bd94f12a259832e2d3e1e7cacdc392174410d674e5999729e13889a4f41 |
| vendor/FSRS-LICENSE.txt | LICENSE                                | 8b83a73dd2894ff553d6de6113064b3ad9dfad3f839837b61f3b183881131d01 |

已逐字节核对原应用 vendor 与留存的 ts-fsrs 5.4.2 npm 包，哈希一致。包来源记录：`https://registry.npmjs.org/ts-fsrs/-/ts-fsrs-5.4.2.tgz`；npm tarball integrity 为 `sha512-z4qop4pzTcyTzuJ566d9EaX/4bZZzhYfeaPImfVr+xcYT65c5oBgFDijUhCE/D+C78eaolHIhKRZ04/RwF+v2g==`。没有改写第三方模块或抹去版权，`npm run verify:vendor` 可重新检查本仓库副本。升级该模块时需独立核验版本、类型和许可，并更新此记录。

FSRS 的记忆状态和下次间隔是上游现成功能。本项目贡献为学习工作流、错词跨组策略、数量计划、服务器校验、持久化与界面；不宣称发明 FSRS。

## 原创工作流

从已有个人学习应用的 `study.mjs` / `plan.mjs` / `server.mjs` / `judgments.mjs` 核对并选择性抽离以下契约，重新组织为本项目类型与存储边界：隐藏答案→主动揭示→判断；错词反馈停留；跨组累计五次与FSRS接续；按词量倒排；revision、requestId、SQLite事务与追加事件。

原应用面向个人资料，有旧版本迁移、PDF映射及特定课程接口。本项目保留可独立使用的核心流程，采用自己的 schema 1，既不兼容也不尝试打开旧个人数据库。原应用路径、进度、端口和部署脚本均未进入代码。

`src/`、`web/`、`tests/`、`scripts/` 为本项目原创或重新组织的作者自有代码，采用根 LICENSE 的 MIT。`content/deck.json` 的8个术语定义及2道算术小题为本项目自编示例，同样MIT；未从原词库、教材、题库或OCR数据复制句子、选项、解析、频次、页码或资料映射。项目不包含教材授权或考试官方认可声明。

开发依赖由 package-lock.json 固定，遵循各自分发包许可。测试仅使用自编样例、固定时钟和临时SQLite，不使用真实学习数据。
