import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TranscriptionService } from './TranscriptionService';

export interface Voice2TextSettings {
  openaiApiKey: string;
  saveAudio: boolean;
  audioFolder: string;
}

export const DEFAULT_SETTINGS: Voice2TextSettings = {
  openaiApiKey: '',
  saveAudio: true,
  audioFolder: 'recordings'
};

interface Voice2TextPlugin extends Plugin {
  transcriptionService: TranscriptionService;
}

export class Voice2TextSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: Voice2TextPlugin,
    private settings: Voice2TextSettings
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '语音转文字设置' });

    new Setting(containerEl)
      .setName('OpenAI API Key')
      .setDesc('请输入您的 OpenAI API Key')
      .addText(text => text
        .setPlaceholder('输入您的 API Key')
        .setValue(this.settings.openaiApiKey)
        .onChange(async (value) => {
          this.settings.openaiApiKey = value;
          await this.plugin.saveData(this.settings);
          this.plugin.transcriptionService.setApiKey(value);
        }));

    new Setting(containerEl)
      .setName('保存音频文件')
      .setDesc('是否保存录音文件到文档库')
      .addToggle(toggle => toggle
        .setValue(this.settings.saveAudio)
        .onChange(async (value) => {
          this.settings.saveAudio = value;
          await this.plugin.saveData(this.settings);
        }));

    new Setting(containerEl)
      .setName('音频文件保存路径')
      .setDesc('设置录音文件的保存路径，默认为 recordings 文件夹')
      .addText(text => text
        .setPlaceholder('输入保存路径')
        .setValue(this.settings.audioFolder)
        .onChange(async (value) => {
          this.settings.audioFolder = value;
          await this.plugin.saveData(this.settings);
        }));
  }
} 