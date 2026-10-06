# 香川高専図書館検索

Bun + TypeScript の検索クライアントと Ink + React の TUI。
最初の段階として CLI を実装しています。MCP サーバーと Skills は今後の段階です。

## 起動

Bun 1.4.2 で動作確認。

```sh
bun install
bun run start                  # 対話TUI（Enterで検索、Escで終了）
bun run search -- Rust         # 検索結果を表示して終了
bun run search -- Rust --campus takuma
bun run search -- --title Rust --author 中田
bun run start -- --interactive --title Rust # 条件を入力した状態でTUIを起動
bun run search -- --isbn 9784873118550
bun run search -- Rust --limit 20 --json
bun run search -- プログラミング --page 2 --json
bun run search -- --help
```

`--campus` は `both`（既定）、`takamatsu`（高松）、`takuma`（詫間）。
`--limit` は 10 / 20 / 50 / 100。書名・著者・出版者の簡略オプションはAND結合です。
`--publisher`、`--year`、`--year-to` も指定できます。
対話TUIは端末の高さに収まる画面を使い、入力中も結果のスクロール位置を保持します。

- Tab / Shift+Tab: 通常検索・詳細検索のタブ切替（入力値は保持）
- ↑ / ↓: 項目移動。長い詳細フォームも選択した項目を画面内に表示
- ← / →: 選択肢の切替。文字入力欄ではカーソル移動
- Enter: 文字入力欄では検索、選択欄では選択一覧を開く
- 選択一覧: 入力でコード・名称を絞り込み、↑↓で移動、Spaceで複数選択、Enterで決定、Escでキャンセル
- 検索結果の上の `[前へ]` / `[次へ]` をクリック: 結果ページを移動。Ctrl+P / Ctrl+Nでも移動できます。検索フォームを編集していても、ページ移動には表示中の結果の検索条件を使います。
- Ctrl+R: どの入力項目からでも検索（新しい検索は1ページ目から）
- マウスホイール・トラックパッド: 結果の上でスクロールすると、結果だけが移動します。上部の検索フォームは固定です。選択一覧もホイールで移動できます。PgUp / PgDnも使用可能です。Ctrl+Gで結果側に移動すると↑↓ / Home / Endでもスクロール可能
- Ctrl+U: 入力消去（選択一覧では全選択を解除）
- Esc: 終了。元のターミナル画面に戻る

詳細検索は4行まで指定でき、各行の項目（キーワード・タイトル・著者名・出版者・件名・タグ）と、2行目以降の結合（AND / OR / NOT）を選べます。
資料種別（全て・図書・雑誌・AV資料）、所蔵館、配置場所、館内資料のみ、出版年、ISBN/ISSN、NCID、書誌ID、登録番号、資料ID、請求記号、コード種別・値、出版国、言語、分類、表示順、表示件数も指定できます。
出版国・言語・配置場所のコードは提供されたOPAC資料から抽出した一覧を同梱しています。出版国はOPAC独自のコードです（日本は `ja`）。
通常検索はキーワード・所蔵館・表示順・表示件数のみを送信し、詳細タブに保存した条件を混ぜません。
引数なしの対話TUIはTTYが必要です。JSONモードはパイプや後のMCP連携向けです。

## CLI・LLMから詳細条件を指定

```sh
bun run search -- --condition '{"field":"title","value":"Rust"}' \
  --condition '{"field":"title","value":"Effective","operator":"NOT"}' \
  --material-type bk --language jpn --no-holdings --json
bun run search -- --list countries
bun run search -- --list languages
bun run search -- --list locations
bun run search -- --options examples/search.json --json
```

`--condition` は最大4回まで指定できます。同じ項目を複数行で検索できます。
`operator` はその行と前の有効な条件の結合です。空の行は送信条件から除き、最初の行のoperatorは使いません。
結合の解釈・優先順位はOPACに従い、クライアントでは独自に変更しません。
`--condition` / JSONの `conditions` を指定すると書名などの簡略条件を置き換えます。
`--country` / `--language` / `--material-type` は複数回指定できます。
`--mode simple|detail` でモードを明示できます。通常検索に詳細条件を渡すとエラーを返します。
利用可能なオプションは `--help`、型定義は `src/search.ts` を参照してください。

## 取得内容

総件数、今回取得した資料の書名、著者・出版情報、書誌ID、書誌詳細URLを返します。
キーワードの検索範囲はOPACの仕様に従います。書名に限定したい場合は `--title` を使います。
各資料の詳細ページから巻号・所蔵館・配置場所・請求記号・資料ID・状態・コメントを取得し、複数冊を表で表示します。
端末幅に合わせて列を折り返し、狭い端末では資料ごとの縦の表に切り替えます。
OPACの空欄は表で `—` と表示します。状態の空欄を貸出可とは解釈しません。
所蔵情報は選択した香川高専キャンパスだけを表示します。取得に失敗した場合は書誌情報と失敗メッセージを残します。
JSONの各書誌には `holdings` 配列（取得失敗時は `holdingsError`）が追加されます。
`--no-holdings` で詳細取得を省略できます。
タイトルはOPACの詳細URLへのリンクです。クリック操作はターミナルのリンク対応・設定に従います。詳細URLも併記します。
検索結果はページ単位で取得します。CLI・JSON入力では `page`（1以上、既定1）で指定します。
JSON出力には `pagination`（page / pageSize / totalPages / start / end）を付け、結果の通し番号もページに合わせて表示します。
範囲外のページはエラーを返します。ページ取得失敗時はTUIの表示中の結果を残します。
MCPの通信、Skillsは未実装です。

検索先: https://libopac-c.kosen-k.go.jp/webopac41/cattab.do
新規検索ではトップページをGETしてセッションを取得し、`ctlsrh.do` にフォームをPOSTします。
次ページは同じ検索セッションのCookie・formkeynoと開始位置を使って取得します。
CLIで途中のページを指定する場合は、初回検索でセッションを作ってから指定ページを取得します。
ユーザーが貼り付けたCookieをソースに保存する必要はありません。
通信は各リクエスト30秒でタイムアウトします。失敗は終了コード1で返します。

## 構成と検証

- `src/search.ts`: 検索条件の型・検証・OPACフォーム生成。MCPから再利用可能。
- `src/opac.ts`: HTTP検索・HTML解析・所蔵情報取得。
- `src/cli.tsx`: CLI引数・JSON入力・TUI起動。
- `src/tui.tsx`: 通常/詳細タブ・選択一覧・端末サイズに収まる画面。
- `src/result-lines.ts`: リンク付き検索結果の整形・スクロール領域。
- `src/data/`: 提供資料から抽出した出版国・言語・香川高専の配置場所コード。
- `tests/fixtures/rust.html`: 提供された検索結果HTMLから抽出した結果表（スクリプト・セッション値を除去）。

```sh
bun run typecheck
bun test
```

実サイトで Rust の簡易検索6件、詫間の書名検索3件、0件の検索、書誌IDリンクを確認。
検索結果以外のHTMLはエラーとして扱い、0件と誤認しないようにしています。

実サイトで図書・言語・表示順・NOTを組み合わせた検索も確認。TUIテストで画面の高さ、入力中のスクロール保持、タブ切替、項目移動、複数選択とNOTの送信を検証しています。

実サイトでプログラミング検索の2ページ目（11〜20件）を確認。ページ移動時のセッション・条件保持、所蔵取得、通し番号、範囲外・セッション切れ、TUIのボタンクリック・検索条件編集後の動作もテストしています。
