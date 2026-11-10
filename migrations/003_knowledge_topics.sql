CREATE TABLE IF NOT EXISTS knowledge_topic_links (
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, topic_id)
);
INSERT OR IGNORE INTO knowledge_topic_links (node_id, topic_id)
SELECT n.id, t.id FROM knowledge_nodes n
JOIN curricula c ON c.goal_id = n.goal_id
JOIN topics t ON t.curriculum_id = c.id AND lower(t.title) = lower(n.name)
WHERE n.kind = 'concept';
CREATE INDEX IF NOT EXISTS idx_knowledge_topic_links_topic ON knowledge_topic_links(topic_id);
