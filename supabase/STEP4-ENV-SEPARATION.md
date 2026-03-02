# Step 4: stg/prod 環境分離

このStepは「環境混線防止」を目的に、stg/prod を分離して同じ手順で再現できる状態を作る。

## 追加ファイル
- `scripts/deploy-edge-functions.sh`
- `supabase/env/stg.example.env`
- `supabase/env/prod.example.env`

## 0. 前提
- Supabase プロジェクトを stg/prod で別々に用意
- Stripe も test/live で分離
- `create-checkout-session` は `--no-verify-jwt` デプロイ（関数内で `auth.getUser()` 検証）

## 1. ローカル env ファイルを作成
```bash
cp supabase/env/stg.example.env supabase/env/stg.env
cp supabase/env/prod.example.env supabase/env/prod.env
```

`*.env` には実値を設定（ファイルはGit管理しない）。

## 2. Edge Functions + Secrets を環境ごとに反映
```bash
# staging
bash scripts/deploy-edge-functions.sh stg <stg-project-ref> supabase/env/stg.env

# production
bash scripts/deploy-edge-functions.sh prod <prod-project-ref> supabase/env/prod.env
```

## 3. SQL (Step2/Step3) の反映確認
対象環境ごとに SQL Editor で以下を実行済みにする。
1. `supabase/step2-subscription-rls.sql`
2. `supabase/step3-stripe-webhook.sql`

## 4. 受け入れ確認（環境ごと）
1. `settings -> checkout -> success` が完走
2. `billing_subscriptions.status = 'active'`
3. `billing_subscription_events` にイベント記録
4. settings のボタンが `契約は有効です`

## 5. 運用ルール（事故防止）
- Stripe key/secret はチャットに貼らない
- stg と prod で price id を混ぜない
- `APP_BASE_URL` を必ず環境ドメインに合わせる
- リリース時は stg 完了後に prod へ同一手順で反映
