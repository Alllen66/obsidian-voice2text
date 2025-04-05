import { App, Plugin, PluginSettingTab, Setting, Notice, requestUrl } from 'obsidian';
import { RecordingModal } from './components/RecordingModal';
import { AudioRecorder } from './components/AudioRecorder';

interface Voice2TextSettings {
  apiKey: string;
  saveAudio: boolean;
}

const DEFAULT_SETTINGS: Voice2TextSettings = {
  apiKey: '',
  saveAudio: true
};

export default class Voice2TextPlugin extends Plugin {
  settings: Voice2TextSettings;
  audioRecorder: AudioRecorder;
  recordingModal: RecordingModal | null = null;
  private statusBarItem: HTMLElement;

  async onload() {
    await this.loadSettings();
    this.audioRecorder = new AudioRecorder();

    // 添加设置选项卡
    this.addSettingTab(new Voice2TextSettingTab(this.app, this));

    // 添加命令
    this.addCommand({
      id: 'start-recording',
      name: '开始录音',
      callback: () => this.startRecording()
    });

    // 添加状态栏项
    this.createStatusBarItem();
    this.statusBarItem.addClass('mod-clickable');
    this.statusBarItem.setAttribute('aria-label', '开始录音');
    this.statusBarItem.setAttribute('title', '点击开始录音');
    this.statusBarItem.addEventListener('click', () => {
      this.startRecording();
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async startRecording() {
    try {
      await this.audioRecorder.startRecording();
      const stream = this.audioRecorder.getStream();
      
      if (!stream) {
        throw new Error('无法获取音频流');
      }

      // 创建并显示录音弹窗
      this.recordingModal = new RecordingModal(
        this.app,
        async (cancelled) => {
          if (!cancelled) {
            await this.stopRecording();
          } else {
            this.audioRecorder.cleanup();
          }
          this.recordingModal = null;
        },
        () => this.audioRecorder.pauseRecording(),
        () => this.audioRecorder.resumeRecording(),
        stream
      );
      
      this.recordingModal.open();
    } catch (error) {
      new Notice('录音失败: ' + error.message);
    }
  }

  async stopRecording() {
    try {
      const audioBlob = await this.audioRecorder.stopRecording();
      
      // 保存音频文件
      if (this.settings.saveAudio) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `录音_${timestamp}.wav`;
        const file = new File([audioBlob], fileName, { type: 'audio/wav' });
        await this.app.vault.createBinary(fileName, await file.arrayBuffer());
      }

      // 显示转写状态
      if (this.recordingModal) {
        this.recordingModal.showTranscribing();
      }

      // 转写音频
      const transcription = await this.transcribeAudio(audioBlob);
      
      // 更新转写文本
      if (this.recordingModal) {
        this.recordingModal.hideTranscribing();
        this.recordingModal.setTranscriptionText(transcription);
      }
    } catch (error) {
      new Notice('处理录音失败: ' + error.message);
    }
  }

  private async transcribeAudio(audioBlob: Blob): Promise<string> {
    try {
      // 将音频数据转换为 base64
      const reader = new FileReader();
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(audioBlob);
      });

      // 创建请求体
      const requestBody = {
        file: base64Audio,
        model: 'whisper-1',
        language: 'zh'
      };

      const response = await requestUrl({
        url: 'https://api.openai.com/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.status !== 200) {
        throw new Error(`转写失败: ${response.status} ${response.text}`);
      }

      const data = JSON.parse(response.text);
      return data.text;
    } catch (error) {
      console.error('转写错误:', error);
      throw error;
    }
  }

  private createStatusBarItem(): void {
    this.statusBarItem = this.addStatusBarItem();
    const icon = document.createElement('span');
    icon.setText('🎙');
    this.statusBarItem.appendChild(icon);
  }

  private updateStatusBarIcon(isRecording: boolean): void {
    if (!this.statusBarItem) return;
    
    // 清除现有内容
    while (this.statusBarItem.firstChild) {
      this.statusBarItem.removeChild(this.statusBarItem.firstChild);
    }
    
    const icon = document.createElement('span');
    icon.setText(isRecording ? '⏹' : '🎙');
    this.statusBarItem.appendChild(icon);
  }
}

class Voice2TextSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Voice2TextPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  plugin: Voice2TextPlugin;

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '语音转文字设置' });

    new Setting(containerEl)
      .setName('OpenAI API Key')
      .setDesc('请输入你的 OpenAI API Key')
      .addText(text => text
        .setPlaceholder('输入 API Key')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('保存音频文件')
      .setDesc('是否保存录音文件到文档库')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.saveAudio)
        .onChange(async (value) => {
          this.plugin.settings.saveAudio = value;
          await this.plugin.saveSettings();
        }));
  }
} 