const { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, Timestamp } = require('firebase/firestore');
const { getFirestoreInstance } = require('../../services/firebaseClient');
const { createEncryptedConverter } = require('../firestoreConverter');
const encryptionService = require('../../services/encryptionService');

const userPresetConverter = createEncryptedConverter(['prompt', 'title']);

function userPresetsCol() {
    const db = getFirestoreInstance();
    return collection(db, 'prompt_presets').withConverter(userPresetConverter);
}

async function getPresets(uid) {
    const userPresetsQuery = query(userPresetsCol(), where('uid', '==', uid));
    const snapshot = await getDocs(userPresetsQuery);
    const presets = snapshot.docs.map(d => d.data());
    return presets.sort((a, b) => a.title.localeCompare(b.title));
}

async function getPresetTemplates() {
    return [];
}

async function create({ uid, title, prompt }) {
    const now = Timestamp.now();
    const newPreset = {
        uid: uid,
        title,
        prompt,
        is_default: 0,
        created_at: now,
    };
    const docRef = await addDoc(userPresetsCol(), newPreset);
    return { id: docRef.id };
}

async function update(id, { title, prompt }, uid) {
    const docRef = doc(userPresetsCol(), id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().uid !== uid) {
        throw new Error("Preset not found or permission denied to update.");
    }

    // Encrypt sensitive fields before sending to Firestore because `updateDoc` bypasses converters.
    const updates = {};
    if (title !== undefined) {
        updates.title = encryptionService.encrypt(title);
    }
    if (prompt !== undefined) {
        updates.prompt = encryptionService.encrypt(prompt);
    }
    updates.updated_at = Timestamp.now();

    await updateDoc(docRef, updates);
    return { changes: 1 };
}

async function del(id, uid) {
    const docRef = doc(userPresetsCol(), id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().uid !== uid) {
        throw new Error("Preset not found or permission denied to delete.");
    }

    await deleteDoc(docRef);
    return { changes: 1 };
}

module.exports = {
    getPresets,
    getPresetTemplates,
    create,
    update,
    delete: del,
}; 