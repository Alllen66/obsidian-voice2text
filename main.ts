import { Plugin, Editor, MarkdownView, Notice, App, TFile } from 'obsidian';
import { AudioRecorder } from './src/components/AudioRecorder';
import { TranscriptionService } from './src/components/TranscriptionService';
import { Voice2TextSettingTab, Voice2TextSettings, DEFAULT_SETTINGS } from './src/components/SettingsTab';
import { RecordingModal } from './src/components/RecordingModal';

export default class Voice2TextPlugin extends Plugin {
  private audioRecorder: AudioRecorder;
  public transcriptionService: TranscriptionService;
  private settings: Voice2TextSettings;
  private recordingModal: RecordingModal | null = null;
  private mediaStream: MediaStream | null = null;
  private statusBarItem: HTMLElement;
  private isRecording: boolean = false;

  async onload() {
    // 加载设置
    await this.loadSettings();
    
    // 初始化组件
    this.audioRecorder = new AudioRecorder();
    this.transcriptionService = new TranscriptionService(this.settings.openaiApiKey);

    // 添加设置标签页
    this.addSettingTab(new Voice2TextSettingTab(this.app, this, this.settings));

    // 添加状态栏按钮
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass('mod-clickable');
    this.statusBarItem.setAttribute('aria-label', '开始录音');
    this.statusBarItem.setAttribute('title', '点击开始录音');
    this.statusBarItem.innerHTML = '🎙';
    this.statusBarItem.addEventListener('click', () => {
      if (!this.isRecording) {
        this.startRecording();
      } else {
        this.stopRecording();
      }
    });

    // 添加录音按钮到编辑器工具栏
    this.addRibbonIcon('microphone', '语音录制', (evt: MouseEvent) => {
      if (!this.isRecording) {
        this.startRecording();
      } else {
        this.stopRecording();
      }
    });

    // 添加开始录音命令
    this.addCommand({
      id: 'start-voice-recording',
      name: '开始语音录制',
      editorCallback: (editor: Editor) => {
        this.startRecording();
      }
    });
    
    // 添加停止录音命令
    this.addCommand({
      id: 'stop-voice-recording',
      name: '停止语音录制',
      editorCallback: (editor: Editor) => {
        this.stopRecording();
      }
    });
  }

  async startRecording() {
    try {
      await this.audioRecorder.startRecording();
      const stream = this.audioRecorder.getStream();
      if (!stream) {
        throw new Error('无法获取音频流');
      }
      
      this.isRecording = true;
      this.statusBarItem.innerHTML = '⏹';
      this.statusBarItem.setAttribute('aria-label', '停止录音');
      this.statusBarItem.setAttribute('title', '点击停止录音');

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
      
      // 获取当前笔记
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice('请先打开一个笔记文件');
        return;
      }

      // 保存音频文件
      const audioFilePath = await this.saveAudioFile(audioBlob);
      
      // 先插入音频文件链接
      const editor = view.editor;
      const cursor = editor.getCursor();
      editor.replaceRange(`![[${audioFilePath}]]\n\n`, cursor);
      
      // 开始转写并显示进度
      new Notice('正在转写...');
      const text = await this.transcriptionService.transcribe(audioBlob);
      
      // 在弹窗中显示转写文本（带打字效果）
      if (this.recordingModal) {
        this.recordingModal.setTranscriptionText(text);
      }

      // 在音频文件链接后插入转写文本
      const newCursor = editor.getCursor();
      editor.replaceRange(`${text}\n\n`, newCursor);
      
    } catch (error) {
      new Notice('转写失败: ' + error.message);
    } finally {
      this.isRecording = false;
      this.statusBarItem.innerHTML = '🎙';
      this.statusBarItem.setAttribute('aria-label', '开始录音');
      this.statusBarItem.setAttribute('title', '点击开始录音');
      
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
    }
  }

  async saveAudioFile(audioBlob: Blob): Promise<string> {
    if (!this.settings.saveAudio) {
      return '';
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${this.settings.audioFolder}/录音_${timestamp}.wav`;
    
    // 确保目标文件夹存在
    const folder = this.app.vault.getAbstractFileByPath(this.settings.audioFolder);
    if (!folder) {
      await this.app.vault.createFolder(this.settings.audioFolder);
    }

    const file = new File([audioBlob], fileName, { type: 'audio/wav' });
    await this.app.vault.createBinary(fileName, await file.arrayBuffer());
    return fileName;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    this.audioRecorder.cleanup();
    if (this.recordingModal) {
      this.recordingModal.close();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
  }
}