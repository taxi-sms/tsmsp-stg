# TSMS Design System Rules

## Source Of Truth

- 見た目の正解は `tsms-design.css` のみ。
- 主要業務画面は `body.page-block-unified` を前提に統一する。
- 画面幅の差分は `page-main-wide` / `page-main-xl` の修飾クラスで表現する。
- 認証系は `auth-main` を使い、業務画面の `.main` とは分離する。

## Shared Components

以下は各 HTML で再定義しない。

- `.tsms-header` / `.header`
- `.tsms-menu` / `.menu`
- `.tsms-bottom-nav`
- `.card`
- `.section`
- `.panel`
- `.wf-panel`
- `.title`
- `.group-title`
- `.wf-label`
- `.btn`
- `.btn.next`
- `.input`
- `.date-switcher`

## Allowed Exceptions

- ページ固有 UI のみローカル style を許可する。
- 例: 音声入力モーダル、settings2 の editor modal、sales の table 入力幅、ops の reset ボタン文言レイアウト。
- 例外スタイルでは色、余白、角丸、影、文字サイズを再設計しない。必要なら先に `tsms-design.css` を更新する。

## Forbidden Patterns

- 各ページで `.btn` `.input` `.wf-panel` `.tsms-header` を再定義すること
- 各ページでライト/ダークの共通配色を上書きすること
- `.main` にページごとの max-width を直書きすること
- 新しい見た目の導入を HTML 単位で行うこと

## Change Workflow

1. 変更対象が `component` か `page-specific` かを先に決める
2. `component` なら `tsms-design.css` を更新する
3. `page-specific` ならその理由を残し、共通部品は触らない
4. 主要画面の静的回帰テストを通す

## Target Pages

- `index.html`
- `report.html`
- `confirm.html`
- `detail.html`
- `ops.html`
- `sales.html`
- `settings.html`
- `settings2.html`
