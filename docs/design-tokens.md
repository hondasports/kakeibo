# デザイントークン

Suzumemo では、`小さな支出と日々のメモを軽く残す` というブランド方向と、
`思いついた時に、軽く・サクッと支出や収入を記録できる静かなメモ帳` という
UI/UX コンセプトを両立するため、色・余白・角丸・タイポグラフィを
`src/designTokens.ts` に集約する。

## 方針

- すずめブラウンを主色にして、軽いメモ感と生活感を出す
- 補助色は葉色とミスト色に寄せ、かわいさを出しつつ読みやすさを保つ
- 余白は広げすぎず、入力作業に必要な情報密度を維持する
- 角丸は 8px を基本にして、柔らかいが崩れないUIにする
- コンポーネント直書きの色や余白は、できるだけ theme または CSS 変数経由に寄せる
- ブランド詳細は `docs/suzumemo-theme.md` を参照する

## トークン一覧

### 色

| グループ | 例 | 用途 |
| --- | --- | --- |
| `color.brand.sparrow` / `paper` / `leaf` / `coral` / `mist` | `#8B5E3C`, `#F7EDE2`, `#A6B28B`, `#F4A27A`, `#AAB7C4` | Suzumemo ブランドパレット |
| `color.primary` | `light` / `main` `#8B5E3C` / `dark` / `contrastText` | 主要ボタン、フォーカス、選択状態 |
| `color.secondary` | `light` / `main` `#6F7F55` / `dark` / `contrastText` | 補助操作、補助情報 |
| `color.success` / `warning` / `error` | `#5F7D4A` / `#C9734B` / `#B85A4C` | 成功・警告・エラー |
| `color.text` | `primary` `#3D2C22` / `secondary` `#765F4F` / `muted` `#9E9288` | テキスト色 |
| `color.surface` | `canvas` `#FBF8F2`, `panel` `#FFFDF8`, `sunken` `#F7EDE2`, `accent` `#F2F5EA` | 画面背景、パネル、補助面 |
| `color.border` | `subtle`, `emphasis`, `track` | 区切り線、強調枠、進捗バー下地 |
| `color.category.default` | `#8B5E3C` | カテゴリ未設定時のデフォルト色 |

### 余白

| トークン | 値 | 主な用途 |
| --- | --- | --- |
| `space.2xs` | `4px` | 極小画面の gap |
| `space.xs` | `8px` | 小さな要素間の余白 |
| `space.sm` | `12px` | 行内の gap |
| `space.md` | `16px` | 通常のカード間隔 |
| `space.panel` | `20px` | パネル内部の余白 |
| `space.lg` | `24px` | 認証画面や広めの余白 |
| `space.xl` | `32px` | ページ全体の上下余白 |

### 角丸とサイズ

| トークン | 値 | 主な用途 |
| --- | --- | --- |
| `radius.sm` | `4px` | 小さな要素 |
| `radius.md` | `8px` | ボタン、パネル、入力欄 |
| `radius.pill` | `999px` | Progress, indicator |
| `size.buttonMinHeight` | `40px` | 主要ボタン |
| `size.inputMinHeight` | `36px` | 入力欄 |
| `size.bottomNavHeight` | `56px` | ボトムナビゲーション |

### タイポグラフィ

| トークン | 値 | 用途 |
| --- | --- | --- |
| `typography.h4` | `1.75rem / 700` | ページ見出し |
| `typography.h5` | `1.25rem / 700` | パネル見出し |
| `typography.h6` | `1rem / 700` | セクション見出し |
| `typography.body1` | `1rem / 400` | 本文 |
| `typography.body2` | `0.875rem / 400` | 補助文 |
| `typography.caption` | `0.75rem / 500` | 小ラベル |

## 実装ルール

- MUI コンポーネントでは `theme.palette.*` と `theme.typography.*` を優先する
- CSS で使う必要がある値は `MuiCssBaseline` から `:root` の CSS 変数として公開する
- 新しい色を直接 `sx={{ bgcolor: "#..." }}` に書く前に、既存トークンで表現できないか確認する
- `App.css` のレイアウト系クラスは CSS 変数を参照し、画面幅ごとの差分だけを media query に残す
- `designTokens.ts` の `rootCssVariables` から `:root` の CSS 変数を生成する

## 追加時のチェック

- その値は既存トークンの言い換えではないか
- 入力画面の情報密度を落とさないか
- ダッシュボード、入力画面、サマリー画面で横断的に使う値か
- CSS 変数に公開する必要があるか、それとも MUI theme だけで足りるか

## Agent Skill

トークンの追加・変更を含むUI作業では、Capability Skill `skills/ui-design` も確認する。外部Skill `web-design-guidelines` の汎用チェックを使う場合も、視覚値の正本はこのドキュメントと `src/designTokens.ts` とし、外部の推奨だけで新しい色・余白・角丸を直書きしない。
