-- エンドレスモードのランキング。1 人につき最高記録を 1 行だけ持つ。
-- プレイヤーの識別子そのものは保存せず、ハッシュだけを持つ。
CREATE TABLE scores (
  player_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  distance INTEGER NOT NULL,
  flown INTEGER NOT NULL,
  level INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_scores_rank ON scores (distance DESC, updated_at ASC);

-- 遊び始めた時刻をサーバー側で覚えておき、記録の送信時に照らし合わせる。
-- 1 人につき 1 行で、送信すると消える。
CREATE TABLE runs (
  player_hash TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  started_at INTEGER NOT NULL
);
