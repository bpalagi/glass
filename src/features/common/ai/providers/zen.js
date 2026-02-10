class ZenProvider {
    static async validateApiKey(key) {
        if (!key || typeof key !== 'string' || key.trim() === '') {
            return { success: false, error: 'API key cannot be empty.' };
        }

        try {
            const response = await fetch('https://opencode.ai/zen/v1/models', {
                headers: {
                    Authorization: `Bearer ${key}`
                }
            });

            if (response.ok) {
                return { success: true };
            }

            const errorData = await response.json().catch(() => ({}));
            const message = errorData?.error?.message || errorData?.message || `Validation failed with status: ${response.status}`;
            return { success: false, error: message };
        } catch (error) {
            console.error('[ZenProvider] Network error during key validation:', error);
            return { success: false, error: 'A network error occurred during validation.' };
        }
    }
}

function createLLM({ apiKey, model = 'opencode/big-pickle', temperature = 0.7, maxTokens = 2048, ...config }) {
    const callApi = async (messages) => {
        const response = await fetch('https://opencode.ai/zen/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: maxTokens
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData?.error?.message || errorData?.message || `${response.status} ${response.statusText}`;
            throw new Error(`Zen API error: ${message}`);
        }

        const result = await response.json();
        const content = result?.choices?.[0]?.message?.content;

        return {
            content: typeof content === 'string' ? content.trim() : String(content || '').trim(),
            raw: result
        };
    };

    return {
        generateContent: async (parts) => {
            const messages = [];
            let systemPrompt = '';
            const userContent = [];

            for (const part of parts) {
                if (typeof part === 'string') {
                    if (systemPrompt === '' && part.includes('You are')) {
                        systemPrompt = part;
                    } else {
                        userContent.push({ type: 'text', text: part });
                    }
                } else if (part?.inlineData) {
                    userContent.push({
                        type: 'image_url',
                        image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
                    });
                }
            }

            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            if (userContent.length > 0) messages.push({ role: 'user', content: userContent });

            const result = await callApi(messages);
            return {
                response: {
                    text: () => result.content
                },
                raw: result.raw
            };
        },

        chat: async (messages) => {
            return await callApi(messages);
        }
    };
}

function createStreamingLLM({ apiKey, model = 'opencode/big-pickle', temperature = 0.7, maxTokens = 2048, ...config }) {
    return {
        streamChat: async (messages) => {
            const response = await fetch('https://opencode.ai/zen/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    stream: true
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const message = errorData?.error?.message || errorData?.message || `${response.status} ${response.statusText}`;
                throw new Error(`Zen API error: ${message}`);
            }

            return response;
        }
    };
}

module.exports = {
    ZenProvider,
    createLLM,
    createStreamingLLM
};
