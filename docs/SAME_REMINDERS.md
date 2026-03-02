# Same 提醒：删日志时的常见错误

> 来源：Same 开发者经验总结  
> 删日志/调试代码时最容易误删或破坏的内容：

## 1. return 语句
- **现象**：整行删掉后，函数没有返回值（或某分支没有 return）
- **注意**：删 `console.log` 时别把上面的 `return xxx;` 一起删掉

## 2. export 关键字
- **现象**：函数导出丢了，其他文件 import 报错
- **注意**：删日志行时别把 `export` 从 `export function foo` 里删成 `function foo`

## 3. 函数调用
- **现象**：整行被删了，关键逻辑缺失（例如 `queryClient.setQueryData(...)`、`convertApiMatchesToAdvanced(...)`）
- **注意**：确认要删的是「仅日志」那一行，不是「日志 + 下面一行调用」

## 4. 括号/引号不匹配
- **现象**：删掉一段日志后，少了一个 `)`、`}` 或 `"`，导致语法错误
- **注意**：删多行时检查前后括号、模板字符串是否成对

---

**建议**：删完日志后跑一次 `npm run build` 或看 Linter，并重点检查该文件的 return/export 和括号匹配。
