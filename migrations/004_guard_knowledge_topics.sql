CREATE TRIGGER IF NOT EXISTS knowledge_topic_same_goal_insert
BEFORE INSERT ON knowledge_topic_links
WHEN (SELECT goal_id FROM knowledge_nodes WHERE id = NEW.node_id) !=
     (SELECT c.goal_id FROM topics t JOIN curricula c ON c.id = t.curriculum_id WHERE t.id = NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'knowledge node and topic belong to different goals'); END;
CREATE TRIGGER IF NOT EXISTS knowledge_topic_same_goal_update
BEFORE UPDATE ON knowledge_topic_links
WHEN (SELECT goal_id FROM knowledge_nodes WHERE id = NEW.node_id) !=
     (SELECT c.goal_id FROM topics t JOIN curricula c ON c.id = t.curriculum_id WHERE t.id = NEW.topic_id)
BEGIN SELECT RAISE(ABORT, 'knowledge node and topic belong to different goals'); END;
