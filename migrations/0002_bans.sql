-- 荒らし対策の追加分。

-- 荒らしと判断したプレイヤー。ここに載った人の記録と名前の変更は受け付けない。
-- 追加のしかたは README の「ランキングの運用」を参照。
CREATE TABLE bans (
  player_hash TEXT PRIMARY KEY,
  reason TEXT,
  created_at INTEGER NOT NULL
);

-- 同じ接続元から 1 日に増やせるプレイヤーの数を数える。
-- 接続元はその日かぎりのハッシュにして保存し、古い行は毎日消す。
CREATE TABLE ip_daily (
  ip_hash TEXT NOT NULL,
  day INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, day)
);

-- 名前のなりすましを防ぐため、表記ゆれをそろえた形で重複を禁止する。
ALTER TABLE scores ADD COLUMN name_key TEXT;
UPDATE scores SET name_key = name || ':' || substr(player_hash, 1, 8);
CREATE UNIQUE INDEX idx_scores_name_key ON scores (name_key);
