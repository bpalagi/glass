let WebSocket, path, EventEmitter;

if (typeof window === 'undefined') {
    WebSocket = require('ws');
    path = require('path');
    EventEmitter = require('events').EventEmitter;
} else {
    class DummyEventEmitter {
        on() {}
        emit() {}
        removeAllListeners() {}
    }
    EventEmitter = DummyEventEmitter;
}

// Input audio: PCM int16 mono at 24kHz from the app's audio capture
// WhisperLive expects: float32 mono at 16kHz
const INPUT_SAMPLE_RATE = 24000;
const TARGET_SAMPLE_RATE = 16000;

function resampleAndConvertToFloat32(pcmInt16Buffer) {
    const numInputSamples = pcmInt16Buffer.length / 2;
    const ratio = TARGET_SAMPLE_RATE / INPUT_SAMPLE_RATE;
    const numOutputSamples = Math.floor(numInputSamples * ratio);
    const float32 = new Float32Array(numOutputSamples);

    for (let i = 0; i < numOutputSamples; i++) {
        // Linear interpolation for resampling
        const srcIdx = i / ratio;
        const idx0 = Math.floor(srcIdx);
        const idx1 = Math.min(idx0 + 1, numInputSamples - 1);
        const frac = srcIdx - idx0;

        const s0 = pcmInt16Buffer.readInt16LE(idx0 * 2) / 32768.0;
        const s1 = pcmInt16Buffer.readInt16LE(idx1 * 2) / 32768.0;
        float32[i] = s0 + (s1 - s0) * frac;
    }

    return Buffer.from(float32.buffer);
}

class WhisperSTTSession extends EventEmitter {
    constructor(model, whisperService, sessionId) {
        super();
        this.model = model;
        this.whisperService = whisperService;
        this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.ws = null;
        this.isRunning = false;
        this.serverReady = false;
        this.uid = this.sessionId;
        this.emittedCompletedCount = 0;
        this.lastEmittedText = '';
    }

    async initialize() {
        try {
            // Ensure the WhisperLive server is running
            if (!this.whisperService.isLiveServerRunning()) {
                console.log(`[WhisperSTT-${this.sessionId}] Starting WhisperLive server...`);
                await this.whisperService.startLiveServer();
            }

            const port = this.whisperService.getLiveServerPort();
            console.log(`[WhisperSTT-${this.sessionId}] Connecting to WhisperLive on port ${port}`);

            return await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WhisperLive WebSocket connection timeout'));
                }, 10000);

                this.ws = new WebSocket(`ws://localhost:${port}`);

                this.ws.on('open', () => {
                    clearTimeout(timeout);
                    // Send initial config
                    const config = {
                        uid: this.uid,
                        language: 'en',
                        task: 'transcribe',
                        model: this._mapModelName(this.model),
                        use_vad: true,
                    };
                    this.ws.send(JSON.stringify(config));
                    console.log(`[WhisperSTT-${this.sessionId}] Connected, sent config: ${JSON.stringify(config)}`);
                });

                this.ws.on('message', (data) => {
                    try {
                        const msg = JSON.parse(data.toString());
                        this._handleServerMessage(msg);

                        // Resolve on SERVER_READY
                        if (msg.message === 'SERVER_READY') {
                            this.isRunning = true;
                            this.serverReady = true;
                            clearTimeout(timeout);
                            resolve(true);
                        }
                    } catch (e) {
                        console.error(`[WhisperSTT-${this.sessionId}] Failed to parse message:`, e);
                    }
                });

                this.ws.on('error', (err) => {
                    clearTimeout(timeout);
                    console.error(`[WhisperSTT-${this.sessionId}] WebSocket error:`, err.message);
                    this.emit('error', err);
                    if (!this.serverReady) reject(err);
                });

