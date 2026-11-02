# Bot 頭頂標籤 compact / expand

## DOM（跟 UI 最終方案）
- 預設：`.lb.lb-compact` → `.lb-ic[data-st]`（CSS 色點）+ `.lb-short`（短名）
- 展開：`.lb.lb-open` → 另加 `.lb-detail`（全名 · 角色）+ `.lb-step`（有 step 先顯示）
- 統一 `lb-*`，唔用 `np--*` / `.np`

## 狀態色（`.lb-ic`）
| status | 色 |
|---|---|
| working | 藍 `#3b82f6` |
| idle | 灰 `#94a3b8` |
| done | 綠 `#22c55e` |
| waiting_user | 橙 `#ff8a3d` |
| error | 紅 `#ef4444` |
| thinking | 紫 `#a855f7` |

Emoji 只放喺 `.lb-ic` 嘅 `title` 備援（`STATUS.zh` + `STATUS.ic`）。腳下光環仍用舊 `STATUS.c`（未改）。

## 短名
`SHORT_ALIAS` 優先；否則去掉 Dr./Mr. 前綴取首段，最長 6 字。見 `shortName()`。

## 互動 API（薄適配，程式員可接管狀態機）
- `window.__office.selectLabel(name, {focus,bubble,toggle})` — 再撳同一 bot 收起
- `clearLabelSel()` / `getLabelSel()`
- 撳 `.lb` / 3D bot → select；撳 canvas 空白 → clear
- 側欄 team card 亦走 `selectLabel`

## Declutter
窄屏／直屏：碰撞隱藏低優先 compact；`labelSel` 展開標籤永不藏。闊屏全顯示。

## 同 UI 差異
- 截稿時 `/workspace/office3d-ui` 尚未落地 `lb-*` CSS；本副本附**最小可用**樣式於 `style.css` 末段，標「UI 設計員 refining」。
- 舊 `.lb .np` / portrait `.lb small{display:none}` 仍在檔案前段，新 DOM 唔再依賴。
