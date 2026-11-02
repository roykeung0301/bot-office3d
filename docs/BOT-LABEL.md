# Bot 頭頂標籤（compact → expand）

Branch: `feature/bot-label-expand`  
基準：`office3d-merged` / `integration/office3d` @ `7fd6840`（線上 poll 合併版）  
副本：`/workspace/office3d-label-prog`（唔改 merged）

## 行為
1. **預設 compact**：短名（`shortName(name,6)`）＋狀態 icon（`STATUS[st].ic`）＋色點。
2. **Click bot（raycast）或 label** → `selectBot(bot)`，該標籤變 **open**（全名、角色、狀態中文、step）。
3. **同時最多一個 open**；click 另一個就切換。
4. **Click 空白／canvas miss** → `selectBot(null)` 收起。
5. 側欄團隊卡 click 都會 `selectBot`。

## API（`window.__office`）
| 名稱 | 說明 |
|------|------|
| `selectBot(b\|null)` | 選中 bot 物件／名；`null`／找不到 → 收起 |
| `getSelected()` | 而家選中嘅 bot 或 `null` |
| `onSelection(fn)` | `fn(next, prev)`；回傳 unsubscribe |
| `shortName(name,max=6)` | 截斷短名 |
| `labelSel` | 內部 selection 物件（`selectedName` getter）|

旗標：`b._selected === true` 只有而家展開嗰個。

## DOM／CSS hook（畀 UI／Visual）
- 根節點：`.lb.lb-compact` 或 `.lb.lb-open`（選中時加 `.selected`）
- `data-bot="<全名>"`
- Compact：`.nm.short`、`.ic`（emoji）、`i`（色點）
- Open：`.nm.full`、`.role`、`.st-zh`（狀態文案）、`.st`（step）、可選 `.tool`

`#labels` 仍然 `pointer-events:none`；`.lb` 開咗 `pointer-events:auto` 先可以撳標籤。

## 檔案
- `bot-label.mjs` — 狀態機（可 node 測）
- `app.js` — 接線、渲染、click
- `style.css` — 基礎 hook（UI 可覆蓋）
- `tests/bot-label.test.mjs`、`tests/bot-label-browser.mjs`

## 協調
- **程式員**：命中／選中／API／DOM class 名（本文件）
- **UI**：`.lb-compact`／`.lb-open` 版面同字級
- **Visual**：open 時特效／高亮（可聽 `onSelection`）