                this.ws.on('close', (code, reason) => {
                    clearTimeout(timeout);
                    console.log(`[WhisperSTT-${this.sessionId}] WebSocket closed: ${code} ${reason}`);
                    this.isRunning = false;
                    this.serverReady = false;
                    this.emit('close', { code, reason: reason?.toString() });
                    if (!this.serverReady) reject(new Error(`WebSocket closed: ${code}`));
                });
            });
        } catch (error) {
            console.error(`[WhisperSTT-${this.sessionId}] Initialization error:`, error);
            this.emit('error', error);
            return false;
        }
    }

    _mapModelName(model) {
        // Map Glass model IDs to faster-whisper model names
        const map = {
            'whisper-tiny': 'tiny',
            'whisper-base': 'base',
            'whisper-small': 'small',
            'whisper-medium': 'medium',
        };
        return map[model] || 'small';
    }

    _handleServerMessage(msg) {
        if (msg.message === 'SERVER_READY') {
            console.log(`[WhisperSTT-${this.sessionId}] Server ready (backend: ${msg.backend || 'unknown'})`);
            return;
        }

        if (msg.status === 'WAIT') {
            console.warn(`[WhisperSTT-${this.sessionId}] Server full, wait time: ${msg.message} min`);
            return;
        }

        if (msg.message === 'DISCONNECT') {
            console.log(`[WhisperSTT-${this.sessionId}] Server requested disconnect`);
            this.close();
            return;
        }

        if (msg.segments && msg.segments.length > 0) {
            // WhisperLive sends ALL segments each time (including old completed ones).
            // Only emit newly completed segments we haven't seen before.
            const completedSegments = msg.segments.filter(s => s.completed);
            const newCompleted = completedSegments.slice(this.emittedCompletedCount);

            for (const seg of newCompleted) {
                const text = (seg.text || '').trim();
                if (text && text !== this.lastEmittedText) {
                    this.lastEmittedText = text;
                    console.log(`[WhisperSTT-${this.sessionId}] Transcription: "${text}"`);
                    this.emit('transcription', {
                        text: text,
                        timestamp: Date.now(),
                        confidence: 1.0,
                        sessionId: this.sessionId,
                        start: seg.start,
                        end: seg.end,
                    });
                } else if (text === this.lastEmittedText) {
                    console.log(`[WhisperSTT-${this.sessionId}] Skipped duplicate: "${text}"`);
                }
            }
            this.emittedCompletedCount = completedSegments.length;
        }

        if (msg.language) {
            console.log(`[WhisperSTT-${this.sessionId}] Detected language: ${msg.language} (prob: ${msg.language_prob})`);
        }
    }

    sendRealtimeInput(audioData) {
        if (!this.isRunning || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        // Decode base64 if needed
        if (typeof audioData === 'string') {
            try {
                audioData = Buffer.from(audioData, 'base64');
            } catch (error) {
                console.error('[WhisperSTT] Failed to decode base64 audio data:', error);
                return;
            }
        } else if (audioData instanceof ArrayBuffer) {
            audioData = Buffer.from(audioData);
        } else if (!Buffer.isBuffer(audioData)) {
            audioData = Buffer.from(audioData);
        }

        if (audioData.length === 0) return;

        // Convert PCM int16 24kHz → float32 16kHz
        const float32Buf = resampleAndConvertToFloat32(audioData);

        try {
            this.ws.send(float32Buf);
        } catch (err) {
            console.error(`[WhisperSTT-${this.sessionId}] Send error:`, err.message);
        }
    }

    async close() {
        console.log(`[WhisperSTT-${this.sessionId}] Closing session`);
        this.isRunning = false;

        if (this.ws) {
            try {
                if (this.ws.readyState === WebSocket.OPEN) {
                    // Signal end of audio
                    this.ws.send(Buffer.from('END_OF_AUDIO'));
                }
                this.ws.close();
            } catch (e) {
                // ignore close errors
            }
            this.ws = null;
        }

        this.removeAllListeners();
    }
}

class WhisperProvider {
    static async validateApiKey() {
        // Whisper is a local service, no API key validation needed.
        return { success: true };
    }

    constructor() {
        this.whisperService = null;
    }

    async initialize() {
        if (!this.whisperService) {
            this.whisperService = require('../../services/whisperService');
            if (!this.whisperService.isInitialized) {
                await this.whisperService.initialize();
            }
        }
    }

    async createSTT(config) {
        await this.initialize();
        
        const model = config.model || 'whisper-tiny';
        const sessionType = config.sessionType || 'unknown';
        console.log(`[WhisperProvider] Creating ${sessionType} STT session with model: ${model}`);
        
        // Create unique session ID based on type
        const sessionId = `${sessionType}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const session = new WhisperSTTSession(model, this.whisperService, sessionId);
        
        // Log session creation
        console.log(`[WhisperProvider] Created session: ${sessionId}`);
        
        const initialized = await session.initialize();
        if (!initialized) {
            throw new Error('Failed to initialize Whisper STT session');
        }

        if (config.callbacks) {
            if (config.callbacks.onmessage) {
                session.on('transcription', config.callbacks.onmessage);
            }
            if (config.callbacks.onerror) {
                session.on('error', config.callbacks.onerror);
            }
            if (config.callbacks.onclose) {
                session.on('close', config.callbacks.onclose);
            }
        }

        return session;
    }

    async createLLM() {
        throw new Error('Whisper provider does not support LLM functionality');
    }

    async createStreamingLLM() {
        console.warn('[WhisperProvider] Streaming LLM is not supported by Whisper.');
        throw new Error('Whisper does not support LLM.');
    }
}

module.exports = {
    WhisperProvider,
    WhisperSTTSession
};