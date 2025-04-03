export class TranscriptionService {
  private apiKey: string;
  private apiEndpoint: string;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
    this.apiEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  async transcribe(audioBlob: Blob): Promise<string> {
    if (!this.apiKey) {
      throw new Error('请先在设置中配置 OpenAI API Key');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'zh');
    formData.append('response_format', 'json');
    formData.append('temperature', '0');

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('转写请求失败: ' + response.status);
      }

      const data = await response.json();
      return data.text;
    } catch (error) {
      throw new Error('语音转写失败: ' + error.message);
    }
  }
}