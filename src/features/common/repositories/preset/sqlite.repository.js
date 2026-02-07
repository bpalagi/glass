const sqliteClient = require('../../services/sqliteClient');

function getPresets(uid) {
    const db = sqliteClient.getDb();
    const query = `
        SELECT * FROM prompt_presets 
        WHERE uid = ? 
        ORDER BY title ASC
    `;
    
    try {
        return db.prepare(query).all(uid);
    } catch (err) {
        console.error('SQLite: Failed to get presets:', err);
        throw err;
    }
}

function getPresetTemplates() {
    return [];
}

function create({ uid, title, prompt }) {
    const db = sqliteClient.getDb();
    const presetId = require('crypto').randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const query = `INSERT INTO prompt_presets (id, uid, title, prompt, is_default, created_at, sync_state) VALUES (?, ?, ?, ?, 0, ?, 'dirty')`;
    
    try {
        db.prepare(query).run(presetId, uid, title, prompt, now);
        return { id: presetId };
    } catch (err) {
        throw err;
    }
}

function update(id, { title, prompt }, uid) {
    const db = sqliteClient.getDb();
    const query = `UPDATE prompt_presets SET title = ?, prompt = ?, sync_state = 'dirty' WHERE id = ? AND uid = ?`;

    try {
        const result = db.prepare(query).run(title, prompt, id, uid);
        if (result.changes === 0) {
            throw new Error("Preset not found or permission denied.");
        }
        return { changes: result.changes };
    } catch (err) {
        throw err;
    }
}

function del(id, uid) {
    const db = sqliteClient.getDb();
    const query = `DELETE FROM prompt_presets WHERE id = ? AND uid = ?`;

    try {
        const result = db.prepare(query).run(id, uid);
        if (result.changes === 0) {
            throw new Error("Preset not found or permission denied.");
        }
        return { changes: result.changes };
    } catch (err) {
        throw err;
    }
}

module.exports = {
    getPresets,
    getPresetTemplates,
    create,
    update,
    delete: del
}; 